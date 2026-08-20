import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import ClientWrapper from "@/components/ClientWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const viewport: Viewport = {
  themeColor: "#059669",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "烟火食间 - 智能食谱规划",
  description: "基于 AI 的个性化每周菜单生成器，支持饮食偏好配置、营养分析和多格式导出。",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "烟火食间 - 智能食谱规划",
    description: "根据饮食偏好、健康目标和用餐场景生成菜单、食谱、营养估算和食材清单。",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "烟火食间 AI 家庭饮食规划",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "烟火食间 - 智能食谱规划",
    description: "生成可调整的家庭菜单，并自动汇总采购清单。",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {`(() => {
            try {
              const theme = window.localStorage.getItem("yanhuofood.theme");
              if (["modern", "yanhuo", "song", "celadon"].includes(theme || "")) {
                document.documentElement.setAttribute("data-theme", theme);
              }
            } catch {}
          })();`}
        </Script>
        <Script id="legacy-service-worker-cleanup" strategy="beforeInteractive">
          {`(() => {
            if (!("serviceWorker" in navigator)) return;
            const cleanupKey = "yanhuofood.legacyServiceWorkerCleanup.v1";
            if (window.sessionStorage.getItem(cleanupKey)) return;

            navigator.serviceWorker.getRegistrations().then(async (registrations) => {
              if (!registrations.length) return;
              window.sessionStorage.setItem(cleanupKey, "done");
              await Promise.all(registrations.map((registration) => registration.unregister()));
              if ("caches" in window) {
                const keys = await window.caches.keys();
                await Promise.all(keys.map((key) => window.caches.delete(key)));
              }
              window.location.reload();
            }).catch(() => {});
          })();`}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ClientWrapper>
            {children}
          </ClientWrapper>
        </Providers>
      </body>
    </html>
  );
}
