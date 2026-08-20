export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type PeriodType = "day" | "week";
export type MenuDays = 1 | 5 | 7;
export type HealthGoal = "balanced" | "fat_loss" | "high_protein" | "low_sugar" | "muscle_gain";
export type BudgetLevel = "low" | "medium" | "high";
export type ModelProvider = "openai" | "openai_compatible";
export type MenuScenario = "daily_home" | "travel" | "work_takeout" | "batch_cooking" | "festival";
export type DishFeedbackValue = "liked" | "blocked" | "cooked";
export type MealMoment = "breakfast" | "lunch" | "dinner" | "late_night";
export type AppetiteLevel = "low" | "normal" | "high";
export type PhysicalState = "normal" | "tired" | "stomach_discomfort" | "after_workout";
export type DiningOccasion = "solo" | "family" | "friends" | "guests";

export type FestivalType =
  | "spring_festival"
  | "lantern_festival"
  | "dragon_boat"
  | "mid_autumn"
  | "double_ninth"
  | "new_year"
  | "christmas"
  | "thanksgiving"
  | "other";
export type IngredientCategory =
  | "grain"
  | "meat"
  | "seafood"
  | "egg_dairy"
  | "vegetable"
  | "fruit"
  | "soy"
  | "seasoning"
  | "other";

export interface NutritionSummary {
  calories?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
}

export interface IngredientUsage {
  name: string;
  amount?: number;
  unit?: string;
  category: IngredientCategory;
  optional?: boolean;
}

export interface LocalModelConfig {
  enabled: boolean;
  provider: ModelProvider;
  api_key?: string;
  base_url?: string;
  model: string;
}

export interface RecipeEvidence {
  source_recipe_id: string;
  source_name: string;
  source_url?: string | null;
  reasons: string[];
  score?: number;
  quality_status?: "draft" | "normalized" | "reviewed" | "deprecated";
}

export interface Dish {
  id?: string;
  name: string;
  ingredients?: IngredientUsage[];
  seasonings?: IngredientUsage[];
  steps?: string[];
  calories?: number;
  nutrition?: NutritionSummary;
  cooking_time_minutes?: number;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  source_kind?: "trusted" | "generated";
  source_recipe_id?: string;
  source_url?: string | null;
  source_name?: string;
  evidence?: RecipeEvidence;
  servings?: number;
  adaptation_note?: string;
}

export interface DishFeedbackEntry {
  id?: string;
  client_id?: string;
  dish_name: string;
  dish_key: string;
  liked?: boolean;
  blocked?: boolean;
  cooked?: boolean;
  source_menu_start?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DishFeedbackSummary {
  liked_dishes: string[];
  blocked_dishes: string[];
  cooked_dishes: string[];
}

export interface TodayMealContext {
  meal_moment: MealMoment;
  diners_count: number;
  dishes_count: number;
  appetite: AppetiteLevel;
  physical_state: PhysicalState;
  occasion: DiningOccasion;
  available_minutes: number;
  available_ingredients: string[];
  note?: string;
}

export interface TodayMealOption {
  id: string;
  kind: "best_match" | "quick" | "different";
  title: string;
  summary: string;
  reason: string;
  /** Canonical multi-dish result. Older API responses may only provide `dish`. */
  dishes?: Dish[];
  /** Backward-compatible first dish field for older callers and stored responses. */
  dish: Dish;
  warnings: string[];
}

export interface TodayMealRecommendation {
  options: TodayMealOption[];
  guidance: string;
}

export interface Meal {
  type?: MealType;
  id?: string;
  title?: string;
  dishes?: Dish[];
  name: string;
  calories: number;
  nutrition?: NutritionSummary;
  reason?: string;
  warnings?: string[];
}

export interface Day {
  date?: string;
  day: string;
  meals: Meal[];
  nutrition?: NutritionSummary;
}

export interface Menu {
  week_start: string;
  period_type?: PeriodType;
  start_date?: string;
  end_date?: string;
  days: Day[];
  summary?: NutritionSummary;
  schema_version?: number;
}

export interface Preferences {
  cuisines?: string;
  dietary_restrictions?: string[];
  disliked_ingredients?: string[];
  halal?: boolean;
  light_meal?: boolean;
  special_group?: "children" | "elderly" | "pregnant" | null;
  energy_display?: "auto" | "on" | "off";
  days?: MenuDays;
  meal_count?: number;
  diners_count?: number;
  dishes_per_meal?: number;
  health_goal?: HealthGoal;
  budget_level?: BudgetLevel;
  cooking_time_limit?: number;
  scenario?: MenuScenario;
  festival_type?: FestivalType;
  festival_theme?: string;
}

export type RecipeSourceType = "system_curated" | "open_source" | "user_created" | "ai_generated" | "manual_import";
export type RecipeQualityStatus = "draft" | "normalized" | "reviewed" | "deprecated";

export interface RecipeSource {
  id: string;
  slug: string;
  name: string;
  source_type: RecipeSourceType;
  homepage_url?: string | null;
  license_name?: string | null;
  license_url?: string | null;
  attribution_text?: string | null;
  source_revision?: string | null;
}

export interface RecipeIngredientDetail extends IngredientUsage {
  normalized_name: string;
}

export interface RecipeStep {
  index: number;
  instruction: string;
  duration_minutes?: number;
}

export interface Recipe {
  id: string;
  client_id?: string | null;
  is_public?: boolean;
  name: string;
  cuisine: string;
  calories: number;
  ingredients?: string[];
  instructions?: string;
  tags?: string[];
  image_url?: string | null;
  video_url?: string | null;
  video_search_keyword?: string | null;
  source_id?: string | null;
  source_recipe_id?: string | null;
  source_url?: string | null;
  source_name?: string;
  source?: RecipeSource | null;
  evidence?: RecipeEvidence;
  servings?: number;
  cooking_time_minutes?: number;
  prep_time_minutes?: number;
  difficulty?: "easy" | "medium" | "hard";
  ingredient_details?: RecipeIngredientDetail[];
  steps?: RecipeStep[];
  seasonings?: RecipeIngredientDetail[];
  nutrition?: NutritionSummary;
  equipment?: string[];
  dietary_flags?: string[];
  health_goals?: string[];
  meal_types?: MealType[];
  schema_version?: number;
  content_hash?: string | null;
  quality_status?: RecipeQualityStatus;
  imported_at?: string | null;
}

export interface RecipeCandidate {
  recipe: Recipe;
  score: number;
  reasons: string[];
  matched_ingredients: string[];
}

export interface MenuRecord {
  id?: string;
  client_id: string;
  week_start: string;
  start_date?: string;
  end_date?: string;
  period_type?: PeriodType;
  schema_version?: number;
  source?: "local" | "ai" | "sample" | "cache";
  preferences_snapshot?: Preferences;
  data: Menu;
  created_at?: string;
  updated_at?: string;
}

export interface PreferencesRecord {
  id?: string;
  client_id: string;
  cuisines?: string;
  dietary_restrictions?: string[];
  disliked_ingredients?: string[];
  halal?: boolean;
  light_meal?: boolean;
  special_group?: "children" | "elderly" | "pregnant" | null;
  energy_display?: "auto" | "on" | "off";
  days?: 5 | 7;
  meal_count?: number;
  diners_count?: number;
  dishes_per_meal?: number;
  health_goal?: HealthGoal;
  budget_level?: BudgetLevel;
  cooking_time_limit?: number;
  scenario?: MenuScenario;
  festival_type?: FestivalType;
  festival_theme?: string;
  created_at?: string;
  updated_at?: string;
}
