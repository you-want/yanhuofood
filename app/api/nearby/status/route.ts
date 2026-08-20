import { NextResponse } from "next/server";
import { getPublicAmapQuotaConfig, getPublicAmapQuotaStatus } from "@/lib/places/public-amap-quota";
import { getHostedAccess } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getHostedAccess(request);
  const quotaConfig = getPublicAmapQuotaConfig();
  const publicQuota = access.allowed
    ? await getPublicAmapQuotaStatus()
    : {
        enabled: quotaConfig.enabled,
        dailyLimit: quotaConfig.dailyLimit,
        used: null,
        remaining: null,
        timeZone: quotaConfig.timeZone,
        available: false,
      };

  return NextResponse.json({
    server: {
      configured: Boolean(process.env.AMAP_WEB_SERVICE_KEY?.trim()) && access.allowed,
      hostedConfigured: Boolean(process.env.AMAP_WEB_SERVICE_KEY?.trim()),
      access: { allowed: access.allowed, reason: access.reason },
      publicQuota,
    },
    localKeySupported: true,
  });
}
