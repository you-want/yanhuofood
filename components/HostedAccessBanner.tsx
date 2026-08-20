"use client";

import Link from "next/link";
import { LockKeyhole, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";

const DISMISSED_KEY = "yanhuofood.hostedAccessBannerDismissed";

export default function HostedAccessBanner() {
  const [visible, setVisible] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    setVisible(window.sessionStorage.getItem(DISMISSED_KEY) !== "true");
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  if (!visible || loading || user) return null;

  return (
    <aside className="border-b border-warning/30 bg-warning/10 print:hidden" aria-label="线上公共额度提示">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 text-sm text-warning sm:px-6 lg:px-8">
        <LockKeyhole className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          登录并关注微信公众号后，可使用站点配置的线上大模型和高德公共额度。
        </p>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="hidden shrink-0 border-warning/40 bg-card text-warning hover:bg-warning/10 sm:inline-flex"
        >
          <Link href="/account">登录并绑定</Link>
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-warning transition hover:bg-warning/10 hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          aria-label="关闭线上公共额度提示"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
