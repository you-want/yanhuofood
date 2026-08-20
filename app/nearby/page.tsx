import type { Metadata } from "next";
import { NearbyPageClient } from "@/components/nearby/NearbyPageClient";

export const metadata: Metadata = {
  title: "附近吃什么 - 烟火食间",
  description: "根据当前位置、距离、预算和口味，从附近真实餐馆中筛选并随机推荐。",
};

export default function NearbyPage() {
  return <NearbyPageClient />;
}
