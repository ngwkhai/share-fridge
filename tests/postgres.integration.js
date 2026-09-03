import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { runMigrations } from '../server/migrate.js';
import { createApiHandler } from '../server/apiHandler.js';
import { createMemoryRepository, createPostgresRepository } from '../server/repository.js';
import { verifyPasscode } from '../server/security.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration. No test was skipped. Use a disposable database.');
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });
const repository = createPostgresRepository({ pool });
const sessionSecret = crypto.randomBytes(48).toString('base64url');
const roleName = `c019_reader_${crypto.randomBytes(6).toString('hex')}`;
const ownedCodes = [];
const workers = [];
let first, second, firstCode, secondCode, legacyCode, legacyRoom, food, shop, subscriberId;
const bucket = value => crypto.createHash('sha256').update(value).digest('hex');
// Per-run proxy fixture identity, shared across both workers and never a real caller.
const fixtureIp = `2001:db8:${crypto.randomBytes(2).toString('hex')}:${crypto.randomBytes(2).toString('hex')}::19`;

async function code() {
  for (let n=0;n<50;n++) {
    const candidate = String(crypto.randomInt(100000,1000000));
    if (!(await pool.query('select 1 from public.rooms where code=$1',[candidate])).rowCount) { ownedCodes.push(candidate); return candidate; }
  }
  throw new Error('Could not allocate test room');
}

async function startWorker() {
  const child = spawn(process.execPath, ['tests/postgres-worker.js'], {
    cwd: process.cwd(), stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, VERCEL:'1', NODE_ENV:'production', DATABASE_URL:process.env.TEST_DATABASE_URL, SESSION_SECRET:sessionSecret, GEMINI_API_KEY:'' },
  });
  const instance = { child, url: null, stopped: false };
  workers.push(instance);
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('API child did not start')), 10000);
    let output='';
    child.once('error',error => { clearTimeout(timeout); reject(error); });
    child.once('exit',status => { clearTimeout(timeout); if (!instance.url) reject(new Error(`API child exited before startup: ${status}`)); });
    child.stdout.on('data',chunk => {
      output += chunk.toString();
      if (!output.includes('\n')) return;
      try { const parsed=JSON.parse(output.split('\n')[0]); instance.url=`http://127.0.0.1:${parsed.port}`; clearTimeout(timeout); resolve(); }
      catch { clearTimeout(timeout); reject(new Error('Invalid child startup response')); }
    });
    child.stderr.on('data', () => {}); // Never print DSNs or connection details.
  });
  return instance;
}
async function stopWorker(instance) {
  if (instance.stopped) return;
  instance.stopped=true;
  if (instance.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer=setTimeout(() => instance.child.kill('SIGKILL'),3000);
    instance.child.once('exit',() => { clearTimeout(timer); resolve(); });
    instance.child.kill('SIGTERM');
  });
}
async function call(worker,path,{method='GET',token,body}={}) {
  const response=await fetch(`${worker.url}${path}`,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':fixtureIp,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return { status:response.status, data:await response.json() };
}

// Create only missing legacy tables and test-owned rows, never reset a database.
test.before(async () => {
  await pool.query(`create table if not exists public.rooms (
    id uuid primary key default gen_random_uuid(),code varchar(10) unique not null,name text not null,
    passcode_hash text not null,salt text not null,created_at timestamptz default now());
    create table if not exists public.foods (
    id uuid primary key default gen_random_uuid(),room_code varchar(10) not null references public.rooms(code) on delete cascade,
    name text not null,quantity text,compartment varchar(20) not null,container_tag text,added_date timestamptz default now(),
    expiry_date timestamptz not null,status varchar(20) not null default 'FRESH',photo_url text,notes text,created_by text,consumed_at timestamptz);`);
  legacyCode=await code();
  const salt=crypto.randomBytes(16).toString('hex');
  legacyRoom={id:crypto.randomUUID(),code:legacyCode,name:'C019 legacy preserved',passcode_hash:crypto.pbkdf2Sync('6789',salt,1000,32,'sha256').toString('hex'),salt,created_at:'2025-01-01T00:00:00.000Z'};
  await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt,created_at) values($1,$2,$3,$4,$5,$6)',Object.values(legacyRoom));
  await pool.query(`create role ${roleName} nologin nosuperuser nobypassrls; grant usage on schema public to ${roleName}; grant select on public.foods to ${roleName};`);
});

test.after(async () => {
  await Promise.all(workers.map(stopWorker));
  // Cleanup is limited to random test-owned room IDs and the test-owned role.
  if (ownedCodes.length) await pool.query('delete from public.rooms where code=any($1::text[])',[ownedCodes]);
  await pool.query(`drop owned by ${roleName}; drop role ${roleName};`);
  await pool.query('delete from sharefridge_private.rate_limits where bucket=any($1::text[])', [[bucket(`create:${fixtureIp}`),bucket(`join-ip:${fixtureIp}`),...ownedCodes.map(code=>bucket(`join-room:${code}`))]]);
  await pool.end();
});

test('migration runs twice and preserves existing UUID, timestamp and legacy password hash', async () => {
  // Reproduce the old public grant/policy before proving migration revokes it.
  await pool.query('grant select,insert on public.rooms,public.foods to public');
  assert.equal((await pool.query("select has_table_privilege('public','public.rooms','SELECT') as allowed")).rows[0].allowed,true);
  await runMigrations(pool);
  await runMigrations(pool);
  assert.equal(await repository.ready(),true);
  assert.deepEqual(await repository.getRoom(legacyCode),legacyRoom);
  assert.equal(verifyPasscode('6789',legacyRoom.passcode_hash,legacyRoom.salt),true);
  assert.equal((await pool.query("select count(*)::int as n from sharefridge_private.schema_migrations where version='001_durable_repository'")).rows[0].n,1);
  first=await startWorker(); second=await startWorker();
  assert.notEqual(first.child.pid,second.child.pid);
  const oldLogin=await call(first,'/api/auth/join-room',{method:'POST',body:{code:legacyCode,passcode:'6789'}});
  assert.equal(oldLogin.status,200); assert.equal(oldLogin.data.room.id,legacyRoom.id);
});

test('two independent API processes share created room, exact food timestamps, shopping and subscription', async () => {
  firstCode=await code(); secondCode=await code();
  const created=await call(first,'/api/auth/create-room',{method:'POST',body:{code:firstCode,passcode:'6789',nickname:'Persistent member'}});
  assert.equal(created.status,201); first.session=created.data;
  const createdSecond=await call(second,'/api/auth/create-room',{method:'POST',body:{code:secondCode,passcode:'9876'}});
  assert.equal(createdSecond.status,201); second.session=createdSecond.data;
  const joined=await call(second,'/api/auth/join-room',{method:'POST',body:{code:firstCode,passcode:'6789'}});
  assert.equal(joined.status,200); assert.equal(joined.data.room.id,first.session.room.id);
  const added=await call(first,'/api/foods',{method:'POST',token:first.session.token,body:{room_code:firstCode,name:'C019 durable food',quantity:'1 box',compartment:'FRIDGE_TOP',shelf_life_days:2}});
  assert.equal(added.status,201); food=added.data;
  const read=await call(second,`/api/foods?room_code=${firstCode}`,{token:first.session.token});
  assert.equal(read.status,200); assert.equal(read.data.items[0].id,food.id); assert.equal(read.data.items[0].added_date,food.added_date); assert.equal(read.data.items[0].expiry_date,food.expiry_date);
  const addedShop=await call(second,'/api/shopping-items',{method:'POST',token:first.session.token,body:{room_code:firstCode,name:'C019 milk',quantity:'1L'}});
  assert.equal(addedShop.status,201);shop=addedShop.data;
  const subscription={endpoint:'https://push.example.test/c019-'+crypto.randomUUID(),keys:{auth:'fixture-auth',p256dh:'fixture-p256dh'}};
  const subscribed=await Promise.all([first,second].map(worker=>call(worker,'/api/notifications/subscribe',{method:'POST',token:first.session.token,body:{room_code:firstCode,subscription,device_name:'C019 fixture'}})));
  assert.deepEqual(subscribed.map(result=>result.status),[200,200]);
  assert.equal(subscribed[0].data.subscriber_id,subscribed[1].data.subscriber_id); subscriberId=subscribed[0].data.subscriber_id;
  assert.equal((await repository.listSubscriptions(firstCode)).length,1);
});

test('unique room constraint prevents concurrent create takeover across workers', async () => {
  const duplicateCode=await code();
  const results=await Promise.all([first,second].map(worker=>call(worker,'/api/auth/create-room',{method:'POST',body:{code:duplicateCode,passcode:'6789'}})));
  assert.deepEqual(results.map(result=>result.status).sort(),[201,409]);
  assert.equal((await pool.query('select count(*)::int as n from public.rooms where code=$1',[duplicateCode])).rows[0].n,1);
});

test('room isolation survives different process and identifier lookups', async () => {
  assert.equal((await call(second,`/api/foods?room_code=${firstCode}`,{token:second.session.token})).status,403);
  for (const [path,method,body] of [[`/api/foods/${food.id}`,'DELETE'],[`/api/foods/${food.id}/consume`,'PATCH',{}],[`/api/shopping-items/${shop.id}/toggle`,'PATCH',{is_bought:true}]]) {
    assert.equal((await call(second,path,{method,body,token:second.session.token})).status,404);
  }
  assert.ok(await repository.getFood(food.id,firstCode));
});

test('concurrent consume is atomic/idempotent and creates one shopping row', async () => {
  const results=await Promise.all(Array.from({length:10},(_,i)=>call(i%2?first:second,`/api/foods/${food.id}/consume`,{method:'PATCH',token:first.session.token,body:{add_to_shopping_list:true,consumed_by:'spoof'}})));
  assert.ok(results.every(result=>result.status===200));
  assert.ok(results.every(result=>result.data.consumed_at===results[0].data.consumed_at));
  assert.ok(results.every(result=>result.data.consumed_by==='Persistent member'));
  assert.equal((await repository.listShopping(firstCode)).filter(item=>item.name===food.name).length,1);
  food=results[0].data;
});

test('shopping insert failure rolls back food consumption in the same database transaction', async () => {
  const id=crypto.randomUUID();
  await repository.createFood({...food,id,name:'C019 rollback fixture',status:'FRESH',consumed_at:null,consumed_by:null});
  // Test-owned temporary trigger rejects only this test-owned food name.
  const functionName=`c019_fail_${crypto.randomBytes(5).toString('hex')}`;
  await pool.query(`create function public.${functionName}() returns trigger language plpgsql as $$ begin if NEW.name='C019 rollback fixture' then raise exception 'C019 test failure'; end if; return NEW; end $$;
    create trigger ${functionName} before insert on public.shopping_items for each row execute function public.${functionName}();`);
  try {
    const result=await call(first,`/api/foods/${id}/consume`,{method:'PATCH',token:first.session.token,body:{add_to_shopping_list:true}});
    assert.equal(result.status,500); assert.deepEqual(result.data,{error:'Internal server error',code:'INTERNAL_ERROR'});
    const preserved=await repository.getFood(id,firstCode); assert.equal(preserved.status,'FRESH'); assert.equal(preserved.consumed_at,null);
    assert.equal((await repository.listShopping(firstCode)).filter(item=>item.name==='C019 rollback fixture').length,0);
  } finally { await pool.query(`drop trigger ${functionName} on public.shopping_items; drop function public.${functionName}();`); }
});

test('failed sign-in limiter is shared and race-safe across processes', async () => {
  const keys=[bucket(`join-ip:${fixtureIp}`),bucket(`join-room:${secondCode}`)];
  for(const key of keys) await repository.clearRateLimit(key);
  const results=await Promise.all(Array.from({length:10},(_,i)=>call(i%2?first:second,'/api/auth/join-room',{method:'POST',body:{code:secondCode,passcode:'0000'}})));
  assert.equal(results.filter(result=>result.status===401).length,5);
  assert.equal(results.filter(result=>result.status===429).length,5);
  await stopWorker(first); first=await startWorker();
  assert.equal((await call(first,'/api/auth/join-room',{method:'POST',body:{code:secondCode,passcode:'0000'}})).status,429);
  for(const key of keys) await repository.clearRateLimit(key);
});

test('cold API process retains session room, food history, shopping, subscriptions and absolute dates', async () => {
  const token=second ? (await call(second,'/api/auth/join-room',{method:'POST',body:{code:firstCode,passcode:'6789'}})).data.token : null;
  assert.ok(token);
  await stopWorker(first); await stopWorker(second);
  first=await startWorker();
  const read=await call(first,`/api/foods?room_code=${firstCode}&status=consumed`,{token});
  assert.equal(read.status,200); assert.equal(read.data.items.length,1); assert.equal(typeof read.data.items[0].days_remaining,'number');
  const stored=read.data.items[0];
  for(const key of ['id','added_date','expiry_date','consumed_at','consumed_by','status']) assert.equal(stored[key],food[key]);
  assert.equal((await call(first,`/api/shopping-items?room_code=${firstCode}`,{token})).data.items.length,2);
  assert.equal((await repository.listSubscriptions(firstCode))[0].id,subscriberId);
  assert.deepEqual((await call(first,'/readyz')).data,{status:'ok',database:'postgres'});
  assert.ok((await call(first,'/api/openapi.json')).data.paths['/readyz']);
});

test('nonowner RLS sees only signed-claim room; anonymous privileges and secrets stay unavailable', async () => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`grant select on public.shopping_items to ${roleName}; set local role ${roleName}`);
    assert.equal((await client.query('select * from public.foods')).rowCount,0);
    await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',room_code:firstCode})]);
    const foods=await client.query('select room_code from public.foods'); assert.ok(foods.rowCount>0); assert.ok(foods.rows.every(row=>row.room_code===firstCode));
    assert.equal((await client.query('select * from public.foods where room_code=$1',[secondCode])).rowCount,0);
    for(const sql of ['select passcode_hash from public.rooms','select * from public.push_subscriptions','select * from sharefridge_private.rate_limits',`insert into public.foods(room_code,name,compartment,expiry_date) values('${firstCode}','Forbidden','CRISPER',now())`]) {
      await client.query('savepoint forbidden');
      await assert.rejects(client.query(sql),error=>error.code==='42501');
      await client.query('rollback to savepoint forbidden');
    }
    await client.query('ROLLBACK');
    assert.equal((await pool.query("select has_table_privilege('public','public.rooms','SELECT') as rooms,has_table_privilege('public','public.foods','INSERT') as writes")).rows[0].rooms,false);
    assert.equal((await pool.query("select has_table_privilege('public','public.foods','INSERT') as writes")).rows[0].writes,false);
  } finally { await client.query('ROLLBACK').catch(()=>{});client.release(); }
});

test('real PostgreSQL handler rejects missing/default/weak production session secret before creating room', async () => {
  const saved={NODE_ENV:process.env.NODE_ENV,SESSION_SECRET:process.env.SESSION_SECRET};
  const absentCode=await code();
  process.env.NODE_ENV='production';
  try {
    const handler=createApiHandler(repository);
    for(const secret of [undefined,'sharefridge-secure-salt-key-2026','x'.repeat(64)]) {
      if(secret===undefined) delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=secret;
      let status,data;
      await handler({url:'/api/auth/create-room',method:'POST',headers:{},socket:{remoteAddress:'C019-secret-fixture'},body:{code:absentCode,passcode:'6789'}},{writeHead(code){status=code;},end(body){data=JSON.parse(body);}});
      assert.equal(status,503);assert.equal(data.code,'SESSION_UNAVAILABLE');
      assert.equal(await repository.getRoom(absentCode),null);
    }
  } finally {
    for(const [key,value] of Object.entries(saved)) { if(value===undefined) delete process.env[key];else process.env[key]=value; }
  }
});

test('readiness fails without migration, expected column, or production DATABASE_URL; no RAM fallback', async () => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("delete from sharefridge_private.schema_migrations where version='001_durable_repository'");
    const local=createPostgresRepository({pool:{query:(...args)=>client.query(...args)}});
    assert.equal(await local.ready(),false);
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query('alter table public.foods rename column storage_path to c019_temp_storage_path');
    assert.equal(await local.ready(),false);
    await client.query('ROLLBACK');
  } finally { await client.query('ROLLBACK').catch(()=>{});client.release(); }
  const saved={NODE_ENV:process.env.NODE_ENV,DATABASE_URL:process.env.DATABASE_URL};
  process.env.NODE_ENV='production';delete process.env.DATABASE_URL;
  try {
    assert.throws(()=>createMemoryRepository(),{code:'DATABASE_UNAVAILABLE'});
    let status,data;
    const handler=createApiHandler();
    const response={writeHead(code){status=code;},end(body){data=JSON.parse(body);}};
    await handler({url:'/readyz',method:'GET',headers:{}},response);
    assert.equal(status,503);assert.deepEqual(data,{status:'unavailable',database:'unavailable'});
    await handler({url:'/api/auth/create-room',method:'POST',headers:{},body:{code:'999999',passcode:'6789'}},response);
    assert.equal(status,503);assert.deepEqual(data,{error:'Database service is not configured.',code:'DATABASE_UNAVAILABLE'});
    await handler({url:'/healthz',method:'GET',headers:{}},response);assert.equal(status,200);
  } finally {
    for(const [key,value] of Object.entries(saved)) { if(value===undefined) delete process.env[key];else process.env[key]=value; }
  }
});
