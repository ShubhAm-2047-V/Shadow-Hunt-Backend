import { searchPlaces, generateMapFromCustomPolygon } from '../src/osm/osmFetcher.js';
import { CAMPUS_PRESETS } from '../src/osm/mapPresets.js';

async function testOSM() {
  console.log('--- TESTING OPENSTREETMAP GEO-CONVERTER & CUSTOM MAP ENGINE ---');

  // Test 1: Verified Presets
  console.log(`✓ Checking Presets: found ${Object.keys(CAMPUS_PRESETS).length} verified campuses.`);
  for (const [id, preset] of Object.entries(CAMPUS_PRESETS)) {
    console.log(`  - [${id}] ${preset.name} (${preset.buildings.length} buildings, area: ${Math.round(preset.areaM2)} m²)`);
    if (preset.buildings.length === 0 || preset.localPolygon.length < 3) {
      throw new Error(`Preset ${id} has invalid geometry!`);
    }
  }

  // Test 2: Custom Polygon Generation with procedural & OSM conversion
  console.log('✓ Testing Custom Polygon Generation:');
  const testPolygon: [number, number][] = [
    [37.7750, -122.4190],
    [37.7770, -122.4190],
    [37.7770, -122.4160],
    [37.7750, -122.4160],
  ];

  const mapData = await generateMapFromCustomPolygon('San Francisco Tech Campus', testPolygon);
  console.log(`  Generated Map: "${mapData.name}"`);
  console.log(`  Area: ${Math.round(mapData.areaM2)} m²`);
  console.log(`  Dimensions: ${mapData.dimensions.widthM}m x ${mapData.dimensions.heightM}m`);
  console.log(`  Buildings Extruded: ${mapData.buildings.length}`);
  console.log(`  Hider Spawns: ${mapData.spawnPoints.hiders.length}`);
  console.log(`  Hunter Spawns: ${mapData.spawnPoints.hunters.length}`);

  if (mapData.buildings.length < 2 || mapData.areaM2 <= 0) {
    throw new Error('Custom map generation failed minimum building or area requirement!');
  }

  console.log('======================================================');
  console.log('  ALL OSM & GEO CONVERSION TESTS PASSED 100%!         ');
  console.log('======================================================');
  process.exit(0);
}

testOSM().catch((err) => {
  console.error('OSM TEST FAILED:', err);
  process.exit(1);
});

