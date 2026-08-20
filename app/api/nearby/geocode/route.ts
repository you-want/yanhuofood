import { NextResponse } from "next/server";
import { getPlaceProvider, isPlaceProviderError } from "@/lib/places/provider";
import {
  consumePublicAmapQuota,
  isPublicAmapQuotaError,
  publicAmapRequestUnits,
} from "@/lib/places/public-amap-quota";
import { nearbyGeocodeRequestSchema } from "@/lib/schemas/nearby";
import { getHostedAccess, hostedAccessResponse } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function providerErrorStatus(code: string) {
  if (code === "MAP_PROVIDER_NOT_CONFIGURED") return 503;
  if (code === "MAP_PROVIDER_INVALID_KEY") return 401;
  if (code === "MAP_PROVIDER_QUOTA_EXCEEDED") return 429;
  if (code === "MAP_PROVIDER_TIMEOUT") return 504;
  if (code === "LOCATION_NOT_FOUND") return 404;
  return 502;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "请求内容不是有效的 JSON。" } },
      { status: 400 }
    );
  }

  const parsed = nearbyGeocodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "地址信息不正确。",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 }
    );
  }

  if (!parsed.data.amap_web_service_key?.trim()) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
  }

  try {
    await consumePublicAmapQuota({
      usingUserKey: Boolean(parsed.data.amap_web_service_key),
      units: publicAmapRequestUnits("geocode", "amap"),
    });
    const provider = getPlaceProvider(parsed.data.amap_web_service_key);
    const location = await provider.geocodeAddress(parsed.data);
    return NextResponse.json({ location });
  } catch (error) {
    if (isPublicAmapQuotaError(error)) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        },
        { status: error.code === "PUBLIC_MAP_DAILY_LIMIT_REACHED" ? 429 : 503 }
      );
    }

    if (isPlaceProviderError(error)) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        },
        { status: providerErrorStatus(error.code) }
      );
    }

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "地址解析失败，请稍后重试。" } },
      { status: 500 }
    );
  }
}
