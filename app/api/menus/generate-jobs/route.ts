import { after, NextResponse } from "next/server";
import { runMenuGenerationJob } from "@/lib/ai/menu-generation-jobs";
import { weekStart } from "@/lib/ai/menu-generator";
import { generateMenuRequestSchema } from "@/lib/schemas/menu";
import { supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import type { Preferences } from "@/lib/types";
import { ensureClientId } from "@/lib/user";
import { getHostedAccess, hostedAccessResponse, revalidateHostedAccessForUser, usesLocalModelConfig } from "@/lib/supabase-auth";

export const maxDuration = 300;

function readPrefsFromCookie(cookieHeader: string): Preferences | null {
  const m = /(?:^|; )prefs=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function redactStoredRequest<T extends { model_config?: { enabled?: boolean; provider?: string; model?: string } }>(data: T) {
  if (!data.model_config) return data;
  return {
    ...data,
    model_config: {
      enabled: data.model_config.enabled,
      provider: data.model_config.provider,
      model: data.model_config.model,
    },
  };
}

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookieValue);
  const supabase = supabaseServer();

  if (!supabase) {
    return NextResponse.json(
      { error: { code: "DATABASE_NOT_CONFIGURED", message: "异步生成任务需要配置 Supabase。" } },
      { status: 503, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const parsedBody = generateMenuRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "生成菜单参数不合法", details: parsedBody.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  let hostedUserId: string | null = null;
  if (!usesLocalModelConfig(parsedBody.data.model_config)) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
    hostedUserId = access.user?.id || null;
  }

  const startDate = parsedBody.data.start_date || weekStart();
  let job: Record<string, unknown> | null = null;
  let createError: { message?: string } | null = null;
  try {
    const result = await withSupabaseTimeout(
      supabase
        .from("menu_generation_jobs")
        .insert({
          client_id: clientId,
          status: "queued",
          request: redactStoredRequest(parsedBody.data),
          start_date: startDate,
        })
        .select("*")
        .single()
    );
    job = result.data;
    createError = result.error;
  } catch {
    createError = { message: "创建生成任务失败" };
  }

  if (createError || !job) {
    return NextResponse.json(
      { error: { code: "JOB_CREATE_FAILED", message: createError?.message || "创建生成任务失败" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { data: stored } = await withSupabaseTimeout(
    supabase.from("preferences").select("*").eq("client_id", clientId).maybeSingle()
  ).catch(() => ({ data: null, error: null }));
  const storedPrefs = (stored as Preferences | null) || readPrefsFromCookie(cookieHeader);
  after(async () => {
    try {
      if (hostedUserId) {
        const access = await revalidateHostedAccessForUser(hostedUserId);
        if (!access.allowed) {
          await supabase
            .from("menu_generation_jobs")
            .update({
              status: "failed",
              stage: "failed",
              error_code: access.reason === "wechat_follow_required" ? "WECHAT_FOLLOW_REQUIRED" : "HOSTED_ACCESS_REVOKED",
              error_message: "线上模型权限已失效；请关注公众号或改用本浏览器自己的模型 Key。",
              finished_at: new Date().toISOString(),
            })
            .eq("id", String(job.id))
            .eq("client_id", clientId);
          return;
        }
      }
      await runMenuGenerationJob({
        supabase,
        jobId: String(job.id),
        clientId,
        requestData: parsedBody.data,
        storedPrefs,
        startDate,
      });
    } catch (error) {
      const message = "生成任务执行失败";
      console.error("Menu generation job failed outside request lifecycle", error);
      await supabase
        .from("menu_generation_jobs")
        .update({
          status: "failed",
          stage: "failed",
          error_code: "JOB_EXECUTION_FAILED",
          error_message: message.slice(0, 500),
          finished_at: new Date().toISOString(),
        })
        .eq("id", String(job.id))
        .eq("client_id", clientId);
    }
  });

  return NextResponse.json(
    {
      clientId,
      job_id: String(job.id),
      status: "queued",
    },
    { status: 202, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}
