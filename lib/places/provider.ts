import { AmapPlaceProvider } from "@/lib/places/providers/amap";
import type {
  GeocodeInput,
  NearbySearchInput,
  NearbySearchResult,
  PlaceProviderName,
  ReverseGeocodeInput,
  ResolvedLocation,
} from "@/lib/places/types";

export type PlaceProviderErrorCode =
  | "MAP_PROVIDER_NOT_CONFIGURED"
  | "MAP_PROVIDER_INVALID_KEY"
  | "MAP_PROVIDER_QUOTA_EXCEEDED"
  | "MAP_PROVIDER_TIMEOUT"
  | "MAP_PROVIDER_UPSTREAM_ERROR"
  | "MAP_PROVIDER_INVALID_RESPONSE"
  | "LOCATION_NOT_FOUND";

export class PlaceProviderError extends Error {
  constructor(
    public readonly code: PlaceProviderErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "PlaceProviderError";
  }
}

export interface PlaceProvider {
  readonly name: PlaceProviderName;
  searchNearby(input: NearbySearchInput): Promise<NearbySearchResult>;
  geocodeAddress(input: GeocodeInput): Promise<ResolvedLocation>;
  reverseGeocodeLocation(input: ReverseGeocodeInput): Promise<ResolvedLocation>;
}

export function isPlaceProviderError(error: unknown): error is PlaceProviderError {
  return error instanceof PlaceProviderError;
}

export function getPlaceProvider(apiKey?: string): PlaceProvider {
  return new AmapPlaceProvider({ apiKey });
}
