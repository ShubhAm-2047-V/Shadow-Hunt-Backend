import {
  GameStatus,
  MapData,
  MatchSettings,
  Player,
  ServerAuthoritativeState,
  ShadowPulseEvent,
  ShadowPulsePing,
  KillFeedItem,
  DecoySignal,
  SmokeCloud,
  Footprint,
  DroneReconEvent,
  RadarScanEvent,
  Team,
  GpsCoordinate,
  NearbyCaptureTarget
} from '../types/game.js';
import { AbilitiesManager } from './AbilitiesManager.js';
import { CAMPUS_PRESETS, createLiveSector } from '../osm/mapPresets.js';
import { AuthService } from '../services/AuthService.js';
import {
  haversineDistanceMeters,
  isLatLngInsideBoundary,
  latLngToLocalMeters
} from '../osm/geoConverter.js';

export class GameRoom {
  public code: string;
  public hostId: string;
  public status: GameStatus = 'LOBBY';
  public map: MapData;
  public settings: MatchSettings;
  public players: Record<string, Player> = {};
  public timeRemaining = 900; // 15 mins default
  public activeShadowPulse: ShadowPulseEvent | null = null;
  public nextShadowPulseIn = 180; // 3-minute pulse
  public activeDecoys: DecoySignal[] = [];
  public activeSmokeClouds: SmokeCloud[] = [];
  public activeFootprints: Footprint[] = [];
  public activeDroneScans: DroneReconEvent[] = [];
  public activeRadarScans: RadarScanEvent[] = [];
  public killFeed: KillFeedItem[] = [];
  public winner: 'HIDERS' | 'HUNTERS' | 'DRAW' | null = null;

  private tickInterval: NodeJS.Timeout | null = null;
  private onStateBroadcast: (room: GameRoom) => void;
  private onAudioAlert: (roomCode: string, sound: string) => void;

  constructor(
    code: string,
    hostId: string,
    onStateBroadcast: (room: GameRoom) => void,
    onAudioAlert: (roomCode: string, sound: string) => void,
    initialMap?: MapData
  ) {
    this.code = code;
    this.hostId = hostId;
    this.onStateBroadcast = onStateBroadcast;
    this.onAudioAlert = onAudioAlert;

    // Default to Stanford Main Quad preset
    this.map = initialMap || CAMPUS_PRESETS['stanford-quad'];

    this.settings = {
      durationSeconds: 900,
      shadowIntervalSeconds: 180,
      shadowDurationSeconds: 6,
      captureRadius: 20.0, // 20.0 meters physical GPS capture proximity (aligns with client & absorbs outdoor GPS drift)
      maxTeamSize: 10,
      abilitiesEnabled: true,
      shadowMode: 'GHOST_SHADOW',
      friendlyTracking: false,
      botCountHiders: 0,
      botCountHunters: 0,
      maxGpsAccuracy: 25.0, // Reject GPS fixes worse than 25m accuracy
      outOfBoundsGraceSeconds: 30 // 30s grace period when physically out of bounds
    };
  }

  public setMap(newMap: MapData) {
    this.map = newMap;
    this.onStateBroadcast(this);
  }

  public broadcast() {
    this.onStateBroadcast(this);
  }

  public addPlayer(id: string, name: string): Player {
    const hiderCount = Object.values(this.players).filter(p => p.team === 'HIDERS').length;
    const hunterCount = Object.values(this.players).filter(p => p.team === 'HUNTERS').length;
    const assignedTeam: Team = hiderCount <= hunterCount ? 'HIDERS' : 'HUNTERS';

    const player: Player = {
      id,
      name,
      team: assignedTeam,
      isHost: id === this.hostId,
      isReady: id === this.hostId,
      isAlive: true,
      isBot: false,
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isInsideBoundary: true,
      stamina: 100,
      isSprinting: false,
      isCrouching: false,
      captures: 0,
      survivedSeconds: 0,
      activeEffects: {},
      cooldowns: {}
    };

    this.players[id] = player;
    return player;
  }

  public removePlayer(id: string) {
    delete this.players[id];
    if (id === this.hostId) {
      const remainingIds = Object.keys(this.players);
      if (remainingIds.length > 0) {
        this.hostId = remainingIds[0];
        this.players[this.hostId].isHost = true;
      }
    }
  }

  public setTeam(playerId: string, team: Team) {
    const p = this.players[playerId];
    if (p && this.status === 'LOBBY') {
      p.team = team;
    }
  }

  public switchPlayerTeam(playerId: string, team: Team) {
    this.setTeam(playerId, team);
  }

  public setPlayerReady(playerId: string, isReady: boolean) {
    const p = this.players[playerId];
    if (p) p.isReady = isReady;
  }

  public updateSettings(newSettings: Partial<MatchSettings>) {
    if (this.status !== 'LOBBY') return;
    this.settings = { ...this.settings, ...newSettings };
    this.timeRemaining = this.settings.durationSeconds;
    this.nextShadowPulseIn = this.settings.shadowIntervalSeconds;
  }

  public startMatch(): boolean {
    const activePlayers = Object.values(this.players).filter(p => p.team === 'HIDERS' || p.team === 'HUNTERS');
    if (activePlayers.length < 1) return false;

    this.status = 'IN_GAME';
    this.timeRemaining = this.settings.durationSeconds;
    this.nextShadowPulseIn = this.settings.shadowIntervalSeconds;
    this.activeShadowPulse = null;
    this.winner = null;
    this.killFeed = [];
    this.activeDecoys = [];
    this.activeSmokeClouds = [];
    this.activeFootprints = [];
    this.activeDroneScans = [];
    this.activeRadarScans = [];

    // Reset players
    for (const player of Object.values(this.players)) {
      player.isAlive = true;
      player.captures = 0;
      player.survivedSeconds = 0;
      player.activeEffects = {};
      player.cooldowns = {};
      player.isInsideBoundary = true;
      player.outOfBoundsSince = null;
    }

    // Start 1Hz Authoritative Match Loop (Optimized for real-world GPS)
    if (this.tickInterval) clearInterval(this.tickInterval);
    let lastTickTime = Date.now();

    this.onAudioAlert(this.code, 'MATCH_START');

    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastTickTime) / 1000;
      lastTickTime = now;
      this.update(deltaTime, now);
    }, 1000);

    return true;
  }

  /**
   * Authoritative Game Loop Tick (1Hz)
   */
  private update(deltaTime: number, now: number) {
    if (this.status !== 'IN_GAME') return;

    // 1. Update Match Timers
    this.timeRemaining -= deltaTime;
    this.nextShadowPulseIn -= deltaTime;

    // Track survived seconds for alive hiders
    for (const p of Object.values(this.players)) {
      if (p.team === 'HIDERS' && p.isAlive) {
        p.survivedSeconds += deltaTime;
      }

      // Check Out-of-Bounds Grace Period
      if (!p.isInsideBoundary && p.outOfBoundsSince && p.isAlive) {
        const secondsOut = (now - p.outOfBoundsSince) / 1000;
        if (secondsOut > this.settings.outOfBoundsGraceSeconds) {
          // Player remained out of bounds past grace period
          if (p.team === 'HIDERS') {
            p.isAlive = false;
            this.killFeed.unshift({
              id: `oob-${now}-${p.id}`,
              timestamp: now,
              hunterName: 'BOUNDARY GEOFENCE',
              hiderName: `${p.name} (Out of Bounds)`
            });
            console.log(`[GEOFENCE] Hider ${p.name} eliminated for remaining out of bounds > ${this.settings.outOfBoundsGraceSeconds}s`);
          }
        }
      }
    }

    // 2. Authoritative 180-second Shadow Intelligence Pulse
    if (this.nextShadowPulseIn <= 0) {
      this.triggerShadowPulse(now);
      this.nextShadowPulseIn = this.settings.shadowIntervalSeconds;
    }

    // Check if active shadow pulse expired
    if (this.activeShadowPulse) {
      if (now - this.activeShadowPulse.timestamp > this.activeShadowPulse.durationMs) {
        this.activeShadowPulse = null;
      }
    }

    // 3. Clean up expired transient abilities
    this.activeDecoys = this.activeDecoys.filter(d => d.expiresAt > now);
    this.activeSmokeClouds = this.activeSmokeClouds.filter(s => s.expiresAt > now);
    this.activeFootprints = this.activeFootprints.filter(f => f.expiresAt > now);
    this.activeDroneScans = this.activeDroneScans.filter(d => d.expiresAt > now);
    this.activeRadarScans = this.activeRadarScans.filter(r => r.expiresAt > now);

    // 4. Check Win / Loss Conditions
    const hiders = Object.values(this.players).filter(p => p.team === 'HIDERS');
    const aliveHiders = hiders.filter(p => p.isAlive);

    if (hiders.length > 0 && aliveHiders.length === 0) {
      // All hiders eliminated -> HUNTERS WIN
      this.endRound('HUNTERS');
      return;
    }

    if (this.timeRemaining <= 0) {
      // Time expired and >= 1 hider survived -> HIDERS WIN
      this.endRound(aliveHiders.length > 0 ? 'HIDERS' : 'HUNTERS');
      return;
    }

    // 5. Broadcast authoritative state to clients
    this.onStateBroadcast(this);
  }

  /**
   * Generates authoritative 180s Shadow Intelligence Snapshot
   */
  private triggerShadowPulse(now: number) {
    const pings: ShadowPulsePing[] = [];

    for (const player of Object.values(this.players)) {
      if (player.team === 'HIDERS' && player.isAlive) {
        // Check if player has Shadow Cloak active
        if (player.activeEffects.shadowCloakUntil && player.activeEffects.shadowCloakUntil > now) {
          continue; // Invisible to shadow pulse
        }

        const playerLat = player.gps?.latitude ?? this.map.center[0];
        const playerLng = player.gps?.longitude ?? this.map.center[1];

        pings.push({
          id: `ping-${player.id}-${now}`,
          hiderId: player.id,
          hiderName: player.name,
          latitude: playerLat,
          longitude: playerLng,
          position: { ...player.position },
          timestamp: now
        });
      }
    }

    this.activeShadowPulse = {
      timestamp: now,
      durationMs: this.settings.shadowDurationSeconds * 1000,
      pings,
      mode: this.settings.shadowMode
    };

    console.log(`[SHADOW PULSE] Fired in room ${this.code}: ${pings.length} hider(s) revealed for ${this.settings.shadowDurationSeconds}s.`);
    this.onAudioAlert(this.code, 'SHADOW_PULSE');
  }

  /**
   * Ingests real-world smartphone GPS fix
   */
  public handleGpsUpdate(playerId: string, gps: GpsCoordinate) {
    const player = this.players[playerId];
    if (!player) return;

    const now = Date.now();

    // AUTO-ANCHOR REAL GPS: If this room was on a demo map preset (Stanford) or far away,
    // immediately re-anchor the tactical operational zone right at the player's real-world GPS coordinates!
    if (gps.latitude !== 0 && gps.longitude !== 0) {
      const distFromCenter = haversineDistanceMeters(gps.latitude, gps.longitude, this.map.center[0], this.map.center[1]);
      if (this.map.id === 'stanford-quad' || distFromCenter > 50000) {
        console.log(`[LIVE GPS AUTO-ANCHOR] Room ${this.code} re-anchoring to player ${player.name}'s real GPS: (${gps.latitude}, ${gps.longitude})`);
        this.map = createLiveSector(gps.latitude, gps.longitude, 300, `Live Sector: ${player.name}'s Zone`);
      }
    }

    // Check GPS accuracy: if worse than threshold, reject or flag
    if (gps.accuracy > this.settings.maxGpsAccuracy) {
      console.warn(`[GPS JITTER] Degraded accuracy (${gps.accuracy}m > max ${this.settings.maxGpsAccuracy}m) from player ${player.name}`);
    }

    // Check geofence boundary using Turf.js
    const wasInside = player.isInsideBoundary;
    const isInside = isLatLngInsideBoundary(gps.latitude, gps.longitude, this.map.polygon);
    player.isInsideBoundary = isInside;

    if (!isInside) {
      if (!player.outOfBoundsSince) {
        player.outOfBoundsSince = now;
      }

      // If player JUST crossed outside the perimeter, alert all players!
      if (wasInside && this.status === 'IN_GAME') {
        console.warn(`[GEOFENCE BREACH] ${player.name} (${player.team}) stepped OUT OF BOUNDS!`);
        this.killFeed.unshift({
          id: `breach-${now}-${player.id}`,
          timestamp: now,
          hunterName: 'PERIMETER ALARM',
          hiderName: `⚠️ ${player.name} (${player.team}) IS OUT OF BOUNDS!`
        });
        this.onAudioAlert(this.code, 'GEOFENCE_BREACH');
      }
    } else {
      // If player just returned inside:
      if (!wasInside && player.outOfBoundsSince && this.status === 'IN_GAME') {
        console.log(`[PERIMETER SECURED] ${player.name} returned inside the play boundary.`);
        this.killFeed.unshift({
          id: `returned-${now}-${player.id}`,
          timestamp: now,
          hunterName: 'PERIMETER RE-ENTERED',
          hiderName: `✅ ${player.name} returned to safe play area`
        });
      }
      player.outOfBoundsSince = null;
    }

    // Convert GPS coordinates to metric coordinates [x, z] relative to map center
    const [x, z] = latLngToLocalMeters(gps.latitude, gps.longitude, this.map.center[0], this.map.center[1]);
    player.position = { x, y: 0.5, z };
    player.gps = gps;
    player.lastGpsUpdate = now;

    // Broadcast immediate update for responsive tracking
    this.onStateBroadcast(this);
  }

  /**
   * Authoritative Physical Proximity Capture
   */
  public attemptCapture(hunterId: string, targetHiderId?: string): { success: boolean; message: string } {
    if (this.status !== 'IN_GAME') return { success: false, message: 'Game not in progress' };

    const hunter = this.players[hunterId];
    if (!hunter || hunter.team !== 'HUNTERS' || !hunter.isAlive) {
      return { success: false, message: 'Only active hunters can capture' };
    }

    const now = Date.now();

    // Verify Hunter has a recent GPS update (< 10 seconds old)
    if (hunter.gps && hunter.lastGpsUpdate && (now - hunter.lastGpsUpdate > 10000)) {
      return { success: false, message: 'GPS signal lost or stale. Acquire clear sky fix.' };
    }

    let capturedHider: Player | null = null;
    let closestDist = Infinity;

    // Search for closest alive Hider within physical capture radius
    for (const hider of Object.values(this.players)) {
      if (hider.team === 'HIDERS' && hider.isAlive) {
        if (targetHiderId && hider.id !== targetHiderId) continue;

        let distMeters: number;

        if (hunter.gps && hider.gps) {
          // True geodesic Haversine distance
          distMeters = haversineDistanceMeters(
            hunter.gps.latitude,
            hunter.gps.longitude,
            hider.gps.latitude,
            hider.gps.longitude
          );
        } else {
          // Metric Cartesian fallback
          distMeters = Math.hypot(
            hider.position.x - hunter.position.x,
            hider.position.z - hunter.position.z
          );
        }

        if (distMeters <= this.settings.captureRadius && distMeters < closestDist) {
          closestDist = distMeters;
          capturedHider = hider;
        }
      }
    }

    if (!capturedHider) {
      return {
        success: false,
        message: `No hider within capture proximity (${this.settings.captureRadius}m). Closest: ${closestDist === Infinity ? 'None' : Math.round(closestDist) + 'm'}`
      };
    }

    // Capture Validated!
    capturedHider.isAlive = false;
    hunter.captures++;

    this.killFeed.unshift({
      id: `capture-${now}-${hunter.id}-${capturedHider.id}`,
      timestamp: now,
      hunterName: hunter.name,
      hiderName: capturedHider.name
    });

    if (this.killFeed.length > 20) {
      this.killFeed = this.killFeed.slice(0, 20);
    }

    console.log(`[CAPTURE CONFIRMED] Hunter ${hunter.name} physically captured Hider ${capturedHider.name} at distance ${closestDist.toFixed(1)}m`);
    this.onAudioAlert(this.code, 'CAPTURE');
    this.onStateBroadcast(this);

    return {
      success: true,
      message: `PHYSICAL CAPTURE! Tagged ${capturedHider.name} (${closestDist.toFixed(1)}m)`
    };
  }

  public triggerAbility(playerId: string, abilityId: string) {
    if (this.status !== 'IN_GAME') return { success: false, message: 'Match not in progress' };
    const player = this.players[playerId];
    if (!player || !player.isAlive) return { success: false, message: 'Dead players cannot use abilities' };
    if (!this.settings.abilitiesEnabled) return { success: false, message: 'Abilities disabled by host' };

    const res = AbilitiesManager.activateAbility(player, abilityId, this.players, this.map.center);
    if (res.decoy) {
      this.activeDecoys.push(res.decoy);
    }
    if (res.smoke) {
      this.activeSmokeClouds.push(res.smoke);
      this.onAudioAlert(this.code, 'SMOKE');
    }
    if (res.droneScan) {
      this.activeDroneScans.push(res.droneScan);
      this.onAudioAlert(this.code, 'DRONE_SCAN');
    }
    if (res.radarScan) {
      this.activeRadarScans.push(res.radarScan);
      this.onAudioAlert(this.code, 'SCANNER');
    }

    this.onStateBroadcast(this);
    return res;
  }

  private endRound(winner: 'HIDERS' | 'HUNTERS') {
    this.status = 'ROUND_OVER';
    this.winner = winner;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Record career stats for registered operators
    for (const p of Object.values(this.players)) {
      if (p.isBot) continue;
      AuthService.getInstance().recordMatchOutcome(
        p.name,
        p.team as 'HIDERS' | 'HUNTERS',
        p.team === winner,
        p.captures,
        p.survivedSeconds
      );
    }

    console.log(`[ROUND OVER] Match ended in room ${this.code}. Winner: ${winner}`);
    this.onAudioAlert(this.code, winner === 'HIDERS' ? 'HIDERS_WIN' : 'HUNTERS_WIN');
    this.onStateBroadcast(this);
  }

  /**
   * Asymmetric State Serialization:
   * HIDERS see Hunters in real time.
   * HUNTERS NEVER see live Hiders (only 180s shadow pings / decoys)!
   */
  public getStateForPlayer(playerId: string): ServerAuthoritativeState {
    const viewer = this.players[playerId];
    const isHiderViewer = viewer?.team === 'HIDERS';
    const isHunterViewer = viewer?.team === 'HUNTERS';

    const filteredPlayers: Record<string, Player> = {};

    for (const [id, p] of Object.entries(this.players)) {
      // 1. Viewer always sees self
      if (id === playerId) {
        filteredPlayers[id] = p;
        continue;
      }

      // 2. If viewer is HIDER:
      if (isHiderViewer) {
        if (p.team === 'HUNTERS') {
          // Hiders see ALL real-time hunter GPS positions & heading!
          filteredPlayers[id] = p;
        } else if (p.team === 'HIDERS' && this.settings.friendlyTracking) {
          filteredPlayers[id] = p;
        } else if (p.team === 'HIDERS') {
          // If friendly tracking disabled, hide teammates' exact coordinates
          filteredPlayers[id] = {
            ...p,
            gps: undefined,
            position: { x: 0, y: -999, z: 0 }
          };
        }
      }

      // 3. If viewer is HUNTER:
      else if (isHunterViewer) {
        if (p.team === 'HUNTERS') {
          // Hunters see their fellow hunters
          filteredPlayers[id] = p;
        } else {
          // HUNTERS NEVER RECEIVE LIVE HIDER GPS!
          // Zero data leakage over the network:
          filteredPlayers[id] = {
            ...p,
            gps: undefined,
            position: { x: 0, y: -999, z: 0 }
          };
        }
      }

      // 4. Spectator
      else {
        filteredPlayers[id] = p;
      }
    }

    const allHiders = Object.values(this.players).filter(p => p.team === 'HIDERS');
    const aliveHiders = allHiders.filter(p => p.isAlive).length;
    const huntersCount = Object.values(this.players).filter(p => p.team === 'HUNTERS').length;

    // Detect all active perimeter breaches for whole-room alerting
    const activeBreaches = [];
    const now = Date.now();
    for (const p of Object.values(this.players)) {
      if (!p.isInsideBoundary && p.isAlive && p.outOfBoundsSince) {
        activeBreaches.push({
          playerId: p.id,
          playerName: p.name,
          playerTeam: p.team,
          outOfBoundsSince: p.outOfBoundsSince,
          secondsOutside: Math.floor((now - p.outOfBoundsSince) / 1000)
        });
      }
    }

    // 5. Compute nearby capture target for Hunter (< 25m proximity)
    let nearbyCaptureTarget: NearbyCaptureTarget | null = null;
    if (isHunterViewer && viewer?.isAlive) {
      let minDistance = Infinity;
      for (const hider of Object.values(this.players)) {
        if (hider.team === 'HIDERS' && hider.isAlive) {
          let dist = Infinity;
          if (viewer.gps && hider.gps) {
            dist = haversineDistanceMeters(
              viewer.gps.latitude,
              viewer.gps.longitude,
              hider.gps.latitude,
              hider.gps.longitude
            );
          } else {
            dist = Math.hypot(
              hider.position.x - viewer.position.x,
              hider.position.z - viewer.position.z
            );
          }

          if (dist <= 25.0 && dist < minDistance) {
            minDistance = dist;
            nearbyCaptureTarget = {
              id: hider.id,
              name: hider.name,
              distance: Math.round(dist * 10) / 10
            };
          }
        }
      }
    }

    return {
      roomCode: this.code,
      status: this.status,
      timeRemaining: Math.max(0, Math.floor(this.timeRemaining)),
      settings: this.settings,
      map: this.map,
      players: filteredPlayers,
      localPlayerId: playerId,
      activeShadowPulse: this.activeShadowPulse,
      nextShadowPulseIn: Math.max(0, Math.floor(this.nextShadowPulseIn)),
      activeDecoys: this.activeDecoys,
      activeSmokeClouds: this.activeSmokeClouds,
      activeFootprints: this.activeFootprints,
      activeDroneScans: this.activeDroneScans,
      activeRadarScans: this.activeRadarScans,
      activeBreaches,
      killFeed: this.killFeed,
      winner: this.winner,
      hidersAlive: aliveHiders,
      hidersTotal: allHiders.length,
      huntersCount,
      nearbyCaptureTarget
    };
  }

  public destroy() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
