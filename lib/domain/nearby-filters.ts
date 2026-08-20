import type {
  NearbyFilters,
  NearbyPlace,
  NearbyPlaceFeedback,
} from "@/lib/places/types";

export function nearbyPlaceKey(place: Pick<NearbyPlace, "provider" | "providerPlaceId">) {
  return `${place.provider}:${place.providerPlaceId}`;
}

function normalizedText(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("zh-CN") || "";
}

function placeMatchesAnyCategory(place: NearbyPlace, categories: string[]) {
  const haystack = normalizedText(`${place.categoryName || ""} ${place.name}`);
  return categories.some((category) => haystack.includes(normalizedText(category)));
}

export function createFeedbackMap(feedback: NearbyPlaceFeedback[]) {
  return new Map(feedback.map((item) => [`${item.provider}:${item.providerPlaceId}`, item.value]));
}

export function filterNearbyPlaces(
  places: NearbyPlace[],
  filters: NearbyFilters,
  feedback: NearbyPlaceFeedback[] = []
) {
  const feedbackMap = createFeedbackMap(feedback);

  return places.filter((place) => {
    if (feedbackMap.get(nearbyPlaceKey(place)) === "blocked") return false;
    if (filters.maxDistanceM !== undefined && place.distanceM > filters.maxDistanceM) return false;

    // 未知价格、评分和营业状态不能被当成不符合；保留候选并在排序阶段降权、提示。
    if (
      filters.maxPrice !== undefined &&
      place.averageCost !== undefined &&
      place.averageCost > filters.maxPrice
    ) {
      return false;
    }
    if (
      filters.minRating !== undefined &&
      place.rating !== undefined &&
      place.rating < filters.minRating
    ) {
      return false;
    }
    if (filters.openNow && place.openStatus === "closed") return false;

    if (filters.categories?.length && !placeMatchesAnyCategory(place, filters.categories)) {
      return false;
    }
    if (
      filters.excludedCategories?.length &&
      placeMatchesAnyCategory(place, filters.excludedCategories)
    ) {
      return false;
    }
    return true;
  });
}
