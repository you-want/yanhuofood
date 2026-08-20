import { z } from "zod";
import { nutritionSummarySchema } from "@/lib/schemas/menu";
import { recipeDifficultySchema, recipeIngredientDetailSchema, recipeQualityStatusSchema, recipeStepSchema } from "@/lib/schemas/recipe-knowledge";

function emptyStringToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

const externalUrlSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().max(2_000).url("请输入有效的网址").refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "网址仅支持 http 或 https").nullable().optional()
);

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, "请填写菜名").max(100),
  cuisine: z.string().trim().min(1, "请选择菜系").max(40),
  calories: z.coerce.number().int().nonnegative().max(100_000).default(0),
  ingredients: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  instructions: z.string().trim().max(20_000).default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  image_url: externalUrlSchema,
  video_url: externalUrlSchema,
  video_search_keyword: z.preprocess(
    emptyStringToNull,
    z.string().trim().max(100).nullable().optional()
  ),
  source_url: externalUrlSchema,
  servings: z.coerce.number().int().min(1).max(100).optional(),
  cooking_time_minutes: z.coerce.number().int().positive().max(1_440).optional(),
  prep_time_minutes: z.coerce.number().int().nonnegative().max(1_440).optional(),
  difficulty: recipeDifficultySchema.optional(),
  ingredient_details: z.array(recipeIngredientDetailSchema).max(100).optional(),
  steps: z.array(recipeStepSchema).max(100).optional(),
  seasonings: z.array(recipeIngredientDetailSchema).max(50).optional(),
  nutrition: nutritionSummarySchema.optional(),
  equipment: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  dietary_flags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  health_goals: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  meal_types: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).max(4).optional(),
  quality_status: recipeQualityStatusSchema.optional(),
});

export const recipeUpdateSchema = recipeInputSchema.partial().extend({
  id: z.string().trim().min(1, "缺少食谱 ID"),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
