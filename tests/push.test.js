import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMemoryPushRepository } from '../server/pushRepository.js';
import { decodePushKey, pushEndpoint, validatePushSubscription, pushConfig, authorizeCron, vietnamSchedule, publicAddress, postPush, createPushService } from '../server/push.js';
import { HttpError } from '../server/http.js';

// C024: run the actual public/sw-push.js source (the file importScripts embeds into
// the generated PWA worker) inside a minimal ServiceWorkerGlobalScope, so the
// push/notificationclick listeners are proven to execute, not just present.
const swPushSource = fs.readFileSync(new URL('../public/sw-push.js', import.meta.url), 'utf8');
function loadServiceWorker(clients = { matchAll: async () => [], openWindow: async () => {} }) {
  const listeners = {};
  const self = {
    addEventListener(type, handler) { listeners[type] = handler; },
    registration: { showNotification: () => {} },
  };
  vm.runInContext(swPushSource, vm.createContext({ self, clients, console }));
  return { listeners, self, clients };
}

const vapidPair = () => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: Buffer.concat([Buffer.alloc(Math.max(0,32-priv.length)),priv]).subarray(-32).toString('base64url') };
};
const subscriptionFixture = (endpoint = 'https://fcm.googleapis.com/fcm/send/'+crypto.randomUUID()) => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint, keys: { auth: crypto.randomBytes(16).toString('base64url'), p256dh: ecdh.getPublicKey().toString('base64url') } };
};
const rejects = (fn, code='INVALID_SUBSCRIPTION') => assert.throws(fn, error => error instanceof HttpError && error.status===400 && error.code===code);

test('decodePushKey enforces exact byte length and canonical base64url', () => {
  assert.deepEqual(decodePushKey(Buffer.alloc(16,7).toString('base64url'),16), Buffer.alloc(16,7));
  for (const value of [undefined, null, 123, '***', Buffer.alloc(15).toString('base64url'), Buffer.alloc(17).toString('base64url'), 'a'.repeat(200)]) rejects(() => decodePushKey(value,16));
});

test('pushEndpoint accepts only known browser push providers over plain HTTPS', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    'https://web.push.apple.com/abc',
    'https://foo123.push.apple.com/abc',
    'https://wns2-db5p.notify.windows.com/w/abc',
  ]) assert.ok(pushEndpoint(endpoint) instanceof URL);
  for (const endpoint of [
    'https://push.example.test/abc',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://fcm.googleapis.com/',
    'https://fcm.googleapis.com',
    'javascript:alert(1)',
    'not a url',
    5,
    'https://fcm.googleapis.com/'+'a'.repeat(8200),
  ]) rejects(() => pushEndpoint(endpoint));
});

test('validatePushSubscription requires a valid on-curve P-256 point and rejects malformed shapes', () => {
  const valid = subscriptionFixture();
  const result = validatePushSubscription(valid);
  assert.deepEqual(result, { endpoint: valid.endpoint, keys: valid.keys });
  const offCurve = Buffer.from(valid.keys.p256dh,'base64url'); offCurve[1] ^= 0xff;
  for (const subscription of [
    null, [], {}, { ...valid, keys: undefined },
    { ...valid, keys: { ...valid.keys, p256dh: offCurve.toString('base64url') } },
    { ...valid, keys: { ...valid.keys, p256dh: valid.keys.p256dh.slice(0,-2) } },
    { ...valid, keys: { ...valid.keys, auth: valid.keys.auth.slice(0,-2) } },
  ]) rejects(() => validatePushSubscription(subscription));
});

test('pushConfig accepts only a matching VAPID keypair with a mailto subject', () => {
  const pair = vapidPair();
  assert.deepEqual(pushConfig({ VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:ops@example.com' }), { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: 'mailto:ops@example.com' });
  assert.equal(pushConfig({}), null);
  const other = vapidPair();
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: other.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:ops@example.com' }), null, 'mismatched keypair must be rejected');
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'ops@example.com' }), null, 'subject must be a mailto: URI');
});

test('authorizeCron requires a configured 32+ byte secret and a matching bearer header', () => {
  assert.throws(() => authorizeCron('Bearer x', undefined), error => error.status===503 && error.code==='PUSH_UNAVAILABLE');
  assert.throws(() => authorizeCron('Bearer x', 'short'), error => error.status===503 && error.code==='PUSH_UNAVAILABLE');
  const secret = crypto.randomBytes(32).toString('base64url');
  assert.throws(() => authorizeCron(undefined, secret), error => error.status===401 && error.code==='UNAUTHORIZED');
  assert.throws(() => authorizeCron(`Bearer ${secret}x`, secret), error => error.status===401 && error.code==='UNAUTHORIZED');
  assert.doesNotThrow(() => authorizeCron(`Bearer ${secret}`, secret));
});

test('vietnamSchedule computes the Asia/Ho_Chi_Minh calendar day and the 16:30 cutoff', () => {
  assert.deepEqual(vietnamSchedule(new Date('2026-09-03T09:29:59.000Z')), { day:'2026-09-03', due:false, expires:'2026-09-03T17:00:00.000Z' });
  assert.equal(vietnamSchedule(new Date('2026-09-03T09:30:00.000Z')).due, true);
  assert.equal(vietnamSchedule(new Date('2026-09-03T23:59:59.000Z')).day, '2026-09-04');
  assert.equal(vietnamSchedule(new Date('2026-09-03T16:59:59.000Z')).due, true);
});

test('publicAddress rejects private/loopback/link-local ranges including IPv4-mapped IPv6', () => {
  for (const address of ['8.8.8.8','2001:4860:4860::8888']) assert.equal(publicAddress(address), true);
  for (const address of ['127.0.0.1','10.0.0.5','192.168.1.1','169.254.1.1','::1','fc00::1','::ffff:127.0.0.1','not-an-ip']) assert.equal(publicAddress(address), false);
});

test('postPush rejects a resolved private address and never connects', async () => {
  await assert.rejects(() => postPush({ endpoint:'https://fcm.googleapis.com/fcm/send/x', headers:{}, body:'' }, { resolve: async () => [{ address:'127.0.0.1' }] }), error => error.message==='PUSH_ADDRESS_REJECTED');
});

test('postPush bounds the response body and reports status/retry-after', async () => {
  const fakeRequest = (options, onResponse) => {
    const res = { statusCode: 429, headers: { 'retry-after': '30' }, on(event,cb) { if (event==='end') setImmediate(cb); } };
    setImmediate(() => onResponse(res));
    return { on() {}, end() {}, destroy() {} };
  };
  const result = await postPush({ endpoint:'https://fcm.googleapis.com/fcm/send/x', headers:{}, body:'' }, { resolve: async () => [{ address:'8.8.8.8' }], request: fakeRequest });
  assert.deepEqual(result, { status: 429, retryAfter: '30' });
});

test('postPush destroys the request when the response body exceeds the byte bound', async () => {
  let destroyed;
  const fakeRequest = (options, onResponse) => {
    const reqHandlers = {};
    const req = { on(event,cb){ reqHandlers[event]=cb; }, end(){}, destroy(error){ destroyed=error; if (error) setImmediate(() => reqHandlers.error?.(error)); } };
    const resHandlers = {};
    const res = { statusCode: 200, headers: {}, on(event,cb) { resHandlers[event]=cb; } };
    setImmediate(() => { onResponse(res); resHandlers.data(Buffer.alloc(9000)); });
    return req;
  };
  await assert.rejects(() => postPush({ endpoint:'https://fcm.googleapis.com/fcm/send/x', headers:{}, body:'' }, { resolve: async () => [{ address:'8.8.8.8' }], request: fakeRequest }), error => error.message==='PUSH_RESPONSE_TOO_LARGE');
  assert.ok(destroyed instanceof Error);
});

test('dispatch: accepted (2xx), expired (404/410) and retryable (429/5xx) outcomes are recorded distinctly, bounded by budget/maximum', async () => {
  const deliveries = new Map();
  let claimed = 0;
  const db = {
    async pushReady() { return true; },
    async claimPush(limit) {
      if (claimed >= 3) return [];
      const batch = [];
      for (let i=0;i<Math.min(limit,3-claimed);i++,claimed++) {
        const id = `d${claimed}`;
        const subscription = subscriptionFixture();
        const record = { id, subscriber_id:`s${claimed}`, subscription, payload:{title:'t',body:'b'}, notification_id:`n${claimed}`, room_code:'620020', expires_at:new Date(Date.now()+3600000).toISOString() };
        deliveries.set(id, record);
        batch.push(record);
      }
      return batch;
    },
    async finishPush(delivery, outcome) { deliveries.get(delivery.id).outcome = outcome; return true; },
    async pendingPush() { return 0; },
  };
  const statuses = [200, 410, 500];
  let call = 0;
  const vapid = { ...vapidPair(), subject:'mailto:a@b.com' };
  const service = createPushService({ configuration: () => vapid, transport: async () => ({ status: statuses[call++], retryAfter: undefined }) });
  const result = await service.dispatch(db, null, { budgetMs: 5000, maximum: 10 });
  assert.deepEqual(result, { success: false, sent: 1, skipped: 1, failed: 1, pending: 0 });
  assert.equal(deliveries.get('d0').outcome.accepted, true);
  assert.equal(deliveries.get('d1').outcome.expired, true);
  assert.equal(deliveries.get('d2').outcome.retry, true);
});

test('dispatch treats a non-HttpError transport failure as retryable and an HttpError as a permanent invalid-subscription failure', async () => {
  const seen = [];
  const db = {
    async pushReady() { return true; },
    async claimPush(limit, lease, room) {
      if (seen.length >= 2) return [];
      const bad = subscriptionFixture(); bad.keys.p256dh = 'not-a-valid-key';
      return [
        { id:'ok', subscriber_id:'s', subscription: subscriptionFixture(), payload:{}, notification_id:'n1', room_code:room, expires_at:new Date(Date.now()+3600000).toISOString() },
        { id:'bad', subscriber_id:'s2', subscription: bad, payload:{}, notification_id:'n2', room_code:room, expires_at:new Date(Date.now()+3600000).toISOString() },
      ];
    },
    async finishPush(delivery, outcome) { seen.push({ id: delivery.id, outcome }); return true; },
    async pendingPush() { return 0; },
  };
  const vapid = { ...vapidPair(), subject:'mailto:a@b.com' };
  const service = createPushService({ configuration: () => vapid, transport: async () => { throw new Error('ECONNRESET'); } });
  await service.dispatch(db, '620020', { maximum: 2 });
  const bad = seen.find(row => row.id==='bad');
  assert.equal(bad.outcome.code, 'INVALID_SUBSCRIPTION');
  assert.equal(bad.outcome.retry, false);
  const ok = seen.find(row => row.id==='ok');
  assert.equal(ok.outcome.code, 'TRANSPORT_FAILURE');
  assert.equal(ok.outcome.retry, true);
});

test('cron only queues the expiry event at/after 16:30 Asia/Ho_Chi_Minh and always dispatches', async () => {
  const queued = [];
  const memory = createMemoryPushRepository(new Map());
  const db = { ...memory, async queueExpiry(day, now, expires) { queued.push(day); return 1; } };
  const vapid = { ...vapidPair(), subject:'mailto:a@b.com' };
  const service = createPushService({ configuration: () => vapid, now: () => Date.parse('2026-09-03T09:00:00.000Z') });
  const before = await service.cron(db);
  assert.deepEqual(queued, []);
  assert.equal(before.success, true);
  const dueService = createPushService({ configuration: () => vapid, now: () => Date.parse('2026-09-03T09:30:00.000Z') });
  await dueService.cron(db);
  assert.deepEqual(queued, ['2026-09-03']);
});

test('cron rejects when push is not configured, without attempting to queue or dispatch', async () => {
  const service = createPushService({ configuration: () => null });
  await assert.rejects(() => service.cron({ async pushReady(){ return true; } }), error => error.status===503 && error.code==='PUSH_UNAVAILABLE');
});

test('sw-push.js push handler shows a notification built from the pushed payload and ignores data-less pushes', async () => {
  let shown;
  const worker = loadServiceWorker();
  worker.self.registration.showNotification = (title, options) => { shown = { title, options }; return Promise.resolve(); };
  let waited;
  const event = { data: { json: () => ({ title: 'Kiểm tra hạn dùng', body: 'Có món sắp hết hạn', url: '/room' }) }, waitUntil: promise => { waited = promise; } };
  worker.listeners.push(event);
  await waited;
  // shown was built inside a separate vm context/realm; compare by structure, not identity.
  assert.deepEqual(JSON.parse(JSON.stringify(shown)), { title: 'Kiểm tra hạn dùng', options: { body: 'Có món sắp hết hạn', icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', vibrate: [100,50,100], data: { url: '/room' } } });

  let handledSilently = true;
  try { await worker.listeners.push({ data: null, waitUntil: () => {} }); } catch { handledSilently = false; }
  assert.equal(handledSilently, true);
});

test('sw-push.js notificationclick handler focuses an existing window or opens one, and always closes the notification', async () => {
  let closed = false, focused = false, opened = false;
  const openClient = { url: '/', focus: () => { focused = true; } };
  const withOpenWindow = loadServiceWorker({ matchAll: async () => [openClient], openWindow: async () => { opened = true; } });
  let waited;
  withOpenWindow.listeners.notificationclick({ notification: { close: () => { closed = true; } }, waitUntil: promise => { waited = promise; } });
  await waited;
  assert.equal(closed, true);
  assert.equal(focused, true);
  assert.equal(opened, false);

  closed = false;
  const withoutOpenWindow = loadServiceWorker({ matchAll: async () => [], openWindow: async () => { opened = true; } });
  let waited2;
  withoutOpenWindow.listeners.notificationclick({ notification: { close: () => { closed = true; } }, waitUntil: promise => { waited2 = promise; } });
  await waited2;
  assert.equal(closed, true);
  assert.equal(opened, true);
});
