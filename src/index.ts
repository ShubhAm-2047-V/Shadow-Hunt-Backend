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
  <title>Campus Hunt - Tactical GPS Field Game (Official Android Download)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-orange: #ea580c;
      --primary-blue: #0284c7;
      --primary-green: #16a34a;
      --hunter-red: #e11d48;
      --hider-blue: #0284c7;
      --bg-light: #fff9f5;
      --card-bg: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-light: #e2e8f0;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: linear-gradient(180deg, #fff5ed 0%, #ffffff 40%, #f0f7f4 100%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 24px 16px 40px;
      position: relative;
      overflow-x: hidden;
    }

    /* Subtle tactical background pattern */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: 
        radial-gradient(rgba(2, 132, 199, 0.04) 1.5px, transparent 1.5px),
        radial-gradient(rgba(234, 88, 12, 0.04) 1.5px, transparent 1.5px);
      background-size: 32px 32px;
      background-position: 0 0, 16px 16px;
      pointer-events: none;
      z-index: 0;
    }

    .main-container {
      position: relative;
      z-index: 1;
      max-width: 960px;
      width: 100%;
      margin: 0 auto;
    }

    /* Top Navigation / Brand Bar */
    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(226, 232, 240, 0.8);
      border-radius: 20px;
      padding: 10px 18px;
      margin-bottom: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }

    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
      border: 1.5px solid #ffffff;
      display: block;
    }

    .brand-text h1 {
      font-size: 19px;
      font-weight: 900;
      letter-spacing: 0.5px;
      line-height: 1.1;
    }
    .brand-text h1 .orange { color: var(--primary-orange); }
    .brand-text h1 .dark { color: #0f172a; }
    .brand-text .sub {
      font-size: 10px;
      font-weight: 800;
      color: var(--text-muted);
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .status-pills {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .pill-gps {
      background: #ecfdf5;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .pill-server {
      background: #f0f9ff;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }

    .pill-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .pill-gps .pill-dot { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    .pill-server .pill-dot { background: #0284c7; box-shadow: 0 0 8px #0284c7; }

    /* Layout Grid: 2 columns on desktop, 1 on mobile */
    .content-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 24px;
      align-items: start;
    }

    @media (max-width: 820px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
      .status-pills .pill-text {
        display: none;
      }
    }

    /* Left Card: Game Info & Main Download */
    .hero-card {
      background: var(--card-bg);
      border: 1px solid var(--border-light);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.06);
    }

    .hero-banner-container {
      position: relative;
      width: 100%;
      height: 200px;
      overflow: hidden;
      background: linear-gradient(135deg, #fed7aa 0%, #bae6fd 100%);
    }

    .hero-banner {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .banner-overlay {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(to top, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%);
      height: 40px;
    }

    .hero-body {
      padding: 24px 28px 28px;
    }

    .tagline-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #fff7ed;
      color: #c2410c;
      border: 1px solid #ffedd5;
      border-radius: 9999px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 1.2px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .hero-title {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.5px;
      line-height: 1.2;
      margin-bottom: 6px;
    }

    .hero-slogan {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 2px;
      margin-bottom: 18px;
    }
    .slogan-blue { color: #0284c7; }
    .slogan-orange { color: #ea580c; }
    .slogan-red { color: #e11d48; }

    /* The Two Teams Showdown Cards */
    .teams-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 22px;
    }

    .team-card {
      padding: 12px 14px;
      border-radius: 16px;
      text-align: left;
    }

    .team-hiders {
      background: #f0f9ff;
      border: 1.5px solid #bae6fd;
    }

    .team-hunters {
      background: #fff1f2;
      border: 1.5px solid #fecdd3;
    }

    .team-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.8px;
      margin-bottom: 3px;
    }
    .team-hiders .team-header { color: #0369a1; }
    .team-hunters .team-header { color: #be123c; }

    .team-desc {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 600;
      line-height: 1.3;
    }

    /* Big Download Action Button */
    .download-button {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      width: 100%;
      padding: 18px 24px;
      background: linear-gradient(135deg, #0284c7 0%, #00b4d8 50%, #16a34a 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(2, 132, 199, 0.35), 0 4px 12px rgba(22, 163, 74, 0.25);
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .download-button::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -60%;
      width: 40%;
      height: 200%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      transform: rotate(25deg);
      animation: shine 3s infinite ease-in-out;
    }
    @keyframes shine {
      0% { left: -60%; }
      40%, 100% { left: 140%; }
    }

    .download-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 36px rgba(2, 132, 199, 0.45), 0 6px 16px rgba(22, 163, 74, 0.3);
    }

    .download-button:active {
      transform: scale(0.98);
    }

    .dl-icon {
      font-size: 26px;
    }

    .dl-text {
      text-align: left;
    }

    .dl-text strong {
      display: block;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 0.8px;
      line-height: 1.2;
    }

    .dl-text small {
      display: block;
      font-size: 11.5px;
      opacity: 0.95;
      font-weight: 600;
    }

    /* Tactical Feature Highlights */
    .features-list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 20px;
      padding-top: 18px;
      border-top: 1px solid var(--border-light);
    }

    .feature-box {
      background: #f8fafc;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      padding: 10px 8px;
      text-align: center;
    }

    .feat-icon {
      font-size: 18px;
      margin-bottom: 4px;
      display: block;
    }

    .feat-title {
      font-size: 11px;
      font-weight: 800;
      color: #1e293b;
    }

    .feat-sub {
      font-size: 9.5px;
      color: var(--text-muted);
      font-weight: 600;
    }

    /* Right Card: QR Code & Mobile Fast Pairing */
    .qr-card {
      background: var(--card-bg);
      border: 1px solid var(--border-light);
      border-radius: 28px;
      padding: 28px 24px;
      text-align: center;
      box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.06);
    }

    .qr-header-tag {
      display: inline-block;
      padding: 4px 12px;
      background: #f1f5f9;
      color: #475569;
      border-radius: 9999px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }

    .qr-card-title {
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .qr-card-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 20px;
      font-weight: 600;
    }

    .qr-image-wrapper {
      background: #ffffff;
      padding: 16px;
      border-radius: 22px;
      border: 2px dashed #cbd5e1;
      display: inline-block;
      margin-bottom: 16px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.05);
    }

    .qr-image-wrapper img {
      width: 200px;
      height: 200px;
      display: block;
      border-radius: 10px;
    }

    .direct-link-box {
      background: #f8fafc;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      padding: 10px 12px;
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .link-text {
      font-family: monospace;
      font-size: 11px;
      color: #0284c7;
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-btn {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .copy-btn:hover { background: #0369a1; }

    /* Steps Section */
    .install-steps-card {
      margin-top: 20px;
      background: #f8fafc;
      border: 1px solid var(--border-light);
      border-radius: 18px;
      padding: 18px;
      text-align: left;
    }

    .steps-heading {
      font-size: 11px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.8px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .step-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #334155;
      line-height: 1.4;
    }
    .step-row:last-child { margin-bottom: 0; }

    .step-badge {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0284c7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10.5px;
      font-weight: 900;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .step-row strong { color: #0f172a; }
    .step-row em { color: #64748b; font-style: normal; font-size: 11px; }

    /* Bottom Footer */
    .page-footer {
      margin-top: 24px;
      text-align: center;
      font-size: 11.5px;
      color: #94a3b8;
      font-weight: 600;
    }
    .page-footer a {
      color: #0284c7;
      text-decoration: none;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="main-container">
    <!-- Top App Navigation Bar -->
    <header class="top-nav">
      <div class="brand-left">
        <img src="/app_logo.png" alt="Campus Hunt Logo" class="brand-logo" />
        <div class="brand-text">
          <h1><span class="orange">CAMPUS</span> <span class="dark">HUNT</span></h1>
          <div class="sub">Tactical Field Operations</div>
        </div>
      </div>

      <div class="status-pills">
        <div class="pill pill-gps">
          <span class="pill-dot"></span>
          <span class="pill-text">GPS LOCKED</span>
        </div>
        <div class="pill pill-server">
          <span class="pill-dot"></span>
          <span class="pill-text">SERVER ONLINE</span>
        </div>
      </div>
    </header>

    <!-- 2-Column Responsive Layout -->
    <div class="content-grid">
      <!-- Left Column: Hero Showcase & Download -->
      <section class="hero-card">
        <div class="hero-banner-container">
          <img src="/campus_hero.png" alt="Campus Sector Map" class="hero-banner" />
          <div class="banner-overlay"></div>
        </div>

        <div class="hero-body">
          <div class="tagline-badge">REAL-WORLD GPS MULTIPLAYER</div>
          <h2 class="hero-title">Experience Campus Like Never Before</h2>
          <div class="hero-slogan">
            <span class="slogan-blue">HIDE.</span> 
            <span class="slogan-orange">TRACK.</span> 
            <span class="slogan-red">SURVIVE.</span>
          </div>

          <!-- Team Roles Showcase -->
          <div class="teams-row">
            <div class="team-card team-hiders">
              <div class="team-header">&#128737;&#65039; TEAM BLUE: HIDERS</div>
              <div class="team-desc">Evade capture, deploy smoke screens & survive until the timer expires.</div>
            </div>
            <div class="team-card team-hunters">
              <div class="team-header">&#128269; TEAM RED: HUNTERS</div>
              <div class="team-desc">Launch radar pings, drone sweeps & track down every operative.</div>
            </div>
          </div>

          <!-- Big Vibrant Action Button -->
          <a href="/CampusHunt.apk" class="download-button" download="CampusHunt.apk">
            <span class="dl-icon">&#11015;&#65039;</span>
            <span class="dl-text">
              <strong>DOWNLOAD ANDROID APK</strong>
              <small>Version 1.0.0 &bull; 79.3 MB &bull; Free Direct Install</small>
            </span>
          </a>

          <!-- Features Grid -->
          <div class="features-list">
            <div class="feature-box">
              <span class="feat-icon">&#128205;</span>
              <div class="feat-title">GPS Radar</div>
              <div class="feat-sub">Real-Time Map</div>
            </div>
            <div class="feature-box">
              <span class="feat-icon">&#127922;</span>
              <div class="feat-title">Secret Roles</div>
              <div class="feat-sub">Auto Reveal</div>
            </div>
            <div class="feature-box">
              <span class="feat-icon">&#9889;</span>
              <div class="feat-title">120Hz Ultra</div>
              <div class="feat-sub">Smooth HUD</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Column: Scan with Phone & Install Guide -->
      <aside class="qr-card">
        <div class="qr-header-tag">SCAN TO INSTALL ON MOBILE</div>
        <h3 class="qr-card-title">Instant Phone Download</h3>
        <p class="qr-card-subtitle">Open your phone camera & point at the screen</p>

        <div class="qr-image-wrapper">
          <img src="${qrCodeUrl}" alt="Scan QR Code to Download Campus Hunt" />
        </div>

        <div class="direct-link-box">
          <span class="link-text" id="shareUrl">${apkDownloadUrl}</span>
          <button class="copy-btn" onclick="copyLink()">Copy</button>
        </div>

        <!-- 4-Step Quick Install Guide -->
        <div class="install-steps-card">
          <div class="steps-heading">&#9881;&#65039; 4-STEP INSTALL GUIDE</div>
          <div class="step-row">
            <span class="step-badge">1</span>
            <div>Tap <strong>Download Android APK</strong> (or scan QR code).</div>
          </div>
          <div class="step-row">
            <span class="step-badge">2</span>
            <div>Open the APK & tap <strong>Install</strong> <em>(allow unknown apps if prompted)</em>.</div>
          </div>
          <div class="step-row">
            <span class="step-badge">3</span>
            <div>Open Campus Hunt & grant <strong>Location / GPS</strong>.</div>
          </div>
          <div class="step-row">
            <span class="step-badge">4</span>
            <div>Enter Operation Sector & deploy into the match!</div>
          </div>
        </div>
      </aside>
    </div>

    <footer class="page-footer">
      Campus Hunt Tactical Operations &bull; Live Satellite Servers &bull; <a href="/CampusHunt.apk">Direct APK Link</a>
    </footer>
  </div>

  <script>
    function copyLink() {
      const url = document.getElementById('shareUrl').innerText;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.innerText = 'Copied!';
        setTimeout(() => { btn.innerText = 'Copy'; }, 2000);
      });
    }
  </script>
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
