import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { realtimeConfig, issueRealtimeToken } from '../server/realtime.js';
const secret=crypto.randomBytes(48).toString('base64url');
const jwt=payload=>{
  const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const b=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${a}.${b}.${crypto.createHmac('sha256',secret).update(`${a}.${b}`).digest('base64url')}`;
};
const env={SUPABASE_URL:'https://c021fixture.supabase.co',SUPABASE_JWT_SECRET:secret,SUPABASE_ANON_KEY:jwt({role:'anon',ref:'c021fixture',exp:Math.floor(Date.now()/1000)+3600})};
test('realtime config requires matching legacy project key, not presence or a service role',()=>{
  assert.ok(realtimeConfig(env));
  for(const change of [{SUPABASE_JWT_SECRET:'x'.repeat(48)},{SUPABASE_ANON_KEY:'sb_publishable_fixture'},{SUPABASE_ANON_KEY:jwt({role:'service_role',ref:'c021fixture',exp:9999999999})},{SUPABASE_URL:'https://different.supabase.co'},{SUPABASE_ANON_KEY:jwt({role:'anon',ref:'c021fixture',exp:1})},{SUPABASE_URL:'http://c021fixture.supabase.co'}]) assert.equal(realtimeConfig({...env,...change}),null);
});
test('room JWT is authenticated, signed, scoped and bounded by room session expiry',()=>{
  const now=Date.now();const token=issueRealtimeToken({id:'room-id'},{room_code:'721021',exp:now+900000},realtimeConfig(env),now);
  const [a,b,s]=token.token.split('.');const payload=JSON.parse(Buffer.from(b,'base64url'));
  assert.equal(s,crypto.createHmac('sha256',secret).update(`${a}.${b}`).digest('base64url'));
  assert.equal(payload.role,'authenticated');assert.equal(payload.room_code,'721021');assert.equal(payload.sub,'room-id');assert.equal(payload.exp-payload.iat,300);assert.equal(Date.parse(token.expires_at),payload.exp*1000);
  assert.equal('nickname' in payload,false);assert.equal('passcode_hash' in payload,false);
  const short=issueRealtimeToken({id:'room-id'},{room_code:'721021',exp:now+60000},realtimeConfig(env),now);assert.ok(Date.parse(short.expires_at)<=now+60000);
});
