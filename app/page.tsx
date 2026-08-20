"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Clock3,
  MapPinned,
  Settings2,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics/client";
import { getMealName, getMenuEndDate, getMenuStartDate } from "@/lib/domain/menu";
import { menuTemplates } from "@/lib/domain/menu-templates";
import { mergeMenuRecords, readLocalMenus, type LocalMenuRecord } from "@/lib/local-menus";
import type { Day, IngredientUsage, Meal, Menu } from "@/lib/types";

const templateIcons = [Utensils, Clock3, CalendarDays];

const mealTypeLabel: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};

const commonTools = [
  {
    title: "食材清单",
    description: "把菜单变成可执行采购单",
    href: "/ingredients",
    icon: ShoppingBasket,
    tone: "bg-violet-50 text-violet-700",
  },
  {
    title: "食谱库",
    description: "查看做法和常用菜品",
    href: "/recipes",
    icon: ChefHat,
    tone: "bg-rose-50 text-rose-700",
  },
];

function formatDate(date?: string) {
  if (!date) return "未设置";
  const [, month, day] = date.split("-");
  if (!month || !day) return date;
  return `${Number(month)}月${Number(day)}日`;
}

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDishNames(meal: Meal) {
  const names = meal.dishes?.map((dish) => dish.name).filter(Boolean) || [];
  return names.length
    ? names
    : getMealName(meal)
        .split("、")
        .map((name) => name.trim())
        .filter(Boolean);
}

function getIngredients(menu?: Menu | null) {
  if (!menu) return [];
  const byName = new Map<string, IngredientUsage>();
  for (const day of menu.days || []) {
    for (const meal of day.meals || []) {
      for (const dish of meal.dishes || []) {
        for (const item of [...(dish.ingredients || []), ...(dish.seasonings || [])]) {
          if (item.name && !byName.has(item.name)) byName.set(item.name, item);
        }
      }
    }
  }
  return Array.from(byName.values());
}

function summarizeMenu(menu?: Menu | null) {
  const days = menu?.days || [];
  const meals = days.flatMap((day) => day.meals || []);
  return {
    dayCount: days.length,
    mealCount: meals.length,
    dishCount: meals.flatMap((meal) => getDishNames(meal)).length,
    ingredientCount: getIngredients(menu).length,
  };
}

function getFocusDay(menu?: Menu | null): Day | null {
  if (!menu?.days?.length) return null;
  return menu.days.find((day) => day.date === todayDate()) || menu.days[0] || null;
}

function sourceLabel(source?: LocalMenuRecord["source"]) {
  if (source === "ai") return "AI 生成";
  if (source === "sample") return "示例菜单";
  if (source === "cache") return "缓存菜单";
  return "本地菜单";
}

export default function Home() {
  const [localMenus, setLocalMenus] = useState<LocalMenuRecord[]>([]);
  const [executedShoppingItems, setExecutedShoppingItems] = useState(0);

  useEffect(() => {
    setLocalMenus(readLocalMenus());
    try {
      const states = JSON.parse(
        window.localStorage.getItem("yanhuofood.shoppingListState") || "{}",
      );
      const executed = Object.values(
        states as Record<string, { item_states?: Record<string, string> }>,
      ).reduce(
        (count, state) =>
          count +
          Object.values(state.item_states || {}).filter((value) => value === "purchased").length,
        0,
      );
      setExecutedShoppingItems(executed);
    } catch {
      setExecutedShoppingItems(0);
    }
  }, []);

  const list = useQuery({
    queryKey: ["menus"],
    queryFn: async () => {
      const res = await fetch("/api/menus/generate");
      return res.json();
    },
  });

  const modelStatus = useQuery({
    queryKey: ["model-status"],
    queryFn: async () => {
      const res = await fetch("/api/model/test", { cache: "no-store" });
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const menus = useMemo(
    () => mergeMenuRecords((list.data?.menus || []) as LocalMenuRecord[], localMenus),
    [list.data?.menus, localMenus],
  );
  const latestRecord = menus[0];
  const latest = latestRecord?.data || null;
  const olderMenus = menus.slice(1, 4);
  const summary = summarizeMenu(latest);
  const focusDay = getFocusDay(latest);
  const hasMenu = Boolean(latest);
  const dateRange = latest
    ? `${formatDate(getMenuStartDate(latest))} - ${formatDate(getMenuEndDate(latest))}`
    : "尚未生成菜单";

  const serverModelConfigured = Boolean(modelStatus.data?.server?.configured);
  const hostedModelConfigured = Boolean(modelStatus.data?.server?.hostedConfigured);
  const hostedModelLocked = hostedModelConfigured && !serverModelConfigured;
  const shouldShowModelConfig =
    modelStatus.isFetched && !serverModelConfigured && !hostedModelLocked;

  const hasExecutedPlan = hasMenu && executedShoppingItems >= 3;
  const primaryNextHref = !hasMenu ? "/menus" : hasExecutedPlan ? "/menus?next=1" : "/ingredients";
  const primaryNextLabel = !hasMenu
    ? "生成第一份菜单"
    : hasExecutedPlan
      ? "规划下周菜单"
      : "继续采购清单";

  return (
    <motion.main
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(28_25_23/0.04),0_12px_30px_rgb(28_25_23/0.04)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>饮食工作台</Badge>
              {hasMenu ? <Badge variant="secondary">当前计划 {dateRange}</Badge> : null}
            </div>
            <h1 className="mt-6 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
              {hasMenu ? "今天吃什么、买什么，从这里继续。" : "把吃什么，变成一份可以执行的计划。"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              {hasMenu
                ? "继续当前菜单，查看今天餐次，或者在不想做饭时直接找附近餐馆。"
                : "根据人数、口味、忌口和健康目标生成菜单，并自动衔接采购清单与食谱。"}
            </p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="col-span-2 w-full sm:w-auto">
                <Link
                  href={primaryNextHref}
                  aria-label={hasMenu && !hasExecutedPlan ? "生成采购清单" : undefined}
                >
                  {hasExecutedPlan ? (
                    <CalendarDays className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {primaryNextLabel}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/today">
                  <Utensils className="h-4 w-4" />
                  今天吃什么
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/nearby">
                  <MapPinned className="h-4 w-4" />
                  附近吃什么
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex h-full flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {hasMenu ? (
                  <CalendarDays className="h-4 w-4 text-primary" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
                {hasMenu ? "当前菜单" : "常用场景"}
              </div>
              {hasMenu ? (
                <Badge variant="secondary">{sourceLabel(latestRecord?.source)}</Badge>
              ) : null}
            </div>

            {hasMenu ? (
              <>
                <p className="mt-5 text-2xl font-semibold tracking-tight">{dateRange}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {executedShoppingItems
                    ? `采购清单已完成 ${executedShoppingItems} 项。`
                    : "菜单已准备好，下一步可以整理采购清单。"}
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    ["天数", `${summary.dayCount} 天`],
                    ["餐次", `${summary.mealCount} 餐`],
                    ["菜品", `${summary.dishCount} 道`],
                    ["食材", `${summary.ingredientCount} 种`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-primary/10 bg-card/80 px-3 py-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 border-primary/20 bg-card text-primary hover:bg-primary/10"
                >
                  <Link href="/menus">
                    查看完整菜单
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <p className="mt-4 text-2xl font-semibold tracking-tight">选择一个模板开始</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  人数、餐次和忌口都可以在生成前调整。
                </p>
                <div className="mt-5 space-y-2.5">
                  {menuTemplates.map((template, index) => {
                    const Icon = templateIcons[index] || Sparkles;
                    return (
                      <Link
                        key={template.id}
                        href={template.href}
                        onClick={() =>
                          trackProductEvent("template_selected", { template_id: template.id })
                        }
                        className="group flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3 transition hover:border-primary/30 hover:bg-primary/10"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">
                            {template.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {template.dinersCount} 人 · {template.days} 天 · {template.mealCount} 餐/天
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {shouldShowModelConfig ? (
        <section className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                <Settings2 className="h-4 w-4" />
                使用 AI 生成前，需要先配置模型
              </div>
              <p className="mt-1 text-sm text-warning">配置只需完成一次，也可以先使用今天或附近功能。</p>
            </div>
            <Button asChild variant="outline" className="border-warning/40 bg-card text-warning">
              <Link href="/model-settings">
                去配置
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section
        className={`mt-6 grid gap-5 ${hasMenu && focusDay ? "lg:grid-cols-[1.15fr_0.85fr]" : ""}`}
      >
        {hasMenu && focusDay ? (
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">今天的安排</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">
                    {formatDate(focusDay.date)} · {focusDay.meals.length} 餐
                  </h2>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/today">
                    查看今天
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-5 divide-y divide-border rounded-xl border border-border">
                {focusDay.meals.slice(0, 4).map((meal, index) => (
                  <div
                    key={`${meal.type || index}-${getMealName(meal)}`}
                    className="flex items-start gap-4 px-4 py-3"
                  >
                    <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground">
                      {mealTypeLabel[meal.type || ""] || meal.title || `第 ${index + 1} 餐`}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-foreground">
                      {getDishNames(meal).slice(0, 3).join("、") || "待补充菜品"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div>
              <p className="text-sm font-medium text-primary">常用工具</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">直接进入你要做的事</h2>
            </div>
            <div
              className={`mt-5 grid gap-3 sm:grid-cols-2 ${
                hasMenu && focusDay ? "lg:grid-cols-1 xl:grid-cols-2" : ""
              }`}
            >
              {commonTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.title}
                    href={tool.href}
                    className="group rounded-xl border border-border p-4 transition hover:border-primary/30 hover:bg-primary/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tool.tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{tool.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{tool.description}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {olderMenus.length ? (
        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">最近使用</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">之前的菜单</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/menus">
                查看全部
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {olderMenus.map((record, index) => {
              const itemSummary = summarizeMenu(record.data);
              const range = `${formatDate(getMenuStartDate(record.data))} - ${formatDate(getMenuEndDate(record.data))}`;
              return (
                <Link key={`${record.id || range}-${index}`} href="/menus" className="group">
                  <Card className="h-full transition hover:border-primary/30 hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline">{sourceLabel(record.source)}</Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                      <p className="mt-4 font-semibold text-foreground">{range}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {itemSummary.dayCount} 天 · {itemSummary.mealCount} 餐 · {itemSummary.dishCount} 道菜
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </motion.main>
  );
}
