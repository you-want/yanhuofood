import { NextResponse } from "next/server";
import { normalizeMenu } from "@/lib/domain/menu";
import type { IngredientUsage } from "@/lib/types";
import type { Menu } from "@/lib/types";

interface Ingredient {
  key: string;
  name: string;
  quantity: string;
  purchaseQuantity: string;
  category: string;
  wasteRate: number;
  bufferRate: number;
  reason: string;
  mergeWarning?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  grain: "主食",
  meat: "肉类",
  seafood: "水产",
  egg_dairy: "蛋奶",
  vegetable: "蔬菜",
  fruit: "水果",
  soy: "豆制品",
  seasoning: "调料",
  other: "其他",
};

const INGREDIENT_MAP: Record<string, { ingredients: { name: string; quantity: string }[]; category: string }> = {
  "皮蛋瘦肉粥": { ingredients: [{ name: "皮蛋", quantity: "2个" }, { name: "瘦肉", quantity: "100g" }, { name: "大米", quantity: "150g" }, { name: "葱花", quantity: "适量" }], category: "主食" },
  "番茄牛腩": { ingredients: [{ name: "番茄", quantity: "2个" }, { name: "牛腩", quantity: "300g" }, { name: "洋葱", quantity: "半个" }, { name: "姜片", quantity: "3片" }], category: "肉菜" },
  "清炒西兰花": { ingredients: [{ name: "西兰花", quantity: "1颗" }, { name: "大蒜", quantity: "3瓣" }, { name: "盐", quantity: "适量" }], category: "素菜" },
  "鸡蛋三明治": { ingredients: [{ name: "鸡蛋", quantity: "2个" }, { name: "面包", quantity: "4片" }, { name: "生菜", quantity: "2片" }, { name: "火腿", quantity: "2片" }], category: "主食" },
  "宫保鸡丁": { ingredients: [{ name: "鸡胸肉", quantity: "200g" }, { name: "花生米", quantity: "50g" }, { name: "干辣椒", quantity: "10个" }, { name: "大葱", quantity: "1根" }], category: "肉菜" },
  "蒜蓉生菜": { ingredients: [{ name: "生菜", quantity: "2颗" }, { name: "大蒜", quantity: "5瓣" }, { name: "蚝油", quantity: "适量" }], category: "素菜" },
  "燕麦牛奶": { ingredients: [{ name: "燕麦片", quantity: "50g" }, { name: "牛奶", quantity: "250ml" }, { name: "蜂蜜", quantity: "适量" }], category: "早餐" },
  "红烧鱼块": { ingredients: [{ name: "鱼块", quantity: "400g" }, { name: "姜片", quantity: "5片" }, { name: "葱段", quantity: "适量" }, { name: "生抽", quantity: "适量" }], category: "肉菜" },
  "紫菜蛋花汤": { ingredients: [{ name: "紫菜", quantity: "1张" }, { name: "鸡蛋", quantity: "1个" }, { name: "葱花", quantity: "适量" }], category: "汤羹" },
  "豆浆油条": { ingredients: [{ name: "油条", quantity: "2根" }, { name: "豆浆", quantity: "300ml" }], category: "早餐" },
  "咖喱土豆鸡": { ingredients: [{ name: "鸡胸肉", quantity: "200g" }, { name: "土豆", quantity: "2个" }, { name: "胡萝卜", quantity: "1根" }, { name: "咖喱块", quantity: "3块" }], category: "肉菜" },
  "凉拌黄瓜": { ingredients: [{ name: "黄瓜", quantity: "2根" }, { name: "蒜末", quantity: "适量" }, { name: "醋", quantity: "适量" }, { name: "香油", quantity: "适量" }], category: "凉菜" },
  "牛奶麦片": { ingredients: [{ name: "牛奶", quantity: "250ml" }, { name: "麦片", quantity: "50g" }], category: "早餐" },
  "菌菇炖豆腐": { ingredients: [{ name: "菌菇", quantity: "200g" }, { name: "豆腐", quantity: "1块" }, { name: "青菜", quantity: "适量" }, { name: "高汤", quantity: "适量" }], category: "素菜" },
  "清炒菠菜": { ingredients: [{ name: "菠菜", quantity: "300g" }, { name: "大蒜", quantity: "3瓣" }, { name: "盐", quantity: "适量" }], category: "素菜" },
  "水果酸奶": { ingredients: [{ name: "酸奶", quantity: "200g" }, { name: "水果", quantity: "适量" }], category: "早餐" },
  "香煎三文鱼": { ingredients: [{ name: "三文鱼", quantity: "200g" }, { name: "柠檬", quantity: "半个" }, { name: "橄榄油", quantity: "适量" }, { name: "黑胡椒", quantity: "适量" }], category: "肉菜" },
  "烤南瓜": { ingredients: [{ name: "南瓜", quantity: "300g" }, { name: "橄榄油", quantity: "适量" }, { name: "盐", quantity: "适量" }], category: "素菜" },
  "鸡蛋面条": { ingredients: [{ name: "面条", quantity: "150g" }, { name: "鸡蛋", quantity: "1个" }, { name: "青菜", quantity: "适量" }, { name: "生抽", quantity: "适量" }], category: "主食" },
  "什锦炒饭": { ingredients: [{ name: "米饭", quantity: "300g" }, { name: "鸡蛋", quantity: "2个" }, { name: "火腿", quantity: "50g" }, { name: "玉米粒", quantity: "适量" }, { name: "胡萝卜丁", quantity: "适量" }], category: "主食" },
  "海带汤": { ingredients: [{ name: "海带", quantity: "100g" }, { name: "豆腐", quantity: "半块" }, { name: "虾皮", quantity: "适量" }, { name: "葱花", quantity: "适量" }], category: "汤羹" },
};

const DEFAULT_CATEGORY = "其他";
const NUMERIC_QUANTITY_RE = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]+)\s*$/;

const PURCHASE_RULES: Record<string, { wasteRate: number; bufferRate: number; reason: string }> = {
  主食: { wasteRate: 0.03, bufferRate: 0.05, reason: "主食损耗较低，少量多备方便调整份量。" },
  肉类: { wasteRate: 0.08, bufferRate: 0.05, reason: "肉类会有修整、缩水和分切损耗。" },
  水产: { wasteRate: 0.1, bufferRate: 0.05, reason: "水产清理和烹饪缩水明显，建议略多准备。" },
  蛋奶: { wasteRate: 0.02, bufferRate: 0.05, reason: "蛋奶损耗低，按最小包装略多准备。" },
  蔬菜: { wasteRate: 0.15, bufferRate: 0.05, reason: "蔬菜清洗、择菜、去根会有较明显损耗。" },
  水果: { wasteRate: 0.1, bufferRate: 0.05, reason: "水果去皮去核后可食部分会减少。" },
  豆制品: { wasteRate: 0.05, bufferRate: 0.05, reason: "豆制品损耗较低，建议留出少量余量。" },
  调料: { wasteRate: 0, bufferRate: 0.1, reason: "调料按口味调整，家中常备可不额外购买。" },
  肉菜: { wasteRate: 0.08, bufferRate: 0.05, reason: "复合肉菜按主料修整和烹饪损耗略多准备。" },
  素菜: { wasteRate: 0.15, bufferRate: 0.05, reason: "素菜清洗、去根和缩水损耗较明显。" },
  凉菜: { wasteRate: 0.12, bufferRate: 0.05, reason: "凉菜多为生鲜蔬果，清洗切配会有损耗。" },
  汤羹: { wasteRate: 0.06, bufferRate: 0.05, reason: "汤羹食材用量弹性较大，建议略多准备。" },
  早餐: { wasteRate: 0.05, bufferRate: 0.05, reason: "早餐食材通常损耗较低，按份量略多准备。" },
  其他: { wasteRate: 0.05, bufferRate: 0.05, reason: "缺少明确品类，按通用损耗略多准备。" },
};

interface IngredientAccumulator {
  category: string;
  freeText: string[];
  numeric: Map<string, number>;
}

function quantityText(usage: IngredientUsage): string {
  if (typeof usage.amount === "number" && usage.unit) return `${usage.amount}${usage.unit}`;
  if (typeof usage.amount === "number") return String(usage.amount);
  return usage.unit || "适量";
}

function parseQuantity(quantity: string): { amount: number; unit: string } | null {
  const match = quantity.match(NUMERIC_QUANTITY_RE);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2] };
}

function addIngredient(
  ingredientMap: Map<string, IngredientAccumulator>,
  name: string,
  quantity: string,
  category: string
) {
  const existing = ingredientMap.get(name);
  const entry = existing || { category, freeText: [], numeric: new Map<string, number>() };
  const parsed = parseQuantity(quantity);

  if (parsed) {
    entry.numeric.set(parsed.unit, (entry.numeric.get(parsed.unit) || 0) + parsed.amount);
  } else if (!entry.freeText.includes(quantity)) {
    entry.freeText.push(quantity);
  }

  ingredientMap.set(name, entry);
}

function roundPurchaseAmount(amount: number, unit: string): number {
  if (["g", "克", "ml", "毫升"].includes(unit)) return Math.ceil(amount / 5) * 5;
  if (["kg", "千克", "斤", "升", "L", "l"].includes(unit)) return Math.ceil(amount * 10) / 10;
  return Math.ceil(amount);
}

function formatAmount(amount: number, unit: string) {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(/\.0$/, "");
  return `${value}${unit}`;
}

function quantityParts(data: IngredientAccumulator) {
  const numericParts = Array.from(data.numeric.entries()).map(([unit, amount]) => formatAmount(amount, unit));
  return [...numericParts, ...data.freeText];
}

function purchaseQuantityParts(data: IngredientAccumulator, wasteRate: number, bufferRate: number) {
  const ratio = 1 + wasteRate + bufferRate;
  const numericParts = Array.from(data.numeric.entries()).map(([unit, amount]) => formatAmount(roundPurchaseAmount(amount * ratio, unit), unit));
  const freeTextParts = data.freeText.map((value) => value === "适量" ? "按需备足" : `${value}，建议略多备`);
  return [...numericParts, ...freeTextParts];
}

function buildIngredient(name: string, data: IngredientAccumulator): Ingredient {
  const rule = PURCHASE_RULES[data.category] || PURCHASE_RULES[DEFAULT_CATEGORY];
  const partCount = data.numeric.size + data.freeText.length;
  return {
    key: `${data.category}:${name}`,
    name,
    quantity: quantityParts(data).join(" / ") || "适量",
    purchaseQuantity: purchaseQuantityParts(data, rule.wasteRate, rule.bufferRate).join(" / ") || "按需备足",
    category: data.category,
    wasteRate: rule.wasteRate,
    bufferRate: rule.bufferRate,
    reason: rule.reason,
    mergeWarning: partCount > 1 ? "存在不同单位或非数字用量，已分开保留，未强行相加。" : undefined,
  };
}

function extractStructuredIngredients(menu: Menu): Ingredient[] {
  const ingredientMap = new Map<string, IngredientAccumulator>();

  for (const day of menu.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes || []) {
        const usages = [...(dish.ingredients || []), ...(dish.seasonings || [])];
        for (const usage of usages) {
          addIngredient(
            ingredientMap,
            usage.name,
            quantityText(usage),
            CATEGORY_LABELS[usage.category] || DEFAULT_CATEGORY
          );
        }
      }
    }
  }

  return Array.from(ingredientMap.entries()).map(([name, data]) => buildIngredient(name, data));
}

function extractLegacyIngredients(menu: Menu): Ingredient[] {
  const ingredientMap = new Map<string, IngredientAccumulator>();

  for (const day of menu.days) {
    for (const meal of day.meals) {
      if (!meal?.name) continue;

      const dishNames = meal.name.split("、").map((n) => n.trim()).filter(Boolean);

      for (const dishName of dishNames) {
        const dishData = INGREDIENT_MAP[dishName];

        if (dishData) {
          for (const ing of dishData.ingredients) {
            addIngredient(ingredientMap, ing.name, ing.quantity, dishData.category);
          }
        } else {
          addIngredient(ingredientMap, dishName, "适量", DEFAULT_CATEGORY);
        }
      }
    }
  }

  return Array.from(ingredientMap.entries()).map(([name, data]) => buildIngredient(name, data));
}

function filterMenuByDate(menu: Menu, dateFrom?: string, dateTo?: string) {
  const normalized = normalizeMenu(menu);
  if (!dateFrom && !dateTo) return normalized;
  return {
    ...normalized,
    days: normalized.days.filter((day) => {
      if (!day.date) return true;
      if (dateFrom && day.date < dateFrom) return false;
      if (dateTo && day.date > dateTo) return false;
      return true;
    }),
  };
}

function extractIngredients(menu: Menu, dateFrom?: string, dateTo?: string): Ingredient[] {
  const normalized = filterMenuByDate(menu, dateFrom, dateTo);
  const structured = extractStructuredIngredients(normalized);
  if (structured.length > 0) return structured;
  return extractLegacyIngredients(normalized);
}

function groupByCategory(ingredients: Ingredient[]): Record<string, Ingredient[]> {
  const grouped: Record<string, Ingredient[]> = {};
  const categoryOrder = ["主食", "肉类", "水产", "蛋奶", "蔬菜", "水果", "豆制品", "调料", "肉菜", "素菜", "凉菜", "汤羹", "早餐", "其他"];
  
  for (const category of categoryOrder) {
    grouped[category] = [];
  }
  
  for (const ing of ingredients) {
    if (grouped[ing.category]) {
      grouped[ing.category].push(ing);
    } else {
      if (!grouped[DEFAULT_CATEGORY]) grouped[DEFAULT_CATEGORY] = [];
      grouped[DEFAULT_CATEGORY].push(ing);
    }
  }
  
  Object.keys(grouped).forEach(key => {
    if (grouped[key].length === 0) delete grouped[key];
  });
  
  return grouped;
}

export async function POST(request: Request) {
  let menu: Menu | null = null;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  try {
    const body = await request.json();
    menu = body?.menu;
    dateFrom = body?.date_from;
    dateTo = body?.date_to;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!menu || !menu.days) {
    return NextResponse.json(
      { error: "Menu data is required" },
      { status: 400 }
    );
  }

  const ingredients = extractIngredients(menu, dateFrom, dateTo);
  const grouped = groupByCategory(ingredients);

  return NextResponse.json(
    { ingredients, grouped, total: ingredients.length, date_from: dateFrom, date_to: dateTo },
    { status: 200 }
  );
}
