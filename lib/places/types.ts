export type CoordinateSystem = "gps" | "amap";
export type PlaceProviderName = "amap";
export type NearbyPlaceOpenStatus = "open" | "closed" | "unknown";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface NearbyPlace {
  provider: PlaceProviderName;
  providerPlaceId: string;
  name: string;
  address?: string;
  location: GeoPoint;
  distanceM: number;
  categoryCode?: string;
  categoryName?: string;
  businessArea?: string;
  cityName?: string;
  districtName?: string;
  rating?: number;
  averageCost?: number;
  openStatus: NearbyPlaceOpenStatus;
  openingHours?: string;
  dataConfidence: number;
}

export interface NearbySearchInput {
  location: GeoPoint;
  coordinateSystem: CoordinateSystem;
  radiusM: number;
  keyword?: string;
  categoryCodes?: string[];
  page: number;
  pageSize: number;
}

export interface NearbySearchResult {
  provider: PlaceProviderName;
  places: NearbyPlace[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface GeocodeInput {
  address: string;
  city?: string;
}

export interface ReverseGeocodeInput {
  location: GeoPoint;
  coordinateSystem: CoordinateSystem;
}

export interface ResolvedLocation {
  provider: PlaceProviderName;
  providerPlaceId?: string;
  name: string;
  formattedAddress: string;
  location: GeoPoint;
  coordinateSystem: "amap";
  province?: string;
  city?: string;
  district?: string;
}

export type NearbyRecommendationMode = "safe" | "balanced" | "surprise";
export type NearbyPlaceFeedbackValue = "liked" | "blocked";

export interface NearbyFilters {
  maxDistanceM?: number;
  maxPrice?: number;
  minRating?: number;
  openNow?: boolean;
  categories?: string[];
  excludedCategories?: string[];
}

export interface NearbyRecentChoice {
  provider: PlaceProviderName;
  providerPlaceId: string;
  name: string;
  categoryName?: string;
  selectedAt: string;
}

export interface NearbyPlaceFeedback {
  provider: PlaceProviderName;
  providerPlaceId: string;
  value: NearbyPlaceFeedbackValue;
  updatedAt: string;
}

export interface SavedNearbyLocation {
  id: string;
  name: string;
  formattedAddress: string;
  location: GeoPoint;
  coordinateSystem: CoordinateSystem;
  updatedAt: string;
}

export interface NearbyPreferences {
  radiusM: number;
  maxPrice?: number;
  minRating?: number;
  openNow: boolean;
  recommendationMode: NearbyRecommendationMode;
}

export interface NearbyRecommendation {
  place: NearbyPlace;
  score: number;
  reasons: string[];
  warnings: string[];
}
