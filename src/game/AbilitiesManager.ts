import { Player, DecoySignal, SmokeCloud, DroneReconEvent, RadarScanEvent } from '../types/game.js';
import { localMetersToLatLng } from '../osm/geoConverter.js';

export interface AbilityResult {
  success: boolean;
  message?: string;
  decoy?: DecoySignal;
  smoke?: SmokeCloud;
  droneScan?: DroneReconEvent;
  radarScan?: RadarScanEvent;
  revealedHiderIds?: string[];
}

export class AbilitiesManager {
  /**
   * Activates a tactical real-world ability for a player.
   */
  public static activateAbility(
    player: Player,
    abilityId: string,
    allPlayers: Record<string, Player>,
    mapCenter?: [number, number]
  ): AbilityResult {
    const now = Date.now();
    const centerLat = mapCenter ? mapCenter[0] : (player.gps?.latitude || 37.4275);
    const centerLng = mapCenter ? mapCenter[1] : (player.gps?.longitude || -122.1697);

    // Check cooldown
    const readyAt = player.cooldowns[abilityId] || 0;
    if (now < readyAt) {
      const waitSeconds = Math.ceil((readyAt - now) / 1000);
      return { success: false, message: `Ability on cooldown (${waitSeconds}s remaining)` };
    }

    if (player.team === 'HIDERS') {
      return this.handleHiderAbility(player, abilityId, now, centerLat, centerLng);
    } else if (player.team === 'HUNTERS') {
      return this.handleHunterAbility(player, abilityId, allPlayers, now, centerLat, centerLng);
    }

    return { success: false, message: 'Invalid team or spectator.' };
  }

  private static handleHiderAbility(
    player: Player,
    abilityId: string,
    now: number,
    centerLat: number,
    centerLng: number
  ): AbilityResult {
    switch (abilityId) {
      case 'SHADOW_CLOAK': {
        const duration = 15 * 1000;
        player.activeEffects.shadowCloakUntil = now + duration;
        player.cooldowns['SHADOW_CLOAK'] = now + duration + (45 * 1000);
        return { success: true, message: 'Shadow Cloak activated! Invisible to radar and 180s pulse for 15s.' };
      }

      case 'DECOY': {
        const cooldown = 45 * 1000;
        player.cooldowns['DECOY'] = now + cooldown;

        // Place decoy ~25 meters in direction of heading (or random offset)
        const headingRad = ((player.gps?.heading || 0) * Math.PI) / 180;
        const offsetX = Math.sin(headingRad) * 25;
        const offsetZ = -Math.cos(headingRad) * 25;

        const posX = player.position.x + offsetX;
        const posZ = player.position.z + offsetZ;
        const [decoyLat, decoyLng] = localMetersToLatLng(posX, posZ, centerLat, centerLng);

        const decoy: DecoySignal = {
          id: `decoy-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          latitude: decoyLat,
          longitude: decoyLng,
          position: { x: posX, y: 0.5, z: posZ },
          expiresAt: now + (18 * 1000)
        };
        return { success: true, message: 'Tactical Decoy deployed! Confusing hunter radars.', decoy };
      }

      case 'SPRINT': {
        const duration = 8 * 1000;
        player.activeEffects.sprintUntil = now + duration;
        player.cooldowns['SPRINT'] = now + duration + (20 * 1000);
        return { success: true, message: 'Adrenaline Surge! Physical escape boosted for 8s.' };
      }

      case 'SILENT_MOVEMENT': {
        const duration = 15 * 1000;
        player.activeEffects.silentUntil = now + duration;
        player.cooldowns['SILENT_MOVEMENT'] = now + duration + (30 * 1000);
        return { success: true, message: 'Silent Stride active! Minimized acoustic footprint for 15s.' };
      }

      case 'SMOKE_SCREEN': {
        const cooldown = 45 * 1000;
        player.cooldowns['SMOKE_SCREEN'] = now + cooldown;
        const playerLat = player.gps?.latitude || centerLat;
        const playerLng = player.gps?.longitude || centerLng;

        const smoke: SmokeCloud = {
          id: `smoke-${Date.now()}`,
          latitude: playerLat,
          longitude: playerLng,
          position: { ...player.position },
          radius: 25, // 25 meters radius (50m total diameter coverage)
          expiresAt: now + (18 * 1000) // 18 seconds duration
        };
        return { success: true, message: 'Tactical Smoke Screen deployed! 25m radar blind zone created.', smoke };
      }

      default:
        return { success: false, message: 'Unknown hider ability' };
    }
  }

  private static handleHunterAbility(
    player: Player,
    abilityId: string,
    allPlayers: Record<string, Player>,
    now: number,
    centerLat: number,
    centerLng: number
  ): AbilityResult {
    const playerLat = player.gps?.latitude || centerLat;
    const playerLng = player.gps?.longitude || centerLng;

    switch (abilityId) {
      case 'AREA_SCANNER': {
        const cooldown = 35 * 1000;
        player.cooldowns['AREA_SCANNER'] = now + cooldown;
        player.activeEffects.scannerUntil = now + (4 * 1000);

        // Detect nearby uncloaked hiders within 45m
        const scanRadius = 45;
        const detectedHiders: Array<{ id: string; name: string; latitude: number; longitude: number }> = [];

        for (const other of Object.values(allPlayers)) {
          if (other.team === 'HIDERS' && other.isAlive) {
            if (other.activeEffects.shadowCloakUntil && other.activeEffects.shadowCloakUntil > now) {
              continue; // Cloaked
            }
            const dist = Math.hypot(
              other.position.x - player.position.x,
              other.position.z - player.position.z
            );
            if (dist <= scanRadius) {
              const hiderLat = other.gps?.latitude ?? (centerLat + (other.position.z / 111320));
              const hiderLng = other.gps?.longitude ?? (centerLng + (other.position.x / (111320 * Math.cos(centerLat * Math.PI / 180))));
              detectedHiders.push({
                id: other.id,
                name: other.name,
                latitude: hiderLat,
                longitude: hiderLng
              });
            }
          }
        }

        const radarScan: RadarScanEvent = {
          id: `scan-${now}-${player.id}`,
          initiatorId: player.id,
          latitude: playerLat,
          longitude: playerLng,
          radius: scanRadius,
          timestamp: now,
          durationMs: 4000,
          expiresAt: now + 4000,
          revealedHiders: detectedHiders
        };

        return {
          success: true,
          message: detectedHiders.length > 0
            ? `Area Scanner: ${detectedHiders.length} hider(s) detected within 45m!`
            : 'Area Scanner: No bio-signatures detected in 45m sector.',
          radarScan,
          revealedHiderIds: detectedHiders.map(h => h.id)
        };
      }

      case 'THERMAL_VISION': {
        const duration = 12 * 1000;
        player.activeEffects.thermalUntil = now + duration;
        player.cooldowns['THERMAL_VISION'] = now + duration + (35 * 1000);
        return { success: true, message: 'Thermal Optics engaged! High-contrast biological infrared scans active for 12s.' };
      }

      case 'SPEED_BOOST': {
        const duration = 8 * 1000;
        player.activeEffects.sprintUntil = now + duration;
        player.cooldowns['SPEED_BOOST'] = now + duration + (25 * 1000);
        return { success: true, message: 'Overdrive pursuit surge active for 8s.' };
      }

      case 'DRONE_SCAN': {
        const cooldown = 50 * 1000;
        player.cooldowns['DRONE_SCAN'] = now + cooldown;

        const heading = player.gps?.heading ?? 0;
        const headingRad = (heading * Math.PI) / 180;

        // Drone starts 30m behind player and flies 100m forward
        const startDist = -30;
        const targetDist = 100;

        const startX = player.position.x + Math.sin(headingRad) * startDist;
        const startZ = player.position.z - Math.cos(headingRad) * startDist;
        const targetX = player.position.x + Math.sin(headingRad) * targetDist;
        const targetZ = player.position.z - Math.cos(headingRad) * targetDist;

        const [startLat, startLng] = localMetersToLatLng(startX, startZ, centerLat, centerLng);
        const [targetLat, targetLng] = localMetersToLatLng(targetX, targetZ, centerLat, centerLng);

        // Corridor scan width: 35m
        const scanWidth = 35;
        const detectedHiders: Array<{ id: string; name: string; latitude: number; longitude: number }> = [];

        for (const other of Object.values(allPlayers)) {
          if (other.team === 'HIDERS' && other.isAlive) {
            if (other.activeEffects.shadowCloakUntil && other.activeEffects.shadowCloakUntil > now) continue;
            // Distance from flight line (p1 to p2)
            const d = pointToSegmentDistance(
              other.position.x,
              other.position.z,
              startX,
              startZ,
              targetX,
              targetZ
            );
            if (d <= scanWidth) {
              const hiderLat = other.gps?.latitude ?? (centerLat + (other.position.z / 111320));
              const hiderLng = other.gps?.longitude ?? (centerLng + (other.position.x / (111320 * Math.cos(centerLat * Math.PI / 180))));
              detectedHiders.push({
                id: other.id,
                name: other.name,
                latitude: hiderLat,
                longitude: hiderLng
              });
            }
          }
        }

        const droneScan: DroneReconEvent = {
          id: `drone-${now}-${player.id}`,
          initiatorId: player.id,
          initiatorName: player.name,
          startLat,
          startLng,
          targetLat,
          targetLng,
          heading,
          radius: scanWidth,
          timestamp: now,
          durationMs: 6000,
          expiresAt: now + 7000,
          revealedHiders: detectedHiders
        };

        return {
          success: true,
          message: detectedHiders.length > 0
            ? `Tactical UAV Recon: ${detectedHiders.length} target(s) locked in forward sector!`
            : 'Tactical UAV Recon: Sector sweep clear. No targets detected.',
          droneScan,
          revealedHiderIds: detectedHiders.map(h => h.id)
        };
      }

      default:
        return { success: false, message: 'Unknown hunter ability' };
    }
  }
}

// Distance from point (px, pz) to line segment (x1, z1) -> (x2, z2) in meters
function pointToSegmentDistance(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - x1, pz - z1);

  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

