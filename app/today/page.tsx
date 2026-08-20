"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, ChefHat, Clock3, Eye, RefreshCw, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RecipeDetailDialog } from "@/components/RecipeDetailDialog";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildDishFeedbackSummary } from "@/lib/domain/dish-feedback";
import { getDayCodeForDate } from "@/lib/domain/menu";
import { readLocalMenus, saveLocalMenu } from "@/lib/local-menus";
import { readLocalModelConfig } from "@/lib/local-model-config";
import type { Dish, DishFeedbackEntry, MealMoment, NutritionSummary, Recipe, TodayMealOption, TodayMealRecommendation } from "@/lib/types";

const FEEDBACK_KEY = "yanhuofood.dishFeedback";
const optionLabels = { best_match: "首选方案", quick: "更省事", different: "换个口味" };

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readFeedback() {
  try { return JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) || "[]") as DishFeedbackEntry[]; } catch { return []; }
}

function splitValues(value: string) {
  return value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

function getOptionDishes(option: TodayMealOption): Dish[] {
  return option.dishes?.length ? option.dishes : [option.dish];
}

function sumNutrition(dishes: Dish[]): NutritionSummary | undefined {
  const total: NutritionSummary = {};
  for (const dish of dishes) {
    const nutrition = dish.nutrition || { calories: dish.calories };
    total.calories = (total.calories ?? 0) + (nutrition.calories ?? 0);
    total.protein_g = (total.protein_g ?? 0) + (nutrition.protein_g ?? 0);
    total.fat_g = (total.fat_g ?? 0) + (nutrition.fat_g ?? 0);
    total.carbs_g = (total.carbs_g ?? 0) + (nutrition.carbs_g ?? 0);
    total.fiber_g = (total.fiber_g ?? 0) + (nutrition.fiber_g ?? 0);
    total.sodium_mg = (total.sodium_mg ?? 0) + (nutrition.sodium_mg ?? 0);
  }
  return Object.keys(total).length > 0 ? total : undefined;
}

function dishToRecipe(dish: Dish, index: number): Recipe {
  return {
    id: dish.id || dish.source_recipe_id || `today-${dish.name}-${index}`,
    name: dish.name,
    cuisine: dish.tags?.[0] || "即时推荐",
    calories: dish.calories ?? dish.nutrition?.calories ?? 0,
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
    steps: (dish.steps || []).map((instruction, stepIndex) => ({ index: stepIndex + 1, instruction })),
    nutrition: dish.nutrition || { calories: dish.calories },
    quality_status: dish.evidence?.quality_status,
  };
}

export default function TodayMealPage() {
  const [mealMoment, setMealMoment] = useState<MealMoment>("dinner");
  const [diners, setDiners] = useState(1);
  const [dishesCount, setDishesCount] = useState(1);
  const [appetite, setAppetite] = useState("normal");
  const [physicalState, setPhysicalState] = useState("normal");
  const [occasion, setOccasion] = useState("solo");
  const [minutes, setMinutes] = useState(30);
  const [ingredients, setIngredients] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<TodayMealOption | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [saved, setSaved] = useState(false);

  const recommendation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/today-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            meal_moment: mealMoment,
            diners_count: diners,
            dishes_count: dishesCount,
            appetite,
            physical_state: physicalState,
            occasion,
            available_minutes: minutes,
            available_ingredients: splitValues(ingredients),
            note: note.trim() || undefined,
          },
          feedback_summary: buildDishFeedbackSummary(readFeedback()),
          model_config: readLocalModelConfig(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "生成失败，请稍后重试");
      return data as { recommendation: TodayMealRecommendation; source: "ai" | "sample"; warning?: string | null };
    },
    onSuccess: () => { setSelected(null); setSaved(false); setDetailRecipe(null); },
  });

  const saveTodayMeal = (option: TodayMealOption) => {
    const date = today();
    const mealType: "breakfast" | "lunch" | "dinner" | "snack" = mealMoment === "late_night" ? "snack" : mealMoment;
    const dishes = getOptionDishes(option);
    const existingRecord = readLocalMenus().find((record) => (record.start_date || record.data.start_date || record.data.week_start) === date);
    const existingDay = existingRecord?.data.days.find((day) => day.date === date) || (existingRecord?.data.days.length === 1 ? existingRecord.data.days[0] : undefined);
    const meal = {
      type: mealType,
      title: option.summary,
      name: dishes.map((dish) => dish.name).join("、"),
      dishes,
      calories: sumNutrition(dishes)?.calories || 0,
      nutrition: sumNutrition(dishes),
      reason: option.reason,
      warnings: option.warnings,
    };
    const meals = [...(existingDay?.meals || []).filter((item) => item.type !== mealType), meal];
    const menuDishes = meals.flatMap((item) => item.dishes || []);
    const nutrition = sumNutrition(menuDishes);
    saveLocalMenu({
      start_date: date,
      week_start: date,
      end_date: date,
      period_type: "day",
      schema_version: 2,
      days: [{ date, day: getDayCodeForDate(date), meals }],
      summary: nutrition,
    }, recommendation.data?.source || "local");
    setSelected(option);
    setSaved(true);
  };

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        eyebrow={<><Badge>即时推荐</Badge><Badge variant="secondary">只规划这一餐</Badge></>}
        title="今天这顿吃什么"
        description="告诉我此刻的状态，结合你的菜品反馈给出三个在家可执行的方案。确认后会保存这顿饭，并直接整理食材清单。"
      />

      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)] xl:items-start">
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader><CardTitle className="text-lg">这一顿的条件</CardTitle><CardDescription>只需填写当前真正影响选择的因素。</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>餐次</Label><SelectNative value={mealMoment} onChange={(e) => setMealMoment(e.target.value as MealMoment)}><option value="breakfast">早餐</option><option value="lunch">午餐</option><option value="dinner">晚餐</option><option value="late_night">夜宵</option></SelectNative></div>
              <div className="grid gap-2"><Label>人数</Label><Input type="number" min={1} max={20} value={diners} onChange={(e) => setDiners(Number(e.target.value) || 1)} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>这顿几个菜</Label><SelectNative value={dishesCount} onChange={(e) => setDishesCount(Number(e.target.value))}><option value={1}>1 个菜</option><option value={2}>2 个菜</option><option value={3}>3 个菜</option><option value={4}>4 个菜</option></SelectNative></div>
              <div className="grid gap-2"><Label>食欲</Label><SelectNative value={appetite} onChange={(e) => setAppetite(e.target.value)}><option value="low">没什么胃口</option><option value="normal">正常</option><option value="high">很饿</option></SelectNative></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>当前状态</Label><SelectNative value={physicalState} onChange={(e) => setPhysicalState(e.target.value)}><option value="normal">状态正常</option><option value="tired">有点累</option><option value="stomach_discomfort">胃口不舒服</option><option value="after_workout">刚运动完</option></SelectNative></div>
              <div className="grid gap-2"><Label>场景</Label><SelectNative value={occasion} onChange={(e) => setOccasion(e.target.value)}><option value="solo">一个人</option><option value="family">和家人</option><option value="friends">和朋友</option><option value="guests">招待客人</option></SelectNative></div>
            </div>
            <div className="grid gap-2"><Label>最多用时</Label><SelectNative value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={45}>45 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option></SelectNative></div>
            <div className="grid gap-2"><Label>家里现有食材</Label><Input value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="例如：鸡蛋、番茄、面条" /></div>
            <div className="grid gap-2"><Label>还有什么想法</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="例如：想吃热乎的，少洗锅" /></div>
            {physicalState === "stomach_discomfort" && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">仅作日常饮食参考，如持续不适请咨询专业人士。</p>}
            <Button size="lg" onClick={() => recommendation.mutate()} disabled={recommendation.isPending}>
              {recommendation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {recommendation.isPending ? "正在整理三个方案" : recommendation.data ? "换一批" : "给我三个建议"}
            </Button>
            {recommendation.error && <p className="text-sm text-destructive">{recommendation.error.message}</p>}
          </CardContent>
        </Card>

        <section aria-live="polite" className="min-w-0">
          {!recommendation.data && !recommendation.isPending && (
            <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-input bg-card/55 px-6 text-center shadow-inner">
              <div className="max-w-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Utensils className="h-7 w-7" /></div>
                <h2 className="mt-5 text-lg font-semibold text-foreground">从当下状态开始</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">生成后会看到三个不同方向，每个方案可以包含多个菜。确认后会保存到食材清单，不再自动跳到菜单页。</p>
              </div>
            </div>
          )}
          {recommendation.isPending && <div className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-80 animate-pulse rounded-xl border border-border bg-card/70" />)}</div>}
          {recommendation.data && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{recommendation.data.recommendation.guidance}</p>{recommendation.data.source === "sample" && <Badge variant="amber">样例推荐</Badge>}</div>
              {recommendation.data.warning && <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">{recommendation.data.warning}</p>}
              <div className="grid gap-4 lg:grid-cols-3">
                {recommendation.data.recommendation.options.map((option) => {
                  const dishes = getOptionDishes(option);
                  const maxCookingTime = Math.max(...dishes.map((dish) => dish.cooking_time_minutes || 0));
                  const totalCalories = sumNutrition(dishes)?.calories;
                  return (
                    <Card key={option.id} className={selected?.id === option.id ? "border-primary ring-1 ring-ring" : ""}>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2"><Badge variant={option.kind === "best_match" ? "default" : "secondary"}>{optionLabels[option.kind]}</Badge>{selected?.id === option.id && <Check className="h-5 w-5 text-primary" />}</div>
                        <CardTitle className="mt-3 text-lg">{dishes.map((dish) => dish.name).join("、")}</CardTitle>
                        <CardDescription>{option.summary}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />约 {maxCookingTime || "--"} 分钟</span><span className="inline-flex items-center gap-1"><ChefHat className="h-3.5 w-3.5" />{dishes.length} 个菜</span>{totalCalories ? <span>{Math.round(totalCalories)} kcal</span> : null}</div>
                        <p className="text-sm leading-6 text-foreground">{option.reason}</p>
                        <div className="space-y-2">
                          {dishes.map((dish, dishIndex) => (
                            <div key={`${dish.name}-${dishIndex}`} className="rounded-lg border border-border bg-muted/70 p-3">
                              <div className="flex items-start justify-between gap-2"><p className="font-semibold text-foreground">{dish.name}</p><Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => setDetailRecipe(dishToRecipe(dish, dishIndex))}><Eye className="h-3.5 w-3.5" />查看详情</Button></div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{dish.ingredients?.map((item) => item.name).join("、") || "按做法准备"}</p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{dish.cooking_time_minutes || "--"} 分钟</span><span>{dish.difficulty === "medium" ? "中等" : dish.difficulty === "hard" ? "较复杂" : "简单"}</span></div>
                            </div>
                          ))}
                        </div>
                        {option.warnings.map((warning) => <p key={warning} className="text-xs leading-5 text-warning">{warning}</p>)}
                        <Button className="w-full" variant={selected?.id === option.id ? "outline" : "default"} onClick={() => saveTodayMeal(option)}>{selected?.id === option.id ? <Check className="h-4 w-4" /> : <ShoppingBasket className="h-4 w-4" />}{selected?.id === option.id ? "已保存这顿饭" : "选这个并保存到今天"}</Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {saved && <div className="mt-5 flex flex-wrap items-center gap-3 border border-primary/30 bg-primary/10 px-4 py-3"><p className="mr-auto text-sm font-medium text-primary">已保存今天的{mealMoment === "late_night" ? "夜宵" : mealMoment === "breakfast" ? "早餐" : mealMoment === "lunch" ? "午餐" : "晚餐"}，共 {selected ? getOptionDishes(selected).length : 0} 个菜。可以直接去整理食材。</p><Button asChild><Link href="/ingredients">去食材清单<ShoppingBasket className="h-4 w-4" /></Link></Button></div>}
            </>
          )}
        </section>
      </div>
      {detailRecipe && <RecipeDetailDialog recipe={detailRecipe} onClose={() => setDetailRecipe(null)} />}
    </main>
  );
}
