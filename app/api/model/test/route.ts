import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { modelCompatibilityOptions } from "@/lib/ai/model-compatibility";
import { localModelConfigSchema } from "@/lib/schemas/menu";
import { getHostedAccess } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_TIMEOUT_MS = 30_000;

const testModelRequestSchema = z.object({
  model_config: localModelConfigSchema,
});

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "模型连接测试失败";
}

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim() || "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export async function GET(request: Request) {
  const apiKey = cleanConfigValue(process.env.OPENAI_API_KEY);
  const baseURL = cleanConfigValue(process.env.OPENAI_BASE_URL);
  const model = cleanConfigValue(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const access = await getHostedAccess(request);

  return NextResponse.json({
    server: {
      configured: !!apiKey && access.allowed,
      hostedConfigured: !!apiKey,
      access: { allowed: access.allowed, reason: access.reason },
      model,
      baseUrlConfigured: !!baseURL,
      provider: baseURL ? "openai_compatible" : "openai",
    },
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是有效 JSON。" }, { status: 400 });
  }

  const parsed = testModelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "模型配置不完整或格式不正确。", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const config = parsed.data.model_config;
  const apiKey = cleanConfigValue(config.api_key);
  const baseURL = cleanConfigValue(config.base_url) || undefined;
  const model = cleanConfigValue(config.model);

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "请先填写 API Key。" }, { status: 400 });
  }
  if (config.provider === "openai_compatible" && !baseURL) {
    return NextResponse.json({ ok: false, error: "OpenAI 兼容接口需要填写 Base URL。" }, { status: 400 });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const openai = new OpenAI({ apiKey, baseURL });
    const completion = await openai.chat.completions.create(
      {
        model,
        messages: [
          {
            role: "user",
            content: "请只回复 ok，用于测试模型连接。",
          },
        ],
        temperature: 0,
        max_tokens: 16,
        ...modelCompatibilityOptions(model),
      },
      { signal: controller.signal }
    );

    const content = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      ok: true,
      provider: config.provider,
      model,
      latencyMs: Date.now() - startedAt,
      sample: content.slice(0, 40),
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    return NextResponse.json(
      {
        ok: false,
        provider: config.provider,
        model,
        latencyMs: Date.now() - startedAt,
        error: aborted ? "连接测试超时，请检查 Base URL、模型名或网络状态。" : errorMessage(error),
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
