import { MapData } from '../types/game.js';
import { latLngToLocalMeters, calculatePolygonAreaM2, calculatePolygonDimensions } from './geoConverter.js';

/**
 * High-fidelity real-world campus map presets.
 * Coordinates are based on real OpenStreetMap coordinates.
 */
export const CAMPUS_PRESETS: Record<string, MapData> = {
  'stanford-quad': createPreset({
    id: 'stanford-quad',
    name: 'Stanford University - Main Quad',
    description: 'Iconic historic arcades, sandstone Memorial Church, and palm-lined courtyards in Stanford, CA.',
    center: [37.4275, -122.1697],
    // Boundary around the Main Quad, Oval and Memorial Court
    polygon: [
      [37.4300, -122.1720],
      [37.4300, -122.1670],
      [37.4255, -122.1670],
      [37.4255, -122.1720],
    ],
    rawBuildings: [
      {
        id: 'memorial-church',
        name: 'Memorial Church',
        centerDelta: [0, -10],
        size: [36, 48],
        height: 24,
        levels: 3
      },
      {
        id: 'building-10',
        name: 'President & Provost Quad',
        centerDelta: [-55, 30],
        size: [42, 28],
        height: 12,
        levels: 2
      },
      {
        id: 'building-20',
        name: 'Department of History',
        centerDelta: [55, 30],
        size: [42, 28],
        height: 12,
        levels: 2
      },
      {
        id: 'building-60',
        name: 'Language Corner',
        centerDelta: [-75, -25],
        size: [32, 50],
        height: 14,
        levels: 2
      },
      {
        id: 'building-160',
        name: 'Wallenberg Hall',
        centerDelta: [75, -25],
        size: [32, 50],
        height: 14,
        levels: 2
      },
      {
        id: 'outer-arcade-west',
        name: 'West Arcade Complex',
        centerDelta: [-110, 10],
        size: [28, 70],
        height: 10,
        levels: 2
      },
      {
        id: 'outer-arcade-east',
        name: 'East Arcade Complex',
        centerDelta: [110, 10],
        size: [28, 70],
        height: 10,
        levels: 2
      },
      {
        id: 'green-library-wing',
        name: 'Green Library West Wing',
        centerDelta: [140, -80],
        size: [45, 60],
        height: 18,
        levels: 3
      },
      {
        id: 'hoover-tower-base',
        name: 'Hoover Memorial Annex',
        centerDelta: [130, 95],
        size: [35, 35],
        height: 38,
        levels: 7
      }
    ],
    spawnPoints: {
      hiders: [
        { x: -40, y: 0.5, z: -50 },
        { x: 30, y: 0.5, z: -40 },
        { x: -80, y: 0.5, z: 20 },
        { x: 60, y: 0.5, z: -60 },
        { x: 0, y: 0.5, z: 70 }
      ],
      hunters: [
        { x: 0, y: 0.5, z: -140 },
        { x: -15, y: 0.5, z: -135 },
        { x: 15, y: 0.5, z: -135 },
        { x: -30, y: 0.5, z: -130 },
        { x: 30, y: 0.5, z: -130 }
      ]
    }
  }),

  'mit-killian': createPreset({
    id: 'mit-killian',
    name: 'MIT - Great Dome & Killian Court',
    description: 'Neoclassical limestone portico and riverfront courtyards at Massachusetts Institute of Technology.',
    center: [42.3598, -71.0920],
    polygon: [
      [42.3618, -71.0945],
      [42.3618, -71.0895],
      [42.3578, -71.0895],
      [42.3578, -71.0945],
    ],
    rawBuildings: [
      {
        id: 'mit-dome',
        name: 'Building 10 (Great Dome)',
        centerDelta: [0, -45],
        size: [52, 40],
        height: 32,
        levels: 4
      },
      {
        id: 'mit-bldg-4',
        name: 'Building 4 (Maclaurin)',
        centerDelta: [-55, -25],
        size: [40, 50],
        height: 16,
        levels: 3
      },
      {
        id: 'mit-bldg-3',
        name: 'Building 3 (Rotch Library)',
        centerDelta: [55, -25],
        size: [40, 50],
        height: 16,
        levels: 3
      },
      {
        id: 'mit-bldg-7',
        name: 'Building 7 (Rogers Lobby)',
        centerDelta: [-100, 30],
        size: [45, 45],
        height: 22,
        levels: 4
      },
      {
        id: 'mit-bldg-2',
        name: 'Building 2 (Math)',
        centerDelta: [100, 30],
        size: [45, 45],
        height: 18,
        levels: 3
      },
      {
        id: 'mit-walker',
        name: 'Walker Memorial',
        centerDelta: [120, -70],
        size: [38, 48],
        height: 15,
        levels: 3
      }
    ],
    spawnPoints: {
      hiders: [
        { x: -35, y: 0.5, z: -20 },
        { x: 35, y: 0.5, z: -20 },
        { x: -70, y: 0.5, z: 20 },
        { x: 70, y: 0.5, z: 20 },
        { x: 0, y: 0.5, z: -80 }
      ],
      hunters: [
        { x: 0, y: 0.5, z: 90 },
        { x: -20, y: 0.5, z: 85 },
        { x: 20, y: 0.5, z: 85 },
        { x: -40, y: 0.5, z: 80 },
        { x: 40, y: 0.5, z: 80 }
      ]
    }
  }),

  'oxford-radcliffe': createPreset({
    id: 'oxford-radcliffe',
    name: 'Oxford - Radcliffe Camera & Bodleian',
    description: 'Centuries-old cobblestones, gothic towers, and hidden college quadrangles in Oxford, UK.',
    center: [51.7538, -1.2544],
    polygon: [
      [51.7555, -1.2570],
      [51.7555, -1.2515],
      [51.7520, -1.2515],
      [51.7520, -1.2570],
    ],
    rawBuildings: [
      {
        id: 'radcliffe-camera',
        name: 'Radcliffe Camera',
        centerDelta: [0, 0],
        size: [32, 32],
        height: 28,
        levels: 4
      },
      {
        id: 'bodleian-library',
        name: 'Old Bodleian Library Quad',
        centerDelta: [0, -50],
        size: [60, 50],
        height: 18,
        levels: 3
      },
      {
        id: 'st-marys-church',
        name: 'University Church of St Mary',
        centerDelta: [0, 50],
        size: [48, 30],
        height: 25,
        levels: 3
      },
      {
        id: 'allsouls-college',
        name: 'All Souls College Quad',
        centerDelta: [65, 0],
        size: [55, 75],
        height: 15,
        levels: 3
      },
      {
        id: 'brasenose-college',
        name: 'Brasenose College Quad',
        centerDelta: [-65, 0],
        size: [55, 75],
        height: 15,
        levels: 3
      }
    ],
    spawnPoints: {
      hiders: [
        { x: -45, y: 0.5, z: -30 },
        { x: 45, y: 0.5, z: -30 },
        { x: -45, y: 0.5, z: 30 },
        { x: 45, y: 0.5, z: 30 },
        { x: 0, y: 0.5, z: -85 }
      ],
      hunters: [
        { x: 0, y: 0.5, z: 95 },
        { x: -20, y: 0.5, z: 90 },
        { x: 20, y: 0.5, z: 90 },
        { x: -35, y: 0.5, z: 85 },
        { x: 35, y: 0.5, z: 85 }
      ]
    }
  }),

  'central-park': createPreset({
    id: 'central-park',
    name: 'Central Park - Bethesda & Sheep Meadow',
    description: 'Manhattan greenery, grand terrace fountain, dense tree clusters, and winding paths.',
    center: [40.7745, -73.9712],
    polygon: [
      [40.7770, -73.9745],
      [40.7770, -73.9675],
      [40.7720, -73.9675],
      [40.7720, -73.9745],
    ],
    rawBuildings: [
      {
        id: 'bethesda-arcade',
        name: 'Bethesda Terrace & Arcade',
        centerDelta: [0, -30],
        size: [40, 25],
        height: 9,
        levels: 1
      },
      {
        id: 'boathouse-complex',
        name: 'Loeb Boathouse',
        centerDelta: [85, -60],
        size: [45, 30],
        height: 11,
        levels: 2
      },
      {
        id: 'pergola-west',
        name: 'West Lake Pavilion',
        centerDelta: [-75, 20],
        size: [24, 24],
        height: 8,
        levels: 1
      },
      {
        id: 'band-shell',
        name: 'Naumburg Bandshell',
        centerDelta: [15, 60],
        size: [32, 22],
        height: 14,
        levels: 1
      },
      {
        id: 'mineral-springs',
        name: 'Mineral Springs Building',
        centerDelta: [-80, 85],
        size: [30, 25],
        height: 9,
        levels: 1
      }
    ],
    spawnPoints: {
      hiders: [
        { x: -40, y: 0.5, z: -50 },
        { x: 40, y: 0.5, z: -50 },
        { x: -60, y: 0.5, z: 20 },
        { x: 60, y: 0.5, z: 20 },
        { x: 0, y: 0.5, z: 80 }
      ],
      hunters: [
        { x: 0, y: 0.5, z: -110 },
        { x: -25, y: 0.5, z: -105 },
        { x: 25, y: 0.5, z: -105 },
        { x: -50, y: 0.5, z: -100 },
        { x: 50, y: 0.5, z: -100 }
      ]
    }
  })
};

interface PresetInput {
  id: string;
  name: string;
  description: string;
  center: [number, number];
  polygon: [number, number][];
  rawBuildings: Array<{
    id: string;
    name: string;
    centerDelta: [number, number]; // [deltaX, deltaZ] in meters
    size: [number, number]; // [widthM, depthM]
    height: number;
    levels: number;
  }>;
  spawnPoints: {
    hiders: Array<{ x: number, y: number, z: number }>;
    hunters: Array<{ x: number, y: number, z: number }>;
  };
}

function createPreset(input: PresetInput): MapData {
  const [centerLat, centerLng] = input.center;

  // Convert polygon to local coordinates
  const localPolygon: [number, number][] = input.polygon.map(([lat, lng]) =>
    latLngToLocalMeters(lat, lng, centerLat, centerLng)
  );

  const areaM2 = calculatePolygonAreaM2(localPolygon);
  const dims = calculatePolygonDimensions(localPolygon);

  // Convert raw rectangular buildings to local 2D polygons [x, z]
  const buildings = input.rawBuildings.map(b => {
    const [cx, cz] = b.centerDelta;
    const [w, d] = b.size;
    const hw = w / 2;
    const hd = d / 2;

    const points: [number, number][] = [
      [cx - hw, cz - hd],
      [cx + hw, cz - hd],
      [cx + hw, cz + hd],
      [cx - hw, cz + hd],
    ];

    return {
      id: b.id,
      name: b.name,
      points,
      height: b.height,
      levels: b.levels,
      type: 'building'
    };
  });

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    center: input.center,
    polygon: input.polygon,
    localPolygon,
    areaM2,
    dimensions: {
      widthM: dims.widthM,
      heightM: dims.heightM,
    },
    buildings,
    spawnPoints: input.spawnPoints
  };
}

/**
 * Dynamically generates a real-world GPS tactical boundary centered around the player's live physical location.
 */
export function createLiveSector(
  centerLat: number,
  centerLng: number,
  radiusMeters = 300,
  name = 'Live Tactical Sector'
): MapData {
  const numPoints = 12;
  const rawPolygon: [number, number][] = [];
  const localPolygon: [number, number][] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const x = radiusMeters * Math.sin(angle);
    const z = radiusMeters * Math.cos(angle);
    localPolygon.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);

    const dLat = (radiusMeters * Math.cos(angle)) / 111320.0;
    const dLng = (radiusMeters * Math.sin(angle)) / (111320.0 * Math.cos((centerLat * Math.PI) / 180.0));
    rawPolygon.push([centerLat + dLat, centerLng + dLng]);
  }
  // Close polygon ring
  rawPolygon.push([rawPolygon[0][0], rawPolygon[0][1]]);
  localPolygon.push([localPolygon[0][0], localPolygon[0][1]]);

  return {
    id: `live-gps-${Date.now()}`,
    name,
    description: `Live physical operational zone centered at ${centerLat.toFixed(5)}, ${centerLng.toFixed(5)} (${radiusMeters}m radius).`,
    center: [centerLat, centerLng],
    polygon: rawPolygon,
    localPolygon,
    areaM2: Math.round(Math.PI * radiusMeters * radiusMeters),
    dimensions: {
      widthM: radiusMeters * 2,
      heightM: radiusMeters * 2,
    },
    buildings: [],
    spawnPoints: {
      hiders: [
        { x: -radiusMeters * 0.25, y: 0, z: -radiusMeters * 0.25 },
        { x: radiusMeters * 0.25, y: 0, z: radiusMeters * 0.25 }
      ],
      hunters: [
        { x: 0, y: 0, z: 0 }
      ]
    }
  };
}


