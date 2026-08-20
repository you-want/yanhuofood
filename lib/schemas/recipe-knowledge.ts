import { z } from "zod";
import { localModelConfigSchema, nutritionSummarySchema } from "@/lib/schemas/menu";

export const recipeSourceTypeSchema = z.enum([
  "system_curated",
  "open_source",
  "user_created",
  "ai_generated",
  "manual_import",
]);

export const recipeQualityStatusSchema = z.enum(["draft", "normalized", "reviewed", "deprecated"]);
export const recipeDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const recipeIngredientDetailSchema = z.object({
  name: z.string().trim().min(1).max(200),
  normalized_name: z.string().trim().min(1).max(200).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  unit: z.string().trim().max(40).optional(),
  category: z.enum(["grain", "meat", "seafood", "egg_dairy", "vegetable", "fruit", "soy", "seasoning", "other"]).default("other"),
  optional: z.boolean().optional(),
});

export const recipeStepSchema = z.object({
  index: z.coerce.number().int().positive(),
  instruction: z.string().trim().min(1).max(1_000),
  duration_minutes: z.coerce.number().int().positive().optional(),
});

export const recipeSourceSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  source_type: recipeSourceTypeSchema,
  homepage_url: z.string().url().nullable().optional(),
  license_name: z.string().nullable().optional(),
  license_url: z.string().url().nullable().optional(),
  attribution_text: z.string().nullable().optional(),
  source_revision: z.string().nullable().optional(),
});

export const recipeEvidenceSchema = z.object({
  source_recipe_id: z.string().trim().min(1),
  source_name: z.string().trim().min(1),
  source_url: z.string().url().nullable().optional(),
  reasons: z.array(z.string().trim().min(1)).default([]),
  score: z.number().optional(),
  quality_status: recipeQualityStatusSchema.optional(),
});

export const recipeAskQuestionTypeSchema = z.enum([
  "why_recommended",
  "replace_ingredient",
  "reduce_oil_salt",
  "adjust_servings",
  "equipment_alternative",
  "prep_ahead",
  "use_leftovers",
  "other",
]);

export const recipeAskRequestSchema = z.object({
  recipe_id: z.string().trim().min(1).optional(),
  recipe: z.record(z.string(), z.unknown()).optional(),
  question: z.string().trim().min(1, "请输入问题").max(500),
  question_type: recipeAskQuestionTypeSchema.optional(),
  diners_count: z.coerce.number().int().min(1).max(20).optional(),
  available_ingredients: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  model_config: localModelConfigSchema.optional(),
}).refine((value) => Boolean(value.recipe_id || value.recipe), {
  message: "需要提供食谱 ID 或食谱内容",
  path: ["recipe_id"],
});

export const recipeAskResponseSchema = z.object({
  question_type: recipeAskQuestionTypeSchema,
  answer: z.string().trim().min(1),
  suggestions: z.array(z.object({
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1),
  })).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  sources: z.array(z.object({
    source_recipe_id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    url: z.string().url().nullable().optional(),
  })).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  nutrition: nutritionSummarySchema.optional(),
});

export type RecipeAskQuestionType = z.infer<typeof recipeAskQuestionTypeSchema>;
export type RecipeAskRequest = z.infer<typeof recipeAskRequestSchema>;
export type RecipeAskResponse = z.infer<typeof recipeAskResponseSchema>;
