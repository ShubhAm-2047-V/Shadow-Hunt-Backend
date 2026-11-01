# CAMPUS HUNT — Authoritative Real-World GPS Game Backend

**Tagline:** *Hide. Track. Survive.*

Authoritative backend engine for **CAMPUS HUNT**, the physical real-world GPS-based multiplayer Hide & Seek game.

Built with **Node.js, Express, Socket.IO, Turf.js, and OpenStreetMap**.

---

## Features
- **Real-World GPS Geofencing:** Turf.js point-in-polygon enforcement ensures players stay inside the host's selected campus perimeter.
- **Authoritative Proximity Capture:** Calculates true geodesic Haversine distance ($\le 8\text{m}$) with GPS freshness validation.
- **Asymmetric Tactical Intelligence:**
  - **Hiders:** Receive live real-time GPS coordinates of all Hunters.
  - **Hunters:** Never receive raw Hider coordinates over the network (zero-leak security).
- **180s Shadow Intelligence System:** Automatically captures an authoritative GPS snapshot of alive Hiders every 3 minutes, broadcasting a 6-second ghost radar pulse to Hunters.
- **Dual Serverless / Persistent Architecture:**
  - REST State & Location API for **Vercel Serverless Functions**.
  - Socket.IO WebSockets for low-latency state synchronization on dedicated servers (Node.js, Railway, Render).

---

## 🚀 One-Click Deploy to Vercel

1. Go to [Vercel](https://vercel.com/new).
2. Import this repository: `https://github.com/ShubhAm-2047-V/Shadow-Hunt-Backend.git`.
3. Keep default settings (`Framework Preset: Other`, Root Directory: `./`).
4. Click **Deploy**.
5. Copy your assigned Vercel production URL (e.g., `https://shadow-hunt-backend.vercel.app`).
6. Paste the URL into the **Campus Hunt Mobile App** settings or Web client!

---

## API Endpoints (Vercel Serverless Ready)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Backend service status and health check |
| `GET` | `/health` | Uptime and server timestamp |
| `GET` | `/api/presets` | Get default campus presets (Stanford, MIT, Oxford, Central Park) |
| `GET` | `/api/search?q=:place` | Search real colleges, universities, and parks via OSM Nominatim |
| `POST` | `/api/map/custom` | Generate custom playable area from drawn polygon coordinates |
| `POST` | `/api/room/create` | Host creates a new game room with custom boundary |
| `POST` | `/api/room/join` | Join room via 6-digit room code |
| `POST` | `/api/room/team` | Switch team (`HIDERS` vs `HUNTERS`) |
| `POST` | `/api/room/start` | Host starts the match |
| `POST` | `/api/player/location` | Stream real-world smartphone GPS fix (`lat, lng, accuracy, heading, speed`) |
| `GET` | `/api/room/state` | Poll asymmetric match state tailored for player's team |
| `POST` | `/api/ability/trigger` | Activate tactical abilities (`SHADOW_CLOAK`, `DECOY`, `AREA_SCANNER`, etc.) |
| `POST` | `/api/player/capture` | Hunter attempts physical proximity capture ($\le 8\text{m}$) |

---

## Local Development

```bash
# Install dependencies
npm install

# Run dev server with auto-reload
npm run dev

# Compile TypeScript
npm run build

# Start production server
npm start
```
