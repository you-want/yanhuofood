import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductEventName =
  | "menu_page_viewed"
  | "template_selected"
  | "generation_started"
  | "generation_completed"
  | "generation_failed"
  | "meal_replaced"
  | "menu_saved"
  | "recipe_viewed"
  | "shopping_list_viewed"
  | "shopping_item_updated"
  | "shopping_list_exported"
  | "dish_feedback_submitted"
  | "next_plan_started"
  | "nearby_location_requested"
  | "nearby_location_granted"
  | "nearby_location_denied"
  | "nearby_manual_location_used"
  | "nearby_search_completed"
  | "nearby_filter_applied"
  | "nearby_random_requested"
  | "nearby_place_selected"
  | "nearby_place_blocked"
  | "nearby_no_result";

type Primitive = string | number | boolean;

type PropertySpec = "string" | "number" | "boolean";

const EVENT_PROPERTY_SPECS: Record<ProductEventName, Record<string, PropertySpec>> = {
  menu_page_viewed: {
    source_entry: "string",
    is_first_user: "boolean",
  },
  template_selected: {
    template_id: "string",
  },
  generation_started: {
    days: "number",
    meal_count: "number",
    diners_count: "number",
    scenario: "string",
    task_id: "string",
  },
  generation_completed: {
    source: "string",
    duration_ms: "number",
    warning_count: "number",
    dish_count: "number",
  },
  generation_failed: {
    error_type: "string",
    stage: "string",
    is_retry: "boolean",
  },
  meal_replaced: {
    date: "string",
    meal_type: "string",
    replace_scope: "string",
    reason: "string",
  },
  menu_saved: {
    edited: "boolean",
    replaced_count: "number",
  },
  recipe_viewed: {
    recipe_id: "string",
    entry: "string",
  },
  shopping_list_viewed: {
    menu_id: "string",
    date_range: "string",
    item_count: "number",
  },
  shopping_item_updated: {
    status: "string",
    category: "string",
  },
  shopping_list_exported: {
    format: "string",
  },
  dish_feedback_submitted: {
    feedback: "string",
    source_menu_id: "string",
  },
  next_plan_started: {
    source_menu_id: "string",
    mode: "string",
  },
  nearby_location_requested: {},
  nearby_location_granted: {
    accuracy_bucket: "string",
  },
  nearby_location_denied: {
    reason: "string",
  },
  nearby_manual_location_used: {
    has_city: "boolean",
  },
  nearby_search_completed: {
    result_count: "number",
    radius_m: "number",
    source: "string",
  },
  nearby_filter_applied: {
    filter: "string",
    value: "string",
  },
  nearby_random_requested: {
    mode: "string",
    candidate_count: "number",
    requested_count: "number",
  },
  nearby_place_selected: {
    provider: "string",
    has_price: "boolean",
    has_rating: "boolean",
  },
  nearby_place_blocked: {
    provider: "string",
  },
  nearby_no_result: {
    radius_m: "number",
    has_keyword: "boolean",
  },
};

export const PRODUCT_EVENT_NAMES = Object.keys(EVENT_PROPERTY_SPECS) as ProductEventName[];

export const FUNNEL_STEPS: ProductEventName[] = [
  "menu_page_viewed",
  "generation_started",
  "generation_completed",
  "menu_saved",
  "shopping_list_viewed",
  "shopping_item_updated",
];

const EVENT_WRITE_TIMEOUT_MS = 300;

export function sanitizeProductEvent(
  eventName: string,
  properties: unknown
): { eventName: ProductEventName; properties: Record<string, Primitive> } | null {
  if (!PRODUCT_EVENT_NAMES.includes(eventName as ProductEventName)) return null;

  const specs = EVENT_PROPERTY_SPECS[eventName as ProductEventName];
  const source = properties && typeof properties === "object" && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {};
  const sanitized: Record<string, Primitive> = {};

  for (const [key, type] of Object.entries(specs)) {
    const value = source[key];
    if (value === undefined || value === null) continue;

    if (type === "string" && typeof value === "string") {
      sanitized[key] = value.slice(0, 120);
    } else if (type === "number" && typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = Math.round(value);
    } else if (type === "boolean" && typeof value === "boolean") {
      sanitized[key] = value;
    }
  }

  return { eventName: eventName as ProductEventName, properties: sanitized };
}

export async function writeProductEvent(
  supabase: SupabaseClient | null,
  input: {
    clientId: string;
    eventName: ProductEventName;
    properties?: Record<string, Primitive>;
  }
) {
  if (!supabase) return;

  const sanitized = sanitizeProductEvent(input.eventName, input.properties || {});
  if (!sanitized) return;

  let settled = false;
  const write = Promise.resolve(
    supabase.from("product_events").insert({
      client_id: input.clientId,
      event_name: sanitized.eventName,
      properties: sanitized.properties,
    })
  ).then(({ error }) => {
    if (error) {
      console.warn(JSON.stringify({ scope: "product_event", status: "failed", event: sanitized.eventName, error: error.message }));
    }
  }).catch((error) => {
    console.warn(JSON.stringify({ scope: "product_event", status: "failed", event: sanitized.eventName, error: error instanceof Error ? error.message : String(error) }));
  }).finally(() => {
    settled = true;
  });

  await Promise.race([
    write,
    new Promise<void>((resolve) => setTimeout(resolve, EVENT_WRITE_TIMEOUT_MS)),
  ]);

  if (!settled) {
    console.warn(JSON.stringify({ scope: "product_event", status: "deferred", event: sanitized.eventName, timeout_ms: EVENT_WRITE_TIMEOUT_MS }));
  }
}

export function countMenuDishes(menu: { days?: Array<{ meals?: Array<{ dishes?: unknown[]; name?: string }> }> }) {
  return (menu.days || []).reduce((sum, day) => {
    return sum + (day.meals || []).reduce((mealSum, meal) => {
      if (Array.isArray(meal.dishes) && meal.dishes.length > 0) return mealSum + meal.dishes.length;
      return meal.name ? mealSum + meal.name.split("、").filter(Boolean).length : mealSum;
    }, 0);
  }, 0);
}
