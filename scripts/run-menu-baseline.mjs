const BASE_URL = process.env.BASELINE_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
const CLIENT_ID = process.env.BASELINE_CLIENT_ID || "baseline-phase0";

const cases = [
  { id: "daily-1p-1d-3m", start_date: "2026-07-13", days: 1, mealCount: 3, diners_count: 1, dishes_per_meal: 1, scenario: "daily_home", cuisines: "中式家常" },
  { id: "daily-2p-5d-3m", start_date: "2026-07-13", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, scenario: "daily_home", cuisines: "江浙家常" },
  { id: "family-3p-7d-3m", start_date: "2026-07-13", days: 7, mealCount: 3, diners_count: 3, dishes_per_meal: 2, scenario: "daily_home", cuisines: "北方家常" },
  { id: "family-4p-7d-4m", start_date: "2026-07-13", days: 7, mealCount: 4, diners_count: 4, dishes_per_meal: 2, scenario: "daily_home", cuisines: "粤菜, 家常" },
  { id: "solo-5d-simple", start_date: "2026-07-20", days: 5, mealCount: 3, diners_count: 1, dishes_per_meal: 1, scenario: "daily_home", cooking_time_limit: 20 },
  { id: "fat-loss-5d", start_date: "2026-07-20", days: 5, mealCount: 3, diners_count: 1, dishes_per_meal: 1, health_goal: "fat_loss", light_meal: true },
  { id: "high-protein-7d", start_date: "2026-07-20", days: 7, mealCount: 3, diners_count: 2, dishes_per_meal: 2, health_goal: "high_protein" },
  { id: "low-sugar-5d", start_date: "2026-07-20", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, health_goal: "low_sugar", dietary_restrictions: ["控糖", "少精制碳水"] },
  { id: "muscle-gain-7d", start_date: "2026-07-27", days: 7, mealCount: 4, diners_count: 1, dishes_per_meal: 1, health_goal: "muscle_gain" },
  { id: "halal-5d", start_date: "2026-07-27", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, halal: true },
  { id: "no-pork-7d", start_date: "2026-07-27", days: 7, mealCount: 3, diners_count: 3, dishes_per_meal: 1, disliked_ingredients: ["猪肉", "五花肉", "培根"] },
  { id: "no-seafood-5d", start_date: "2026-08-03", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, disliked_ingredients: ["虾", "蟹", "贝类", "海鲜"] },
  { id: "no-cilantro-spicy", start_date: "2026-08-03", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, disliked_ingredients: ["香菜", "辣椒"], dietary_restrictions: ["清淡"] },
  { id: "children-5d", start_date: "2026-08-03", days: 5, mealCount: 3, diners_count: 3, dishes_per_meal: 1, special_group: "children" },
  { id: "elderly-5d", start_date: "2026-08-10", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, special_group: "elderly", dietary_restrictions: ["少盐", "软烂"] },
  { id: "pregnant-5d", start_date: "2026-08-10", days: 5, mealCount: 3, diners_count: 1, dishes_per_meal: 1, special_group: "pregnant" },
  { id: "batch-cooking-5d", start_date: "2026-08-10", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 2, scenario: "batch_cooking" },
  { id: "batch-cooking-7d", start_date: "2026-08-17", days: 7, mealCount: 3, diners_count: 2, dishes_per_meal: 2, scenario: "batch_cooking", cooking_time_limit: 60 },
  { id: "travel-1d", start_date: "2026-08-17", days: 1, mealCount: 3, diners_count: 2, dishes_per_meal: 1, scenario: "travel", cuisines: "成都" },
  { id: "travel-5d", start_date: "2026-08-17", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, scenario: "travel", cuisines: "上海, 杭州" },
  { id: "work-takeout-5d", start_date: "2026-08-24", days: 5, mealCount: 3, diners_count: 1, dishes_per_meal: 1, scenario: "work_takeout" },
  { id: "festival-spring-1d", start_date: "2026-08-24", days: 1, mealCount: 3, diners_count: 6, dishes_per_meal: 3, scenario: "festival", festival_type: "spring_festival", festival_theme: "家庭聚餐" },
  { id: "festival-mid-autumn-1d", start_date: "2026-08-24", days: 1, mealCount: 3, diners_count: 5, dishes_per_meal: 2, scenario: "festival", festival_type: "mid_autumn" },
  { id: "low-budget-7d", start_date: "2026-08-31", days: 7, mealCount: 3, diners_count: 2, dishes_per_meal: 1, budget_level: "low" },
  { id: "high-budget-5d", start_date: "2026-08-31", days: 5, mealCount: 3, diners_count: 4, dishes_per_meal: 2, budget_level: "high" },
  { id: "many-diners-7d", start_date: "2026-08-31", days: 7, mealCount: 3, diners_count: 8, dishes_per_meal: 3, scenario: "daily_home" },
  { id: "five-meals-5d", start_date: "2026-09-07", days: 5, mealCount: 5, diners_count: 1, dishes_per_meal: 1, health_goal: "high_protein" },
  { id: "one-day-four-meals", start_date: "2026-09-07", days: 1, mealCount: 4, diners_count: 1, dishes_per_meal: 2 },
  { id: "vegetarian-5d", start_date: "2026-09-07", days: 5, mealCount: 3, diners_count: 2, dishes_per_meal: 1, dietary_restrictions: ["素食"], disliked_ingredients: ["牛肉", "猪肉", "鸡肉", "鱼", "虾"] },
  { id: "allergy-peanut-7d", start_date: "2026-09-14", days: 7, mealCount: 3, diners_count: 3, dishes_per_meal: 1, dietary_restrictions: ["花生过敏"], disliked_ingredients: ["花生", "花生酱"] },
];

function addDays(dateText, offset) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function collectText(menu) {
  return JSON.stringify(menu || {}).toLowerCase();
}

function validateMenu(testCase, payload) {
  const failures = [];
  const menu = payload?.menu;
  if (!menu?.days?.length) return ["missing menu days"];

  if (menu.days.length !== testCase.days) {
    failures.push(`expected ${testCase.days} days, got ${menu.days.length}`);
  }

  menu.days.forEach((day, index) => {
    const expectedDate = addDays(testCase.start_date, index);
    if (day.date !== expectedDate) failures.push(`day ${index + 1} expected date ${expectedDate}, got ${day.date}`);
    if ((day.meals || []).length !== testCase.mealCount) {
      failures.push(`day ${index + 1} expected ${testCase.mealCount} meals, got ${(day.meals || []).length}`);
    }

    (day.meals || []).forEach((meal, mealIndex) => {
      if (!meal.name) failures.push(`day ${index + 1} meal ${mealIndex + 1} missing name`);
      const dishes = meal.dishes || [];
      if (dishes.length > 0) {
        dishes.forEach((dish, dishIndex) => {
          const ingredientCount = [...(dish.ingredients || []), ...(dish.seasonings || [])].length;
          if (ingredientCount === 0) failures.push(`day ${index + 1} meal ${mealIndex + 1} dish ${dishIndex + 1} missing ingredients`);
        });
      }
    });
  });

  const text = collectText(menu);
  const forbidden = new Set([...(testCase.disliked_ingredients || [])]);
  if (testCase.halal) {
    ["猪", "猪肉", "五花肉", "培根", "火腿", "料酒", "黄酒", "啤酒"].forEach((item) => forbidden.add(item));
  }
  for (const item of forbidden) {
    if (item && text.includes(String(item).toLowerCase())) {
      failures.push(`forbidden ingredient appears: ${item}`);
    }
  }

  return failures;
}

async function runCase(testCase) {
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/menus/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `client_id=${CLIENT_ID}-${testCase.id}`,
    },
    body: JSON.stringify({
      ...testCase,
      energy_display: "auto",
      force_regenerate: true,
    }),
  });
  const durationMs = Date.now() - startedAt;
  const payload = await response.json().catch(() => ({}));
  const failures = response.ok ? validateMenu(testCase, payload) : [`http ${response.status}`];
  return {
    id: testCase.id,
    ok: response.ok && failures.length === 0,
    source: payload?.source || "unknown",
    durationMs,
    warningCount: payload?.warnings?.length || 0,
    failures,
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

const results = [];
for (const testCase of cases) {
  process.stdout.write(`Running ${testCase.id}... `);
  try {
    const result = await runCase(testCase);
    results.push(result);
    process.stdout.write(`${result.ok ? "ok" : "fail"} ${result.source} ${result.durationMs}ms\n`);
  } catch (error) {
    results.push({
      id: testCase.id,
      ok: false,
      source: "error",
      durationMs: 0,
      warningCount: 0,
      failures: [error instanceof Error ? error.message : String(error)],
    });
    process.stdout.write("error\n");
  }
}

const durations = results.map((result) => result.durationMs).filter((value) => value > 0);
const successCount = results.filter((result) => result.ok).length;
const fallbackCount = results.filter((result) => result.source === "sample").length;
const report = {
  baseUrl: BASE_URL,
  total: results.length,
  successCount,
  successRate: `${Math.round((successCount / results.length) * 100)}%`,
  fallbackCount,
  fallbackRate: `${Math.round((fallbackCount / results.length) * 100)}%`,
  averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
  p95DurationMs: percentile(durations, 0.95),
  results,
};

console.log(JSON.stringify(report, null, 2));

if (successCount !== results.length) {
  process.exitCode = 1;
}
