import type {
  CoordinateSystem,
  GeoPoint,
  NearbyPlace,
  PlaceProviderName,
  ResolvedLocation,
} from "@/lib/places/types";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
}

export class NearbyApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "NearbyApiError";
  }
}

export interface NearbySearchApiInput {
  location: GeoPoint;
  coordinateSystem: CoordinateSystem;
  locationAccuracyM?: number;
  radiusM: number;
  keyword?: string;
  categoryCodes?: string[];
  page?: number;
  pageSize?: number;
  amapWebServiceKey?: string;
}

export interface NearbySearchApiResponse {
  provider: PlaceProviderName;
  places: NearbyPlace[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  locationAccuracyM?: number;
  limitations: string[];
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (response.ok) return body as T;
  const payload = body as ApiErrorPayload;
  throw new NearbyApiError(
    payload.error?.code || "REQUEST_FAILED",
    payload.error?.message || "请求失败，请稍后重试。",
    response.status,
    Boolean(payload.error?.retryable)
  );
}

export async function searchNearbyPlaces(input: NearbySearchApiInput) {
  const response = await fetch("/api/nearby/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      coordinate_system: input.coordinateSystem,
      location_accuracy_m: input.locationAccuracyM,
      radius_m: input.radiusM,
      keyword: input.keyword,
      category_codes: input.categoryCodes,
      page: input.page || 1,
      page_size: input.pageSize || 25,
      amap_web_service_key: input.amapWebServiceKey,
    }),
  });
  return parseResponse<NearbySearchApiResponse>(response);
}

export async function geocodeNearbyAddress(
  address: string,
  city?: string,
  amapWebServiceKey?: string
) {
  const response = await fetch("/api/nearby/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      city,
      amap_web_service_key: amapWebServiceKey,
    }),
  });
  const result = await parseResponse<{ location: ResolvedLocation }>(response);
  return result.location;
}

export async function reverseGeocodeNearbyLocation(
  location: GeoPoint,
  coordinateSystem: CoordinateSystem,
  amapWebServiceKey?: string
) {
  const response = await fetch("/api/nearby/reverse-geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      coordinate_system: coordinateSystem,
      amap_web_service_key: amapWebServiceKey,
    }),
  });
  const result = await parseResponse<{ location: ResolvedLocation }>(response);
  return result.location;
}

export interface NearbyMapStatus {
  server: {
    configured: boolean;
    hostedConfigured?: boolean;
    access?: { allowed: boolean; reason: string };
    publicQuota?: {
      enabled: boolean;
      dailyLimit: number;
      used: number | null;
      remaining: number | null;
      timeZone: string;
      available: boolean;
    };
  };
  localKeySupported: boolean;
}

export async function getNearbyMapStatus() {
  const response = await fetch("/api/nearby/status", { cache: "no-store" });
  return parseResponse<NearbyMapStatus>(response);
}
