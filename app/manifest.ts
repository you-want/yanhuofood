import type { MetadataRoute } from "next";

// Next.js 会在 /manifest.webmanifest 提供该文件，并自动注入 <link rel="manifest">。
// 让主打“手机上采购、厨房里看菜谱”的工具支持“添加到主屏幕”。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "烟火食间 - 智能食谱规划",
    short_name: "烟火食间",
    description: "根据饮食偏好、健康目标和用餐场景生成菜单、食谱、营养估算和食材清单。",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#059669",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/logo.svg", type: "image/svg+xml", sizes: "any", purpose: "maskable" },
    ],
  };
}
