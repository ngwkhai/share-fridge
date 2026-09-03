import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { runMigrations } from '../server/migrate.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required; use a disposable local database. This gate never silently skips.');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:3000,max:5});
const ownedCodes=[], workers=[];
const fixtureIp=`2001:db8:${crypto.randomBytes(2).toString('hex')}:${crypto.randomBytes(2).toString('hex')}::20`;
const bucket=value=>crypto.createHash('sha256').update(value).digest('hex');
const secret=crypto.randomBytes(48).toString('base64url');
let first,second,session,other,movedId,shoppingId;
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
test.before(async()=>{await runMigrations(pool);first=await start();second=await start();session=await createRoom(first,'C020 Actor');other=await createRoom(second,'Other Actor');});
test.after(async()=>{await Promise.all(workers.map(stop));if(ownedCodes.length)await pool.query('delete from public.rooms where code=any($1::text[])',[ownedCodes]);await pool.query('delete from sharefridge_private.rate_limits where bucket=any($1::text[])',[[bucket(`create:${fixtureIp}`),bucket(`join-ip:${fixtureIp}`),...ownedCodes.map(code=>bucket(`join-room:${code}`))]]);await pool.end();});

test('two independent PostgreSQL workers move a shopping item once under concurrent requests',async()=>{
  assert.notEqual(first.child.pid,second.child.pid);
  const created=await call(first,'/api/shopping-items',{method:'POST',body:{room_code:session.room.code,name:'C020 durable move',quantity:'2 hộp'}});
  assert.equal(created.status,201);shoppingId=created.body.id;
  const results=await Promise.all(Array.from({length:12},(_,i)=>call(i%2?first:second,`/api/shopping-items/${shoppingId}/toggle`,{method:'PATCH',body:{is_bought:true,move_to_fridge:true,compartment:'FREEZER'}})));
  assert.ok(results.every(r=>r.status===200&&r.body.is_bought));
  const rows=(await pool.query('select * from public.foods where room_code=$1 and name=$2',[session.room.code,'C020 durable move'])).rows;
  assert.equal(rows.length,1);movedId=rows[0].id;
  assert.equal(rows[0].created_by,'C020 Actor');assert.equal(rows[0].compartment,'FREEZER');
  assert.equal(rows[0].expiry_date.getTime()-rows[0].added_date.getTime(),3*86400000);
  assert.equal((await pool.query("select count(*)::int n from sharefridge_private.idempotency_keys where room_code=$1 and operation='shopping-move' and key=$2",[session.room.code,shoppingId])).rows[0].n,1);
});

test('uncheck/recheck, moved-food deletion, and fresh worker retries do not duplicate the same purchase',async()=>{
  await stop(first);first=await start();
  assert.equal((await call(first,`/api/shopping-items/${shoppingId}/toggle`,{method:'PATCH',body:{is_bought:false}})).status,200);
  assert.equal((await call(first,`/api/shopping-items/${shoppingId}/toggle`,{method:'PATCH',body:{is_bought:true,move_to_fridge:true}})).status,200);
  assert.equal((await call(first,`/api/foods?room_code=${session.room.code}&status=active`)).body.total,1);
  const deleted=await call(first,`/api/foods/${movedId}`,{method:'DELETE'});assert.deepEqual(deleted.body,{success:true,deleted_id:movedId});
  assert.equal((await call(second,`/api/shopping-items/${shoppingId}/toggle`,{method:'PATCH',body:{is_bought:true,move_to_fridge:true}})).status,200);
  assert.equal((await call(second,`/api/foods?room_code=${session.room.code}&status=active`)).body.total,0,'a retry may not resurrect a deleted transferred food');
});

test('food insert failure rolls back bought state and replay marker; retry succeeds after recovery',async()=>{
  const marker=`c020_fail_${crypto.randomBytes(6).toString('hex')}`;
  const created=await call(first,'/api/shopping-items',{method:'POST',body:{room_code:session.room.code,name:marker}});
  const id=created.body.id;
  await pool.query(`create function sharefridge_private.${marker}() returns trigger language plpgsql as $$ begin raise exception 'C020 injected insert failure'; end $$;
    create trigger ${marker} before insert on public.foods for each row when (NEW.room_code='${session.room.code}' and NEW.name='${marker}') execute function sharefridge_private.${marker}();`);
  try {
    const result=await call(first,`/api/shopping-items/${id}/toggle`,{method:'PATCH',body:{is_bought:true,move_to_fridge:true}});
    assert.equal(result.status,500);assert.deepEqual(result.body,{error:'Internal server error',code:'INTERNAL_ERROR'});
    assert.equal((await pool.query('select is_bought from public.shopping_items where id=$1',[id])).rows[0].is_bought,false);
    assert.equal((await pool.query("select count(*)::int n from sharefridge_private.idempotency_keys where room_code=$1 and operation='shopping-move' and key=$2",[session.room.code,id])).rows[0].n,0);
  } finally {await pool.query(`drop trigger ${marker} on public.foods; drop function sharefridge_private.${marker}();`);}
  const retry=await call(second,`/api/shopping-items/${id}/toggle`,{method:'PATCH',body:{is_bought:true,move_to_fridge:true}});assert.equal(retry.status,200);
  const saved=(await pool.query('select * from public.foods where room_code=$1 and name=$2',[session.room.code,marker])).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].compartment,'FRIDGE_TOP');
});

test('PostgreSQL edit is room-scoped, preserves history identity, and normalizes optional null fields',async()=>{
  const created=await call(first,'/api/foods',{method:'POST',body:{room_code:session.room.code,name:'C020 edit',compartment:'CRISPER',shelf_life_days:0}});
  assert.equal(created.status,201);assert.equal(created.body.status,'EXPIRED');assert.equal(created.body.expiry_date,created.body.added_date);
  const id=created.body.id;
  await pool.query('update public.foods set quantity=null,container_tag=null,created_by=null where id=$1',[id]);
  const expiry=new Date(Date.now()+7*86400000).toISOString();
  const edited=await call(second,`/api/foods/${id}`,{method:'PATCH',body:{name:'Edited durable',expiry_date:expiry,notes:'Updated'}});
  assert.equal(edited.status,200);assert.equal(edited.body.status,'FRESH');assert.equal(edited.body.expiry_date,expiry);
  for(const key of ['quantity','container_tag','created_by'])assert.equal(Object.hasOwn(edited.body,key),false);
  for(const path of [`/api/foods/${id}`,`/api/shopping-items/${shoppingId}/toggle`]) {
    const result=await call(second,path,{method:'PATCH',token:other.token,body:path.includes('toggle')?{is_bought:true,move_to_fridge:true}:{name:'Forbidden'}});assert.equal(result.status,404);
  }
  const used=await call(second,`/api/foods/${id}/consume`,{method:'PATCH',body:{consumed_by:'Spoof'}});assert.equal(used.body.consumed_by,'C020 Actor');
  const editedHistory=await call(first,`/api/foods/${id}`,{method:'PATCH',body:{notes:'History note'}});assert.equal(editedHistory.body.status,'CONSUMED');assert.equal(editedHistory.body.consumed_at,used.body.consumed_at);
  const history=await call(second,`/api/foods?room_code=${session.room.code}&status=consumed`);assert.equal(history.body.total,1);assert.equal(history.body.items[0].id,id);assert.equal(Number.isInteger(history.body.items[0].days_remaining),true);
  for(const path of ['/api/foods/not-a-uuid','/api/shopping-items/not-a-uuid'])assert.equal((await call(first,path,{method:'DELETE'})).status,404);
});
