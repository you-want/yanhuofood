import { supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import type { CoordinateSystem } from "@/lib/places/types";

const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const MAX_DAILY_LIMIT = 1_000_000;

export type PublicAmapQuotaErrorCode =
  | "PUBLIC_MAP_DAILY_LIMIT_REACHED"
  | "PUBLIC_MAP_QUOTA_UNAVAILABLE";

export class PublicAmapQuotaError extends Error {
  constructor(
    public readonly code: PublicAmapQuotaErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "PublicAmapQuotaError";
  }
}

export interface PublicAmapQuotaConfig {
  enabled: boolean;
  dailyLimit: number;
  timeZone: string;
  bucket: string;
}

export interface PublicAmapQuotaStatus {
  enabled: boolean;
  dailyLimit: number;
  used: number | null;
  remaining: number | null;
  timeZone: string;
  available: boolean;
}

interface QuotaRow {
  allowed?: unknown;
  used?: unknown;
  remaining?: unknown;
}

function parseInteger(value: string | undefined) {
  if (!value?.trim()) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function validTimeZone(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getPublicAmapQuotaConfig(
  env: NodeJS.ProcessEnv = process.env
): PublicAmapQuotaConfig {
  const configuredLimit = parseInteger(env.AMAP_PUBLIC_DAILY_REQUEST_LIMIT);
  const dailyLimit =
    configuredLimit > 0 && configuredLimit <= MAX_DAILY_LIMIT ? configuredLimit : 0;
  const bucket = (env.AMAP_PUBLIC_QUOTA_BUCKET || "default")
    .trim()
    .slice(0, 80) || "default";

  return {
    enabled: dailyLimit > 0,
    dailyLimit,
    timeZone: validTimeZone(env.AMAP_PUBLIC_QUOTA_TIME_ZONE),
    bucket,
  };
}

export function publicAmapRequestUnits(
  operation: "search" | "geocode" | "reverse-geocode",
  coordinateSystem: CoordinateSystem = "amap"
) {
  // 地址解析会先查 POI（公司/园区/大厦），未命中时再回退到 v3 门牌地理编码，
  // 最多可能产生两次高德请求，因此公共额度按两单位预留。
  if (operation === "geocode") return 2;
  return coordinateSystem === "gps" ? 2 : 1;
}

function quotaDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function finiteNonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function firstQuotaRow(value: unknown): QuotaRow | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as QuotaRow) : null;
  }
  return value && typeof value === "object" ? (value as QuotaRow) : null;
}

export async function consumePublicAmapQuota(input: {
  usingUserKey: boolean;
  units: number;
}) {
  const config = getPublicAmapQuotaConfig();
  if (input.usingUserKey || !config.enabled) return;

  // 没有公共 Key 时应继续由 Provider 返回 MAP_PROVIDER_NOT_CONFIGURED，
  // 不能在没有发生高德请求的情况下占用公共额度。
  if (!process.env.AMAP_WEB_SERVICE_KEY?.trim()) return;

  const supabase = supabaseServer();
  if (!supabase) {
    throw new PublicAmapQuotaError(
      "PUBLIC_MAP_QUOTA_UNAVAILABLE",
      "站点公共地图额度保护已开启，但计数数据库未配置。请使用你自己的高德 Key，或联系站点管理员。"
    );
  }

  try {
    const { data, error } = await withSupabaseTimeout(
      supabase.rpc("consume_nearby_public_amap_quota", {
        p_quota_key: config.bucket,
        p_usage_date: quotaDate(config.timeZone),
        p_limit: config.dailyLimit,
        p_units: Math.max(1, Math.trunc(input.units)),
      })
    );

    if (error) throw error;
    const row = firstQuotaRow(data);
    if (!row || typeof row.allowed !== "boolean") throw new Error("Invalid quota response");
    if (!row.allowed) {
      throw new PublicAmapQuotaError(
        "PUBLIC_MAP_DAILY_LIMIT_REACHED",
        "站点今天的公共地图调用额度已用完。你可以填写自己的高德 Web 服务 Key 后继续使用。"
      );
    }
  } catch (error) {
    if (error instanceof PublicAmapQuotaError) throw error;
    throw new PublicAmapQuotaError(
      "PUBLIC_MAP_QUOTA_UNAVAILABLE",
      "站点暂时无法确认公共地图剩余额度。为避免产生超额费用，已暂停公共 Key；你可以填写自己的高德 Key。",
      true
    );
  }
}

export async function getPublicAmapQuotaStatus(): Promise<PublicAmapQuotaStatus> {
  const config = getPublicAmapQuotaConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      dailyLimit: 0,
      used: null,
      remaining: null,
      timeZone: config.timeZone,
      available: true,
    };
  }

  if (!process.env.AMAP_WEB_SERVICE_KEY?.trim()) {
    return {
      enabled: true,
      dailyLimit: config.dailyLimit,
      used: 0,
      remaining: config.dailyLimit,
      timeZone: config.timeZone,
      available: true,
    };
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return {
      enabled: true,
      dailyLimit: config.dailyLimit,
      used: null,
      remaining: null,
      timeZone: config.timeZone,
      available: false,
    };
  }

  try {
    const { data, error } = await withSupabaseTimeout(
      supabase
        .from("nearby_public_amap_daily_usage")
        .select("request_units")
        .eq("quota_key", config.bucket)
        .eq("usage_date", quotaDate(config.timeZone))
        .maybeSingle()
    );
    if (error) throw error;
    const used = finiteNonNegativeInteger(data?.request_units) ?? 0;
    return {
      enabled: true,
      dailyLimit: config.dailyLimit,
      used,
      remaining: Math.max(0, config.dailyLimit - used),
      timeZone: config.timeZone,
      available: true,
    };
  } catch {
    return {
      enabled: true,
      dailyLimit: config.dailyLimit,
      used: null,
      remaining: null,
      timeZone: config.timeZone,
      available: false,
    };
  }
}

export function isPublicAmapQuotaError(error: unknown): error is PublicAmapQuotaError {
  return error instanceof PublicAmapQuotaError;
}
