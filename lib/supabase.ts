import { createClient } from "@supabase/supabase-js";

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim() || "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("\x27") && trimmed.endsWith("\x27"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const supabaseUrl = cleanConfigValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = cleanConfigValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = cleanConfigValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function cleanSupabaseConfigValue(value: string | undefined) {
  return cleanConfigValue(value);
}

export function supabaseUrlValue() {
  return supabaseUrl;
}

export function supabaseAnonKeyValue() {
  return supabaseAnonKey;
}

export function supabaseRequestTimeoutMs() {
  const configured = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 500 && configured <= 30_000 ? configured : 3_000;
}

export async function withSupabaseTimeout<T>(operation: PromiseLike<T>, timeoutMs = supabaseRequestTimeoutMs()): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("Supabase request timed out"), { name: "TimeoutError" })), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function isSupabaseConnectionError(error: unknown) {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === "object" && error !== null
      ? `${String((error as Record<string, unknown>).name || "")} ${String((error as Record<string, unknown>).message || "")}`
      : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "fetch failed",
    "load failed",
    "network error",
    "aborterror",
    "aborted",
    "timed out",
    "timeout",
    "connection refused",
    "connection reset",
    "econnrefused",
    "econnreset",
    "enotfound",
    "socket hang up",
  ].some((fragment) => normalized.includes(fragment));
}

export function supabaseBrowser() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
}

export function supabaseServer() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}
