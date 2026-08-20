import WechatLoginConfirm from "@/components/WechatLoginConfirm";

export const metadata = {
  title: "确认微信登录｜烟火食间",
  robots: { index: false, follow: false },
};

export default async function WechatLoginConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ challengeId?: string; displayCode?: string }>;
}) {
  const params = await searchParams;
  return (
    <WechatLoginConfirm
      challengeId={params.challengeId || ""}
      displayCode={(params.displayCode || "------").replace(/[^0-9]/g, "").slice(0, 6).padEnd(6, "-")}
    />
  );
}
