import path from 'path';
import fs from 'fs';
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
app.use(express.static(path.join(process.cwd(), 'public')));

// 1. Direct APK Binary Download Endpoint
app.get(['/CampusHunt.apk', '/campus_hunt.apk', '/download/apk', '/api/download'], (req, res) => {
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'CampusHunt.apk'),
    path.join(process.cwd(), 'server', 'public', 'CampusHunt.apk'),
    path.join(__dirname, '..', 'public', 'CampusHunt.apk'),
    path.join(__dirname, '..', '..', 'public', 'CampusHunt.apk')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', 'attachment; filename="CampusHunt.apk"');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const stream = fs.createReadStream(p);
      return stream.pipe(res);
    }
  }

  res.status(404).send('Campus Hunt APK not found on server.');
});

// 2. Mobile Responsive APK Download Page (QR Code + 1-Click Install)
app.get(['/download', '/app'], (req, res) => {
  const host = req.get('host') || 'shadow-hunt-backend.vercel.app';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  const apkDownloadUrl = `${baseUrl}/CampusHunt.apk`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(apkDownloadUrl)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Campus Hunt - Tactical GPS Field Game</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #080d1a 55%, #020617 100%);
      color: #f1f5f9;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      text-align: center;
      overflow-x: hidden;
    }
    .card {
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 34px 22px 28px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 45px -10px rgba(6, 182, 212, 0.25);
      position: relative;
    }
    .logo-container {
      position: relative;
      display: inline-block;
      margin-bottom: 14px;
    }
    .app-logo {
      width: 92px;
      height: 92px;
      border-radius: 24px;
      box-shadow: 0 14px 35px rgba(6, 182, 212, 0.45), 0 0 25px rgba(249, 115, 22, 0.25);
      border: 2px solid rgba(255, 255, 255, 0.25);
      display: block;
      object-fit: cover;
      margin: 0 auto;
    }
    .game-badge {
      display: inline-block;
      padding: 5px 14px;
      background: rgba(6, 182, 212, 0.14);
      border: 1px solid rgba(6, 182, 212, 0.4);
      color: #38bdf8;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .game-title {
      font-size: 27px;
      font-weight: 900;
      letter-spacing: 1.2px;
      line-height: 1.15;
      margin-bottom: 4px;
      background: linear-gradient(135deg, #ffffff 0%, #38bdf8 55%, #fb923c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      margin-bottom: 12px;
    }
    .roles-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .role-hunter {
      padding: 4px 10px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 8px;
      color: #f87171;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .vs-tag {
      font-size: 10px;
      color: #64748b;
      font-weight: 900;
    }
    .role-hider {
      padding: 4px 10px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.35);
      border-radius: 8px;
      color: #38bdf8;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .qr-container {
      margin-bottom: 20px;
    }
    .qr-card {
      background: #ffffff;
      padding: 12px;
      border-radius: 20px;
      display: inline-block;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    }
    .qr-card img {
      width: 190px;
      height: 190px;
      display: block;
      border-radius: 8px;
    }
    .qr-hint {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      margin-top: 8px;
    }
    .download-action {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 16px 20px;
      background: linear-gradient(135deg, #0284c7 0%, #06b6d4 50%, #10b981 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 18px;
      box-shadow: 0 12px 30px rgba(6, 182, 212, 0.4), 0 4px 14px rgba(16, 185, 129, 0.3);
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .download-action::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -60%;
      width: 40%;
      height: 200%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
      transform: rotate(25deg);
      animation: shine 3s infinite ease-in-out;
    }
    @keyframes shine {
      0% { left: -60%; }
      40%, 100% { left: 140%; }
    }
    .download-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 40px rgba(6, 182, 212, 0.5), 0 6px 18px rgba(16, 185, 129, 0.35);
    }
    .download-action:active {
      transform: scale(0.97);
    }
    .btn-ico {
      font-size: 22px;
    }
    .btn-labels {
      text-align: left;
    }
    .btn-labels strong {
      display: block;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.6px;
      line-height: 1.2;
    }
    .btn-labels small {
      display: block;
      font-size: 11px;
      opacity: 0.9;
      font-weight: 600;
    }
    .features-grid {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .feature-chip {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .guide-box {
      margin-top: 16px;
      text-align: left;
      background: rgba(3, 7, 18, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 16px;
      padding: 14px 16px;
    }
    .guide-header {
      font-size: 10px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .guide-step {
      font-size: 11.5px;
      color: #cbd5e1;
      margin-bottom: 8px;
      line-height: 1.4;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .guide-step:last-child {
      margin-bottom: 0;
    }
    .step-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      background: rgba(6, 182, 212, 0.2);
      color: #38bdf8;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .guide-step strong {
      color: #ffffff;
    }
    .guide-step em {
      color: #94a3b8;
      font-size: 10.5px;
      font-style: normal;
    }
    .status-bar {
      margin-top: 18px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .status-bar strong {
      color: #10b981;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <img src="/app_logo.png" alt="Campus Hunt Logo" class="app-logo" />
    </div>

    <div class="game-badge">REAL-WORLD MULTIPLAYER GPS ACTION</div>
    <h1 class="game-title">CAMPUS HUNT</h1>
    <div class="tagline">HIDE &bull; TRACK &bull; SURVIVE</div>

    <div class="roles-bar">
      <span class="role-hunter">&#128308; HUNTERS</span>
      <span class="vs-tag">VS</span>
      <span class="role-hider">&#128309; HIDERS</span>
    </div>

    <div class="qr-container">
      <div class="qr-card">
        <img src="${qrCodeUrl}" alt="Scan QR to Download Campus Hunt" />
      </div>
      <div class="qr-hint">Point your phone camera to download directly</div>
    </div>

    <a href="/CampusHunt.apk" class="download-action" download="CampusHunt.apk">
      <span class="btn-ico">&#11015;</span>
      <span class="btn-labels">
        <strong>DOWNLOAD ANDROID APK</strong>
        <small>v1.0.0 &bull; 79.3 MB &bull; Free Direct Install</small>
      </span>
    </a>

    <div class="features-grid">
      <div class="feature-chip"><span>&#128205;</span> GPS Radar</div>
      <div class="feature-chip"><span>&#127922;</span> Secret Roles</div>
      <div class="feature-chip"><span>&#9889;</span> 120Hz Ultra-Smooth</div>
    </div>

    <div class="guide-box">
      <div class="guide-header">QUICK INSTALL GUIDE</div>
      <div class="guide-step">
        <span class="step-circle">1</span>
        <div>Tap <strong>Download Android APK</strong> above</div>
      </div>
      <div class="guide-step">
        <span class="step-circle">2</span>
        <div>Open downloaded file & tap <strong>Install</strong> <em>(allow unknown apps if prompted)</em></div>
      </div>
      <div class="guide-step">
        <span class="step-circle">3</span>
        <div>Launch Campus Hunt & grant <strong>Location / GPS</strong> permission</div>
      </div>
      <div class="guide-step">
        <span class="step-circle">4</span>
        <div>Join or Create an Operation Room and play!</div>
      </div>
    </div>

    <div class="status-bar">
      <span class="live-dot"></span> Satellite Operations: <strong>ONLINE</strong>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

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
app.get('/', (req, res) => {
  const host = req.get('host') || 'shadow-hunt-backend.vercel.app';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  res.json({
    service: 'Campus Hunt Authoritative Backend',
    status: 'ONLINE',
    version: '1.0.0',
    mode: 'Real-World GPS Tactical Operations',
    downloadPage: `${protocol}://${host}/download`,
    directApkUrl: `${protocol}://${host}/CampusHunt.apk`,
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
