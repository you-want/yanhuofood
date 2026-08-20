import { NextResponse } from "next/server";
import { getHostedAccess } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getHostedAccess(request);
  if (!access.user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "请先登录账户。" } }, { status: 401 });
  return NextResponse.json({
    status: access.account?.wechat_status || "unbound",
    allowed: access.allowed,
    followedAt: access.account?.wechat_followed_at || null,
  });
}
