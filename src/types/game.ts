export type Team = 'HIDERS' | 'HUNTERS' | 'SPECTATORS';

export type GameStatus = 'LOBBY' | 'STARTING' | 'IN_GAME' | 'ROUND_OVER';

export type ShadowMode = 'GHOST_SHADOW' | 'RADAR_ZONE' | 'ZONE_INTELLIGENCE';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters (e.g. 4.2m)
  altitude?: number | null;
  heading?: number | null; // 0 - 360 degrees
  speed?: number | null; // meters per second
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  team: Team;
  isHost: boolean;
  isReady: boolean;
  isAlive: boolean;
  isBot?: boolean;
  gps?: GpsCoordinate;
  position: Vector3D; // Projected local Cartesian coordinates [x, y, z] in meters relative to map center
  rotation: Vector3D;
  velocity: Vector3D;
  isInsideBoundary: boolean;
  outOfBoundsSince?: number | null;
  stamina: number; // 0 - 100
  isSprinting: boolean;
  isCrouching: boolean;
  captures: number;
  survivedSeconds: number;
  activeEffects: {
    shadowCloakUntil?: number;
    silentUntil?: number;
    sprintUntil?: number;
    thermalUntil?: number;
    scannerUntil?: number;
  };
  cooldowns: Record<string, number>; // abilityName -> timestamp when ready
  lastGpsUpdate?: number;
}

export interface BuildingData {
  id: string;
  name?: string;
  points: [number, number][]; // [x, z] relative to map center
  geoPoints?: [number, number][]; // [lat, lng]
  height: number;
  levels?: number;
  type?: string;
}

export interface MapData {
  id: string;
  name: string;
  description?: string;
  center: [number, number]; // [lat, lng]
  polygon: [number, number][]; // [lat, lng]
  localPolygon: [number, number][]; // [x, z] in meters
  areaM2: number;
  dimensions: {
    widthM: number;
    heightM: number;
  };
  buildings: BuildingData[];
  spawnPoints: {
    hiders: Vector3D[];
    hunters: Vector3D[];
  };
  restrictedZones?: Array<{
    id: string;
    name: string;
    polygon: [number, number][];
  }>;
}

export interface ShadowPulsePing {
  id: string;
  hiderId: string;
  hiderName?: string;
  latitude: number;
  longitude: number;
  position: Vector3D;
  timestamp: number;
}

export interface ShadowPulseEvent {
  timestamp: number;
  durationMs: number;
  pings: ShadowPulsePing[];
  mode: ShadowMode;
}

export interface MatchSettings {
  durationSeconds: number;
  shadowIntervalSeconds: number;
  shadowDurationSeconds: number;
  captureRadius: number; // in meters (default: 8.0m for real-world GPS)
  maxTeamSize: number;
  abilitiesEnabled: boolean;
  shadowMode: ShadowMode;
  friendlyTracking: boolean;
  botCountHiders: number;
  botCountHunters: number;
  maxGpsAccuracy: number; // meters, rejects fixes worse than this (default: 25)
  outOfBoundsGraceSeconds: number; // seconds before out-of-bounds elimination (default: 30)
}

export interface KillFeedItem {
  id: string;
  timestamp: number;
  hunterName: string;
  hiderName: string;
}

export interface DecoySignal {
  id: string;
  latitude: number;
  longitude: number;
  position: Vector3D;
  expiresAt: number;
}

export interface SmokeCloud {
  id: string;
  latitude: number;
  longitude: number;
  position: Vector3D;
  radius: number;
  expiresAt: number;
}

export interface Footprint {
  id: string;
  latitude?: number;
  longitude?: number;
  position: Vector3D;
  rotationY: number;
  expiresAt: number;
}

export interface ServerAuthoritativeState {
  roomCode: string;
  status: GameStatus;
  timeRemaining: number;
  settings: MatchSettings;
  map: MapData;
  players: Record<string, Player>;
  localPlayerId: string;
  activeShadowPulse: ShadowPulseEvent | null;
  nextShadowPulseIn: number;
  activeDecoys: DecoySignal[];
  activeSmokeClouds: SmokeCloud[];
  activeFootprints: Footprint[];
  killFeed: KillFeedItem[];
  winner: 'HIDERS' | 'HUNTERS' | 'DRAW' | null;
  hidersAlive: number;
  hidersTotal: number;
  huntersCount: number;
}
