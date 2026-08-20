import { NextResponse } from "next/server";
import { isMenuGenerationJobStale } from "@/lib/ai/menu-generation-job-lifecycle";
import { supabaseServer } from "@/lib/supabase";
import { ensureClientId } from "@/lib/user";

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const { data: job, error } = await supabase
    .from("menu_generation_jobs")
    .select("*")
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "读取生成任务失败" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (!job) {
    return NextResponse.json(
      { error: { code: "JOB_NOT_FOUND", message: "生成任务不存在或不属于当前浏览器。" } },
      { status: 404, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (isMenuGenerationJobStale(job)) {
    const finishedAt = new Date().toISOString();
    await supabase
      .from("menu_generation_jobs")
      .update({
        status: "failed",
        stage: "failed",
        error_code: "JOB_STALE",
        error_message: "生成任务长时间没有进度，已停止轮询。可保留当前提纲并重新生成。",
        finished_at: finishedAt,
      })
      .eq("id", id)
      .eq("client_id", clientId)
      .in("status", ["queued", "running"]);

    job.status = "failed";
    job.stage = "failed";
    job.error_code = "JOB_STALE";
    job.error_message = "生成任务长时间没有进度，已停止轮询。可保留当前提纲并重新生成。";
    job.finished_at = finishedAt;
  }

  const storedPartial = job.partial_result || (job.result?.partial ? job.result : null);
  const storedProgress = storedPartial?.progress || {};

  return NextResponse.json(
    {
      clientId,
      job_id: job.id,
      status: job.status,
      result: job.status === "succeeded" ? job.result : undefined,
      partial_result: storedPartial,
      stage: job.stage || storedProgress.stage || (job.status === "queued" ? "queued" : job.status === "running" ? "planning" : job.status),
      completed_days: job.completed_days ?? storedProgress.completed_days ?? 0,
      total_days: job.total_days ?? storedProgress.total_days ?? 0,
      current_day: job.current_day ?? storedProgress.current_day ?? null,
      failed_days: storedProgress.failed_days || [],
      warnings: job.warnings || [],
      error: job.error_message,
      error_code: job.error_code,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      heartbeat_at: job.heartbeat_at,
    },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const { data: job, error: fetchError } = await supabase
    .from("menu_generation_jobs")
    .select("status")
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: fetchError.message } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (!job) {
    return NextResponse.json(
      { error: { code: "JOB_NOT_FOUND", message: "生成任务不存在或不属于当前浏览器。" } },
      { status: 404, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json(
      { status: job.status },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { error: updateError } = await supabase
    .from("menu_generation_jobs")
    .update({
      status: "cancelled",
      stage: "cancelled",
      error_code: "USER_CANCELLED",
      error_message: "用户已取消生成任务。",
      heartbeat_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("client_id", clientId);

  if (updateError) {
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: updateError.message } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  return NextResponse.json(
    { status: "cancelled", message: "生成任务已取消。" },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}
