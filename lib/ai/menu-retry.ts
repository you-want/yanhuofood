const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429]);
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

function recordValue(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function numericStatus(error: unknown) {
  const candidates = [
    recordValue(error, "status"),
    recordValue(error, "statusCode"),
    recordValue(recordValue(error, "response"), "status"),
  ];
  for (const candidate of candidates) {
    const status = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return undefined;
}

function stringValue(error: unknown, key: string) {
  const value = recordValue(error, key);
  return typeof value === "string" ? value : "";
}

function retryableByMessage(error: unknown) {
  const name = error instanceof Error ? error.name : stringValue(error, "name");
  const message = error instanceof Error ? error.message : String(recordValue(error, "message") || error || "");
  const normalized = `${name} ${message}`.toLowerCase();

  return [
    "aborterror",
    "apiconnectionerror",
    "apiconnectiontimeouterror",
    "fetch failed",
    "network error",
    "socket hang up",
    "socket closed",
    "connection reset",
    "connection terminated",
    "connection refused",
    "request timeout",
    "request timed out",
    "timed out",
    "timeout",
  ].some((fragment) => normalized.includes(fragment));
}

/**
 * 判断一次模型请求是否值得重试。这里只处理传输/服务端错误；
 * JSON、schema 与硬约束错误由生成器的 repair 流程负责。
 */
export function isRetryableMenuRequestError(error: unknown): boolean {
  const status = numericStatus(error);
  if (status !== undefined) {
    if (NON_RETRYABLE_HTTP_STATUSES.has(status)) return false;
    if (RETRYABLE_HTTP_STATUSES.has(status) || status >= 500) return true;
    return false;
  }

  const code = stringValue(error, "code").toUpperCase();
  if (RETRYABLE_ERROR_CODES.has(code)) return true;
  if (retryableByMessage(error)) return true;

  const cause = recordValue(error, "cause");
  return cause !== undefined && cause !== error ? isRetryableMenuRequestError(cause) : false;
}
