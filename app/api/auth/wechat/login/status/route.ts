import { NextRequest, NextResponse } from "next/server";
import {
  browserOwnsChallenge,
  challengeExpired,
  findChallengeById,
  markChallengeExpired,
  WECHAT_LOGIN_BROWSER_COOKIE,
} from "@/lib/wechat/login-challenge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const challengeId = request.nextUrl.searchParams.get("challengeId") || "";
  if (!challengeId) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "缺少登录 Challenge。" } }, { status: 400 });
  }

  try {
    const challenge = await findChallengeById(challengeId);
    const browserToken = request.cookies.get(WECHAT_LOGIN_BROWSER_COOKIE)?.value;
    if (!challenge || !browserOwnsChallenge(challenge, browserToken)) {
      return NextResponse.json({ error: { code: "WECHAT_STATE_INVALID", message: "登录二维码不属于当前浏览器。" } }, { status: 403 });
    }

    let status = challenge.status;
    if (challengeExpired(challenge) && !["consumed", "failed", "expired"].includes(status)) {
      await markChallengeExpired(challenge.id);
      status = "expired";
    }

    const response = NextResponse.json({
      status,
      displayCode: challenge.display_code,
      expiresAt: challenge.expires_at,
      failureCode: status === "failed" ? challenge.failure_code : null,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("WeChat login status failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "ACCESS_CHECK_FAILED", message: "读取微信登录状态失败。" } }, { status: 503 });
  }
}
