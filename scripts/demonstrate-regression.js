import assert from 'node:assert/strict';
import http from 'node:http';
import { handleApiRequest } from '../tests/helpers.js';
import { createServerlessHandler } from '../api/index.js';

const handler = createServerlessHandler(handleApiRequest);

async function runRegressionDemonstration() {
  console.log('=== C-027 Verify Item 2: Route / Auth / Cache Regression Demonstration ===\n');

  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Setup authenticated room
    const createRes = await fetch(`${baseUrl}/api/auth/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '771122', passcode: '1234', nickname: 'Demonstrator' })
    });
    assert.equal(createRes.status, 201);
    const { token, room } = await createRes.json();

    // 2. Demonstration of Auth Regression: Calling protected food endpoint without Bearer token
    console.log('1. Simulating Auth Regression (Request without Bearer Token):');
    const noAuthRes = await fetch(`${baseUrl}/api/foods?room_code=${room.code}`);
    console.log(`   Response status: ${noAuthRes.status} ${noAuthRes.statusText}`);
    const noAuthBody = await noAuthRes.json();
    console.log(`   Error body:`, noAuthBody);
    assert.equal(noAuthRes.status, 401, 'Auth gate must block unauthenticated requests');
    assert.equal(noAuthBody.code, 'UNAUTHORIZED');
    console.log('   [VERIFIED] Unauthenticated request correctly rejected with 401 UNAUTHORIZED.\n');

    // 3. Demonstration of Cross-Room Access Regression: Room A token accessing Room B
    console.log('2. Simulating Cross-Room Boundary Regression:');
    const crossRes = await fetch(`${baseUrl}/api/foods?room_code=999999`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   Response status: ${crossRes.status}`);
    const crossBody = await crossRes.json();
    console.log(`   Error body:`, crossBody);
    assert.equal(crossRes.status, 403, 'Cross-room access must be rejected with 403 FORBIDDEN');
    assert.equal(crossBody.code, 'FORBIDDEN');
    console.log('   [VERIFIED] Cross-room access correctly rejected with 403 FORBIDDEN.\n');

    // 4. Demonstration of Cache/Duplicate Takeover Regression: Recreating existing room with wrong passcode
    console.log('3. Simulating Room Takeover Regression:');
    const dupRes = await fetch(`${baseUrl}/api/auth/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '771122', passcode: '9999' })
    });
    console.log(`   Response status: ${dupRes.status}`);
    const dupBody = await dupRes.json();
    console.log(`   Error body:`, dupBody);
    assert.equal(dupRes.status, 409, 'Duplicate room takeover must be rejected with 409 CONFLICT');
    assert.equal(dupBody.code, 'ROOM_EXISTS');
    console.log('   [VERIFIED] Room takeover correctly rejected with 409 ROOM_EXISTS.\n');

    console.log('=== All 3 Regression Demonstrations Passed Successfully ===');
  } finally {
    server.close();
  }
}

runRegressionDemonstration().catch((err) => {
  console.error('Regression demonstration failed:', err);
  process.exit(1);
});
