import type { BudgetLevel, HealthGoal, MenuDays } from "@/lib/types";

export type MenuTemplateId = "family_week" | "solo_quick" | "high_protein";

export interface MenuTemplate {
  id: MenuTemplateId;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  days: MenuDays;
  mealCount: number;
  dinersCount: number;
  dishesPerMeal: number;
  healthGoal: HealthGoal;
  budgetLevel: BudgetLevel;
  cookingTimeLimit: number;
  cuisines: string;
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
  lightMeal: boolean;
  energyDisplay: "auto" | "on" | "off";
}

export const menuTemplates: MenuTemplate[] = [
  {
    id: "family_week",
    title: "三口之家 7 天家常菜",
    subtitle: "家庭周计划",
    description: "适合 3 人家庭的 7 天不重样家常菜单，并自动汇总采购清单，让周末采购更高效。",
    href: "/menus?template=family_week",
    days: 7,
    mealCount: 3,
    dinersCount: 3,
    dishesPerMeal: 2,
    healthGoal: "balanced",
    budgetLevel: "medium",
    cookingTimeLimit: 45,
    cuisines: "中式家常",
    dietaryRestrictions: [],
    dislikedIngredients: [],
    lightMeal: false,
    energyDisplay: "auto",
  },
  {
    id: "solo_quick",
    title: "一人 5 天省时餐",
    subtitle: "工作日快手",
    description: "按 1 人、5 天、做饭不超过 25 分钟生成省时菜单，减少复杂步骤。",
    href: "/menus?template=solo_quick",
    days: 5,
    mealCount: 3,
    dinersCount: 1,
    dishesPerMeal: 1,
    healthGoal: "balanced",
    budgetLevel: "low",
    cookingTimeLimit: 25,
    cuisines: "快手家常",
    dietaryRestrictions: ["少油"],
    dislikedIngredients: [],
    lightMeal: false,
    energyDisplay: "auto",
  },
  {
    id: "high_protein",
    title: "减脂高蛋白 5 天餐",
    subtitle: "控热量高蛋白",
    description: "按 1 人、5 天、轻食高蛋白生成菜单，默认展示热量估算。",
    href: "/menus?template=high_protein",
    days: 5,
    mealCount: 3,
    dinersCount: 1,
    dishesPerMeal: 1,
    healthGoal: "high_protein",
    budgetLevel: "medium",
    cookingTimeLimit: 35,
    cuisines: "中式轻食",
    dietaryRestrictions: ["少油", "高蛋白"],
    dislikedIngredients: [],
    lightMeal: true,
    energyDisplay: "on",
  },
];

export function getMenuTemplate(id: string | null) {
  return menuTemplates.find((template) => template.id === id) || null;
}
