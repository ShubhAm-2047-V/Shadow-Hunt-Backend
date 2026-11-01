import { Player, Vector3D, MapData, DecoySignal, ShadowPulsePing } from '../types/game.js';
import { CollisionSystem } from './CollisionSystem.js';

export class BotController {
  private bot: Player;
  private map: MapData;
  private collisionSystem: CollisionSystem;
  private targetWaypoints: Vector3D[] = [];
  private currentWaypointIndex = 0;
  private state: 'PATROL' | 'INVESTIGATE' | 'CHASE' | 'HIDE' | 'FLEE' = 'PATROL';
  private investigateTarget: Vector3D | null = null;
  private lastAbilityUse = 0;

  constructor(bot: Player, map: MapData, collisionSystem: CollisionSystem) {
    this.bot = bot;
    this.map = map;
    this.collisionSystem = collisionSystem;
    this.initWaypoints();
    this.state = bot.team === 'HUNTERS' ? 'PATROL' : 'HIDE';
  }

  private initWaypoints() {
    // Generate patrol waypoints from building centers / corners and map points
    this.targetWaypoints = [];
    for (const bldg of this.map.buildings) {
      if (bldg.points.length > 0) {
        // Use first corner
        this.targetWaypoints.push({
          x: bldg.points[0][0],
          y: 0.5,
          z: bldg.points[0][1]
        });
      }
    }

    if (this.targetWaypoints.length === 0) {
      // Fallback waypoints
      this.targetWaypoints = [
        { x: -30, y: 0.5, z: -30 },
        { x: 30, y: 0.5, z: -30 },
        { x: 30, y: 0.5, z: 30 },
        { x: -30, y: 0.5, z: 30 },
      ];
    }
  }

  /**
   * Update bot logic each tick (called by GameRoom at ~30Hz or 10Hz)
   */
  public update(
    deltaTime: number,
    allPlayers: Record<string, Player>,
    activeDecoys: DecoySignal[],
    lastShadowPings: ShadowPulsePing[],
    onCaptureAttempt: (hunter: Player, targetHider: Player) => void
  ) {
    if (!this.bot.isAlive) return;

    if (this.bot.team === 'HUNTERS') {
      this.updateHunterBot(deltaTime, allPlayers, activeDecoys, lastShadowPings, onCaptureAttempt);
    } else if (this.bot.team === 'HIDERS') {
      this.updateHiderBot(deltaTime, allPlayers);
    }
  }

  private updateHunterBot(
    deltaTime: number,
    allPlayers: Record<string, Player>,
    activeDecoys: DecoySignal[],
    lastShadowPings: ShadowPulsePing[],
    onCaptureAttempt: (hunter: Player, targetHider: Player) => void
  ) {
    const now = Date.now();
    let closestHider: Player | null = null;
    let closestHiderDist = Infinity;

    // Check for nearby visible/chaseable hiders
    for (const p of Object.values(allPlayers)) {
      if (p.team === 'HIDERS' && p.isAlive) {
        const dist = Math.hypot(p.position.x - this.bot.position.x, p.position.z - this.bot.position.z);
        // Hunter bot only "spots" hider if close (< 18m) and hider is not cloaked
        const isCloaked = p.activeEffects.shadowCloakUntil && p.activeEffects.shadowCloakUntil > now;
        if (!isCloaked && dist < 18 && dist < closestHiderDist) {
          closestHiderDist = dist;
          closestHider = p;
        }
      }
    }

    // 1. If very close to a hider, attempt capture!
    if (closestHider && closestHiderDist <= 2.8) {
      onCaptureAttempt(this.bot, closestHider);
    }

    // 2. State decision
    if (closestHider) {
      this.state = 'CHASE';
      this.moveTowards(closestHider.position, deltaTime, 6.2); // Hunter chase speed

      // Trigger speed boost if off cooldown
      if (now - this.lastAbilityUse > 30000 && !this.bot.cooldowns['SPEED_BOOST']) {
        this.bot.activeEffects.sprintUntil = now + 6000;
        this.bot.cooldowns['SPEED_BOOST'] = now + 25000;
        this.lastAbilityUse = now;
      }
      return;
    }

    // Check for recent shadow pulse pings or active decoys to investigate
    if (activeDecoys.length > 0) {
      const decoy = activeDecoys[0];
      this.state = 'INVESTIGATE';
      this.moveTowards(decoy.position, deltaTime, 4.8);
      return;
    }

    if (lastShadowPings.length > 0 && Math.random() < 0.6) {
      const targetPing = lastShadowPings[0];
      this.state = 'INVESTIGATE';
      this.moveTowards(targetPing.position, deltaTime, 4.8);
      return;
    }

    // Default: Patrol between waypoints
    this.state = 'PATROL';
    if (this.targetWaypoints.length > 0) {
      const targetWp = this.targetWaypoints[this.currentWaypointIndex];
      const dist = Math.hypot(targetWp.x - this.bot.position.x, targetWp.z - this.bot.position.z);
      if (dist < 4) {
        this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.targetWaypoints.length;
      } else {
        this.moveTowards(targetWp, deltaTime, 4.0);
      }
    }
  }

  private updateHiderBot(deltaTime: number, allPlayers: Record<string, Player>) {
    const now = Date.now();
    // Find nearest hunter
    let nearestHunter: Player | null = null;
    let nearestHunterDist = Infinity;

    for (const p of Object.values(allPlayers)) {
      if (p.team === 'HUNTERS' && p.isAlive) {
        const dist = Math.hypot(p.position.x - this.bot.position.x, p.position.z - this.bot.position.z);
        if (dist < nearestHunterDist) {
          nearestHunterDist = dist;
          nearestHunter = p;
        }
      }
    }

    // If hunter is within 22m, FLEE!
    if (nearestHunter && nearestHunterDist < 22) {
      this.state = 'FLEE';

      // Use hider ability if available
      if (now - this.lastAbilityUse > 35000) {
        if (!this.bot.cooldowns['SHADOW_CLOAK']) {
          this.bot.activeEffects.shadowCloakUntil = now + 12000;
          this.bot.cooldowns['SHADOW_CLOAK'] = now + 50000;
          this.lastAbilityUse = now;
        } else if (!this.bot.cooldowns['SPRINT']) {
          this.bot.activeEffects.sprintUntil = now + 6000;
          this.bot.cooldowns['SPRINT'] = now + 25000;
          this.lastAbilityUse = now;
        }
      }

      // Run in opposite direction of hunter
      const dirX = this.bot.position.x - nearestHunter.position.x;
      const dirZ = this.bot.position.z - nearestHunter.position.z;
      const length = Math.hypot(dirX, dirZ) || 1;

      const fleeTarget: Vector3D = {
        x: this.bot.position.x + (dirX / length) * 20,
        y: 0.5,
        z: this.bot.position.z + (dirZ / length) * 20
      };

      this.moveTowards(fleeTarget, deltaTime, 6.0);
    } else {
      // HIDE mode: stay still or crouch
      this.state = 'HIDE';
      this.bot.isCrouching = true;
      this.bot.velocity = { x: 0, y: 0, z: 0 };
    }
  }

  private moveTowards(target: Vector3D, deltaTime: number, baseSpeed: number) {
    const dx = target.x - this.bot.position.x;
    const dz = target.z - this.bot.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.2) {
      this.bot.velocity = { x: 0, y: 0, z: 0 };
      return;
    }

    let speed = baseSpeed;
    if (this.bot.activeEffects.sprintUntil && this.bot.activeEffects.sprintUntil > Date.now()) {
      speed *= 1.5;
      this.bot.isSprinting = true;
    } else {
      this.bot.isSprinting = false;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;

    // Rotate bot to face direction of travel
    this.bot.rotation.y = Math.atan2(-dirX, -dirZ);

    const desiredPos: Vector3D = {
      x: this.bot.position.x + dirX * speed * deltaTime,
      y: 0.5,
      z: this.bot.position.z + dirZ * speed * deltaTime
    };

    // Apply collision resolution
    const resolved = this.collisionSystem.resolveMovement(this.bot.position, desiredPos);
    this.bot.position = resolved;
    this.bot.velocity = {
      x: (resolved.x - this.bot.position.x) / (deltaTime || 0.016),
      y: 0,
      z: (resolved.z - this.bot.position.z) / (deltaTime || 0.016)
    };
  }
}

