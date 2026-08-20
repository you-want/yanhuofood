import { NextResponse } from "next/server";
import { getPlaceProvider, isPlaceProviderError } from "@/lib/places/provider";
import {
  consumePublicAmapQuota,
  isPublicAmapQuotaError,
  publicAmapRequestUnits,
} from "@/lib/places/public-amap-quota";
import { nearbySearchRequestSchema } from "@/lib/schemas/nearby";
import { getHostedAccess, hostedAccessResponse } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const LIMITATIONS = [
  "价格、评分和营业时间可能缺失或不是实时数据",
  "是否支持外卖、配送范围、配送费和送达时间需要在外部平台确认",
];

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

  const parsed = nearbySearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "附近门店搜索条件不正确。",
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
    const input = parsed.data;
    await consumePublicAmapQuota({
      usingUserKey: Boolean(input.amap_web_service_key),
      units: publicAmapRequestUnits("search", input.coordinate_system),
    });
    const provider = getPlaceProvider(input.amap_web_service_key);
    const result = await provider.searchNearby({
      location: { latitude: input.latitude, longitude: input.longitude },
      coordinateSystem: input.coordinate_system,
      radiusM: input.radius_m,
      keyword: input.keyword,
      categoryCodes: input.category_codes,
      page: input.page,
      pageSize: input.page_size,
    });

    return NextResponse.json({
      ...result,
      locationAccuracyM: input.location_accuracy_m,
      limitations: LIMITATIONS,
    });
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
      { error: { code: "INTERNAL_ERROR", message: "附近门店搜索失败，请稍后重试。" } },
      { status: 500 }
    );
  }
}
