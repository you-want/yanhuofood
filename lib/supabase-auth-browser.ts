"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || typeof window === "undefined") return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  if (!browserClient) browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
