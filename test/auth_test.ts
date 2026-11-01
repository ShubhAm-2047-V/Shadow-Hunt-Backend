import { AuthService } from '../src/services/AuthService.js';

console.log('====================================================');
console.log('   TESTING OPERATOR AUTHENTICATION & STATS ENGINE   ');
console.log('====================================================');

const auth = AuthService.getInstance();

async function runTest() {
  // 1. Register test operator
  const username = `test_op_${Date.now() % 10000}`;
  const email = `${username}@campushunt.tactical`;
  const password = 'TacticalPassword123!';
  const callsign = 'Ghost-9';

  console.log(`Registering new operator ${username}...`);
  const regRes = await auth.register(username, email, password, callsign);
  if (!regRes.success || !regRes.token || !regRes.user) {
    throw new Error(`Registration failed: ${regRes.message}`);
  }
  console.log(`✓ Operator registered: ID ${regRes.user.id}, Callsign: ${regRes.user.callsign}`);

  // 2. Test duplicate registration prevention
  const dupRes = await auth.register(username, 'different@campushunt.tactical', password);
  if (dupRes.success) throw new Error('Duplicate username was allowed!');
  console.log(`✓ Duplicate username rejected: "${dupRes.message}"`);

  // 3. Test Login
  console.log('Testing operator login...');
  const loginRes = await auth.login(username, password);
  if (!loginRes.success || !loginRes.token) {
    throw new Error(`Login failed: ${loginRes.message}`);
  }
  console.log(`✓ Login successful! Token: ${loginRes.token.substring(0, 25)}...`);

  // 4. Test Token Verification
  const verifiedUser = auth.verifyToken(loginRes.token);
  if (!verifiedUser || verifiedUser.username !== username) {
    throw new Error('Token verification failed!');
  }
  console.log(`✓ JWT signature verified for operator ${verifiedUser.username}`);

  // 5. Test Career Stats Recording
  console.log('Simulating completed match outcome...');
  auth.recordMatchOutcome(username, 'HUNTERS', true, 3, 240);
  const updatedProfile = auth.getUserById(regRes.user.id);
  if (!updatedProfile || updatedProfile.matchesPlayed !== 1 || updatedProfile.totalCaptures !== 3) {
    throw new Error('Career stats not recorded properly!');
  }
  console.log(`✓ Career stats updated: Matches: ${updatedProfile.matchesPlayed}, Wins: ${updatedProfile.winsAsHunter}, Captures: ${updatedProfile.totalCaptures}`);

  // 6. Test Leaderboard
  const leaderboard = auth.getLeaderboard(5);
  console.log(`✓ Leaderboard returned ${leaderboard.length} operator(s). Top operator: ${leaderboard[0]?.callsign}`);

  console.log('');
  console.log('====================================================');
  console.log('   ALL AUTHENTICATION TESTS PASSED! (100%)          ');
  console.log('====================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
