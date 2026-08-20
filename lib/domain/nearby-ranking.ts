import { createFeedbackMap, nearbyPlaceKey } from "@/lib/domain/nearby-filters";
import type {
  NearbyFilters,
  NearbyPlace,
  NearbyPlaceFeedback,
  NearbyRecentChoice,
  NearbyRecommendation,
} from "@/lib/places/types";

const WEIGHTS = {
  distance: 0.25,
  category: 0.2,
  budget: 0.15,
  quality: 0.15,
  openStatus: 0.1,
  freshness: 0.1,
  confidence: 0.05,
} as const;

interface RankNearbyPlacesOptions {
  filters: NearbyFilters;
  recentChoices?: NearbyRecentChoice[];
  feedback?: NearbyPlaceFeedback[];
  now?: Date;
  recentWindowDays?: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function includesCategory(place: NearbyPlace, categories: string[]) {
  const haystack = `${place.name} ${place.categoryName || ""}`.toLocaleLowerCase("zh-CN");
  return categories.some((category) => haystack.includes(category.toLocaleLowerCase("zh-CN")));
}

function recentChoiceIds(
  choices: NearbyRecentChoice[],
  now: Date,
  recentWindowDays: number
) {
  const threshold = now.getTime() - recentWindowDays * 24 * 60 * 60 * 1_000;
  return new Set(
    choices
      .filter((choice) => {
        const selectedAt = Date.parse(choice.selectedAt);
        return Number.isFinite(selectedAt) && selectedAt >= threshold;
      })
      .map((choice) => `${choice.provider}:${choice.providerPlaceId}`)
  );
}

function getWarnings(place: NearbyPlace, filters: NearbyFilters) {
  const warnings: string[] = [];
  if (place.averageCost === undefined) warnings.push("暂无可靠人均价格，请在外部平台确认");
  if (place.rating === undefined) warnings.push("暂无可靠评分数据");
  if (filters.openNow && place.openStatus === "unknown") {
    warnings.push("当前营业状态未知，出发或下单前请确认");
  }
  warnings.push("是否支持外卖和配送范围需在外部平台确认");
  return warnings;
}

export function rankNearbyPlaces(
  places: NearbyPlace[],
  options: RankNearbyPlacesOptions
): NearbyRecommendation[] {
  const {
    filters,
    recentChoices = [],
    feedback = [],
    now = new Date(),
    recentWindowDays = 7,
  } = options;
  const feedbackMap = createFeedbackMap(feedback);
  const recentIds = recentChoiceIds(recentChoices, now, recentWindowDays);
  const maxDistance = Math.max(filters.maxDistanceM || 1_500, 100);

  return places
    .map((place) => {
      const key = nearbyPlaceKey(place);
      const isRecent = recentIds.has(key);
      const isLiked = feedbackMap.get(key) === "liked";
      const distanceScore = clamp01(1 - place.distanceM / maxDistance);
      const categoryScore = filters.categories?.length
        ? includesCategory(place, filters.categories)
          ? 1
          : 0.2
        : 0.72;
      const budgetScore =
        filters.maxPrice === undefined
          ? 0.72
          : place.averageCost === undefined
            ? 0.45
            : clamp01(1 - Math.max(0, place.averageCost - filters.maxPrice * 0.5) / filters.maxPrice);
      const qualityScore =
        place.rating === undefined ? 0.45 : clamp01((place.rating - 2.5) / 2.5);
      const openStatusScore =
        place.openStatus === "open" ? 1 : place.openStatus === "closed" ? 0 : 0.5;
      const freshnessScore = isRecent ? 0.15 : 1;
      const confidenceScore = clamp01(place.dataConfidence);

      let score =
        distanceScore * WEIGHTS.distance +
        categoryScore * WEIGHTS.category +
        budgetScore * WEIGHTS.budget +
        qualityScore * WEIGHTS.quality +
        openStatusScore * WEIGHTS.openStatus +
        freshnessScore * WEIGHTS.freshness +
        confidenceScore * WEIGHTS.confidence;

      if (isLiked) score += 0.05;
      score = clamp01(score);

      const reasons: string[] = [];
      if (place.distanceM <= 500) reasons.push(`距离较近，约 ${place.distanceM} 米`);
      else reasons.push(`距离约 ${(place.distanceM / 1_000).toFixed(1)} 公里`);
      if (place.averageCost !== undefined && filters.maxPrice !== undefined) {
        reasons.push(place.averageCost <= filters.maxPrice ? "人均价格符合预算" : "价格接近预算上限");
      }
      if (place.rating !== undefined && place.rating >= 4) reasons.push(`评分 ${place.rating.toFixed(1)}`);
      if (filters.categories?.length && includesCategory(place, filters.categories)) {
        reasons.push("餐饮类型符合当前偏好");
      }
      if (!isRecent) reasons.push("最近没有选择过");
      if (isLiked) reasons.push("你之前标记过喜欢");

      return {
        place,
        score: Number((score * 100).toFixed(1)),
        reasons: reasons.slice(0, 4),
        warnings: getWarnings(place, filters),
      };
    })
    .sort((a, b) => b.score - a.score || a.place.distanceM - b.place.distanceM);
}
