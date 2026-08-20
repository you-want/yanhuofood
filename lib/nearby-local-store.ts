import { z } from "zod";
import {
  nearbyPlaceFeedbackSchema,
  nearbyPreferencesSchema,
  nearbyRecentChoiceSchema,
  savedNearbyLocationSchema,
} from "@/lib/schemas/nearby";
import type {
  NearbyPlace,
  NearbyPlaceFeedback,
  NearbyPlaceFeedbackValue,
  NearbyPreferences,
  NearbyRecentChoice,
  SavedNearbyLocation,
} from "@/lib/places/types";

const STORAGE_KEYS = {
  preferences: "yanhuofood.nearbyPreferences",
  recentChoices: "yanhuofood.nearbyRecentChoices",
  savedLocations: "yanhuofood.savedLocations",
  feedback: "yanhuofood.nearbyPlaceFeedback",
} as const;

const STORAGE_VERSION = 1;
const DEFAULT_PREFERENCES: NearbyPreferences = {
  radiusM: 1_500,
  openNow: false,
  recommendationMode: "balanced",
};

function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ version: z.literal(STORAGE_VERSION), data });
}

function readStorage<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = envelopeSchema(schema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.data : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, data: value }));
}

export function loadNearbyPreferences() {
  return readStorage(STORAGE_KEYS.preferences, nearbyPreferencesSchema, DEFAULT_PREFERENCES);
}

export function saveNearbyPreferences(preferences: NearbyPreferences) {
  const parsed = nearbyPreferencesSchema.parse(preferences);
  writeStorage(STORAGE_KEYS.preferences, parsed);
}

export function loadNearbyRecentChoices() {
  return readStorage(STORAGE_KEYS.recentChoices, z.array(nearbyRecentChoiceSchema), []);
}

export function recordNearbyChoice(place: NearbyPlace, selectedAt = new Date()) {
  const choice: NearbyRecentChoice = {
    provider: place.provider,
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    categoryName: place.categoryName,
    selectedAt: selectedAt.toISOString(),
  };
  const previous = loadNearbyRecentChoices().filter(
    (item) =>
      item.provider !== choice.provider || item.providerPlaceId !== choice.providerPlaceId
  );
  const next = [choice, ...previous].slice(0, 100);
  writeStorage(STORAGE_KEYS.recentChoices, next);
  return next;
}

export function loadSavedNearbyLocations() {
  return readStorage(STORAGE_KEYS.savedLocations, z.array(savedNearbyLocationSchema), []);
}

export function saveNearbyLocation(location: SavedNearbyLocation) {
  const parsed = savedNearbyLocationSchema.parse(location);
  const previous = loadSavedNearbyLocations().filter((item) => item.id !== parsed.id);
  const next = [parsed, ...previous].slice(0, 10);
  writeStorage(STORAGE_KEYS.savedLocations, next);
  return next;
}

export function removeSavedNearbyLocation(id: string) {
  const next = loadSavedNearbyLocations().filter((item) => item.id !== id);
  writeStorage(STORAGE_KEYS.savedLocations, next);
  return next;
}

export function loadNearbyPlaceFeedback() {
  return readStorage(STORAGE_KEYS.feedback, z.array(nearbyPlaceFeedbackSchema), []);
}

export function setNearbyPlaceFeedback(
  place: Pick<NearbyPlace, "provider" | "providerPlaceId">,
  value: NearbyPlaceFeedbackValue,
  updatedAt = new Date()
) {
  const item: NearbyPlaceFeedback = {
    provider: place.provider,
    providerPlaceId: place.providerPlaceId,
    value,
    updatedAt: updatedAt.toISOString(),
  };
  const previous = loadNearbyPlaceFeedback().filter(
    (current) =>
      current.provider !== item.provider || current.providerPlaceId !== item.providerPlaceId
  );
  const next = [item, ...previous].slice(0, 500);
  writeStorage(STORAGE_KEYS.feedback, next);
  return next;
}

export function removeNearbyPlaceFeedback(
  place: Pick<NearbyPlace, "provider" | "providerPlaceId">
) {
  const next = loadNearbyPlaceFeedback().filter(
    (item) => item.provider !== place.provider || item.providerPlaceId !== place.providerPlaceId
  );
  writeStorage(STORAGE_KEYS.feedback, next);
  return next;
}

export function clearNearbyLocalData() {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key));
}
