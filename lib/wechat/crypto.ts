import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { wechatLoginHmacSecret } from "@/lib/wechat/config";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function tokenHashMatches(rawToken: string | undefined, expectedHash: string | null | undefined) {
  if (!rawToken || !expectedHash) return false;
  const actual = Buffer.from(hashToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function wechatSubjectHash(openid: string) {
  const secret = wechatLoginHmacSecret();
  if (!secret) throw new Error("WECHAT_LOGIN_HMAC_SECRET is not configured");
  return createHmac("sha256", secret).update(openid).digest("hex");
}

export function createDisplayCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
