import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {runMigrations} from '../server/migrate.js';
import {createPostgresRepository} from '../server/repository.js';
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL must name a disposable PostgreSQL database.');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const repo=createPostgresRepository({pool});
const role=`c021_${crypto.randomBytes(6).toString('hex')}`;
const codes=[];let ownsPublication=false;
const allocate=async()=>{for(let n=0;n<50;n++){const code=String(crypto.randomInt(100000,1000000));if(!(await pool.query('select 1 from public.rooms where code=$1',[code])).rowCount){codes.push(code);return code;}}throw new Error('code allocation failed');};
const revision=async code=>Number((await pool.query('select revision from public.room_sync_versions where room_code=$1',[code])).rows[0]?.revision||0);
test.before(async()=>{
  await runMigrations(pool);
  if(!(await pool.query("select 1 from pg_publication where pubname='supabase_realtime'")).rowCount){await pool.query('create publication supabase_realtime');ownsPublication=true;}
  await runMigrations(pool);await runMigrations(pool);
  await pool.query(`create role ${role} nologin nosuperuser nobypassrls;grant usage on schema public to ${role};grant select on public.room_sync_versions to ${role};`);
});
test.after(async()=>{
  if(codes.length)await pool.query('delete from public.rooms where code=any($1::text[])',[codes]);
  await pool.query(`drop owned by ${role};drop role ${role};`);
  if(ownsPublication)await pool.query('drop publication supabase_realtime');
  await pool.end();
});
test('revision triggers capture food/shopping changes and rollback atomically, preserving IDs/dates',async()=>{
  const code=await allocate();await repo.createRoom({id:crypto.randomUUID(),code,name:'C021 private',passcode_hash:'test-only',salt:'test-only',created_at:new Date().toISOString()});
  const stamp='2026-01-01T00:00:00.000Z';const food={id:crypto.randomUUID(),room_code:code,name:'C021 food',compartment:'CRISPER',added_date:stamp,expiry_date:stamp,status:'EXPIRED'};
  await repo.createFood(food);assert.equal(await revision(code),1);
  await repo.consumeFood(food.id,code,'C021',true);assert.equal(await revision(code),3);
  const saved=await repo.getFood(food.id,code);assert.equal(saved.id,food.id);assert.equal(saved.expiry_date,stamp);
  const client=await pool.connect();try{await client.query('begin');await client.query('delete from public.foods where id=$1',[food.id]);await client.query('rollback');}finally{client.release();}
  assert.equal(await revision(code),3);assert.ok(await repo.getFood(food.id,code));
  await repo.deleteFood(food.id,code);assert.equal(await revision(code),4);
  const shopping=(await repo.listShopping(code))[0];await repo.toggleShopping(shopping.id,code,true,false);assert.equal(await revision(code),5);await repo.deleteShopping(shopping.id,code);assert.equal(await revision(code),6);
  await runMigrations(pool);assert.equal(await revision(code),6);
});
test('nonowner room-claim RLS isolates revisions and rejects client writes/trigger execution',async()=>{
  const own=codes[0],other=await allocate();await repo.createRoom({id:crypto.randomUUID(),code:other,name:'Other',passcode_hash:'x',salt:'x',created_at:new Date().toISOString()});await runMigrations(pool);
  const client=await pool.connect();try{
    await client.query('begin');await client.query(`set local role ${role}`);
    assert.equal((await client.query('select * from public.room_sync_versions')).rowCount,0);
    await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({room_code:own})]);
    assert.deepEqual((await client.query('select room_code from public.room_sync_versions')).rows.map(r=>r.room_code),[own]);
    await client.query('rollback');
    for(const sql of ["update public.room_sync_versions set revision=999",'select sharefridge_private.bump_room_sync()']){
      await client.query('begin');await client.query(`set local role ${role}`);await assert.rejects(()=>client.query(sql),e=>e.code==='42501');await client.query('rollback');
    }
  }finally{await client.query('rollback');client.release();}
});
test('realtime readiness requires revision-only publication and refuses raw or all-table publishing',async()=>{
  assert.equal(await repo.realtimeReady(),true);
  const before=await pool.query("select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('foods','shopping_items')");assert.equal(before.rowCount,0);
  await pool.query('alter publication supabase_realtime add table public.foods');
  try{assert.equal(await repo.realtimeReady(),false);}finally{await runMigrations(pool);}
  assert.equal(await repo.realtimeReady(),true);
  // Only a publication created by this disposable test can be replaced.
  if(ownsPublication){
    await pool.query('drop publication supabase_realtime');await pool.query('create publication supabase_realtime for all tables');
    try{assert.equal(await repo.realtimeReady(),false);}finally{await pool.query('drop publication supabase_realtime');await pool.query('create publication supabase_realtime');await runMigrations(pool);}
  }
});
