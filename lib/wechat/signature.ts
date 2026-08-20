import { createHash, timingSafeEqual } from "node:crypto";
import { cleanSupabaseConfigValue } from "@/lib/supabase";

export function wechatCallbackSignatureMatches(searchParams: URLSearchParams) {
  const token = cleanSupabaseConfigValue(process.env.WECHAT_TOKEN);
  const signature = searchParams.get("signature") || "";
  const timestamp = searchParams.get("timestamp") || "";
  const nonce = searchParams.get("nonce") || "";
  if (!token || !signature || !timestamp || !nonce || !/^[a-f0-9]{40}$/i.test(signature)) return false;

  const expected = createHash("sha1").update([token, timestamp, nonce].sort().join("")).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
