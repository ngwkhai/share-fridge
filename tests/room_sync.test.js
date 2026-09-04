import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import http from 'node:http';
import { createMemoryRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';
const load = async path => {
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const {createRoomSyncController}=await load('../src/services/roomSync.ts');
const {api}=await load('../src/services/api.ts');
const session={code:'721021',name:'Sync',nickname:'A',token:'session-a',cached_at:0};
const room={id:'stable-room',code:session.code,name:'Sync',created_at:'2026-01-01T00:00:00.000Z',active_food_count:0,urgent_food_count:0};
const empty=()=>({room,foods:[],consumed:[],shopping:[],savedAt:Date.now()});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(read=async()=>empty()) {
  const saved=new Map(); let online=true,invalidated=0;
  const controller=createRoomSyncController({read,cached:code=>saved.get(code)||null,save:(code,data)=>saved.set(code,data),online:()=>online,invalidate:()=>invalidated++});
  controller.activate(session);controller.capture().transport('polling');
  return {controller,saved,offline:()=>online=false,online:()=>online=true,invalidated:()=>invalidated};
}

test('two controllers use actual HTTP: delete final item, reload/reconnect remain empty and no cache POST replay',async()=>{
  const handler=createApiHandler(createMemoryRepository());const requests=[];
  const server=http.createServer(async(req,res)=>{requests.push([req.method,req.url]);if(!await handler(req,res)){res.writeHead(404);res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  let token='';
  const call=async(path,method='GET',body)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data;
  };
  try {
    const auth=await call('/api/auth/create-room','POST',{code:session.code,passcode:'6789'});token=auth.token;
    const food=await call('/api/foods','POST',{room_code:session.code,name:'Expired final food',compartment:'CRISPER',shelf_life_days:0});
    const read=async()=>{const[r,a,c,s]=await Promise.all([call(`/api/rooms/${session.code}`),call(`/api/foods?room_code=${session.code}&status=active`),call(`/api/foods?room_code=${session.code}&status=consumed`),call(`/api/shopping-items?room_code=${session.code}`)]);return{room:r,foods:a.items,consumed:c.items,shopping:s.items,savedAt:Date.now()};};
    const a=fixture(read),b=fixture(read);await Promise.all([a.controller.refresh(),b.controller.refresh()]);
    assert.equal(b.controller.getState().snapshot.foods[0].id,food.id);assert.equal(food.expiry_date,food.added_date);
    await a.controller.mutate(session.token,()=>call(`/api/foods/${food.id}`,'DELETE'));
    // Device B reloads the stale saved copy, then gets an authoritative empty list.
    b.controller.activate(session);assert.equal(b.controller.getState().snapshot.foods.length,1);
    await b.controller.refresh();assert.deepEqual(b.saved.get(session.code).foods,[]);
    b.controller.activate(session);await b.controller.capture().refresh();assert.deepEqual(b.controller.getState().snapshot.foods,[]);
    assert.equal(requests.filter(([method,path])=>method==='POST'&&path==='/api/foods').length,1);
    const second=await call('/api/foods','POST',{room_code:session.code,name:'Consume me',compartment:'DOOR',shelf_life_days:3});
    await a.controller.mutate(session.token,()=>call(`/api/foods/${second.id}/consume`,'PATCH',{add_to_shopping_list:true}));
    await b.controller.refresh();const synced=b.controller.getState().snapshot;
    assert.equal(synced.consumed[0].id,second.id);assert.equal(synced.consumed[0].expiry_date,second.expiry_date);assert.equal(synced.shopping.length,1);
    await call(`/api/foods/${second.id}`,'DELETE');await call(`/api/shopping-items/${synced.shopping[0].id}`,'DELETE');await b.controller.refresh();
    assert.deepEqual(b.controller.getState().snapshot.consumed,[]);assert.deepEqual(b.controller.getState().snapshot.shopping,[]);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('late pre-mutation snapshot cannot resurrect a deleted row',async()=>{
  const old=deferred();let reads=0;const f=fixture(()=>++reads===1?old.promise:Promise.resolve(empty()));
  const pending=f.controller.refresh();await f.controller.mutate(session.token,async()=>{});
  old.resolve({...empty(),foods:[{id:'deleted'}]});await pending;
  assert.deepEqual(f.controller.getState().snapshot.foods,[]);
});

test('direct room delta updates a complete peer snapshot immediately and tombstones prevent late resurrection',async()=>{
  const f=fixture();await f.controller.refresh();
  const food={id:'delta-food',room_code:session.code,name:'Peer item',compartment:'DOOR',added_date:'2026-01-01T00:00:00.000Z',expiry_date:'2026-01-04T00:00:00.000Z',days_remaining:3,status:'FRESH'};
  assert.equal(f.controller.applyDelta({resource:'food',operation:'upsert',item:food}),true);
  assert.equal(f.controller.getState().snapshot.foods[0].id,food.id);
  assert.equal(f.saved.get(session.code).foods[0].id,food.id);
  assert.equal(f.controller.applyDelta({resource:'food',operation:'delete',id:food.id,room_code:session.code}),true);
  assert.deepEqual(f.controller.getState().snapshot.foods,[]);
  assert.equal(f.controller.applyDelta({resource:'food',operation:'upsert',item:food}),false,'a delayed peer event cannot bring back a deleted stable ID');
  assert.deepEqual(f.controller.getState().snapshot.foods,[]);
});

test('untrusted realtime deltas with invalid room or item shape do not alter a snapshot',async()=>{
  const f=fixture();await f.controller.refresh();const before=f.controller.getState().snapshot;
  for(const delta of [null,{}, {resource:'food',operation:'upsert'}, {resource:'shopping',operation:'upsert',item:null}, {resource:'food',operation:'invalid'}]) {
    assert.equal(f.controller.applyDelta(delta),false,'malformed payload must be rejected without throwing');
  }
  assert.equal(f.controller.applyDelta({resource:'food',operation:'delete',id:'x',room_code:'foreign'}),false);
  assert.equal(f.controller.applyDelta({resource:'food',operation:'upsert',item:{id:'x',room_code:session.code}}),false);
  assert.equal(f.controller.getState().snapshot,before);
});

test('a delta callback from an old session cannot delete data after rejoining the same room',async()=>{
  const food={id:'same-room-food',room_code:session.code};
  const f=fixture(async()=>({...empty(),foods:[food]}));await f.controller.refresh();
  const old=f.controller.capture();
  f.controller.activate({...session,token:'replacement-token'});await f.controller.refresh();
  const delta={resource:'food',operation:'delete',id:food.id,room_code:session.code};
  assert.equal(old.delta(delta),false);
  assert.equal(f.controller.getState().snapshot.foods.length,1);
  assert.equal(f.controller.capture().delta(delta),true);
  assert.deepEqual(f.controller.getState().snapshot.foods,[]);
});

test('delta invalidates an older read without leaving refreshing stuck',async()=>{
  const pending=deferred();let reads=0;
  const f=fixture(()=>++reads===1?Promise.resolve(empty()):pending.promise);await f.controller.refresh();
  const read=f.controller.refresh();assert.equal(f.controller.getState().refreshing,true);
  assert.equal(f.controller.applyDelta({resource:'food',operation:'delete',id:'removed',room_code:session.code}),true);
  assert.equal(f.controller.getState().refreshing,false);
  pending.resolve({...empty(),foods:[{id:'removed'}]});await read;
  assert.deepEqual(f.controller.getState().snapshot.foods,[]);
  assert.equal(f.controller.getState().refreshing,false);
});

test('a peer delta is emitted after server success before the source device waits for its full refresh',async()=>{
  const refresh=deferred(),announced=deferred();const f=fixture(()=>refresh.promise);
  const mutation=f.controller.mutate(session.token,async()=>({id:'accepted-write'}),value=>announced.resolve(value));
  assert.deepEqual(await announced.promise,{id:'accepted-write'},'the low-latency hint is not held behind REST refresh');
  refresh.resolve(empty());await mutation;
});

test('logout and room switch invalidate delayed reads, callbacks and auth failures',async()=>{
  const old=deferred();const f=fixture(()=>old.promise);const callbacks=f.controller.capture();const pending=f.controller.refresh();
  f.controller.activate({...session,code:'721022',token:'session-b'});
  callbacks.transport('connected');callbacks.error(Object.assign(new Error('Expired old session'),{status:401}));await callbacks.refresh();
  old.resolve(empty());await pending;assert.equal(f.controller.getState().session.code,'721022');assert.equal(f.controller.getState().snapshot,null);assert.equal(f.invalidated(),0);
  f.controller.activate(null);callbacks.transport('connected');assert.equal(f.controller.getState().session,null);
});

test('late successful write and queued writes cannot affect a replacement session',async()=>{
  const wait=deferred();const f=fixture();let executed=0;
  const first=f.controller.mutate(session.token,()=>wait.promise);const second=f.controller.mutate(session.token,async()=>executed++);
  const rejected1=assert.rejects(first,e=>e.code==='SESSION_CHANGED'),rejected2=assert.rejects(second,e=>e.code==='SESSION_CHANGED');
  await Promise.resolve();f.controller.activate({...session,token:'new-session'});wait.resolve('saved old room');
  await Promise.all([rejected1,rejected2]);assert.equal(executed,0);assert.equal(f.controller.getState().snapshot,null);
});

test('offline writes never execute; failed refresh keeps snapshot; 403 retains session; 401 clears it',async()=>{
  let fault=null;const f=fixture(async()=>{if(fault)throw fault;return empty();});await f.controller.refresh();const previous=f.controller.getState().snapshot;
  f.offline();f.controller.connectivityChanged();let writes=0;await assert.rejects(()=>f.controller.mutate(session.token,async()=>writes++),e=>e.code==='OFFLINE');assert.equal(writes,0);assert.equal(f.controller.getState().status,'offline');
  f.online();fault=new Error('Network lost');await f.controller.refresh();assert.equal(f.controller.getState().snapshot,previous);assert.equal(f.controller.getState().status,'reconnecting');
  fault=null;await assert.rejects(()=>f.controller.mutate(session.token,async()=>{throw Object.assign(new Error('Forbidden'),{status:403});}));assert.equal(f.controller.getState().session.token,session.token);assert.equal(f.invalidated(),0);
  fault=Object.assign(new Error('Expired'),{status:401});await f.controller.refresh();assert.equal(f.controller.getState().session,null);assert.equal(f.invalidated(),1);
});

test('SUBSCRIBED waits for refreshed snapshot before connected status',async()=>{
  const f=fixture();await f.controller.refresh();assert.equal(f.controller.getState().status,'polling');
  f.controller.capture().transport('connected');assert.equal(f.controller.getState().status,'reconnecting');await f.controller.refresh();assert.equal(f.controller.getState().status,'connected');
});

test('actual cache preserves stable IDs/absolute expiry, ages status, accepts empty, and clears on logout',async()=>{
  const prior=globalThis.localStorage;const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  try {
    api.sessionCache.save(session);
    const expiry='2020-01-01T00:00:00.000Z';const food={id:'fixed-id',room_code:session.code,name:'Old',compartment:'CRISPER',added_date:expiry,expiry_date:expiry,days_remaining:3,status:'FRESH'};
    api.foodCache.saveSnapshot(session.code,{...empty(),foods:[food]});const cached=api.foodCache.getSnapshot(session.code);assert.equal(cached.foods[0].id,'fixed-id');assert.equal(cached.foods[0].expiry_date,expiry);assert.equal(cached.foods[0].status,'EXPIRED');
    api.foodCache.saveSnapshot(session.code,empty());assert.deepEqual(api.foodCache.getSnapshot(session.code).foods,[]);
    api.sessionCache.clear();assert.equal(api.foodCache.getSnapshot(session.code),null);assert.equal(api.sessionCache.get(),null);
  } finally {if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior;}
});

test('canonical session token wins cross-tab write ordering and late login cannot restore logout',async()=>{
  const priorStorage=globalThis.localStorage,priorFetch=globalThis.fetch;const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  try{
    api.sessionCache.save(session);map.set('sharefridge_session_token','stale-legacy-token');let authorization;
    globalThis.fetch=async(_path,options)=>{authorization=options.headers.Authorization;return new Response(JSON.stringify({items:[],total:0}),{status:200});};
    await api.getFoods(session.code,'active');assert.equal(authorization,'Bearer session-a');
    const pending=deferred();globalThis.fetch=()=>pending.promise;
    const login=api.joinRoomWithPasscode(session.code,'6789');const rejected=assert.rejects(login,e=>e.code==='SESSION_CHANGED');
    api.sessionCache.clear();pending.resolve(new Response(JSON.stringify({room,token:'late-token',nickname:'Late member'}),{status:200}));await rejected;assert.equal(api.sessionCache.get(),null);
  }finally{globalThis.fetch=priorFetch;if(priorStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=priorStorage;}
});

test('session switch during post-write refresh rejects completion for the old UI',async()=>{
  const entered=deferred(),snapshot=deferred();const f=fixture(()=>{entered.resolve();return snapshot.promise;});
  const mutation=f.controller.mutate(session.token,async()=>({id:'old-room-write'}));
  const rejected=assert.rejects(mutation,e=>e.code==='SESSION_CHANGED');await entered.promise;
  f.controller.activate({...session,code:'721022',token:'new-room-token'});snapshot.resolve(empty());await rejected;
  assert.equal(f.controller.getState().session.token,'new-room-token');assert.equal(f.controller.getState().snapshot,null);
});
