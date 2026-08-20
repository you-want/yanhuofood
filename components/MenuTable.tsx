"use client";

import { type ReactNode, useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { Ban, CheckCheck, Download, ExternalLink, Eye, FileDown, Heart, Printer, RefreshCw, Search, Shuffle, X } from "lucide-react";
import { RecipeQuestionPanel } from "@/components/RecipeQuestionPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/analytics/client";
import { normalizeDishFeedbackName } from "@/lib/domain/dish-feedback";
import { getMealCalories, getMealName, getMenuStartDate } from "@/lib/domain/menu";
import { buildDouyinSearchUrl } from "@/lib/recipe-media";
import type { Day, Dish, DishFeedbackEntry, DishFeedbackValue, Meal, Menu, Recipe } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReplaceReason = "dislike" | "hard_to_buy" | "too_complex" | "too_expensive" | "repeated" | "other";

const replacementReasons: Array<{ value: ReplaceReason; label: string }> = [
  { value: "dislike", label: "不爱吃" },
  { value: "hard_to_buy", label: "食材难买" },
  { value: "too_complex", label: "太复杂" },
  { value: "too_expensive", label: "太贵" },
  { value: "repeated", label: "重复" },
  { value: "other", label: "其他" },
];

function dayLabel(day: string) {
  const map: Record<string, string> = {
    Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日",
  };
  return map[day] || day;
}

function mealTypeLabel(type: string) {
  const map: Record<string, string> = {
    breakfast: "早餐",
    lunch: "午餐",
    dinner: "晚餐",
    snack: "加餐",
  };
  return map[type] || "餐次";
}

function fullDayLabel(day: Day) {
  const label = dayLabel(day.day);
  return day.date ? `${day.date} ${label}` : label;
}

function dishToRecipe(dish: Dish, meal: Meal): Recipe {
  return {
    id: dish.id || dish.source_recipe_id || `menu-${dish.name}`,
    name: dish.name,
    cuisine: dish.tags?.[0] || "菜单菜品",
    calories: dish.calories ?? dish.nutrition?.calories ?? meal.calories ?? 0,
    ingredients: (dish.ingredients || []).map((item) => item.name),
    instructions: (dish.steps || []).join("\n"),
    tags: dish.tags || [],
    source_recipe_id: dish.source_recipe_id,
    source_url: dish.source_url,
    source_name: dish.source_name,
    evidence: dish.evidence,
    servings: dish.servings,
    cooking_time_minutes: dish.cooking_time_minutes,
    difficulty: dish.difficulty,
    ingredient_details: (dish.ingredients || []).map((item) => ({ ...item, normalized_name: item.name.trim().toLowerCase() })),
    seasonings: (dish.seasonings || []).map((item) => ({ ...item, normalized_name: item.name.trim().toLowerCase() })),
    steps: (dish.steps || []).map((instruction, index) => ({ index: index + 1, instruction })),
    nutrition: dish.nutrition || { calories: dish.calories },
    quality_status: dish.evidence?.quality_status,
  };
}

function defaultMealLabels(n: number): string[] {
  if (n === 5) return ["早餐", "加餐", "午餐", "午点", "晚餐"];
  if (n === 4) return ["早餐", "午餐", "晚餐", "加餐"];
  return ["早餐", "午餐", "晚餐"];
}

interface EditableCellProps {
  meal: Meal | undefined;
  day: Day;
  dayIndex: number;
  mealIndex: number;
  showEnergy: boolean;
  inlineEnergy?: boolean;
  onUpdate: (name: string, calories: number) => void;
  onOpenDetails: (payload: { day: Day; meal: Meal; dish?: Dish; dishIndex?: number }) => void;
  onRequestReplace?: (target: { dayIndex: number; mealIndex: number; dishIndex?: number; scope: "meal" | "dish" }) => void;
  isReplacing?: boolean;
  generationState?: "complete" | "active" | "pending";
}

function EditableCell({
  meal,
  day,
  dayIndex,
  mealIndex,
  showEnergy,
  inlineEnergy = true,
  onUpdate,
  onOpenDetails,
  onRequestReplace,
  isReplacing,
  generationState,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(getMealName(meal));
  const [calories, setCalories] = useState(String(getMealCalories(meal) || ""));

  useEffect(() => {
    setName(getMealName(meal));
    setCalories(String(getMealCalories(meal) || ""));
  }, [meal]);

  const handleSave = () => {
    const cal = parseInt(calories) || 0;
    onUpdate(name, cal);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setIsEditing(false);
  };

  if (isEditing) {
    return (
      <td className="border-b border-border bg-primary/10 p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-input px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {showEnergy && (
          <input
            type="number"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mt-1 w-24 rounded-md border border-input px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="kcal"
          />
        )}
        <div className="mt-1 flex gap-1">
          <button onClick={handleSave} className="text-xs font-medium text-primary hover:text-primary">确定</button>
          <button onClick={() => setIsEditing(false)} className="text-xs text-muted-foreground hover:text-foreground">取消</button>
        </div>
      </td>
    );
  }

  const generationLocked = generationState !== undefined;

  return (
    <td
      onClick={() => {
        if (!generationLocked) setIsEditing(true);
      }}
      className={cn(
        "border-b border-border p-2 text-foreground transition",
        generationLocked ? "cursor-default bg-muted/60" : "cursor-pointer hover:bg-primary/10"
      )}
    >
      {meal ? (
        <div className="space-y-2">
          <div className="flex items-start gap-1">
            <span className="min-w-0">
              {getMealName(meal)}{showEnergy && inlineEnergy && (!generationLocked || getMealCalories(meal) > 0) ? ` · ${getMealCalories(meal)} kcal` : ""}
            </span>
            {isReplacing && <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          </div>
          {(generationState === "active" || generationState === "pending") && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {generationState === "active" && <RefreshCw className="h-3 w-3 animate-spin text-primary" />}
              <span>{generationState === "active" ? "正在补充详情" : "等待补充详情"}</span>
            </div>
          )}
          {!generationLocked && <div className="flex flex-wrap gap-1 print:hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails({ day, meal });
              }}
              title="查看站内做法"
              className="inline-flex h-6 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <Eye className="h-3 w-3" />
              详情
            </button>
            {meal.dishes?.[0] && onRequestReplace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestReplace({ dayIndex, mealIndex, dishIndex: 0, scope: "dish" });
                }}
                title="只换一道菜"
                className="inline-flex h-6 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
              >
                <Shuffle className="h-3 w-3" />
                换菜
              </button>
            )}
            {onRequestReplace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestReplace({ dayIndex, mealIndex, scope: "meal" });
                }}
                title="替换整餐"
                className="inline-flex h-6 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
              >
                <RefreshCw className="h-3 w-3" />
                整餐
              </button>
            )}
            <a
              href={buildDouyinSearchUrl(getMealName(meal))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              title="在抖音搜索做法"
              aria-label={`在抖音搜索${getMealName(meal)}做法`}
              className="inline-flex h-6 items-center justify-center rounded border border-border bg-card px-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <Search className="h-3 w-3" />
            </a>
          </div>}
        </div>
      ) : (
        <span className="text-muted-foreground">点击编辑</span>
      )}
    </td>
  );
}

export default function MenuTable({ 
  menu, 
  layout = "three", 
  mealCount = 3, 
  labels, 
  showEnergy = true,
  onUpdateMenu,
  toolbarActions,
  onReplace,
  replacingTarget,
  dishFeedback,
  onDishFeedback,
  generationProgress,
}: { 
  menu: Menu; 
  layout?: "list" | "three" | "matrix"; 
  mealCount?: number; 
  labels?: string[]; 
  showEnergy?: boolean;
  onUpdateMenu?: (menu: Menu) => void;
  toolbarActions?: ReactNode;
  onReplace?: (target: { dayIndex: number; mealIndex: number; dishIndex?: number; scope: "meal" | "dish"; reason: ReplaceReason }) => void;
  replacingTarget?: string | null;
  dishFeedback?: Record<string, DishFeedbackEntry>;
  onDishFeedback?: (input: { dishName: string; feedback: DishFeedbackValue }) => void;
  generationProgress?: {
    completedDays: number;
    currentDay?: number | null;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mealLabels = labels && labels.length ? labels : defaultMealLabels(mealCount);
  const [detailTarget, setDetailTarget] = useState<{ day: Day; meal: Meal; dish?: Dish; dishIndex?: number } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ dayIndex: number; mealIndex: number; dishIndex?: number; scope: "meal" | "dish" } | null>(null);
  const generationStateForDay = (dayIndex: number) => {
    if (!generationProgress) return undefined;
    if (dayIndex < generationProgress.completedDays) return "complete" as const;
    if (dayIndex === generationProgress.currentDay) return "active" as const;
    return "pending" as const;
  };

  const handleUpdateMeal = (dayIndex: number, mealIndex: number, name: string, calories: number) => {
    if (!onUpdateMenu) return;
    const newMenu: Menu = JSON.parse(JSON.stringify(menu));
    if (!newMenu.days[dayIndex].meals[mealIndex]) {
      newMenu.days[dayIndex].meals[mealIndex] = { name: "", calories: 0 };
    }
    const meal = newMenu.days[dayIndex].meals[mealIndex];
    const nameChanged = getMealName(meal) !== name;
    meal.name = name;
    meal.calories = calories;
    meal.nutrition = nameChanged ? { calories } : { ...(meal.nutrition || {}), calories };
    meal.warnings = nameChanged
      ? Array.from(new Set([...(meal.warnings || []), "手动编辑后需重新计算食材和营养。"]))
      : meal.warnings || [];
    if (newMenu.days[dayIndex].meals[mealIndex].dishes?.length) {
      const dish = newMenu.days[dayIndex].meals[mealIndex].dishes![0];
      dish.name = name;
      dish.calories = calories;
      dish.nutrition = nameChanged ? { calories } : { ...(dish.nutrition || {}), calories };
      if (nameChanged) {
        dish.ingredients = [];
        dish.seasonings = [];
        dish.steps = [];
        dish.tags = Array.from(new Set([...(dish.tags || []), "需重新计算"]));
      }
    }
    onUpdateMenu(newMenu);
  };

  const openDetails = (payload: { day: Day; meal: Meal; dish?: Dish; dishIndex?: number }) => {
    setDetailTarget(payload);
    trackProductEvent("recipe_viewed", {
      recipe_id: payload.dish?.id || payload.meal.id || "menu_meal",
      entry: "menu_table",
    });
  };

  const detailDish = detailTarget?.dish || detailTarget?.meal.dishes?.[0] || null;
  const detailDishes = detailTarget?.meal.dishes || [];
  const detailDishName = detailDish?.name || (detailTarget ? getMealName(detailTarget.meal) : "");
  const detailFeedback = detailDishName ? dishFeedback?.[normalizeDishFeedbackName(detailDishName)] : undefined;
  const feedbackButtons: Array<{ value: DishFeedbackValue; label: string; active: boolean; icon: typeof Heart }> = [
    { value: "liked", label: "喜欢", active: !!detailFeedback?.liked, icon: Heart },
    { value: "blocked", label: "不想再吃", active: !!detailFeedback?.blocked, icon: Ban },
    { value: "cooked", label: "做过了", active: !!detailFeedback?.cooked, icon: CheckCheck },
  ];

  const handleDownloadCSV = () => {
    const rows: string[] = [showEnergy ? "日期,餐次,菜名,热量(kcal)" : "日期,餐次,菜名"];    
    for (const d of menu.days) {
      for (let i = 0; i < mealCount; i++) {
        const m = d.meals[i];
        if (!m) {
          rows.push(showEnergy ? `${fullDayLabel(d)},${mealLabels[i]},,` : `${fullDayLabel(d)},${mealLabels[i]},`);
        } else {
          rows.push(showEnergy ? `${fullDayLabel(d)},${mealLabels[i]},${getMealName(m)},${getMealCalories(m)}` : `${fullDayLabel(d)},${mealLabels[i]},${getMealName(m)}`);
        }
      }
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `菜单_${getMenuStartDate(menu)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    if (!ref.current) return;
    const dataUrl = await toPng(ref.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `菜单_${getMenuStartDate(menu)}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!ref.current) return;

    const iframe = document.createElement("iframe");
    iframe.title = "打印菜单";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join("\n");
    const menuHtml = ref.current.outerHTML;

    document.body.appendChild(iframe);

    const printDocument = iframe.contentDocument;
    if (!printDocument) {
      iframe.remove();
      return;
    }

    let printed = false;
    const cleanup = () => {
      iframe.remove();
    };
    const printFrame = () => {
      if (printed || !document.body.contains(iframe)) return;
      printed = true;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(cleanup, 1000);
    };

    iframe.onload = printFrame;

    printDocument.open();
    printDocument.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>菜单_${getMenuStartDate(menu)}</title>
          ${styles}
          <style>
            @page { margin: 14mm; }
            html, body { background: #ffffff !important; color: #1c1917; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
            .print\\:hidden { display: none !important; }
            table { width: 100%; border-collapse: collapse; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          </style>
        </head>
        <body>${menuHtml}</body>
      </html>`);
    printDocument.close();

    window.setTimeout(printFrame, 100);
  };

  const startDate = getMenuStartDate(menu);
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + (menu.days.length - 1));
  const rangeStr = `${startDate} ~ ${end.toISOString().slice(0,10)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleDownloadCSV} variant="outline" size="sm" disabled={!!generationProgress}>
            <FileDown className="h-4 w-4" />
            CSV
          </Button>
          <Button onClick={handleDownloadPNG} variant="outline" size="sm" disabled={!!generationProgress}>
            <Download className="h-4 w-4" />
            图片
          </Button>
          <Button onClick={handlePrint} variant="outline" size="sm" disabled={!!generationProgress}>
            <Printer className="h-4 w-4" />
            打印
          </Button>
        </div>
        {toolbarActions && <div className="flex flex-wrap gap-2 sm:justify-end">{toolbarActions}</div>}
      </div>

      <div ref={ref} className="overflow-x-auto rounded-lg border border-border bg-card p-3 shadow-xs">
        <div className="text-center mb-2">
          <div className="font-semibold text-foreground">每周营养餐单</div>
          <div className="text-sm text-muted-foreground">{rangeStr}</div>
        </div>

        {layout === "matrix" ? (
          <table className="min-w-[900px] w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border-b border-border p-2 w-20 text-muted-foreground">餐次</th>
                {menu.days.map((d) => (
                  <th key={d.date || d.day} className="border-b border-border p-2 text-muted-foreground">
                    <span className="block">{dayLabel(d.day)}</span>
                    {d.date && <span className="block text-xs font-normal text-muted-foreground">{d.date}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mealLabels.map((label, mealIndex) => (
                <tr key={label}>
                  <td className="border-b border-border p-2 font-medium text-foreground">{label}</td>
                  {menu.days.map((d, dayIndex) => {
                    const m = d.meals[mealIndex];
                    return (
                      <EditableCell
                        key={`${d.date || d.day}-${mealIndex}`}
                        day={d}
                        dayIndex={dayIndex}
                        mealIndex={mealIndex}
                        meal={m}
                        showEnergy={showEnergy}
                        onUpdate={(name, calories) => handleUpdateMeal(dayIndex, mealIndex, name, calories)}
                        onOpenDetails={openDetails}
                        onRequestReplace={onReplace ? setReplaceTarget : undefined}
                        isReplacing={replacingTarget === `${dayIndex}-${mealIndex}-meal` || replacingTarget === `${dayIndex}-${mealIndex}-dish-0`}
                        generationState={generationStateForDay(dayIndex)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : layout === "three" ? (
          <table className="min-w-[720px] w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border-b border-border p-2 text-muted-foreground">日期</th>
                {mealLabels.map((l) => (
                  <th key={l} className="border-b border-border p-2 text-muted-foreground">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menu.days.map((d, dayIndex) => {
                return (
                  <tr key={d.date || d.day}>
                    <td className="border-b border-border p-2 font-medium text-foreground">{fullDayLabel(d)}</td>
                    {mealLabels.map((l, mealIndex) => {
                      const m = d.meals[mealIndex];
                      return (
                        <EditableCell
                          key={`${d.date || d.day}-${l}`}
                          day={d}
                          dayIndex={dayIndex}
                          mealIndex={mealIndex}
                          meal={m}
                          showEnergy={showEnergy}
                          onUpdate={(name, calories) => handleUpdateMeal(dayIndex, mealIndex, name, calories)}
                          onOpenDetails={openDetails}
                          onRequestReplace={onReplace ? setReplaceTarget : undefined}
                          isReplacing={replacingTarget === `${dayIndex}-${mealIndex}-meal` || replacingTarget === `${dayIndex}-${mealIndex}-dish-0`}
                          generationState={generationStateForDay(dayIndex)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="min-w-[560px] w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border-b border-border p-2 text-muted-foreground">日期</th>
                <th className="border-b border-border p-2 text-muted-foreground">餐次</th>
                <th className="border-b border-border p-2 text-muted-foreground">菜名</th>
                {showEnergy && <th className="border-b border-border p-2 text-muted-foreground">热量(kcal)</th>}
              </tr>
            </thead>
            <tbody>
              {menu.days.map((d, dayIndex) => (
                Array.from({ length: mealCount }).map((_, mealIndex) => {
                  const m = d.meals[mealIndex];
                  return (
                    <tr key={`${d.date || d.day}-${mealIndex}`}>
                      <td className="whitespace-nowrap border-b border-border p-2 font-medium text-foreground">{fullDayLabel(d)}</td>
                      <td className="whitespace-nowrap border-b border-border p-2 text-muted-foreground">{mealLabels[mealIndex]}</td>
                      <EditableCell
                        day={d}
                        dayIndex={dayIndex}
                        mealIndex={mealIndex}
                        meal={m}
                        showEnergy={showEnergy}
                        inlineEnergy={false}
                        onUpdate={(name, calories) => handleUpdateMeal(dayIndex, mealIndex, name, calories)}
                        onOpenDetails={openDetails}
                        onRequestReplace={onReplace ? setReplaceTarget : undefined}
                        isReplacing={replacingTarget === `${dayIndex}-${mealIndex}-meal` || replacingTarget === `${dayIndex}-${mealIndex}-dish-0`}
                        generationState={generationStateForDay(dayIndex)}
                      />
                      {showEnergy && (
                        <td className="border-b border-border p-2 text-foreground">
                          {m ? `${getMealCalories(m)} kcal` : <span className="text-muted-foreground">-</span>}
                        </td>
                      )}
                    </tr>
                  );
                })
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detailTarget && (
        <div className="fixed inset-0 z-50 bg-foreground/30 p-3 print:hidden" onClick={() => setDetailTarget(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-dish-detail-title"
            className="ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden rounded-lg bg-card shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{fullDayLabel(detailTarget.day)} · {mealTypeLabel(detailTarget.meal.type || "")}</p>
                <h3 id="menu-dish-detail-title" className="mt-1 text-lg font-semibold text-foreground">{detailDish?.name || getMealName(detailTarget.meal)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="关闭详情"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {detailDishes.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {detailDishes.map((dish, index) => (
                    <button
                      key={`${dish.name}-${index}`}
                      type="button"
                      onClick={() => setDetailTarget({ ...detailTarget, dish, dishIndex: index })}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/30 hover:text-primary"
                    >
                      {dish.name}
                    </button>
                  ))}
                </div>
              )}

              {detailDish && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={detailDish.source_kind === "trusted" ? "default" : "secondary"}>
                    {detailDish.source_kind === "trusted" ? "可信菜谱" : "AI 生成菜品"}
                  </Badge>
                  {detailDish.source_name && <Badge variant="outline">{detailDish.source_name}</Badge>}
                </div>
              )}

              {detailDish?.evidence?.reasons?.length ? (
                <section className="rounded-md border border-primary/20 bg-primary/10 px-3 py-3">
                  <h4 className="text-xs font-semibold text-primary">为什么推荐</h4>
                  <ul className="mt-1 space-y-1 text-sm text-foreground">
                    {detailDish.evidence.reasons.map((reason) => <li key={reason}>· {reason}</li>)}
                  </ul>
                </section>
              ) : null}

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">热量</p>
                  <p className="mt-1 font-semibold text-foreground">{Math.round(detailDish?.calories ?? detailDish?.nutrition?.calories ?? getMealCalories(detailTarget.meal)) || "--"} kcal</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">耗时</p>
                  <p className="mt-1 font-semibold text-foreground">{detailDish?.cooking_time_minutes ? `${detailDish.cooking_time_minutes} 分钟` : "--"}</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">难度</p>
                  <p className="mt-1 font-semibold text-foreground">{detailDish?.difficulty || "--"}</p>
                </div>
              </div>

              {detailDishName && (
                <Button asChild className="w-full sm:w-auto">
                  <a
                    href={buildDouyinSearchUrl(detailDishName)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Search className="h-4 w-4" />
                    在抖音搜索做法
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}

              <section>
                <h4 className="text-sm font-semibold text-foreground">食材</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...(detailDish?.ingredients || []), ...(detailDish?.seasonings || [])].length > 0
                    ? [...(detailDish?.ingredients || []), ...(detailDish?.seasonings || [])].map((item) => (
                        <span key={`${item.category}-${item.name}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground">
                          {item.name}{typeof item.amount === "number" ? ` ${item.amount}${item.unit || ""}` : item.unit ? ` ${item.unit}` : ""}
                        </span>
                      ))
                    : <p className="text-sm text-muted-foreground">暂无结构化食材；可替换或重新生成补齐。</p>}
                </div>
              </section>

              {onDishFeedback && detailDishName && (
                <section>
                  <h4 className="text-sm font-semibold text-foreground">菜品反馈</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {feedbackButtons.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.value}
                          type="button"
                          size="sm"
                          variant={item.active ? "default" : "outline"}
                          onClick={() => onDishFeedback({ dishName: detailDishName, feedback: item.value })}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h4 className="text-sm font-semibold text-foreground">步骤</h4>
                {detailDish?.steps?.length ? (
                  <ol className="mt-2 space-y-2">
                    {detailDish.steps.map((step, index) => (
                      <li key={`${index}-${step}`} className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-foreground">
                        {index + 1}. {step}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">暂无站内步骤。</p>
                )}
              </section>

              {detailDish && (
                <RecipeQuestionPanel recipe={dishToRecipe(detailDish, detailTarget.meal)} dinersCount={detailDish.servings} />
              )}

              {detailTarget.meal.warnings?.length ? (
                <section className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  {detailTarget.meal.warnings.join("；")}
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      )}

      {replaceTarget && onReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-3 print:hidden" onClick={() => setReplaceTarget(null)}>
          <div className="w-full max-w-md rounded-lg bg-card p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">{replaceTarget.scope === "dish" ? "换一道菜" : "替换整餐"}</h3>
                <p className="mt-1 text-sm text-muted-foreground">选择原因后会只更新当前目标，其他餐次保持不变。</p>
              </div>
              <button
                type="button"
                onClick={() => setReplaceTarget(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="关闭替换原因"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {replacementReasons.map((reason) => (
                <Button
                  key={reason.value}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onReplace({ ...replaceTarget, reason: reason.value });
                    setReplaceTarget(null);
                  }}
                >
                  {reason.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
