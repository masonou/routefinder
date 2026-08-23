const EARTH_RADIUS_KM = 6_371.0088;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Returns the great-circle distance between two geographic coordinates. */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * centralAngle;
}
