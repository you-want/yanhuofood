const LOCAL_ORIGIN = "http://localhost:3000";

function validOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function emailAuthRedirectUrl() {
  const configuredOrigin = validOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const browserOrigin = typeof window === "undefined" ? null : validOrigin(window.location.origin);
  // 浏览器当前 origin 最可信，可避免生产环境误用仍指向 localhost 的部署变量。
  const origin = browserOrigin || configuredOrigin || LOCAL_ORIGIN;
  return new URL("/account", origin).toString();
}

export function authCallbackErrorMessage(params: URLSearchParams) {
  const code = params.get("error_code") || "";
  const description = params.get("error_description") || "";

  if (code === "otp_expired" || description.toLowerCase().includes("expired")) {
    return "邮箱验证链接无效或已过期。请填写邮箱并重新发送验证邮件，且只使用最新邮件中的链接。";
  }
  if (params.get("error") === "access_denied") {
    return "邮箱验证没有完成，请重新发送验证邮件后再试。";
  }
  return description || null;
}
