import { Player, DecoySignal, SmokeCloud } from '../types/game.js';
import { localMetersToLatLng } from '../osm/geoConverter.js';

export interface AbilityResult {
  success: boolean;
  message?: string;
  decoy?: DecoySignal;
  smoke?: SmokeCloud;
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
      return this.handleHunterAbility(player, abilityId, allPlayers, now);
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
        const cooldown = 50 * 1000;
        player.cooldowns['SMOKE_SCREEN'] = now + cooldown;
        const playerLat = player.gps?.latitude || centerLat;
        const playerLng = player.gps?.longitude || centerLng;

        const smoke: SmokeCloud = {
          id: `smoke-${Date.now()}`,
          latitude: playerLat,
          longitude: playerLng,
          position: { ...player.position },
          radius: 15,
          expiresAt: now + (15 * 1000)
        };
        return { success: true, message: 'Smoke Screen deployed on GPS radar!', smoke };
      }

      default:
        return { success: false, message: 'Unknown hider ability' };
    }
  }

  private static handleHunterAbility(
    player: Player,
    abilityId: string,
    allPlayers: Record<string, Player>,
    now: number
  ): AbilityResult {
    switch (abilityId) {
      case 'AREA_SCANNER': {
        const cooldown = 35 * 1000;
        player.cooldowns['AREA_SCANNER'] = now + cooldown;
        player.activeEffects.scannerUntil = now + (5 * 1000);

        // Detect nearby uncloaked hiders within 40m
        const scanRadius = 40;
        const detectedIds: string[] = [];
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
              detectedIds.push(other.id);
            }
          }
        }
        return {
          success: true,
          message: detectedIds.length > 0
            ? `Area Scanner: ${detectedIds.length} hider(s) detected within 40m!`
            : 'Area Scanner: No thermal signatures in 40m radius.',
          revealedHiderIds: detectedIds
        };
      }

      case 'THERMAL_VISION': {
        const duration = 10 * 1000;
        player.activeEffects.thermalUntil = now + duration;
        player.cooldowns['THERMAL_VISION'] = now + duration + (40 * 1000);
        return { success: true, message: 'Thermal Optics engaged! Biological scans active for 10s.' };
      }

      case 'SPEED_BOOST': {
        const duration = 8 * 1000;
        player.activeEffects.sprintUntil = now + duration;
        player.cooldowns['SPEED_BOOST'] = now + duration + (25 * 1000);
        return { success: true, message: 'Hunter Sprint Surge active for 8s.' };
      }

      case 'DRONE_SCAN': {
        const cooldown = 60 * 1000;
        player.cooldowns['DRONE_SCAN'] = now + cooldown;

        // Drone scans 40m in front
        const headingRad = ((player.gps?.heading || 0) * Math.PI) / 180;
        const targetX = player.position.x + Math.sin(headingRad) * 40;
        const targetZ = player.position.z - Math.cos(headingRad) * 40;

        const scanRadius = 30;
        const detectedIds: string[] = [];
        for (const other of Object.values(allPlayers)) {
          if (other.team === 'HIDERS' && other.isAlive) {
            if (other.activeEffects.shadowCloakUntil && other.activeEffects.shadowCloakUntil > now) continue;
            const dist = Math.hypot(other.position.x - targetX, other.position.z - targetZ);
            if (dist <= scanRadius) {
              detectedIds.push(other.id);
            }
          }
        }
        return {
          success: true,
          message: detectedIds.length > 0
            ? `Drone Recon: ${detectedIds.length} target(s) pinpointed in scan sector!`
            : 'Drone Recon: Sector clear.',
          revealedHiderIds: detectedIds
        };
      }

      default:
        return { success: false, message: 'Unknown hunter ability' };
    }
  }
}
