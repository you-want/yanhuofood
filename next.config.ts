import type { NextConfig } from "next";

function configuredOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseRealtimeOrigin = supabaseOrigin?.replace(/^http/, "ws") || null;
const connectSources = [
  "'self'",
  "https://www.yanhuofood.com",
  supabaseOrigin,
  supabaseRealtimeOrigin,
].filter((source): source is string => Boolean(source));

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' https://fonts.gstatic.com",
            `connect-src ${connectSources.join(" ")}`,
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
        {
          key: "Access-Control-Allow-Origin",
          value: "https://www.yanhuofood.com",
        },
        {
          key: "Access-Control-Allow-Methods",
          value: "GET, POST, PUT, DELETE, OPTIONS",
        },
        {
          key: "Access-Control-Allow-Headers",
          value: "Content-Type, Authorization",
        },
        {
          key: "Access-Control-Max-Age",
          value: "86400",
        },
      ],
    },
  ],
};

export default nextConfig;
