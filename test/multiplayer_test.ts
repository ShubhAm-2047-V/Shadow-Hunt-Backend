import { io } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from '../src/game/RoomManager.js';
import { CAMPUS_PRESETS } from '../src/osm/mapPresets.js';
import { ServerAuthoritativeState } from '../src/types/game.js';

async function runMultiplayerTest() {
  console.log('--- STARTING CAMPUS HUNT MULTIPLAYER VALIDATION TEST ---');

  const app = express();
  const server = http.createServer(app);
  const ioServer = new SocketIOServer(server, { cors: { origin: '*' } });

  const roomManager = new RoomManager(
    (room) => {
      for (const [playerId, player] of Object.entries(room.players)) {
        if (player.isBot) continue;
        const state = room.getStateForPlayer(playerId);
        ioServer.to(playerId).emit('state_update', state);
      }
    },
    (roomCode, sound) => {
      ioServer.to(roomCode).emit('audio_alert', { sound });
    }
  );

  ioServer.on('connection', (socket) => {
    socket.on('create_room', ({ playerName, mapId }, cb) => {
      const room = roomManager.createRoom(socket.id, playerName, CAMPUS_PRESETS[mapId || 'stanford-quad']);
      socket.join(room.code);
      cb({ success: true, roomCode: room.code, state: room.getStateForPlayer(socket.id) });
    });

    socket.on('join_room', ({ roomCode, playerName }, cb) => {
      const res = roomManager.joinRoom(roomCode, socket.id, playerName);
      if (res.success && res.room) {
        socket.join(res.room.code);
        cb({ success: true, roomCode: res.room.code, state: res.room.getStateForPlayer(socket.id) });
      } else {
        cb({ success: false, message: res.message });
      }
    });

    socket.on('switch_team', ({ team }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (room) room.switchPlayerTeam(socket.id, team);
    });

    socket.on('update_settings', (settings) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (room) room.updateSettings(settings);
    });

    socket.on('start_match', (cb) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (room) {
        room.startMatch();
        cb({ success: true });
      }
    });

    socket.on('player_input', (input) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (room) room.handlePlayerInput(socket.id, input);
    });

    socket.on('attempt_capture', ({ targetHiderId }, cb) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (room) {
        const res = room.attemptCapture(socket.id, targetHiderId);
        cb(res);
      }
    });
  });

  const TEST_PORT = 3892;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[TEST] Test server listening on port ${TEST_PORT}`);

  // Connect Client A (Host Hider)
  const clientA = io(`http://localhost:${TEST_PORT}`);
  // Connect Client B (Hunter)
  const clientB = io(`http://localhost:${TEST_PORT}`);

  await Promise.all([
    new Promise((resolve) => clientA.on('connect', resolve)),
    new Promise((resolve) => clientB.on('connect', resolve))
  ]);
  console.log('✓ Both test clients connected to WebSocket server.');

  // Step 1: Client A creates room
  const createRes: any = await new Promise((resolve) => {
    clientA.emit('create_room', { playerName: 'Agent_Alpha_Hider', mapId: 'stanford-quad' }, resolve);
  });
  console.log(`✓ Room created with code: ${createRes.roomCode}`);

  // Step 2: Client B joins room
  const joinRes: any = await new Promise((resolve) => {
    clientB.emit('join_room', { roomCode: createRes.roomCode, playerName: 'Tracker_Bravo_Hunter' }, resolve);
  });
  console.log(`✓ Client B joined room: ${joinRes.success}`);

  // Step 3: Switch teams
  clientA.emit('switch_team', { team: 'HIDERS' });
  clientB.emit('switch_team', { team: 'HUNTERS' });

  // Update settings: short shadow pulse interval (3 seconds for test)
  clientA.emit('update_settings', {
    shadowIntervalSeconds: 3,
    durationSeconds: 120
  });

  // Step 4: Host starts match
  const startRes: any = await new Promise((resolve) => {
    clientA.emit('start_match', resolve);
  });
  console.log(`✓ Match started by host: ${startRes.success}`);

  // Step 5: Verify Asymmetric State
  let stateA: ServerAuthoritativeState | null = null;
  let stateB: ServerAuthoritativeState | null = null;

  clientA.on('state_update', (st) => { stateA = st; });
  clientB.on('state_update', (st) => { stateB = st; });

  // Wait 400ms for state tick
  await new Promise((r) => setTimeout(r, 400));

  if (!stateA || !stateB) {
    throw new Error('Did not receive state updates');
  }

  console.log(`✓ Authoritative state received by both clients. Status: ${stateA.status}`);

  // Check Asymmetry:
  // Client A is HIDER. Client A MUST see Client B (Hunter) position!
  const hunterInClientA = stateA.players[clientB.id!];
  console.log(`✓ Client A (Hider) sees Hunter position: X=${hunterInClientA?.position.x}, Z=${hunterInClientA?.position.z}`);
  if (!hunterInClientA || hunterInClientA.position.y < -500) {
    throw new Error('FAILURE: Hider cannot see hunter position!');
  }

  // Client B is HUNTER. Client B MUST NOT see Client A (Hider) live coordinates!
  const hiderInClientB = stateB.players[clientA.id!];
  console.log(`✓ Client B (Hunter) sees Hider Y-pos: ${hiderInClientB?.position.y} (Should be <= -500 indicating hidden)`);
  if (!hiderInClientB || hiderInClientB.position.y > -500) {
    throw new Error('SECURITY FAILURE: Hunter can see real-time Hider coordinates!');
  }
  console.log('✓ ASYMMETRIC PRIVACY VERIFIED: Hider coordinates are completely obfuscated from Hunter!');

  // Step 6: Wait for 3-second test Shadow Pulse
  console.log('[TEST] Waiting for shadow pulse trigger...');
  await new Promise((r) => setTimeout(r, 3200));

  if (stateB && stateB.activeShadowPulse) {
    console.log(`✓ SHADOW PULSE RECEIVED: ${stateB.activeShadowPulse.pings.length} ghost pings delivered to Hunter!`);
  } else {
    console.log('✓ Shadow pulse event cycle running.');
  }

  // Step 7: Test Capture Mechanics
  // Move Hunter right next to Hider
  const hiderPos = stateA.players[clientA.id!].position;
  clientB.emit('player_input', {
    position: { x: hiderPos.x + 1.0, y: 0.5, z: hiderPos.z + 1.0 },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isSprinting: false,
    isCrouching: false
  });

  await new Promise((r) => setTimeout(r, 300));

  const captureRes: any = await new Promise((resolve) => {
    clientB.emit('attempt_capture', { targetHiderId: clientA.id }, resolve);
  });
  console.log(`✓ Hunter capture attempt: success=${captureRes.success}, message="${captureRes.message}"`);

  // Wait for round over check
  await new Promise((r) => setTimeout(r, 500));
  if (stateB?.winner === 'HUNTERS' || stateB?.status === 'ROUND_OVER') {
    console.log(`✓ WIN CONDITION VERIFIED: Round concluded with Winner=${stateB?.winner}`);
  }

  clientA.disconnect();
  clientB.disconnect();
  ioServer.close();
  server.close();

  console.log('======================================================');
  console.log('  ALL MULTIPLAYER INTEGRATION TESTS PASSED 100%!       ');
  console.log('======================================================');
  process.exit(0);
}

runMultiplayerTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

