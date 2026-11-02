import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './game/RoomManager.js';
import { CAMPUS_PRESETS, createLiveSector, createCustomPolygonSector } from './osm/mapPresets.js';
import { searchPlaces, generateMapFromCustomPolygon } from './osm/osmFetcher.js';
import { latLngToLocalMeters } from './osm/geoConverter.js';
import { MapData } from './types/game.js';
import { AuthService } from './services/AuthService.js';

dotenv.config();

export const app = express();
export const server = http.createServer(app);
const authService = AuthService.getInstance();

// Allow any origin for easy local testing, LAN access, Vercel, and ngrok tunnels
export const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Initialize Room Manager
export const roomManager = new RoomManager(
  // Broadcast callback: sends asymmetric state tailored for each connected player
  (room) => {
    for (const [playerId, player] of Object.entries(room.players)) {
      if (player.isBot) continue;
      const state = room.getStateForPlayer(playerId);
      io.to(playerId).emit('state_update', state);
    }
  },
  // Audio alert callback
  (roomCode, sound) => {
    io.to(roomCode).emit('audio_alert', { sound });
  }
);

// REST API Endpoints (Fully compatible with Vercel Serverless & Mobile App)
app.get('/', (_req, res) => {
  res.json({
    service: 'Campus Hunt Authoritative Backend',
    status: 'ONLINE',
    version: '1.0.0',
    mode: 'Real-World GPS Tactical Operations',
    time: new Date().toISOString()
  });
});

app.get('/api', (_req, res) => {
  res.json({
    service: 'Campus Hunt Authoritative Backend',
    status: 'ONLINE',
    version: '1.0.0',
    endpoints: [
      'POST /api/room/create',
      'POST /api/room/join',
      'POST /api/room/team',
      'POST /api/room/start',
      'POST /api/player/location',
      'GET /api/room/state',
      'POST /api/ability/trigger',
      'POST /api/player/capture',
      'GET /api/presets',
      'GET /health'
    ]
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Campus Hunt Backend', time: new Date().toISOString() });
});

// Authentication Endpoints
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, callsign } = req.body;
  const result = await authService.register(username, email, password, callsign);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const result = await authService.login(usernameOrEmail, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token required' });
  }
  const token = authHeader.substring(7);
  const user = authService.verifyToken(token);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
  res.json({ success: true, user });
});

app.get('/api/auth/leaderboard', (_req, res) => {
  const leaderboard = authService.getLeaderboard(15);
  res.json({ success: true, leaderboard });
});

app.get('/api/presets', (_req, res) => {
  res.json(Object.values(CAMPUS_PRESETS));
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q as string;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query parameter q is required.' });
  }
  const results = await searchPlaces(query);
  res.json(results);
});

app.post('/api/map/custom', async (req, res) => {
  try {
    const { name, polygon } = req.body as { name: string; polygon: [number, number][] };
    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
      return res.status(400).json({ error: 'Valid polygon coordinates required.' });
    }
    const mapData = await generateMapFromCustomPolygon(name, polygon);
    res.json(mapData);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// MOBILE & VERCEL REST ENDPOINTS:
// 1. Create Room via REST
app.post('/api/room/create', (req, res) => {
  try {
    const { playerName, mapId, customMap, playerId, hostLat, hostLng, radiusMeters } = req.body;
    const finalPlayerId = playerId || `mobile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let chosenMap = customMap;
    if (!chosenMap && hostLat && hostLng && !isNaN(Number(hostLat)) && !isNaN(Number(hostLng))) {
      chosenMap = createLiveSector(Number(hostLat), Number(hostLng), Number(radiusMeters) || 300, `Live Sector: ${playerName || 'Operator'}'s Zone`);
    } else if (!chosenMap && mapId && CAMPUS_PRESETS[mapId]) {
      chosenMap = CAMPUS_PRESETS[mapId];
    }
    const room = roomManager.createRoom(finalPlayerId, playerName || 'Field Operator', chosenMap);
    const state = room.getStateForPlayer(finalPlayerId);
    res.json({ success: true, roomCode: room.code, playerId: finalPlayerId, state });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 2. Join Room via REST
app.post('/api/room/join', (req, res) => {
  try {
    const { roomCode, playerName, playerId } = req.body;
    const finalPlayerId = playerId || `mobile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const result = roomManager.joinRoom(roomCode, finalPlayerId, playerName || 'Tactical Operator');
    if (!result.success || !result.room) {
      return res.status(404).json({ success: false, message: result.message });
    }
    const state = result.room.getStateForPlayer(finalPlayerId);
    res.json({ success: true, roomCode: result.room.code, playerId: finalPlayerId, state });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 3. Switch Team via REST
app.post('/api/room/team', (req, res) => {
  const { playerId, roomCode, team } = req.body;
  let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
  if (!room && roomCode) {
    room = roomManager.getRoom(roomCode);
  }
  if (room) {
    room.switchPlayerTeam(playerId, team);
    const state = room.getStateForPlayer(playerId);
    return res.json({ success: true, state });
  }
  res.status(404).json({ success: false, message: 'Room or player not found' });
});

// 4. Start Match via REST
app.post('/api/room/start', (req, res) => {
  const { playerId, roomCode, randomRoles } = req.body;
  let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
  if (!room && roomCode) {
    room = roomManager.getRoom(roomCode);
  }
  // Serverless resilient fallback: if room was evicted from memory, recreate it
  if (!room) {
    const code = (roomCode || 'CAMPUS').toUpperCase().trim();
    room = roomManager.createRoom(playerId || 'host', 'Field Operator');
    room.code = code;
  }
  if (room) {
    if (randomRoles) {
      room.randomizeTeams();
    }
    room.startMatch();
    const state = room.getStateForPlayer(playerId || room.hostId);
    return res.json({ success: true, state });
  }
  res.status(400).json({ success: false, message: 'Could not start match' });
});

// 5. GPS Real-World Location Stream from Mobile App (Fine Location tracking)
app.post('/api/player/location', (req, res) => {
  const { playerId, latitude, longitude, accuracy, heading, speed, altitude, timestamp } = req.body;
  const room = roomManager.getRoomByPlayerId(playerId);
  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found for player' });
  }

  room.handleGpsUpdate(playerId, {
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy: Number(accuracy) || 5.0,
    heading: heading != null ? Number(heading) : null,
    speed: speed != null ? Number(speed) : null,
    altitude: altitude != null ? Number(altitude) : null,
    timestamp: timestamp || Date.now()
  });

  // Return updated asymmetric state
  const state = room.getStateForPlayer(playerId);
  res.json({ success: true, state });
});

// 6. Get Asymmetric Authoritative Room State (Polling / Sync)
app.get('/api/room/state', (req, res) => {
  const playerId = req.query.playerId as string;
  const roomCode = req.query.roomCode as string;

  let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
  if (!room && roomCode) {
    room = roomManager.getRoom(roomCode);
  }

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found' });
  }

  const state = room.getStateForPlayer(playerId || 'guest');
  res.json({ success: true, state });
});

// 7. Trigger Ability via REST
app.post('/api/ability/trigger', (req, res) => {
  const { playerId, abilityId } = req.body;
  const room = roomManager.getRoomByPlayerId(playerId);
  if (room) {
    const result = room.triggerAbility(playerId, abilityId);
    const state = room.getStateForPlayer(playerId);
    return res.json({ ...result, state });
  }
  res.status(404).json({ success: false, message: 'Room or player not found' });
});

// 8. Capture Attempt via REST
app.post('/api/player/capture', (req, res) => {
  const { playerId, targetHiderId, roomCode } = req.body;
  let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
  if (!room && roomCode) room = roomManager.getRoom(roomCode);
  if (!room && roomManager.getAllRooms().length === 1) {
    room = roomManager.getAllRooms()[0];
  }
  if (room) {
    const result = room.attemptCapture(playerId, targetHiderId);
    const state = room.getStateForPlayer(playerId);
    return res.json({ ...result, state });
  }
  res.status(404).json({ success: false, message: 'Room or player not found' });
});

// 9. Update Play Area / Boundary via REST
// 8B. Convert Eliminated Shadow to Hunter (Infection Mode)
app.post('/api/player/convert-hunter', (req, res) => {
  const { playerId, roomCode } = req.body;
  let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
  if (!room && roomCode) room = roomManager.getRoom(roomCode);
  if (!room && roomManager.getAllRooms().length === 1) {
    room = roomManager.getAllRooms()[0];
  }
  if (room) {
    const result = room.convertPlayerToHunter(playerId);
    const state = room.getStateForPlayer(playerId);
    return res.json({ ...result, state });
  }
  res.status(404).json({ success: false, message: 'Room or player not found' });
});

app.post('/api/room/update-boundary', (req, res) => {
  try {
    const { playerId, roomCode, polygon, name, radiusMeters, centerLat, centerLng } = req.body;
    let room = playerId ? roomManager.getRoomByPlayerId(playerId) : undefined;
    if (!room && roomCode) room = roomManager.getRoom(roomCode);

    // Fallback to active room if exists
    if (!room) {
      const allRooms = roomManager.getAllRooms();
      if (allRooms.length > 0) room = allRooms[0];
    }

    // Auto-create room if server restarted
    if (!room) {
      const targetRoomCode = roomCode || 'TACTICAL';
      const initialMap = centerLat && centerLng && radiusMeters
        ? createLiveSector(Number(centerLat), Number(centerLng), Number(radiusMeters), name || `Sector: ${radiusMeters}m Zone`)
        : undefined;
      room = roomManager.createRoom(playerId || 'operator', 'Field Operator', initialMap);
      room.code = targetRoomCode;
    }

    // 1. Custom Polygon Area
    if (Array.isArray(polygon) && polygon.length >= 3) {
      const newMap = createCustomPolygonSector(polygon, name || 'Custom Tactical Perimeter');
      room.setMap(newMap);
      room.killFeed.unshift({
        id: `boundary-${Date.now()}`,
        timestamp: Date.now(),
        hunterName: 'SECTOR RECONFIGURED',
        hiderName: `Play area updated: ${polygon.length} nodes (${newMap.areaM2} m²)`
      });
      room.broadcast();
      return res.json({ success: true, map: newMap, state: room.getStateForPlayer(playerId || 'operator') });
    }

    // 2. Center + Radius Sector
    if (centerLat && centerLng && radiusMeters) {
      const newMap = createLiveSector(Number(centerLat), Number(centerLng), Number(radiusMeters), name || `Sector: ${radiusMeters}m Zone`);
      room.setMap(newMap);
      room.killFeed.unshift({
        id: `boundary-${Date.now()}`,
        timestamp: Date.now(),
        hunterName: 'SECTOR RECONFIGURED',
        hiderName: `Operational radius set to ${radiusMeters}m`
      });
      room.broadcast();
      return res.json({ success: true, map: newMap, state: room.getStateForPlayer(playerId || 'operator') });
    }

    res.status(400).json({ success: false, message: 'Provide either polygon coordinates or centerLat + centerLng + radiusMeters' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Real-Time Socket.IO Handlers (for persistent Node/Railway environments)
io.on('connection', (socket) => {
  // Create Room
  socket.on('create_room', ({ playerName, mapId, customMap, hostLat, hostLng, radiusMeters }, cb) => {
    try {
      let chosenMap = customMap;
      if (!chosenMap && hostLat && hostLng && !isNaN(Number(hostLat)) && !isNaN(Number(hostLng))) {
        chosenMap = createLiveSector(Number(hostLat), Number(hostLng), Number(radiusMeters) || 300, `Live Sector: ${playerName || 'Agent'}'s Zone`);
      } else if (!chosenMap && mapId && CAMPUS_PRESETS[mapId]) {
        chosenMap = CAMPUS_PRESETS[mapId];
      }
      const room = roomManager.createRoom(socket.id, playerName || 'Agent Host', chosenMap);
      socket.join(room.code);
      const state = room.getStateForPlayer(socket.id);
      cb?.({ success: true, roomCode: room.code, state });
    } catch (err) {
      cb?.({ success: false, message: (err as Error).message });
    }
  });

  // Join Room
  socket.on('join_room', ({ roomCode, playerName }, cb) => {
    try {
      const result = roomManager.joinRoom(roomCode, socket.id, playerName || 'Tactical Operator');
      if (!result.success || !result.room) {
        return cb?.({ success: false, message: result.message });
      }
      socket.join(result.room.code);
      const state = result.room.getStateForPlayer(socket.id);
      cb?.({ success: true, roomCode: result.room.code, state });
    } catch (err) {
      cb?.({ success: false, message: (err as Error).message });
    }
  });

  socket.on('switch_team', ({ team }) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room) room.switchPlayerTeam(socket.id, team);
  });

  socket.on('toggle_ready', ({ isReady }) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room) room.setPlayerReady(socket.id, isReady);
  });

  socket.on('update_settings', (settings) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room && room.hostId === socket.id) room.updateSettings(settings);
  });

  socket.on('select_map', (mapData: MapData) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room && room.hostId === socket.id) room.setMap(mapData);
  });

  socket.on('update_boundary', ({ roomCode, polygon, radiusMeters, centerLat, centerLng, name }, cb) => {
    let room = roomManager.getRoomByPlayerId(socket.id);
    if (!room && roomCode) room = roomManager.getRoom(roomCode);
    if (!room) {
      const allRooms = roomManager.getAllRooms();
      if (allRooms.length > 0) room = allRooms[0];
    }
    if (!room) return cb?.({ success: false, message: 'Room not found' });

    if (Array.isArray(polygon) && polygon.length >= 3) {
      const newMap = createCustomPolygonSector(polygon, name || 'Custom Tactical Perimeter');
      room.setMap(newMap);
      room.killFeed.unshift({
        id: `boundary-${Date.now()}`,
        timestamp: Date.now(),
        hunterName: 'SECTOR RECONFIGURED',
        hiderName: `Play area updated: ${polygon.length} nodes`
      });
      room.broadcast();
      return cb?.({ success: true, map: newMap });
    }

    if (centerLat && centerLng && radiusMeters) {
      const newMap = createLiveSector(Number(centerLat), Number(centerLng), Number(radiusMeters), name || `Sector: ${radiusMeters}m Zone`);
      room.setMap(newMap);
      room.killFeed.unshift({
        id: `boundary-${Date.now()}`,
        timestamp: Date.now(),
        hunterName: 'SECTOR RECONFIGURED',
        hiderName: `Operational radius set to ${radiusMeters}m`
      });
      room.broadcast();
      return cb?.({ success: true, map: newMap });
    }

    cb?.({ success: false, message: 'Invalid boundary parameters' });
  });

  socket.on('start_match', (cb) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room && room.hostId === socket.id) {
      room.startMatch();
      cb?.({ success: true });
    } else {
      cb?.({ success: false, message: 'Only room host can start the match' });
    }
  });

  socket.on('gps_update', (gps) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room) room.handleGpsUpdate(socket.id, gps);
  });

  socket.on('trigger_ability', ({ abilityId }, cb) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room) cb?.(room.triggerAbility(socket.id, abilityId));
    else cb?.({ success: false, message: 'Room not found' });
  });

  socket.on('attempt_capture', ({ targetHiderId }, cb) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (room) cb?.(room.attemptCapture(socket.id, targetHiderId));
    else cb?.({ success: false, message: 'Room not found' });
  });

  socket.on('disconnect', () => {
    roomManager.leaveRoom(socket.id);
  });
});

// When running directly via node
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  CAMPUS HUNT - Server Running on port ${PORT}    `);
    console.log(`  Health: http://localhost:${PORT}/health       `);
    console.log(`=================================================`);
  });
}

export default app;
