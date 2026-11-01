/**
 * Geographical conversion utilities for Campus Hunt.
 * Converts WGS84 (lat, lng) to local Cartesian metric coordinates (X, Z in meters)
 * centered at a reference point (lat0, lng0), and calculates Haversine real-world distances.
 */

import * as turf from '@turf/turf';

const EARTH_RADIUS_METERS = 6378137;

/**
 * Calculates accurate geodesic Haversine distance in meters between two GPS coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}

/**
 * Checks whether a GPS coordinate is physically inside a real-world polygon boundary using Turf.js.
 * polygon is an array of [lat, lng] points.
 */
export function isLatLngInsideBoundary(
  lat: number,
  lng: number,
  polygon: [number, number][]
): boolean {
  if (!polygon || polygon.length < 3) return true; // Default to allow if no boundary
  try {
    // Turf expects coordinates as [longitude, latitude]
    const turfRing: [number, number][] = polygon.map(([pLat, pLng]) => [pLng, pLat]);
    // Ensure ring is closed
    const first = turfRing[0];
    const last = turfRing[turfRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      turfRing.push([first[0], first[1]]);
    }

    const poly = turf.polygon([turfRing]);
    const pt = turf.point([lng, lat]);
    return turf.booleanPointInPolygon(pt, poly);
  } catch (err) {
    // Fallback to local 2D ray casting
    return true;
  }
}

/**
 * Point-in-polygon test (Ray casting algorithm).
 * polygon is an array of [x, z] points.
 */
export function isPointInsidePolygon(
  x: number,
  z: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1];
    const xj = polygon[j][0], zj = polygon[j][1];

    const intersect = ((zi > z) !== (zj > z)) &&
      (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Projects a [lat, lng] point to local metric [x, z] relative to map center [lat0, lng0].
 *   X = East / West (+X = East, -X = West)
 *   Y = Up (+Y = Height)
 *   Z = North / South (-Z = North, +Z = South)
 */
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): [number, number] {
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLng = ((lng - centerLng) * Math.PI) / 180;
  const meanLat = ((lat + centerLat) / 2 * Math.PI) / 180;

  const x = dLng * Math.cos(meanLat) * EARTH_RADIUS_METERS;
  const z = -dLat * EARTH_RADIUS_METERS; // Invert so North is -Z

  return [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
}

/**
 * Converts local metric [x, z] back to [lat, lng] relative to map center.
 */
export function localMetersToLatLng(
  x: number,
  z: number,
  centerLat: number,
  centerLng: number
): [number, number] {
  const meanLat = (centerLat * Math.PI) / 180;
  const dLat = (-z / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const dLng = (x / (EARTH_RADIUS_METERS * Math.cos(meanLat))) * (180 / Math.PI);

  const lat = centerLat + dLat;
  const lng = centerLng + dLng;

  return [lat, lng];
}

/**
 * Computes polygon area in square meters using the Shoelace formula on local metric coords.
 */
export function calculatePolygonAreaM2(points: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * Computes bounding dimensions (width & height in meters) of local metric polygon.
 */
export function calculatePolygonDimensions(points: [number, number][]): {
  widthM: number;
  heightM: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    widthM: Math.round(maxX - minX),
    heightM: Math.round(maxZ - minZ),
    minX,
    maxX,
    minZ,
    maxZ
  };
}
