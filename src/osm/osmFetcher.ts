import axios from 'axios';
import { MapData, BuildingData, Vector3D } from '../types/game.js';
import {
  latLngToLocalMeters,
  calculatePolygonAreaM2,
  calculatePolygonDimensions,
  isPointInsidePolygon
} from './geoConverter.js';

interface NominatimResult {
  place_id: number;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  type: string;
}

/**
 * Searches places via OpenStreetMap Nominatim
 */
export async function searchPlaces(query: string): Promise<Array<{
  name: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // [minLat, maxLat, minLng, maxLng]
}>> {
  try {
    const res = await axios.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        addressdetails: 1,
        limit: 8
      },
      headers: {
        'User-Agent': 'CampusHuntGame/1.0 (academic-gaming-project)'
      },
      timeout: 8000
    });

    return res.data.map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      bbox: [
        parseFloat(item.boundingbox[0]),
        parseFloat(item.boundingbox[1]),
        parseFloat(item.boundingbox[2]),
        parseFloat(item.boundingbox[3])
      ]
    }));
  } catch (err) {
    console.warn('[OSM] Nominatim search failed or timed out:', (err as Error).message);
    return [];
  }
}

/**
 * Converts custom drawn polygon [lat, lng][] into a fully functional 3D Game MapData.
 * Queries Overpass API for real building footprints; falls back to procedural campus generation if Overpass is unreachable.
 */
export async function generateMapFromCustomPolygon(
  name: string,
  polygon: [number, number][]
): Promise<MapData> {
  if (polygon.length < 3) {
    throw new Error('Polygon must have at least 3 points.');
  }

  // Calculate centroid
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of polygon) {
    sumLat += lat;
    sumLng += lng;
  }
  const centerLat = sumLat / polygon.length;
  const centerLng = sumLng / polygon.length;
  const center: [number, number] = [centerLat, centerLng];

  // Convert polygon to local coordinates
  const localPolygon: [number, number][] = polygon.map(([lat, lng]) =>
    latLngToLocalMeters(lat, lng, centerLat, centerLng)
  );

  const areaM2 = calculatePolygonAreaM2(localPolygon);
  const dims = calculatePolygonDimensions(localPolygon);

  // Validate bounds
  if (areaM2 < 2000) {
    throw new Error(`Selected area (${Math.round(areaM2)} m²) is too small for Campus Hunt (minimum 2,000 m²).`);
  }
  if (areaM2 > 5000000) {
    throw new Error(`Selected area (${Math.round(areaM2)} m²) is excessively large (maximum 5,000,000 m²).`);
  }

  let buildings: BuildingData[] = [];

  // Try fetching real OSM buildings via Overpass
  try {
    buildings = await fetchOverpassBuildings(polygon, centerLat, centerLng);
    console.log(`[OSM] Successfully fetched ${buildings.length} real buildings from Overpass API.`);
  } catch (err) {
    console.warn('[OSM] Overpass API query failed or timed out. Generating procedural campus architecture:', (err as Error).message);
  }

  // If no buildings found from OSM or Overpass failed, generate authentic campus architectural layout
  if (buildings.length < 3) {
    buildings = generateProceduralCampusBuildings(localPolygon, dims);
  }

  // Compute safe spawn points inside the polygon
  const spawnPoints = generateSpawnPoints(localPolygon, buildings, dims);

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: name || 'Custom Tactical Campus',
    center,
    polygon,
    localPolygon,
    areaM2,
    dimensions: {
      widthM: dims.widthM,
      heightM: dims.heightM,
    },
    buildings,
    spawnPoints
  };
}

/**
 * Fetches real building footprints via Overpass API within polygon boundary
 */
async function fetchOverpassBuildings(
  polygon: [number, number][],
  centerLat: number,
  centerLng: number
): Promise<BuildingData[]> {
  // Overpass poly string format: "lat1 lon1 lat2 lon2 ... lat1 lon1"
  const polyStr = [...polygon, polygon[0]].map(([lat, lng]) => `${lat} ${lng}`).join(' ');

  const overpassQuery = `
    [out:json][timeout:10];
    (
      way["building"](poly:"${polyStr}");
    );
    out geom 40;
  `;

  const res = await axios.post('https://overpass-api.de/api/interpreter', overpassQuery, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 10000
  });

  const elements = res.data?.elements || [];
  const buildings: BuildingData[] = [];

  for (const el of elements) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      const tags = el.tags || {};
      const name = tags.name || tags['addr:housename'] || undefined;
      const levels = parseInt(tags['building:levels'] || '2', 10) || 2;
      const height = parseFloat(tags.height || '') || (levels * 3.8);

      const localPoints: [number, number][] = el.geometry.map((pt: { lat: number, lon: number }) =>
        latLngToLocalMeters(pt.lat, pt.lon, centerLat, centerLng)
      );

      // Check if building has non-zero area
      const bArea = calculatePolygonAreaM2(localPoints);
      if (bArea > 25 && bArea < 100000) {
        buildings.push({
          id: `osm-${el.id}`,
          name,
          points: localPoints,
          height: Math.min(Math.max(height, 5), 45),
          levels,
          type: tags.building || 'building'
        });
      }
    }
  }

  return buildings;
}

/**
 * Procedural building generator if Overpass is down or area has no OSM building footprints.
 * Places realistic academic quads, halls, libraries, and laboratories inside the polygon.
 */
function generateProceduralCampusBuildings(
  localPolygon: [number, number][],
  dims: { minX: number; maxX: number; minZ: number; maxZ: number; widthM: number; heightM: number }
): BuildingData[] {
  const buildings: BuildingData[] = [];
  const buildingNames = [
    'Science & Engineering Complex',
    'Main University Library',
    'Student Union Center',
    'Humanities & Arts Hall',
    'Administration Building',
    'Robotics & AI Pavilion',
    'Lecture Theater Hall',
    'Bio-Research Institute',
    'Athletic Pavilion',
    'Alumni Memorial Hall'
  ];

  const gridStepX = Math.max(dims.widthM / 4, 40);
  const gridStepZ = Math.max(dims.heightM / 4, 40);

  let nameIndex = 0;

  for (let x = dims.minX + gridStepX * 0.6; x < dims.maxX - gridStepX * 0.4; x += gridStepX) {
    for (let z = dims.minZ + gridStepZ * 0.6; z < dims.maxZ - gridStepZ * 0.4; z += gridStepZ) {
      // Add slight jitter for natural campus arrangement
      const jitterX = ((Math.sin(x * 12.3 + z) * 0.25) * gridStepX);
      const jitterZ = ((Math.cos(z * 8.7 + x) * 0.25) * gridStepZ);
      const cx = x + jitterX;
      const cz = z + jitterZ;

      const w = Math.min(Math.max(gridStepX * 0.45, 20), 45);
      const d = Math.min(Math.max(gridStepZ * 0.45, 18), 40);
      const hw = w / 2;
      const hd = d / 2;

      const pts: [number, number][] = [
        [cx - hw, cz - hd],
        [cx + hw, cz - hd],
        [cx + hw, cz + hd],
        [cx - hw, cz + hd]
      ];

      // Ensure building center and corners are inside polygon
      if (isPointInsidePolygon(cx, cz, localPolygon) &&
          isPointInsidePolygon(pts[0][0], pts[0][1], localPolygon) &&
          isPointInsidePolygon(pts[2][0], pts[2][1], localPolygon)) {

        const levels = 2 + (nameIndex % 3);
        const height = levels * 4.2;

        buildings.push({
          id: `proc-bldg-${nameIndex + 1}`,
          name: buildingNames[nameIndex % buildingNames.length],
          points: pts,
          height,
          levels,
          type: 'academic'
        });

        nameIndex++;
      }
    }
  }

  return buildings;
}

/**
 * Computes safe tactical spawn points for both Hiders and Hunters.
 */
function generateSpawnPoints(
  localPolygon: [number, number][],
  buildings: BuildingData[],
  dims: { minX: number; maxX: number; minZ: number; maxZ: number }
): { hiders: Vector3D[]; hunters: Vector3D[] } {
  const hiderSpawns: Vector3D[] = [];
  const hunterSpawns: Vector3D[] = [];

  // Hunters spawn at the South or North main entrance perimeter
  const hunterBaseZ = dims.maxZ * 0.8;
  const hunterBaseX = (dims.minX + dims.maxX) / 2;

  for (let i = -2; i <= 2; i++) {
    const x = hunterBaseX + i * 8;
    const z = hunterBaseZ;
    if (isPointInsidePolygon(x, z, localPolygon)) {
      hunterSpawns.push({ x, y: 0.5, z });
    } else {
      hunterSpawns.push({ x: hunterBaseX, y: 0.5, z: (dims.minZ + dims.maxZ) / 2 });
    }
  }

  // Hiders spawn dispersed across campus courtyards and northern/central zones
  const candidatePoints: [number, number][] = [
    [(dims.minX + dims.maxX) / 2, (dims.minZ + dims.maxZ) * 0.2],
    [dims.minX * 0.6, dims.minZ * 0.4],
    [dims.maxX * 0.6, dims.minZ * 0.4],
    [dims.minX * 0.5, (dims.minZ + dims.maxZ) * 0.5],
    [dims.maxX * 0.5, (dims.minZ + dims.maxZ) * 0.5],
  ];

  for (const [cx, cz] of candidatePoints) {
    if (isPointInsidePolygon(cx, cz, localPolygon)) {
      hiderSpawns.push({ x: cx, y: 0.5, z: cz });
    } else {
      hiderSpawns.push({ x: 0, y: 0.5, z: 0 });
    }
  }

  return {
    hiders: hiderSpawns.length > 0 ? hiderSpawns : [{ x: 0, y: 0.5, z: 0 }],
    hunters: hunterSpawns.length > 0 ? hunterSpawns : [{ x: 0, y: 0.5, z: 50 }]
  };
}

