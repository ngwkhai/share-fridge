import { test, expect } from '@playwright/test';

test.describe('API Contract Validation', () => {

  test('GET /healthz returns 200 with status/version/timestamp', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('timestamp');
  });

  test('GET /readyz returns 200 with status/database', async ({ request }) => {
    const res = await request.get('/readyz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('database');
  });

  test('GET /api/openapi.json returns 200 with valid OpenAPI', async ({ request }) => {
    const res = await request.get('/api/openapi.json');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBeDefined();
    expect(body.paths).toBeDefined();
    expect(body.paths['/healthz']).toBeDefined();
    expect(body.paths['/api/auth/create-room']).toBeDefined();
  });

  test('GET /api/config returns 200 with capabilities', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('google_client_id');
    expect(body.capabilities).toBeDefined();
  });

  test('Room creation and auth workflows', async ({ request }) => {
    const roomName = `API Room ${Date.now()}`;
    const passcode = '1234';
    
    // Create room
    const createRes = await request.post('/api/auth/create-room', {
      data: {
        name: roomName,
        passcode: passcode,
        nickname: 'API Tester'
      }
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.room.code).toBeDefined();
    expect(createBody.token).toBeDefined();
    const roomCode = createBody.room.code;
    const token = createBody.token;

    // Join room
    const joinRes = await request.post('/api/auth/join-room', {
      data: {
        code: roomCode,
        passcode: passcode,
        nickname: 'API Tester 2'
      }
    });
    expect(joinRes.status()).toBe(200);
    const joinBody = await joinRes.json();
    expect(joinBody.token).toBeDefined();

    // Verify missing auth -> 401
    const getFoodsRes = await request.get(`/api/foods?room_code=${roomCode}`);
    expect(getFoodsRes.status()).toBe(401);

    // Cross room access -> 403 or 404
    const getOtherFoodsRes = await request.get(`/api/foods?room_code=999999`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect([403, 404]).toContain(getOtherFoodsRes.status());
  });

});
