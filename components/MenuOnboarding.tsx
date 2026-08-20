"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "yanhuofood.menuOnboardingCompleted";

const steps = [
  {
    selector: "#menu-generation-settings",
    title: "先确认本次条件",
    description: "人数、天数、餐次和忌口是最关键的条件；口味、健康、预算和烹饪时间可以在高级条件中调整。",
  },
  {
    selector: "#menu-generate-action",
    title: "生成本周菜单",
    description: "AI 通常需要几十秒。生成期间按钮会锁定，刷新或暂时离开后也能恢复任务状态。",
  },
  {
    selector: "#menu-history",
    title: "随时找回历史菜单",
    description: "生成和保存过的菜单会按周期显示在这里，方便查看、复制到下周或继续调整。",
  },
];

export default function MenuOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    const timer = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.querySelectorAll("[data-onboarding-active]").forEach((element) => {
      element.removeAttribute("data-onboarding-active");
    });
    if (!open) return;
    const target = document.querySelector(steps[step].selector);
    target?.setAttribute("data-onboarding-active", "true");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => target?.removeAttribute("data-onboarding-active");
  }, [open, step]);

  const finish = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  if (!open) return null;

  const current = steps[step];
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-50 mx-auto w-auto max-w-lg rounded-lg border border-primary/20 bg-card p-4 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[420px]"
      aria-live="polite"
      aria-label="菜单工作台新手引导"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary">快速上手 · {step + 1}/{steps.length}</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{current.title}</h2>
        </div>
        <button
          type="button"
          onClick={finish}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          aria-label="跳过新手引导"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{current.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={finish}>跳过</Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeft className="h-4 w-4" />
              上一步
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => step === steps.length - 1 ? finish() : setStep((value) => value + 1)}>
            {step === steps.length - 1 ? "开始使用" : "下一步"}
            {step < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
