import type { GeoPoint } from "@/lib/places/types";

const EARTH_RADIUS_M = 6_371_008.8;

function degreesToRadians(value: number) {
  return value * (Math.PI / 180);
}

export function haversineDistanceM(from: GeoPoint, to: GeoPoint) {
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return Math.round(EARTH_RADIUS_M * angularDistance);
}
