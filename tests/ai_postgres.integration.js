import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { runMigrations } from '../server/migrate.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required; use a disposable local database. This gate never silently skips.');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:3000,max:5});
const ownedCodes=[], workers=[];
const fixtureIp=`2001:db8:${crypto.randomBytes(2).toString('hex')}:${crypto.randomBytes(2).toString('hex')}::23`;
const bucket=value=>crypto.createHash('sha256').update(value).digest('hex');
const secret=crypto.randomBytes(48).toString('base64url');
let first,second,session,other;
async function start() {
  const child=spawn(process.execPath,['tests/postgres-worker.js'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:{...process.env,VERCEL:'1',NODE_ENV:'production',DATABASE_URL:process.env.TEST_DATABASE_URL,SESSION_SECRET:secret,GEMINI_API_KEY:''}});
  const worker={child,url:null,stopped:false};workers.push(worker);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Worker failed to start')),10000);
    let output='';
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',status=>{clearTimeout(timer);if(!worker.url)reject(new Error(`Worker exited: ${status}`));});
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();if(!output.includes('\n'))return;
      try {worker.url=`http://127.0.0.1:${JSON.parse(output.split('\n')[0]).port}`;clearTimeout(timer);resolve();}
      catch {clearTimeout(timer);reject(new Error('Malformed worker startup'));}
    });
    child.stderr.on('data',()=>{});
  });return worker;
}
async function stop(worker) {
  if(worker.stopped||worker.child.exitCode!==null)return;worker.stopped=true;
  await new Promise(resolve=>{const timer=setTimeout(()=>worker.child.kill('SIGKILL'),3000);worker.child.once('exit',()=>{clearTimeout(timer);resolve();});worker.child.kill('SIGTERM');});
}
async function call(worker,path,{method='GET',body,token=session?.token}={}) {
  const response=await fetch(worker.url+path,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':fixtureIp,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
async function createRoom(worker,nickname) {
  // Create only random test-owned rooms; never reset tables or touch app users.
  for(let n=0;n<20;n++) {
    const code=String(crypto.randomInt(100000,1000000));
    if((await pool.query('select 1 from public.rooms where code=$1',[code])).rowCount)continue;
    const result=await call(worker,'/api/auth/create-room',{method:'POST',body:{code,passcode:'6789',nickname}});
    assert.equal(result.status,201);ownedCodes.push(code);return result.body;
  }throw new Error('Could not allocate fixture room');
}
test.before(async()=>{await runMigrations(pool);first=await start();second=await start();session=await createRoom(first,'C023 Actor');other=await createRoom(second,'Other Actor');});
test.after(async()=>{await Promise.all(workers.map(stop));if(ownedCodes.length)await pool.query('delete from public.rooms where code=any($1::text[])',[ownedCodes]);await pool.query('delete from sharefridge_private.rate_limits where bucket=any($1::text[])',[[bucket(`create:${fixtureIp}`),bucket(`join-ip:${fixtureIp}`),...ownedCodes.map(code=>bucket(`join-room:${code}`))]]);await pool.end();});

const add = async (name, days = 3, target = session) => {
  const result = await call(first, '/api/foods', { method:'POST', token:target.token, body:{room_code:target.room.code,name,compartment:'FRIDGE_TOP',shelf_life_days:days} });
  assert.equal(result.status,201); return result.body;
};
const batch = (worker, ids, key = crypto.randomUUID(), addToShopping = true) => call(worker,'/api/foods/consume-batch',{method:'POST',body:{food_ids:ids,idempotency_key:key,add_to_shopping_list:addToShopping}});
const snapshot = async () => ({
  foods:(await pool.query('select id,status,consumed_at from public.foods where room_code=$1 order by id',[session.room.code])).rows,
  shopping:(await pool.query('select id,name from public.shopping_items where room_code=$1 order by id',[session.room.code])).rows,
  revision:(await pool.query('select revision from public.room_sync_versions where room_code=$1',[session.room.code])).rows[0].revision,
  keys:(await pool.query("select key from sharefridge_private.idempotency_keys where room_code=$1 and operation='consume-batch' order by key",[session.room.code])).rows,
});

test('12 concurrent replays on two PostgreSQL processes transition exact IDs once and survive process restart',async()=>{
  const a=await add('C023 duplicate name'),b=await add('C023 duplicate name');
  const key=crypto.randomUUID();
  const results=await Promise.all(Array.from({length:12},(_,i)=>batch(i%2?first:second,i%2?[a.id,b.id]:[b.id,a.id],key)));
  assert.ok(results.every(result=>result.status===200),JSON.stringify(results.map(result=>({status:result.status,code:result.body.code}))));
  for(const result of results)assert.deepEqual(result.body,results[0].body);
  assert.deepEqual(results[0].body.items.map(row=>row.id).sort(),[a.id,b.id].sort());
  assert.ok(results[0].body.items.every(row=>row.consumed_by==='C023 Actor'&&row.consumed_at===results[0].body.consumed_at));
  assert.equal((await pool.query('select count(*)::int n from public.shopping_items where room_code=$1 and name=$2',[session.room.code,a.name])).rows[0].n,2);
  const before=await snapshot();
  assert.equal((await batch(first,[a.id],key)).status,409);
  assert.equal((await batch(first,[a.id,b.id],key,false)).status,409);
  assert.deepEqual(await snapshot(),before);
  await stop(first);first=await start();
  assert.deepEqual((await batch(first,[a.id,b.id],key)).body,results[0].body);
});

test('overlapping batches with different keys have one whole winner without partial consumption or revision deadlock',async()=>{
  const a=await add('Overlap a'),b=await add('Overlap b'),c=await add('Overlap c');
  const before=await snapshot();
  const results=await Promise.all([batch(first,[a.id,b.id]),batch(second,[c.id,b.id])]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  const rows=(await pool.query('select id,status from public.foods where id=any($1::uuid[])',[[a.id,b.id,c.id]])).rows;
  assert.equal(rows.filter(row=>row.status==='CONSUMED').length,2);
  assert.equal(rows.find(row=>row.id===b.id).status,'CONSUMED');
  const after=await snapshot();assert.equal(after.shopping.length-before.shopping.length,2);assert.equal(after.keys.length-before.keys.length,1);
});

test('missing, foreign, expired and duplicate IDs reject before mutation; corrected absolute expiry is authoritative',async()=>{
  const own=await add('Valid'),expired=await add('Expired',0),foreign=await add('Foreign',3,other);
  const before=await snapshot();
  for(const [ids,status] of [[[own.id,foreign.id],404],[[own.id,crypto.randomUUID()],404],[[own.id,expired.id],409],[[own.id,own.id],400],[[],400]]) assert.equal((await batch(first,ids)).status,status);
  assert.deepEqual(await snapshot(),before);
  assert.equal((await call(first,`/api/foods/${expired.id}`,{method:'PATCH',body:{expiry_date:new Date(Date.now()+86400000).toISOString()}})).status,200);
  assert.equal((await batch(first,[expired.id],crypto.randomUUID(),false)).status,200,'expiry update must not retain a stale EXPIRED classification');
});

test('injected shopping insert failure rolls back all food rows, replay record and sync revision',async()=>{
  const marker=`c023_fail_${crypto.randomBytes(6).toString('hex')}`;
  const a=await add(marker),b=await add('Rollback peer');const key=crypto.randomUUID();const before=await snapshot();
  await pool.query(`create function sharefridge_private.${marker}() returns trigger language plpgsql as $$ begin raise exception 'C023 injected failure'; end $$;
    create trigger ${marker} before insert on public.shopping_items for each row when (NEW.room_code='${session.room.code}' and NEW.name='${marker}') execute function sharefridge_private.${marker}();`);
  try {
    const result=await batch(first,[a.id,b.id],key);assert.equal(result.status,500);assert.deepEqual(result.body,{error:'Internal server error',code:'INTERNAL_ERROR'});
    assert.deepEqual(await snapshot(),before);
  } finally {await pool.query(`drop trigger ${marker} on public.shopping_items; drop function sharefridge_private.${marker}();`);}
  assert.equal((await batch(second,[a.id,b.id],key)).status,200);
});

test('held row lock times out safely, releases transaction locks and permits retry after blocker rolls back',async()=>{
  const a=await add('Lock timeout a'),b=await add('Lock timeout b');const key=crypto.randomUUID();
  const before=await snapshot();const blocker=await pool.connect();
  try {
    await blocker.query('begin');await blocker.query('select id from public.foods where id=$1 for update',[b.id]);
    const started=Date.now();const result=await batch(first,[a.id,b.id],key);
    assert.equal(result.status,503);assert.equal(result.body.code,'BATCH_BUSY');assert.ok(Date.now()-started<5000);
    assert.deepEqual(await snapshot(),before);
  } finally {await blocker.query('rollback');blocker.release();}
  assert.equal((await batch(second,[b.id,a.id],key)).status,200);
});

test('a concurrent single consume and batch never leave only part of a losing batch applied',async()=>{
  const a=await add('Single race a'),b=await add('Single race b');
  const results=await Promise.all([batch(first,[a.id,b.id]),call(second,`/api/foods/${b.id}/consume`,{method:'PATCH',body:{add_to_shopping_list:true}})]);
  assert.equal(results[1].status,200);assert.ok([200,409].includes(results[0].status));
  const rows=(await pool.query('select id,status from public.foods where id=any($1::uuid[])',[[a.id,b.id]])).rows;
  assert.equal(rows.find(row=>row.id===a.id).status,results[0].status===200?'CONSUMED':'FRESH');
  for(const item of [a,b])assert.equal((await pool.query('select count(*)::int n from public.shopping_items where room_code=$1 and name=$2',[session.room.code,item.name])).rows[0].n,item===a&&results[0].status===409?0:1);
});
