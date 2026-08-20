import { z } from "zod";

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(maxLength).optional()
  );

const optionalAmapWebServiceKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(8).max(128).optional()
);

export const coordinateSystemSchema = z.enum(["gps", "amap"]);

export const geoPointSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const nearbySearchRequestSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  coordinate_system: coordinateSystemSchema.default("gps"),
  location_accuracy_m: z.coerce.number().nonnegative().max(100_000).optional(),
  radius_m: z.coerce.number().int().min(100).max(5_000).default(1_500),
  keyword: optionalTrimmedString(60),
  category_codes: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  page: z.coerce.number().int().min(1).max(20).default(1),
  page_size: z.coerce.number().int().min(1).max(25).default(20),
  amap_web_service_key: optionalAmapWebServiceKey,
});

export const nearbyGeocodeRequestSchema = z.object({
  address: z.string().trim().min(2).max(120),
  city: optionalTrimmedString(40),
  amap_web_service_key: optionalAmapWebServiceKey,
});

export const nearbyReverseGeocodeRequestSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  coordinate_system: coordinateSystemSchema.default("gps"),
  amap_web_service_key: optionalAmapWebServiceKey,
});

export type NearbySearchRequest = z.infer<typeof nearbySearchRequestSchema>;
export type NearbyGeocodeRequest = z.infer<typeof nearbyGeocodeRequestSchema>;
export type NearbyReverseGeocodeRequest = z.infer<
  typeof nearbyReverseGeocodeRequestSchema
>;

export const nearbyRecommendationModeSchema = z.enum(["safe", "balanced", "surprise"]);
export const nearbyPlaceFeedbackValueSchema = z.enum(["liked", "blocked"]);

export const nearbyFiltersSchema = z.object({
  maxDistanceM: z.coerce.number().int().min(100).max(5_000).optional(),
  maxPrice: z.coerce.number().min(1).max(10_000).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  openNow: z.boolean().optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  excludedCategories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const nearbyPreferencesSchema = z.object({
  radiusM: z.coerce.number().int().min(100).max(5_000).default(1_500),
  maxPrice: z.coerce.number().min(1).max(10_000).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  openNow: z.boolean().default(false),
  recommendationMode: nearbyRecommendationModeSchema.default("balanced"),
});

export const localAmapConfigSchema = z.object({
  enabled: z.boolean().default(true),
  webServiceKey: z.string().trim().max(128).default(""),
});

export type LocalAmapConfig = z.infer<typeof localAmapConfigSchema>;

export const nearbyRecentChoiceSchema = z.object({
  provider: z.literal("amap"),
  providerPlaceId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  categoryName: optionalTrimmedString(120),
  selectedAt: z.iso.datetime(),
});

export const nearbyPlaceFeedbackSchema = z.object({
  provider: z.literal("amap"),
  providerPlaceId: z.string().trim().min(1).max(100),
  value: nearbyPlaceFeedbackValueSchema,
  updatedAt: z.iso.datetime(),
});

export const savedNearbyLocationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  formattedAddress: z.string().trim().min(1).max(160),
  location: geoPointSchema,
  coordinateSystem: coordinateSystemSchema,
  updatedAt: z.iso.datetime(),
});
