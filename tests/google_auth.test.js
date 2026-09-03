import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import ts from 'typescript';
import { OAuth2Client } from 'google-auth-library';
import { createGoogleClient, createGoogleVerifier } from '../server/googleIdentity.js';
import { generateGoogleIdentity, generateSessionToken, verifyGoogleIdentity, verifySessionToken } from '../server/security.js';
import { createApiHandler } from '../server/apiHandler.js';
import { createMemoryRepository } from '../server/repository.js';

const clientId = 'c022-test.apps.googleusercontent.com';
const previousClient = process.env.GOOGLE_CLIENT_ID;
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' });
const signed = (changes = {}, signingKey = key.privateKey, header = { alg: 'RS256', kid: 'fixture-key', typ: 'JWT' }) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'https://accounts.google.com', aud: clientId, iat: now - 10, exp: now + 3600, sub: '111111111111111111111', name: 'Account One', email: 'one@example.com', email_verified: true, picture: 'https://lh3.googleusercontent.com/a/fixture-one', ...changes };
  const input = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url')}`;
};
const google = new OAuth2Client();
// Replace certificate retrieval only, preserving Google's actual JWT verifier.
google.getFederatedSignonCertsAsync = async () => ({ certs: { 'fixture-key': publicKey } });
const verify = createGoogleVerifier(google);
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { api } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const store = new Map();
const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
let server, base;
const db = createMemoryRepository();
const handler = createApiHandler(db, { verifyGoogleCredential: verify });
const post = async (path, body, token) => {
  const result = await originalFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: result.status, data: await result.json() };
};
test.before(async () => {
  process.env.GOOGLE_CLIENT_ID = clientId;
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key,value) => store.set(key,value), removeItem: key => store.delete(key) };
  server = http.createServer(handler);
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = (url, options) => originalFetch(new URL(url,base),options);
});
test.after(async () => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  if (previousClient === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previousClient;
  await new Promise(resolve => server.close(resolve));
});

test('real RSA verification rejects fake signature, expired, wrong audience/issuer and unverified claims', async () => {
  const differentKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const credentials = ['fake.google.credential', signed({},differentKey), signed({ exp: Math.floor(Date.now()/1000)-1 }), signed({ aud: 'other.apps.googleusercontent.com' }), signed({ iss: 'https://attacker.example' }), signed({ email_verified: false }), signed({ azp: 'other.apps.googleusercontent.com' }), signed({ sub: '' }), signed({ picture: 'javascript:alert(1)' }), signed({},key.privateKey,{alg:'none',kid:'fixture-key'}), signed({ iat: Math.floor(Date.now()/1000)+100 })];
  for (const credential of credentials) {
    const result = await post('/api/auth/google',{ credential });
    assert.equal(result.status,401);
    assert.equal(result.data.code,'INVALID_GOOGLE_CREDENTIAL');
    assert.deepEqual(Object.keys(result.data).sort(),['code','error']);
    assert.ok(!JSON.stringify(result.data).includes(credential));
  }
  for (const credential of ['', 'x'.repeat(8193), 123]) assert.equal((await post('/api/auth/google',{credential})).status,400);
});

test('actual client verifies two stable identities, enforces PIN, persists profile through create/join/reload, and clears on logout', async () => {
  const one = await api.verifyGoogleCredential(signed());
  const repeated = await api.verifyGoogleCredential(signed());
  const two = await api.verifyGoogleCredential(signed({ sub:'222222222222222222222', name:'Account Two', email:'two@example.com', picture:'https://lh3.googleusercontent.com/a/fixture-two' }));
  assert.equal(one.profile.sub,repeated.profile.sub); assert.notEqual(one.profile.sub,two.profile.sub);
  assert.ok(Date.parse(one.expires_at) <= Date.now()+600000);
  assert.equal(api.sessionCache.get(),null,'Google alone must not create a room session');
  assert.equal(verifySessionToken(one.identity_token),null);
  assert.equal((await post('/api/auth/create-room',{ code:'622022',google_identity_token:one.identity_token })).status,400);
  const created = await api.createRoomWithPasscode('622022','Google room','7788','Roommate One',one.identity_token);
  assert.deepEqual(created.google_profile,one.profile);
  assert.deepEqual(api.sessionCache.get().google_profile,one.profile);
  assert.deepEqual((await api.verifyToken(created.token)).payload.google_profile,one.profile);
  assert.equal(verifyGoogleIdentity(created.token),null);
  assert.equal((await post('/api/auth/join-room',{code:'622022',passcode:'9999',google_identity_token:two.identity_token})).status,401);
  assert.equal((await post('/api/auth/join-room',{code:'622022',passcode:'7788',google_identity_token:created.token})).status,401);
  const joined = await api.joinRoomWithPasscode('622022','7788','Roommate Two',two.identity_token);
  assert.deepEqual(joined.google_profile,two.profile);
  // Load the persisted JSON through the real cache boundary (page reload data).
  assert.deepEqual(api.sessionCache.get().google_profile,two.profile);
  assert.deepEqual((await api.verifyToken()).payload.google_profile,two.profile);
  const foreign = await api.createRoomWithPasscode('622023','Foreign','4455','Other');
  const response = await originalFetch(base+'/api/rooms/622023',{headers:{Authorization:`Bearer ${joined.token}`}});
  assert.equal(response.status,403,'verified Google identity must not bypass room scope');
  assert.equal((await originalFetch(base+'/api/rooms/622022',{headers:{Authorization:`Bearer ${two.identity_token}`}})).status,401);
  api.sessionCache.clear(); assert.equal(api.sessionCache.get(),null); assert.equal(store.get('sharefridge_session_token'),undefined);
  assert.ok(foreign.token);
});

test('verified room payload repairs tampered cache profile; malformed profiles rejected and legacy sessions remain valid', async () => {
  const identity = await verify(signed());
  const token = generateSessionToken('622022','Legacy-compatible',identity.profile);
  api.sessionCache.save({ code:'622022',name:'Google room',nickname:'Legacy-compatible',passcode:'',token,cached_at:Date.now(),google_profile:{...identity.profile,name:'Local tampering'} });
  await api.verifyToken();
  assert.equal(api.sessionCache.get().google_profile.name,identity.profile.name);
  const cached = JSON.parse(store.get('sharefridge_session_cache'));
  store.set('sharefridge_session_cache',JSON.stringify({...cached,google_profile:{...identity.profile,picture:'javascript:alert(1)'}}));
  assert.equal(api.sessionCache.get(),null);
  store.set('sharefridge_session_cache',JSON.stringify({...cached,google_profile:undefined,google_email:'old-fake@example.com',user_avatar:'https://fake.example/a'}));
  assert.equal(api.sessionCache.get().google_profile,undefined);
  assert.equal(api.sessionCache.get().google_email,undefined);
  const old = generateSessionToken('622022','Old session');
  assert.equal(verifySessionToken(old).nickname,'Old session');
  assert.equal((await post('/api/auth/verify-token',{token:old})).status,200);
  const expired = generateGoogleIdentity(identity.profile,Date.now()+30);
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(verifyGoogleIdentity(expired.identity_token),null);
  api.sessionCache.clear();
});

test('missing provider configuration is public false/null and Google auth fails safely without a database', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const config = await api.getConfig();
    assert.equal(config.google_client_id,null);assert.equal(config.capabilities.google,false);
    let status,body;
    await createApiHandler()({url:'/api/auth/google',method:'POST',headers:{}},{writeHead:value=>status=value,end:value=>body=JSON.parse(value)});
    assert.equal(status,503);assert.equal(body.code,'GOOGLE_UNAVAILABLE');
    await assert.rejects(()=>api.verifyGoogleCredential(signed()),error=>error.status===503);
  } finally { process.env.GOOGLE_CLIENT_ID=clientId; }
});

test('certificate transport aborts a stalled fetch and never retries a 503', async () => {
  let requests=0, closed=false;
  const certServer=http.createServer((req,res)=>{ requests++; req.on('close',()=>{closed=true;}); if(req.url==='/failure'){res.writeHead(503);res.end('private provider diagnostics');} });
  await new Promise((resolve,reject)=>{certServer.once('error',reject);certServer.listen(0,'127.0.0.1',resolve);});
  const address=`http://127.0.0.1:${certServer.address().port}`;
  try {
    for(const endpoint of ['/failure','/stall']) {
      const client=createGoogleClient({endpoints:{oauth2FederatedSignonPemCertsUrl:address+endpoint}},80);
      const started=Date.now();
      await assert.rejects(()=>createGoogleVerifier(client,500)(signed()),error=>error.status===503&&error.code==='GOOGLE_UNAVAILABLE'&&!error.message.includes('diagnostics'));
      assert.ok(Date.now()-started<1000);
    }
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(requests,2,'each key fetch must issue exactly one HTTP request');assert.equal(closed,true);
  } finally { certServer.closeAllConnections();await new Promise(resolve=>certServer.close(resolve)); }
});

test('logout during real Google verification rejects the late identity response', async () => {
  const pending = api.verifyGoogleCredential(signed());
  api.sessionCache.clear();
  await assert.rejects(pending,error=>error.code==='SESSION_CHANGED');
  assert.equal(api.sessionCache.get(),null);
});
