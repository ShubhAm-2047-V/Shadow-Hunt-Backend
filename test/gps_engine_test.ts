import { GameRoom } from '../src/game/GameRoom.js';
import { CAMPUS_PRESETS } from '../src/osm/mapPresets.js';
import { haversineDistanceMeters } from '../src/osm/geoConverter.js';

console.log('====================================================');
console.log('   RUNNING REAL-WORLD GPS ENGINE AUTOMATED TESTS    ');
console.log('====================================================');

let broadcastCount = 0;
let lastAudioAlert = '';

const testRoom = new GameRoom(
  'GPS100',
  'host-hunter-1',
  () => { broadcastCount++; },
  (_code, sound) => { lastAudioAlert = sound; },
  CAMPUS_PRESETS['stanford-quad']
);

// 1. Add Players
const hunter = testRoom.addPlayer('host-hunter-1', 'Hunter One');
const hider1 = testRoom.addPlayer('client-hider-1', 'Hider Alpha');
const hider2 = testRoom.addPlayer('client-hider-2', 'Hider Bravo');

testRoom.setTeam(hunter.id, 'HUNTERS');
testRoom.setTeam(hider1.id, 'HIDERS');
testRoom.setTeam(hider2.id, 'HIDERS');

console.log('✓ Players joined and teams assigned:');
console.log(`  Hunter: ${hunter.name} (${hunter.team})`);
console.log(`  Hider 1: ${hider1.name} (${hider1.team})`);
console.log(`  Hider 2: ${hider2.name} (${hider2.team})`);

// 2. Start Match
testRoom.startMatch();
console.log(`✓ Match started. Status: ${testRoom.status}, time: ${testRoom.timeRemaining}s`);

// 3. Test Real-World GPS Updates
// Stanford Quad center: ~37.4275, -122.1697
const stanfordCenterLat = 37.4275;
const stanfordCenterLng = -122.1697;

// Hunter at Center
testRoom.handleGpsUpdate(hunter.id, {
  latitude: stanfordCenterLat,
  longitude: stanfordCenterLng,
  accuracy: 3.5,
  heading: 90,
  speed: 1.2,
  timestamp: Date.now()
});

// Hider 1 located 6 meters away (within 8m capture range)
// ~0.000054 deg lat is ~6 meters
const hider1Lat = stanfordCenterLat + 0.000054;
const hider1Lng = stanfordCenterLng;
testRoom.handleGpsUpdate(hider1.id, {
  latitude: hider1Lat,
  longitude: hider1Lng,
  accuracy: 4.0,
  heading: 180,
  speed: 0.0,
  timestamp: Date.now()
});

// Hider 2 located 45 meters away (outside capture range)
const hider2Lat = stanfordCenterLat + 0.000405;
const hider2Lng = stanfordCenterLng;
testRoom.handleGpsUpdate(hider2.id, {
  latitude: hider2Lat,
  longitude: hider2Lng,
  accuracy: 3.8,
  heading: 270,
  speed: 0.8,
  timestamp: Date.now()
});

const distToHider1 = haversineDistanceMeters(hunter.gps!.latitude, hunter.gps!.longitude, hider1.gps!.latitude, hider1.gps!.longitude);
const distToHider2 = haversineDistanceMeters(hunter.gps!.latitude, hunter.gps!.longitude, hider2.gps!.latitude, hider2.gps!.longitude);

console.log(`✓ Real Haversine Distance Hunter -> Hider 1: ${distToHider1.toFixed(2)}m (Expected: ~6m)`);
console.log(`✓ Real Haversine Distance Hunter -> Hider 2: ${distToHider2.toFixed(2)}m (Expected: ~45m)`);

if (Math.abs(distToHider1 - 6) > 2) throw new Error('Distance calculation inaccurate');

// 4. Test Zero-Leak Asymmetric Visibility
const hunterView = testRoom.getStateForPlayer(hunter.id);
const hiderView = testRoom.getStateForPlayer(hider1.id);

// In hunter view, live hider coordinates MUST BE undefined / hidden!
if (hunterView.players[hider1.id].gps !== undefined) {
  throw new Error('SECURITY LEAK: Hunter received live Hider GPS coordinates!');
}
console.log('✓ ASYMMETRIC SECURITY VERIFIED: Hunter state contains ZERO live Hider GPS fixes.');

// In hider view, live hunter coordinates MUST BE present!
if (!hiderView.players[hunter.id].gps || hiderView.players[hunter.id].gps?.latitude !== stanfordCenterLat) {
  throw new Error('FAILURE: Hider did not receive live Hunter GPS coordinates!');
}
console.log('✓ ASYMMETRIC TRACKING VERIFIED: Hider receives exact real-time GPS coordinates of Hunter.');

// 5. Test 180s Shadow Intelligence Pulse
console.log('Testing 180s Shadow Pulse generator...');
testRoom.nextShadowPulseIn = 0; // Trigger pulse now
// Simulate 1 tick
(testRoom as any).update(1, Date.now());

const hunterViewAfterPulse = testRoom.getStateForPlayer(hunter.id);
if (!hunterViewAfterPulse.activeShadowPulse || hunterViewAfterPulse.activeShadowPulse.pings.length !== 2) {
  throw new Error('FAILURE: 180s Shadow Pulse did not broadcast ghost pings of alive hiders!');
}
console.log(`✓ 180s SHADOW PULSE VERIFIED: Hunter received ${hunterViewAfterPulse.activeShadowPulse.pings.length} ghost radar pings.`);
console.log(`  Ping 1: Lat ${hunterViewAfterPulse.activeShadowPulse.pings[0].latitude}, Lng ${hunterViewAfterPulse.activeShadowPulse.pings[0].longitude}`);

// 6. Test Physical GPS Capture
console.log('Testing Proximity Capture...');
const captureFarResult = testRoom.attemptCapture(hunter.id, hider2.id);
if (captureFarResult.success) {
  throw new Error('FAILURE: Hunter was able to capture Hider 2 at 45m distance!');
}
console.log(`✓ Capture rejected at 45m: "${captureFarResult.message}"`);

const captureCloseResult = testRoom.attemptCapture(hunter.id, hider1.id);
if (!captureCloseResult.success) {
  throw new Error(`FAILURE: Hunter could not capture Hider 1 at 6m: ${captureCloseResult.message}`);
}
console.log(`✓ Capture confirmed at 6m: "${captureCloseResult.message}"`);

if (hider1.isAlive) throw new Error('Hider 1 should be dead after capture');
if (hunter.captures !== 1) throw new Error('Hunter captures count should be 1');

// 7. Test Geofence Boundary Check (Move player outside Stanford Quad)
testRoom.handleGpsUpdate(hider2.id, {
  latitude: 38.0000, // Miles north of Stanford
  longitude: -122.1697,
  accuracy: 4.0,
  timestamp: Date.now()
});
if (hider2.isInsideBoundary) {
  throw new Error('FAILURE: Turf.js geofence failed to detect player outside campus boundary!');
}
console.log('✓ GEOFENCE VERIFIED: Out-of-bounds detection successfully flagged player outside boundary.');

testRoom.destroy();
console.log('');
console.log('====================================================');
console.log('  ALL REAL-WORLD GPS ENGINE TESTS PASSED! (100%)    ');
console.log('====================================================');

