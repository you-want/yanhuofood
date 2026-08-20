"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookPlus, CalendarDays, LayoutGrid, List, RotateCw, Save, Sparkles, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import MenuOnboarding from "@/components/MenuOnboarding";
import MenuHistoryPanel from "@/components/MenuHistoryPanel";
import MenuResultNotice from "@/components/MenuResultNotice";
import MenuGenerationForm, { type MenuGenerationFormValue } from "@/components/MenuGenerationForm";
import MenuGenerationStatus from "@/components/MenuGenerationStatus";
import MenuTable from "@/components/MenuTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trackProductEvent } from "@/lib/analytics/client";
import { applyDishFeedbackEntry, buildDishFeedbackSummary, mergeDishFeedbackEntries, normalizeDishFeedbackName } from "@/lib/domain/dish-feedback";
import { findMenuConstraintIssues } from "@/lib/domain/menu-constraints";
import { generateMenuRequestSchema } from "@/lib/schemas/menu";
import { addDaysToDate, getDayCodeForDate, getMealCalories, getMenuEndDate, getMenuStartDate } from "@/lib/domain/menu";
import { getMenuTemplate, type MenuTemplate } from "@/lib/domain/menu-templates";
import { mergeMenuRecords, readLocalMenus, saveLocalMenu, type LocalMenuRecord } from "@/lib/local-menus";
import { readLocalModelConfig } from "@/lib/local-model-config";
import type { BudgetLevel, Dish, DishFeedbackEntry, DishFeedbackValue, FestivalType, HealthGoal, Menu, MenuDays, MenuScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

type LayoutMode = "three" | "list" | "matrix";
type GenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
type ReplaceReason = "dislike" | "hard_to_buy" | "too_complex" | "too_expensive" | "repeated" | "other";

const ACTIVE_JOB_STORAGE_KEY = "yanhuofood.activeMenuGenerationJob";
const DISH_FEEDBACK_STORAGE_KEY = "yanhuofood.dishFeedback";

interface GenerationJobSnapshot {
  jobId: string;
  status: GenerationStatus;
  startedAt: string;
  templateId?: string;
}

interface GenerationProgress {
  stage: string;
  completedDays: number;
  totalDays: number;
  currentDay?: number | null;
  failedDays: number[];
}

interface GenerateMenuPayload {
  mealCount: number;
  start_date: string;
  days: MenuDays;
  dishes_per_meal: number;
  energy_display: "auto" | "on" | "off";
  halal: boolean;
  light_meal: boolean;
  special_group: "children" | "elderly" | "pregnant" | null;
  cuisines: string;
  dietary_restrictions: string[];
  disliked_ingredients: string[];
  diners_count: number;
  health_goal: HealthGoal;
  budget_level: BudgetLevel;
  cooking_time_limit: number;
  scenario: MenuScenario;
  festival_type?: FestivalType;
  festival_theme?: string;
  model_config?: ReturnType<typeof readLocalModelConfig>;
  feedback_summary?: ReturnType<typeof buildDishFeedbackSummary>;
  force_regenerate: boolean;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDate() {
  return formatLocalDate(new Date());
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalDate(date);
}

function generationMealTypes(mealCount: number) {
  if (mealCount === 5) return ["breakfast", "snack", "lunch", "snack", "dinner"] as const;
  if (mealCount === 4) return ["breakfast", "lunch", "dinner", "snack"] as const;
  if (mealCount === 3) return ["breakfast", "lunch", "dinner"] as const;
  return Array.from({ length: mealCount }, (_, index) => index === 0 ? "breakfast" as const : index === mealCount - 1 ? "dinner" as const : "snack" as const);
}

function createGenerationSkeleton(startDate: string, days: MenuDays, mealCount: number): Menu {
  const types = generationMealTypes(mealCount);
  return {
    week_start: startDate,
    start_date: startDate,
    end_date: addDaysToDate(startDate, days - 1),
    period_type: days === 1 ? "day" : "week",
    schema_version: 2,
    days: Array.from({ length: days }, (_, dayIndex) => {
      const date = addDaysToDate(startDate, dayIndex);
      return {
        date,
        day: getDayCodeForDate(date),
        meals: Array.from({ length: mealCount }, (_, mealIndex) => ({
          type: types[mealIndex],
          name: "正在安排菜品",
          calories: 0,
          dishes: [],
        })),
      };
    }),
  };
}

function getMenuRecordStartDate(menu: LocalMenuRecord) {
  return menu.start_date || getMenuStartDate(menu.data);
}

function formatIngredientName(item: { name: string; amount?: number; unit?: string }) {
  const amount = typeof item.amount === "number" && item.amount > 0 ? `${item.amount}${item.unit || ""}` : "";
  return amount ? `${item.name} ${amount}` : item.name;
}

function dishToRecipePayload(dish: Dish, cuisine: string) {
  return {
    name: dish.name,
    cuisine: cuisine.trim() || "中式",
    calories: Math.round(dish.calories ?? dish.nutrition?.calories ?? 0),
    ingredients: [...(dish.ingredients || []), ...(dish.seasonings || [])]
      .map(formatIngredientName)
      .filter(Boolean),
    instructions: (dish.steps || []).join("\n"),
    tags: Array.from(new Set([...(dish.tags || []), "菜单沉淀"])),
  };
}

function collectMenuDishes(menu: Menu) {
  const byName = new Map<string, Dish>();
  for (const day of menu.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes || []) {
        if (dish.name && !byName.has(dish.name)) byName.set(dish.name, dish);
      }
    }
  }
  return Array.from(byName.values());
}

function readStoredJob(): GenerationJobSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeJob(snapshot: GenerationJobSnapshot | null) {
  if (typeof window === "undefined") return;
  if (!snapshot) {
    window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, JSON.stringify(snapshot));
}

function readLocalDishFeedback(): DishFeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISH_FEEDBACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDishFeedback(entries: DishFeedbackEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISH_FEEDBACK_STORAGE_KEY, JSON.stringify(entries));
}

function nextMondayDate() {
  const date = new Date();
  const day = date.getDay();
  const diff = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + diff);
  return formatLocalDate(date);
}

function applyTemplateToSearch(template: MenuTemplate, setters: {
  setMealCount: (value: number) => void;
  setCuisines: (value: string) => void;
  setRestrictions: (value: string[]) => void;
  setDisliked: (value: string[]) => void;
  setLightMeal: (value: boolean) => void;
  setEnergyDisplay: (value: "auto" | "on" | "off") => void;
  setDays: (value: MenuDays) => void;
  setDiners: (value: number) => void;
  setDishesPerMeal: (value: number) => void;
  setHealthGoal: (value: HealthGoal) => void;
  setBudgetLevel: (value: BudgetLevel) => void;
  setCookingTimeLimit: (value: number) => void;
  setScenario: (value: MenuScenario) => void;
}) {
  setters.setMealCount(template.mealCount);
  setters.setCuisines(template.cuisines);
  setters.setRestrictions(template.dietaryRestrictions);
  setters.setDisliked(template.dislikedIngredients);
  setters.setLightMeal(template.lightMeal);
  setters.setEnergyDisplay(template.energyDisplay);
  setters.setDays(template.days);
  setters.setDiners(template.dinersCount);
  setters.setDishesPerMeal(template.dishesPerMeal);
  setters.setHealthGoal(template.healthGoal);
  setters.setBudgetLevel(template.budgetLevel);
  setters.setCookingTimeLimit(template.cookingTimeLimit);
  setters.setScenario("daily_home");
}

function LayoutControl({ value, onChange }: { value: LayoutMode; onChange: (v: LayoutMode) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as LayoutMode)}>
      <TabsList>
        <TabsTrigger value="matrix" className="gap-1.5">
          <LayoutGrid className="h-4 w-4" />
          矩阵
        </TabsTrigger>
        <TabsTrigger value="three" className="gap-1.5">
          <Table2 className="h-4 w-4" />
          表格
        </TabsTrigger>
        <TabsTrigger value="list" className="gap-1.5">
          <List className="h-4 w-4" />
          列表
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export default function MenusPage() {
  const qc = useQueryClient();
  const [layout, setLayout] = useState<LayoutMode>("matrix");
  const [mealCount, setMealCount] = useState<number>(3);
  const [cuisines, setCuisines] = useState("");
  const [dietaryRestrictions, setRestrictions] = useState<string[]>([]);
  const [dislikedIngredients, setDisliked] = useState<string[]>([]);
  const [halal, setHalal] = useState<boolean>(false);
  const [lightMeal, setLightMeal] = useState<boolean>(false);
  const [specialGroup, setSpecialGroup] = useState<"children" | "elderly" | "pregnant" | "">("");
  const [energyDisplay, setEnergyDisplay] = useState<"auto" | "on" | "off">("auto");
  const [startDate, setStartDate] = useState<string>(() => nextMondayDate());
  const [days, setDays] = useState<MenuDays>(7);
  const [dinersCount, setDiners] = useState<number>(1);
  const [dishesPerMeal, setDishesPerMeal] = useState<number>(1);
  const [healthGoal, setHealthGoal] = useState<HealthGoal>("balanced");
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>("medium");
  const [cookingTimeLimit, setCookingTimeLimit] = useState<number>(45);
  const [scenario, setScenario] = useState<MenuScenario>("daily_home");
  const [festivalType, setFestivalType] = useState<FestivalType>("spring_festival");
  const [festivalTheme, setFestivalTheme] = useState("");
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [recipeMessage, setRecipeMessage] = useState<string | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [localMenus, setLocalMenus] = useState<LocalMenuRecord[]>([]);
  const [initializedFromPrefs, setInitializedFromPrefs] = useState(false);
  const [initializedFromQuery, setInitializedFromQuery] = useState(false);
  const [trackedMenuPageView, setTrackedMenuPageView] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MenuTemplate | null>(null);
  const [activeJob, setActiveJob] = useState<GenerationJobSnapshot | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [progressMenu, setProgressMenu] = useState<Menu | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [generationFieldErrors, setGenerationFieldErrors] = useState<Record<string, string>>({});
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceMessage, setReplaceMessage] = useState<string | null>(null);
  const [replacingTarget, setReplacingTarget] = useState<string | null>(null);
  const [dishFeedbackEntries, setDishFeedbackEntries] = useState<DishFeedbackEntry[]>([]);
  const [dishFeedbackWarning, setDishFeedbackWarning] = useState<string | null>(null);

  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => {
      const res = await fetch("/api/preferences");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "读取偏好失败");
      return data;
    },
  });

  const dishFeedbackQuery = useQuery({
    queryKey: ["dish-feedback"],
    queryFn: async () => {
      const response = await fetch("/api/dish-feedback");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "读取菜品反馈失败");
      return data;
    },
  });

  const p = prefs.data?.preferences;
  const showEnergy = energyDisplay === "on" || (energyDisplay === "auto" && (lightMeal || healthGoal !== "balanced"));
  const planEndDate = addDaysToDate(startDate, days - 1);
  const isGenerating = generationStatus === "queued" || generationStatus === "running";

  useEffect(() => {
    setLocalMenus(readLocalMenus());
  }, []);

  useEffect(() => {
    const remote = Array.isArray(dishFeedbackQuery.data?.feedback) ? dishFeedbackQuery.data.feedback : [];
    setDishFeedbackEntries(mergeDishFeedbackEntries(readLocalDishFeedback(), remote));
  }, [dishFeedbackQuery.data?.feedback]);

  useEffect(() => {
    if (!p || initializedFromPrefs) return;

    setCuisines(p.cuisines ?? "");
    setRestrictions(p.dietary_restrictions ?? []);
    setDisliked(p.disliked_ingredients ?? []);
    setHalal(!!p.halal);
    setLightMeal(!!p.light_meal);
    setSpecialGroup(p.special_group ?? "");
    setEnergyDisplay(p.energy_display ?? "auto");
    setDays(p.days ?? 7);
    setMealCount(p.meal_count ?? 3);
    setDiners(p.diners_count ?? 1);
    setDishesPerMeal(p.dishes_per_meal ?? 1);
    setHealthGoal(p.health_goal ?? "balanced");
    setBudgetLevel(p.budget_level ?? "medium");
    setCookingTimeLimit(p.cooking_time_limit ?? 45);
    setInitializedFromPrefs(true);
  }, [initializedFromPrefs, p]);

  useEffect(() => {
    if (initializedFromQuery || !prefs.isFetched) return;
    const params = new URLSearchParams(window.location.search);
    const quick = params.get("quick");
    const template = getMenuTemplate(params.get("template"));
    const daysParam = Number(params.get("days"));

    if (params.get("next") === "1") {
      setStartDate(nextMondayDate());
      setSelectedWeek(null);
      setEditingMenu(null);
      setGenerationMessage("已沿用当前偏好，确认条件后即可生成下周菜单。");
    } else if (template) {
      setSelectedTemplate(template);
      applyTemplateToSearch(template, {
        setMealCount,
        setCuisines,
        setRestrictions,
        setDisliked,
        setLightMeal,
        setEnergyDisplay,
        setDays,
        setDiners,
        setDishesPerMeal,
        setHealthGoal,
        setBudgetLevel,
        setCookingTimeLimit,
        setScenario,
      });
    } else if (quick === "today") {
      setStartDate(todayDate());
      setDays(1);
    } else if (quick === "tomorrow") {
      setStartDate(tomorrowDate());
      setDays(1);
    } else if (daysParam === 1 || daysParam === 5 || daysParam === 7) {
      setDays(daysParam);
    }

    setInitializedFromQuery(true);
  }, [initializedFromQuery, prefs.isFetched]);

  useEffect(() => {
    const stored = readStoredJob();
    if (stored?.jobId && (stored.status === "queued" || stored.status === "running")) {
      setActiveJob(stored);
      setGenerationStatus(stored.status);
      setGenerationMessage("已恢复上次未完成的生成任务。");
    }
  }, []);

  useEffect(() => {
    setLayout(days === 7 ? "matrix" : days === 1 ? "list" : "three");
  }, [days]);

  const list = useQuery({
    queryKey: ["menus"],
    retry: 1,
    queryFn: async () => {
      const res = await fetch("/api/menus/generate");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "读取历史菜单失败");
      return data;
    },
  });

  const job = useQuery({
    queryKey: ["menu-generation-job", activeJob?.jobId],
    enabled: !!activeJob?.jobId && isGenerating,
    retry: false,
    refetchInterval: isGenerating ? 1200 : false,
    queryFn: async () => {
      const res = await fetch(`/api/menus/generate-jobs/${activeJob?.jobId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || "读取生成任务失败");
      }
      return data;
    },
  });

  const buildGeneratePayload = (): GenerateMenuPayload => {
    const localModelConfig = readLocalModelConfig();
    const payload = {
      mealCount,
      start_date: startDate,
      days,
      dishes_per_meal: dishesPerMeal,
      energy_display: energyDisplay,
      halal,
      light_meal: lightMeal,
      special_group: specialGroup || null,
      cuisines,
      dietary_restrictions: dietaryRestrictions,
      disliked_ingredients: dislikedIngredients,
      diners_count: dinersCount,
      health_goal: healthGoal,
      budget_level: budgetLevel,
      cooking_time_limit: cookingTimeLimit,
      scenario,
      festival_type: scenario === "festival" ? festivalType : undefined,
      festival_theme: scenario === "festival" ? festivalTheme.trim() || undefined : undefined,
      model_config: localModelConfig.enabled ? localModelConfig : undefined,
      feedback_summary: buildDishFeedbackSummary(dishFeedbackEntries),
      force_regenerate: true,
    };
    const parsed = generateMenuRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextFieldErrors = parsed.error.issues.reduce<Record<string, string>>((errors, issue) => {
        const key = String(issue.path[0] || "form");
        if (!errors[key]) errors[key] = issue.message;
        return errors;
      }, {});
      setGenerationFieldErrors(nextFieldErrors);
      setAdvancedOpen(true);
      const firstIssue = parsed.error.issues[0];
      throw new Error(firstIssue?.message || "请检查菜单生成参数");
    }
    setGenerationFieldErrors({});
    return parsed.data as GenerateMenuPayload;
  };

  const gen = useMutation({
    onMutate: () => {
      setSaveError(null);
      setSaveMessage(null);
      setGenerationMessage(null);
      setGenerationWarnings([]);
      setGenerationFieldErrors({});
      setGenerationStatus("queued");
      setProgressMenu(createGenerationSkeleton(startDate, days, mealCount));
      setGenerationProgress({
        stage: "queued",
        completedDays: 0,
        totalDays: days,
        currentDay: null,
        failedDays: [],
      });
    },
    mutationFn: async (payload: GenerateMenuPayload) => {
      const jobRes = await fetch("/api/menus/generate-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const jobData = await jobRes.json();

      if (jobRes.ok) return jobData;

      const message = jobData?.error?.message || jobData?.error || "创建生成任务失败";
      const errorCode = jobData?.error?.code;
      const canUseDirectGeneration = jobRes.status >= 500 || errorCode === "DATABASE_NOT_CONFIGURED" || errorCode === "JOB_CREATE_FAILED";
      if (!canUseDirectGeneration) {
        throw new Error(message);
      }

      const fallbackRes = await fetch("/api/menus/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const fallbackData = await fallbackRes.json();
      if (!fallbackRes.ok) {
        throw new Error(fallbackData?.error?.message || fallbackData?.error || message || "生成失败");
      }
      return {
        ...fallbackData,
        warnings: ["异步任务服务暂不可用，已改用直接生成。", ...(fallbackData.warnings || [])],
        status: "succeeded",
        sync: true,
      };
    },
    onSuccess: (data) => {
      if (data?.menu) {
        qc.invalidateQueries({ queryKey: ["menus"] });
        setLocalMenus(saveLocalMenu(data.menu, data.source || "ai"));
        setEditingMenu(data.menu);
        setSelectedWeek(getMenuStartDate(data.menu));
        setGenerationStatus("succeeded");
        setGenerationProgress(null);
        setProgressMenu(null);
        setGenerationWarnings(data.warnings || []);
        setGenerationMessage(data.source === "sample" ? "当前展示的是样例兜底菜单，可调整条件后重试 AI 生成。" : "菜单已生成。");
        storeJob(null);
        setActiveJob(null);
        return;
      }

      if (data?.job_id) {
        const snapshot: GenerationJobSnapshot = {
          jobId: data.job_id,
          status: data.status === "running" ? "running" : "queued",
          startedAt: new Date().toISOString(),
          templateId: selectedTemplate?.id,
        };
        storeJob(snapshot);
        setActiveJob(snapshot);
        setGenerationStatus(snapshot.status);
        setGenerationProgress((currentProgress) => currentProgress ? { ...currentProgress, stage: snapshot.status } : null);
        setGenerationMessage("生成任务已开始，离开或刷新后会自动恢复。");
      }
    },
    onError: (error) => {
      storeJob(null);
      setActiveJob(null);
      setGenerationStatus("failed");
      setGenerationProgress(null);
      setProgressMenu(null);
      setGenerationMessage(error instanceof Error ? error.message : "生成失败");
    },
  });

  const handleGenerate = () => {
    try {
      gen.mutate(buildGeneratePayload());
    } catch (error) {
      setGenerationStatus("idle");
      setGenerationProgress(null);
      setProgressMenu(null);
      setGenerationMessage(error instanceof Error ? error.message : "请检查菜单生成参数");
    }
  };

  const save = useMutation({
    onMutate: () => {
      setSaveError(null);
      setSaveMessage(null);
    },
    mutationFn: async (menu: Menu) => {
      const res = await fetch("/api/menus/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error?.message || data?.error || "保存失败";
        if (typeof message === "string" && (message.includes("数据库未配置") || message.includes("Database not available"))) {
          return {
            saved: true,
            local: true,
            menu,
            localMenus: saveLocalMenu(menu, "local"),
            message: "菜单已保存到当前浏览器。",
          };
        }
        throw new Error(data?.error?.message || data?.error || "保存失败");
      }
      return {
        ...data,
        localMenus: saveLocalMenu(menu, data?.source || "local"),
        message: "菜单已保存。",
      };
    },
    onSuccess: (data, menu) => {
      qc.invalidateQueries({ queryKey: ["menus"] });
      if (data?.localMenus) setLocalMenus(data.localMenus);
      setSaveError(null);
      setSaveMessage(data?.message || "菜单已保存。");
      setSelectedWeek(getMenuStartDate(menu));
      setEditingMenu(null);
    },
    onError: (error) => {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : "保存失败");
    },
  });

  const saveRecipes = useMutation({
    onMutate: () => {
      setRecipeMessage(null);
      setRecipeError(null);
    },
    mutationFn: async (menu: Menu) => {
      const dishes = collectMenuDishes(menu);
      if (!dishes.length) {
        return { created: 0, skipped: 0 };
      }

      const existingRes = await fetch("/api/recipes");
      const existingData = await existingRes.json();
      const existingNames = new Set<string>(
        ((existingData?.recipes || []) as Array<{ name?: string }>)
          .map((recipe) => recipe.name?.trim())
          .filter(Boolean) as string[]
      );

      let created = 0;
      let skipped = 0;
      for (const dish of dishes) {
        if (existingNames.has(dish.name.trim())) {
          skipped += 1;
          continue;
        }

        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dishToRecipePayload(dish, cuisines)),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error?.message || data?.error || `保存「${dish.name}」失败`);
        }
        created += 1;
        existingNames.add(dish.name.trim());
      }

      return { created, skipped };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setRecipeError(null);
      if (result.created === 0 && result.skipped > 0) {
        setRecipeMessage(`当前菜单的 ${result.skipped} 道菜已在食谱库中。`);
      } else if (result.created === 0) {
        setRecipeMessage("当前菜单没有可沉淀的结构化菜品。");
      } else {
        setRecipeMessage(`已加入 ${result.created} 道菜到食谱库${result.skipped ? `，跳过 ${result.skipped} 道已存在菜品` : ""}。`);
      }
    },
    onError: (error) => {
      setRecipeMessage(null);
      setRecipeError(error instanceof Error ? error.message : "加入食谱库失败");
    },
  });

  const replaceMeal = useMutation({
    onMutate: (target: { dayIndex: number; mealIndex: number; dishIndex?: number; scope: "meal" | "dish"; reason: ReplaceReason }) => {
      setReplaceError(null);
      setReplaceMessage(null);
      setReplacingTarget(`${target.dayIndex}-${target.mealIndex}-${target.scope}${target.dishIndex !== undefined ? `-${target.dishIndex}` : ""}`);
    },
    mutationFn: async (target: { dayIndex: number; mealIndex: number; dishIndex?: number; scope: "meal" | "dish"; reason: ReplaceReason }) => {
      if (!displayMenu) throw new Error("当前没有可替换的菜单");
      const localModelConfig = readLocalModelConfig();
      const res = await fetch("/api/menus/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu: displayMenu,
          target: {
            dayIndex: target.dayIndex,
            mealIndex: target.mealIndex,
            dishIndex: target.dishIndex,
          },
          scope: target.scope,
          reason: target.reason,
          preferences: {
            cuisines,
            dietary_restrictions: dietaryRestrictions,
            disliked_ingredients: dislikedIngredients,
            halal,
            light_meal: lightMeal,
            special_group: specialGroup || null,
            energy_display: energyDisplay,
            days,
            meal_count: mealCount,
            diners_count: dinersCount,
            dishes_per_meal: dishesPerMeal,
            health_goal: healthGoal,
            budget_level: budgetLevel,
            cooking_time_limit: cookingTimeLimit,
          },
          model_config: localModelConfig.enabled ? localModelConfig : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const issueText = Array.isArray(data?.error?.issues)
          ? `：${data.error.issues.map((issue: { message?: string }) => issue.message).filter(Boolean).join("；")}`
          : "";
        throw new Error(`${data?.error?.message || data?.error || "替换失败"}${issueText}`);
      }
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["menus"] });
      if (data?.menu) {
        setLocalMenus(saveLocalMenu(data.menu, data.source || "ai"));
        setEditingMenu(data.menu);
        setSelectedWeek(getMenuStartDate(data.menu));
      }
      setReplaceError(null);
      setReplaceMessage(data?.source === "sample" ? "已使用本地样例完成替换。" : "已替换目标餐次。");
    },
    onError: (error) => {
      setReplaceMessage(null);
      setReplaceError(error instanceof Error ? error.message : "替换失败");
    },
    onSettled: () => {
      setReplacingTarget(null);
    },
  });

  const serverMenus = (list.data?.menus || []) as LocalMenuRecord[];
  const menus = mergeMenuRecords(serverMenus, localMenus);
  const latest = menus[0] || null;
  const current = gen.data?.menu || latest?.data || null;
  const selectedMenu = menus.find((m) => getMenuRecordStartDate(m) === selectedWeek);
  const isTemplateDraft = !!selectedTemplate && !editingMenu && !selectedMenu;
  const displayMenu = progressMenu || editingMenu || selectedMenu?.data || (isTemplateDraft ? null : current);
  const displaySource = progressMenu ? "ai" : selectedMenu?.source || (gen.data?.menu === displayMenu ? gen.data?.source : latest?.data === displayMenu ? latest?.source : undefined);
  const hasChanges = !(gen.isPending || isGenerating) && editingMenu !== null && editingMenu !== current;
  const dishCount = displayMenu ? collectMenuDishes(displayMenu).length : 0;
  const handleDishFeedback = async (dishName: string, feedback: DishFeedbackValue) => {
    const current = dishFeedbackEntries.find((entry) => normalizeDishFeedbackName(entry.dish_name) === normalizeDishFeedbackName(dishName));
    const active = feedback === "liked" ? !current?.liked : feedback === "blocked" ? !current?.blocked : !current?.cooked;
    const next = applyDishFeedbackEntry(dishFeedbackEntries, { dish_name: dishName, feedback, active, source_menu_start: displayMenu ? getMenuStartDate(displayMenu) : null });
    setDishFeedbackEntries(next);
    writeLocalDishFeedback(next);
    try {
      const response = await fetch("/api/dish-feedback", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dish_name: dishName, feedback, active, source_menu_start: displayMenu ? getMenuStartDate(displayMenu) : null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || data?.error || "同步菜品反馈失败");
      setDishFeedbackWarning(data?.localOnly ? data?.warning || "本次反馈仅保存在当前浏览器。" : null);
    } catch {
      setDishFeedbackWarning("服务端反馈暂时不可用，本次反馈仅保存在当前浏览器。");
    }
  };
  const constraintIssues = displayMenu ? findMenuConstraintIssues(displayMenu, {
    cuisines,
    dietary_restrictions: dietaryRestrictions,
    disliked_ingredients: dislikedIngredients,
    halal,
    light_meal: lightMeal,
    special_group: specialGroup || null,
    energy_display: energyDisplay,
    days,
    meal_count: mealCount,
    diners_count: dinersCount,
    dishes_per_meal: dishesPerMeal,
    health_goal: healthGoal,
    budget_level: budgetLevel,
    cooking_time_limit: cookingTimeLimit,
  }) : [];

  useEffect(() => {
    if (!job.data || !activeJob?.jobId) return;

    const status = job.data.status as GenerationStatus;
    if (status === "queued" || status === "running") {
      const partial = job.data.partial_result;
      if (partial?.menu) {
        setProgressMenu(partial.menu as Menu);
      }
      setGenerationProgress({
        stage: job.data.stage || status,
        completedDays: job.data.completed_days || 0,
        totalDays: job.data.total_days || days,
        currentDay: job.data.current_day,
        failedDays: Array.isArray(job.data.failed_days) ? job.data.failed_days : [],
      });
      setGenerationStatus(status);
      if (activeJob.status !== status) {
        const snapshot = { ...activeJob, status };
        setActiveJob(snapshot);
        storeJob(snapshot);
      }
      setGenerationMessage(status === "running" ? "菜单正在逐天生成，刷新页面后仍可恢复进度。" : "生成任务排队中。");
      return;
    }

    if (status === "succeeded") {
      const result = job.data.result || {};
      const menu = result.menu as Menu | undefined;
      if (menu) {
        qc.invalidateQueries({ queryKey: ["menus"] });
        setLocalMenus(saveLocalMenu(menu, result.source || "ai"));
        setEditingMenu(menu);
        setSelectedWeek(getMenuStartDate(menu));
      }
      setGenerationStatus("succeeded");
      setGenerationProgress(null);
      setProgressMenu(null);
      setGenerationWarnings(result.warnings || job.data.warnings || []);
      setGenerationMessage(result.source === "sample" ? "当前展示的是样例兜底菜单，可调整条件后重试 AI 生成。" : "菜单已生成。");
      storeJob(null);
      setActiveJob(null);
      return;
    }

    if (status === "failed" || status === "cancelled") {
      const partialMenu = job.data.partial_result?.menu as Menu | undefined;
      if (partialMenu) setEditingMenu(partialMenu);
      setGenerationStatus(status);
      setGenerationProgress(null);
      setProgressMenu(null);
      setGenerationMessage(status === "cancelled" ? "生成任务已取消。" : job.data.error || "生成失败，可以重试或查看样例菜单。");
      storeJob(null);
      setActiveJob(null);
    }
  }, [activeJob, days, job.data, qc]);

  useEffect(() => {
    if (!job.error) return;
    storeJob(null);
    setActiveJob(null);
    setGenerationStatus("failed");
    setGenerationProgress(null);
    setProgressMenu(null);
    setGenerationMessage(job.error instanceof Error ? job.error.message : "读取生成任务失败");
  }, [job.error]);

  useEffect(() => {
    if (trackedMenuPageView || !list.isFetched) return;
    const params = new URLSearchParams(window.location.search);
    trackProductEvent("menu_page_viewed", {
      source_entry: params.get("template") ? `template_${params.get("template")}` : params.get("quick") ? `quick_${params.get("quick")}` : "direct",
      is_first_user: menus.length === 0,
    });
    setTrackedMenuPageView(true);
  }, [list.isFetched, menus.length, trackedMenuPageView]);

  const handleSelectWeek = (weekStart: string) => {
    const menu = menus.find((m) => getMenuRecordStartDate(m) === weekStart);
    if (menu?.data) {
      setSelectedWeek(weekStart);
      setEditingMenu(menu.data);
    }
  };

  const calculateNutrition = (menu: Menu) => {
    let totalCalories = 0;
    const dailyCalories: Record<string, number> = {};

    for (const day of menu.days) {
      let dayTotal = 0;
      for (const meal of day.meals) {
        dayTotal += getMealCalories(meal);
      }
      totalCalories += dayTotal;
      dailyCalories[day.day] = dayTotal;
    }

    const avgDaily = Math.round(totalCalories / menu.days.length);
    const recommended = lightMeal || healthGoal === "fat_loss" ? 1500 : specialGroup === "children" ? 1200 : specialGroup === "elderly" ? 1800 : healthGoal === "muscle_gain" ? 2400 : 2000;
    return {
      totalCalories,
      avgDaily,
      dailyCalories,
      recommended,
      overUnder: avgDaily - recommended,
      percentage: Math.round((avgDaily / recommended) * 100),
    };
  };

  const generationBusy = gen.isPending || isGenerating;
  const nutrition = displayMenu && !generationBusy ? calculateNutrition(displayMenu) : null;
  const displayRange = displayMenu ? `${getMenuStartDate(displayMenu)} ~ ${getMenuEndDate(displayMenu)}` : `${startDate} ~ ${planEndDate}`;
  const generationHint = generationProgress?.stage === "planning"
    ? "正在安排整段菜单的菜名和搭配。"
    : "菜单会从第一天开始逐日补充食材、做法和营养。";

  const prepareNextPlan = () => {
    setStartDate(nextMondayDate());
    setSelectedWeek(null);
    setEditingMenu(null);
    setSelectedTemplate(null);
    setGenerationMessage("已沿用当前人数、餐次、预算、时间限制和菜品反馈；确认后即可生成下周菜单。");
    trackProductEvent("next_plan_started", { source_menu_id: latest ? getMenuStartDate(latest.data) : "", mode: "reuse_preferences" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyPlanToNextWeek = () => {
    if (!displayMenu) return;
    const nextStart = nextMondayDate();
    const copied = JSON.parse(JSON.stringify(displayMenu)) as Menu;
    copied.week_start = nextStart;
    copied.start_date = nextStart;
    copied.end_date = addDaysToDate(nextStart, copied.days.length - 1);
    copied.days = copied.days.map((day, index) => ({ ...day, date: addDaysToDate(nextStart, index) }));
    setLocalMenus(saveLocalMenu(copied, "local"));
    setEditingMenu(copied);
    setSelectedWeek(nextStart);
    setGenerationMessage("整周已顺延到下周。请检查季节性食材和重复菜品后保存。");
    trackProductEvent("next_plan_started", { source_menu_id: getMenuStartDate(displayMenu), mode: "copy_week" });
  };

  return (
    <TooltipProvider>
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
      >
      <PageHeader
        eyebrow={<><Badge>菜单工作台</Badge><Badge variant="secondary">生成 · 编辑 · 导出</Badge></>}
        title="智能菜单"
        description="把人数、口味、健康目标和真实生活场景放在一起，生成一份可以直接执行的餐食计划。"
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">当前规划</p><p className="mt-1 truncate text-sm font-semibold text-primary">{displayRange}</p></div>
        <div className="rounded-lg border border-border bg-card px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">计划规模</p><p className="mt-1 text-sm font-semibold text-foreground">{days} 天 · {mealCount} 餐/天 · {dinersCount} 人</p></div>
        <div className="rounded-lg border border-border bg-card px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">工作状态</p><p className="mt-1 text-sm font-semibold text-foreground">{generationBusy ? "正在生成，可安全离开页面" : displayMenu ? "已有菜单，可继续调整" : "等待生成"}</p></div>
      </div>

      <MenuGenerationForm
        selectedTemplate={selectedTemplate}
        planEndDate={planEndDate}
        advancedOpen={advancedOpen}
        fieldErrors={generationFieldErrors}
        dinersCount={dinersCount}
        days={days}
        mealCount={mealCount}
        startDate={startDate}
        dislikedIngredients={dislikedIngredients}
        cuisines={cuisines}
        dietaryRestrictions={dietaryRestrictions}
        healthGoal={healthGoal}
        specialGroup={specialGroup}
        energyDisplay={energyDisplay}
        halal={halal}
        lightMeal={lightMeal}
        scenario={scenario}
        festivalType={festivalType}
        festivalTheme={festivalTheme}
        dishesPerMeal={dishesPerMeal}
        budgetLevel={budgetLevel}
        cookingTimeLimit={cookingTimeLimit}
        onAdvancedOpenChange={setAdvancedOpen}
        onChange={(key: keyof MenuGenerationFormValue, value) => {
          switch (key) {
            case "dinersCount": setDiners(value as number); break;
            case "days": setDays(value as MenuDays); break;
            case "mealCount": setMealCount(value as number); break;
            case "startDate": setStartDate(value as string); break;
            case "dislikedIngredients": setDisliked(value as string[]); break;
            case "cuisines": setCuisines(value as string); break;
            case "dietaryRestrictions": setRestrictions(value as string[]); break;
            case "healthGoal": setHealthGoal(value as HealthGoal); break;
            case "specialGroup": setSpecialGroup(value as "children" | "elderly" | "pregnant" | ""); break;
            case "energyDisplay": setEnergyDisplay(value as "auto" | "on" | "off"); break;
            case "halal": setHalal(value as boolean); break;
            case "lightMeal": setLightMeal(value as boolean); break;
            case "scenario": setScenario(value as MenuScenario); break;
            case "festivalType": setFestivalType(value as FestivalType); break;
            case "festivalTheme": setFestivalTheme(value as string); break;
            case "dishesPerMeal": setDishesPerMeal(value as number); break;
            case "budgetLevel": setBudgetLevel(value as BudgetLevel); break;
            case "cookingTimeLimit": setCookingTimeLimit(value as number); break;
          }
        }}
      />

      <div className="mt-6">
        <MenuResultNotice
          source={displaySource}
          constraintIssueCount={constraintIssues.length}
          listError={list.error instanceof Error ? list.error.message : list.error ? "读取历史菜单失败" : null}
          listWarning={typeof list.data?.warning === "string" ? list.data.warning : null}
          storageWarnings={Array.from(new Set([
            typeof prefs.data?.warning === "string" ? prefs.data.warning : "",
            typeof dishFeedbackQuery.data?.warning === "string" ? dishFeedbackQuery.data.warning : "",
            dishFeedbackWarning || "",
          ].filter(Boolean)))}
          onRetryGeneration={handleGenerate}
          onRetryList={() => list.refetch()}
          generationBusy={generationBusy}
        />
      </div>

      <section className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {displayMenu ? displayRange : "还没有菜单"}
                </CardTitle>
                <CardDescription>
                  {displayMenu
                    ? generationBusy
                      ? `${displayMenu.days.length} 天计划正在逐日补充，完成后可继续编辑。`
                      : `${displayMenu.days.length} 天计划，点击表格单元可编辑餐食。`
                    : selectedTemplate
                      ? `已按「${selectedTemplate.title}」预填条件，生成后会显示 ${displayRange} 的新菜单。`
                      : `先生成 ${displayRange} 的菜单，再继续编辑和导出。`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <LayoutControl value={layout} onChange={setLayout} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {generationBusy && (
              <MenuGenerationStatus
                stage={generationProgress?.stage || generationStatus}
                completedDays={generationProgress?.completedDays || 0}
                totalDays={generationProgress?.totalDays || days}
                currentDay={generationProgress?.currentDay}
                startedAt={activeJob?.startedAt}
                jobId={activeJob?.jobId}
                onCancel={() => {
                  if (activeJob?.jobId) {
                    fetch(`/api/menus/generate-jobs/${activeJob.jobId}`, { method: "DELETE" });
                  }
                }}
              />
            )}
            {isTemplateDraft && !generationBusy && (
              <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                <p className="font-medium">模板条件已就绪，尚未生成新菜单。</p>
                <p className="mt-1 text-warning">为避免和旧菜单混在一起，最近一次菜单已收起；需要查看旧菜单时可从右侧历史菜单切换。</p>
              </div>
            )}
            {displayMenu ? (
              <MenuTable
                menu={displayMenu}
                layout={layout}
                mealCount={mealCount}
                showEnergy={showEnergy}
                onUpdateMenu={setEditingMenu}
                onReplace={generationBusy ? undefined : (target) => replaceMeal.mutate(target)}
                replacingTarget={replacingTarget}
                generationProgress={generationBusy ? {
                  completedDays: generationProgress?.completedDays || 0,
                  currentDay: generationProgress?.currentDay,
                } : undefined}
                dishFeedback={Object.fromEntries(dishFeedbackEntries.map((entry) => [entry.dish_key || normalizeDishFeedbackName(entry.dish_name), entry]))}
                onDishFeedback={({ dishName, feedback }) => void handleDishFeedback(dishName, feedback)}
                toolbarActions={
                  <>
                    {hasChanges && (
                      <Button onClick={() => editingMenu && save.mutate(editingMenu)} disabled={save.isPending} variant="outline" size="sm">
                        <Save className="h-4 w-4" />
                        {save.isPending ? "保存中" : "保存修改"}
                      </Button>
                    )}
                    <Button id="menu-generate-action" onClick={handleGenerate} disabled={generationBusy} size="sm">
                      {generationBusy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {generationBusy ? "正在生成" : "重新生成"}
                    </Button>
                    <Button onClick={prepareNextPlan} disabled={generationBusy} variant="outline" size="sm">
                      <CalendarDays className="h-4 w-4" />
                      沿用偏好规划下周
                    </Button>
                    <Button onClick={copyPlanToNextWeek} disabled={generationBusy} variant="outline" size="sm">
                      <RotateCw className="h-4 w-4" />
                      复制整周顺延
                    </Button>
                    <Button onClick={() => saveRecipes.mutate(displayMenu)} disabled={generationBusy || saveRecipes.isPending || dishCount === 0 || constraintIssues.length > 0 || displaySource === "sample"} variant="outline" size="sm">
                      {saveRecipes.isPending ? <RotateCw className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
                      {saveRecipes.isPending ? "加入中" : "加入食谱库"}
                    </Button>
                  </>
                }
              />
            ) : (
              <div className={cn(
                "flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center transition",
                generationBusy ? "border-primary/30 bg-primary/5" : "border-input bg-muted"
              )}>
                {generationBusy ? <RotateCw className="h-8 w-8 animate-spin text-primary" /> : <Sparkles className="h-8 w-8 text-primary" />}
                <p className="mt-3 text-base font-semibold text-foreground">{generationBusy ? "正在生成本周菜单" : "开始你的第一份智能菜单"}</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {generationBusy ? generationHint : `确认人数、天数和餐次，AI 将生成 ${displayRange} 的可调整菜单与采购清单。`}
                </p>
                <Button id="menu-generate-action" className="mt-4" onClick={handleGenerate} disabled={generationBusy}>
                  {generationBusy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generationBusy ? "正在生成" : "生成本周菜单"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {constraintIssues.length > 0 && (
            <Card className="border-warning/30 bg-warning/10">
              <CardHeader>
                <CardTitle>硬性限制提示</CardTitle>
                <CardDescription>发现忌口、清真或饮食限制冲突，修正前不要进入采购执行。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-warning">
                {constraintIssues.slice(0, 6).map((issue, index) => (
                  <p key={`${issue.type}-${issue.keyword}-${index}`}>
                    {issue.date || "未知日期"} 第 {(issue.mealIndex ?? 0) + 1} 餐：{issue.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {(generationMessage || save.isSuccess || saveError || saveMessage || recipeMessage || recipeError || replaceMessage || replaceError || generationWarnings.length > 0) && (
            <Card className={saveError || recipeError || replaceError || generationStatus === "failed" || generationStatus === "cancelled" ? "border-destructive/30 bg-destructive/10" : "border-primary/30 bg-primary/5"}>
              <CardContent className="pt-5 text-sm">
                {generationMessage && generationStatus !== "failed" && <p className="text-primary">{generationMessage}</p>}
                {generationMessage && (generationStatus === "failed" || generationStatus === "cancelled") && (
                  <div className="space-y-3">
                    <p className="text-destructive">{generationStatus === "cancelled" ? "生成已取消" : `生成失败：${generationMessage}`}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={handleGenerate} disabled={generationBusy}>
                        <RotateCw className={cn("h-4 w-4", generationBusy && "animate-spin")} />
                        重新生成
                      </Button>
                    </div>
                  </div>
                )}
                {(save.isSuccess || saveMessage) && !saveError && <p className="text-primary">{saveMessage || "菜单已保存。"}</p>}
                {saveError && <p className="text-destructive">保存失败：{saveError}</p>}
                {recipeMessage && !recipeError && <p className="text-primary">{recipeMessage}</p>}
                {recipeError && <p className="text-destructive">加入食谱库失败：{recipeError}</p>}
                {replaceMessage && !replaceError && <p className="text-primary">{replaceMessage}</p>}
                {replaceError && <p className="text-destructive">替换失败：{replaceError}</p>}
                {generationWarnings.map((warning: string) => (
                  <p key={warning} className="text-warning">{warning}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {nutrition && showEnergy && (
            <Card>
              <CardHeader>
                <CardTitle>营养概览</CardTitle>
                <CardDescription>热量为估算值，用于日常规划参考。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-primary/5 p-3">
                    <p className="text-xs text-primary">本周总热量</p>
                    <p className="mt-1 text-xl font-semibold text-primary">{nutrition.totalCalories.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">日均热量</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{nutrition.avgDaily.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">推荐摄入</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{nutrition.recommended}</p>
                  </div>
                  <div className="rounded-lg bg-warning/10 p-3">
                    <p className="text-xs text-warning">摄入比例</p>
                    <p className="mt-1 text-xl font-semibold text-warning">{nutrition.percentage}%</p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>达标进度</span>
                    <span>{nutrition.percentage}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        nutrition.percentage >= 90 && nutrition.percentage <= 110 ? "bg-primary" : nutrition.percentage < 90 ? "bg-sky-500" : "bg-destructive"
                      )}
                      style={{ width: `${Math.min(nutrition.percentage, 100)}%` }}
                    />
                  </div>
                  {nutrition.overUnder !== 0 && (
                    <p className={cn("mt-2 text-sm", nutrition.overUnder > 0 ? "text-destructive" : "text-sky-700")}>
                      {nutrition.overUnder > 0 ? "超出" : "低于"}推荐值 {Math.abs(nutrition.overUnder)} kcal/天
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <MenuHistoryPanel
            menus={menus}
            selectedStartDate={selectedWeek}
            loading={list.isLoading}
            error={list.error instanceof Error ? list.error.message : list.error ? "读取历史菜单失败" : null}
            onSelect={handleSelectWeek}
            onRetry={() => list.refetch()}
          />
        </div>
      </section>
      <MenuOnboarding />
      </motion.main>
    </TooltipProvider>
  );
}
