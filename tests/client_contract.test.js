import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import Ajv from 'ajv';
import { createMemoryRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';
import { createServerlessHandler } from '../api/index.js';

// Execute the same TypeScript client imported by App, with types erased only.
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/services/api.ts',import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { api, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const store = new Map();
const db = createMemoryRepository();
const handler = createServerlessHandler(createApiHandler(db));
const seen = [];
let server, base, fault = null, first, second;
const schema = JSON.parse(fs.readFileSync(new URL('../server/openapi.json',import.meta.url),'utf8'));
const ajv = new Ajv({ allErrors:true, nullable:true, jsonPointers:true });
const converted = x => JSON.parse(JSON.stringify(x).replaceAll('#/components/schemas/','#/definitions/'));
const validateSchema = (name,data) => {
  const validate = ajv.compile({ $ref:`#/definitions/${name}`, definitions:converted(schema.components.schemas) });
  assert.equal(validate(data),true,`${name}: ${JSON.stringify(validate.errors)}`);
};
const raw = async (path,method='GET',body,token=first?.token) => {
  const response = await originalFetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body === undefined ? undefined : JSON.stringify(body)});
  return { status:response.status, body:await response.json() };
};
const fail = (status,code) => error => error instanceof ApiError && error.status === status && error.code === code;
const withVapid = async operation => {
  const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const priv=ecdh.getPrivateKey();
  const saved={VAPID_PUBLIC_KEY:process.env.VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY:process.env.VAPID_PRIVATE_KEY,VAPID_SUBJECT:process.env.VAPID_SUBJECT};
  process.env.VAPID_PUBLIC_KEY=ecdh.getPublicKey().toString('base64url');
  process.env.VAPID_PRIVATE_KEY=Buffer.concat([Buffer.alloc(Math.max(0,32-priv.length)),priv]).subarray(-32).toString('base64url');
  process.env.VAPID_SUBJECT='mailto:test@example.com';
  try { return await operation(); }
  finally { for(const key of Object.keys(saved)) if(saved[key]===undefined) delete process.env[key]; else process.env[key]=saved[key]; }
};

test.before(async () => {
  globalThis.localStorage = { getItem:key=>store.get(key)||null, setItem:(key,value)=>store.set(key,value), removeItem:key=>store.delete(key) };
  server=http.createServer(async(req,res)=>{
    if (fault === 'malformed') {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({items:[],total:'0'}));return;}
    if (fault === 'nonjson') {res.writeHead(500);res.end('<html>private diagnostics</html>');return;}
    await handler(req,res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (path,options) => {
    if (fault === 'network') throw new Error('simulated offline');
    const response=await originalFetch(new URL(path,base),options);
    const json=await response.clone().json().catch(()=>null);
    seen.push({path,method:options?.method||'GET',status:response.status,body:json,fault,request:options?.body ? JSON.parse(options.body) : undefined});
    return response;
  };
  first=await api.createRoomWithPasscode('620020','Contract first','6789','Actor One');
  second=await api.createRoomWithPasscode('620021','Contract second','9876','Actor Two');
  await api.joinRoomWithPasscode(first.room.code,'6789','Actor One');
});
test.after(async()=>{
  globalThis.fetch=originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage=originalStorage;
  await new Promise(resolve=>server.close(resolve));
});

test('actual client creates, edits, consumes, reads history, moves shopping exactly once, and deletes',async()=>{
  validateSchema('Health',await api.getHealth());
  validateSchema('AuthSession',first);
  validateSchema('VerifiedSession',await api.verifyToken());
  validateSchema('RoomDetail',await api.getRoom(first.room.code));
  const added=await api.addFood({room_code:first.room.code,name:'  Rau cải  ',quantity:'500g',compartment:'CRISPER',shelf_life_days:0,created_by:'Spoof'});
  validateSchema('FoodItem',added);
  assert.equal(added.name,'Rau cải');assert.equal(added.status,'EXPIRED');assert.equal(added.created_by,'Actor One');
  assert.equal(added.expiry_date,added.added_date,'zero days must not silently become three');
  const expiry=new Date(Date.now()+86400000).toISOString();
  const edited=await api.updateFood(added.id,{name:'Rau xanh',quantity:'700g',compartment:'FRIDGE_BOTTOM',container_tag:'Hộp xanh',expiry_date:expiry,notes:'Nấu tối'});
  assert.equal(edited.id,added.id);assert.equal(edited.expiry_date,expiry);assert.equal(edited.status,'COOK_SOON');
  validateSchema('FoodList',await api.getFoods(first.room.code,'active'));
  const used=await api.consumeFood(added.id,undefined,false);
  assert.equal(used.status,'CONSUMED');assert.equal(used.consumed_by,'Actor One');assert.ok(used.consumed_at);
  assert.equal((await api.getShoppingItems(first.room.code)).total,0,'existing third positional false must reach add_to_shopping_list');
  const refill=await api.addFood({room_code:first.room.code,name:'Trứng',compartment:'DOOR',shelf_life_days:3});
  await Promise.all(Array.from({length:8},()=>api.consumeFood(refill.id,undefined,true)));
  const history=await api.getFoods(first.room.code,'consumed');validateSchema('FoodList',history);assert.equal(history.total,2);
  const shopping=await api.getShoppingItems(first.room.code);validateSchema('ShoppingList',shopping);assert.equal(shopping.total,1);
  const item=shopping.items[0];
  await Promise.all(Array.from({length:8},()=>api.toggleShoppingItem(item.id,true,true,'FREEZER')));
  await api.toggleShoppingItem(item.id,false);
  await api.toggleShoppingItem(item.id,true,true,'FREEZER');
  const moved=(await api.getFoods(first.room.code,'active')).items;assert.equal(moved.length,1);assert.equal(moved[0].compartment,'FREEZER');assert.equal(moved[0].created_by,'Actor One');
  assert.equal(Date.parse(moved[0].expiry_date)-Date.parse(moved[0].added_date),3*86400000);
  const manual=await api.addShoppingItem({room_code:first.room.code,name:'Sữa',quantity:'1 hộp'});validateSchema('ShoppingItem',manual);
  await api.toggleShoppingItem(manual.id,true);
  await api.deleteShoppingItem(manual.id);
  await api.deleteShoppingItem(item.id);
  await api.deleteFood(added.id);await api.deleteFood(refill.id);await api.deleteFood(moved[0].id);
  assert.deepEqual(await api.getFoods(first.room.code,'active'),{items:[],total:0});
  assert.deepEqual(await api.getFoods(first.room.code,'consumed'),{items:[],total:0});
  assert.deepEqual(await api.getShoppingItems(first.room.code),{items:[],total:0});
  assert.ok(seen.some(r=>r.path===`/api/foods/${added.id}/consume`&&r.method==='PATCH'&&r.request.add_to_shopping_list===false));
  for(const result of seen.filter(r=>r.method==='DELETE'&&r.status===200)) validateSchema('Deleted',result.body);
});

test('invalid DTOs and boolean coercion fail 400 without mutations',async()=>{
  const baseFood={room_code:first.room.code,name:'Food',compartment:'CRISPER',shelf_life_days:3};
  for(const change of [{name:''},{name:'x'.repeat(201)},{name:45},{compartment:'GARAGE'},{shelf_life_days:'3'},{shelf_life_days:-1},{shelf_life_days:366},{shelf_life_days:0.5},{quantity:[]},{container_tag:'x'.repeat(201)},{notes:'x'.repeat(2001)},{created_by:{}},{room_code:undefined}]) {
    await assert.rejects(()=>api.addFood({...baseFood,...change}),e=>e instanceof ApiError&&e.status===400);
  }
  const food=await api.addFood(baseFood);
  for(const dto of [{},{name:' '},{expiry_date:'2026-02-31T00:00:00Z'},{expiry_date:'today'},{status:'CONSUMED'},{room_code:second.room.code}]) await assert.rejects(()=>api.updateFood(food.id,dto),e=>e instanceof ApiError&&[400,403].includes(e.status));
  for(const dto of [{add_to_shopping_list:'false'},{consumed_by:{name:'Spoof'}}]) assert.equal((await raw(`/api/foods/${food.id}/consume`,'PATCH',dto)).status,400);
  assert.equal((await db.getFood(food.id,first.room.code)).status,'FRESH');
  const shop=await api.addShoppingItem({room_code:first.room.code,name:'Mua'});
  for(const dto of [{is_bought:'false'},{is_bought:false,move_to_fridge:true},{is_bought:true,move_to_fridge:'yes'},{is_bought:true,compartment:'GARAGE'}]) assert.equal((await raw(`/api/shopping-items/${shop.id}/toggle`,'PATCH',dto)).status,400);
  assert.equal((await db.getShopping(shop.id,first.room.code)).is_bought,false);
  assert.equal((await raw(`/api/foods?room_code=${first.room.code}&status=garbage`)).status,400);
  for(const transcript of ['',45,'x'.repeat(2001)]) assert.equal((await raw('/api/ai/parse-voice','POST',{transcript})).status,400);
  assert.equal((await raw('/api/ai/suggest-recipes','POST',{room_code:first.room.code,preference:'x'.repeat(2001)})).status,400);
  await api.deleteFood(food.id);await api.deleteShoppingItem(shop.id);
});

test('actual client throws typed 401/403/404/500 errors; room failure never auto-recreates',async()=>{
  const before=seen.length;
  api.sessionCache.clear();
  for(const call of [()=>api.getFoods(first.room.code),()=>api.getShoppingItems(first.room.code),()=>api.deleteFood('missing'),()=>api.verifyToken()]) await assert.rejects(call,fail(401,'UNAUTHORIZED'));
  await api.joinRoomWithPasscode(first.room.code,'6789','Actor One');
  await assert.rejects(()=>api.getFoods(second.room.code),fail(403,'FORBIDDEN'));
  await assert.rejects(()=>api.getRoom(second.room.code),fail(403,'FORBIDDEN'));
  await assert.rejects(()=>api.deleteFood('not-a-uuid'),fail(404,'NOT_FOUND'));
  await assert.rejects(()=>api.deleteShoppingItem('not-a-uuid'),fail(404,'NOT_FOUND'));
  const foreign=await db.createFood({id:crypto.randomUUID(),room_code:second.room.code,name:'Private',compartment:'CRISPER',status:'FRESH',added_date:new Date().toISOString(),expiry_date:new Date().toISOString()});
  await assert.rejects(()=>api.updateFood(foreign.id,{name:'Taken'}),fail(404,'NOT_FOUND'));
  const original=db.listFoods;db.listFoods=async()=>{throw new Error('select private_password from secret_table');};
  try {await assert.rejects(()=>api.getFoods(first.room.code),error=>fail(500,'INTERNAL_ERROR')(error)&&!error.message.includes('secret_table'));} finally {db.listFoods=original;}
  assert.equal(seen.slice(before).filter(r=>r.path==='/api/auth/create-room').length,0);
  for(const result of seen.slice(before).filter(r=>r.status>=400)) validateSchema('Error',result.body);
});

test('malformed success, non-JSON error and offline connection never return success-shaped data',async()=>{
  try {
    fault='malformed';await assert.rejects(()=>api.getFoods(first.room.code),fail(200,'INVALID_RESPONSE'));
    fault='nonjson';await assert.rejects(()=>api.deleteFood('missing'),fail(500,'HTTP_ERROR'));
    fault='network';await assert.rejects(()=>api.getShoppingItems(first.room.code),fail(0,'NETWORK_ERROR'));
  } finally {fault=null;}
});

test('actual notification client uses documented route; malformed/foreign/off-curve subscriptions are rejected',async()=>withVapid(async()=>{
  const p256dh=crypto.createECDH('prime256v1');p256dh.generateKeys();
  const validKeys={auth:crypto.randomBytes(16).toString('base64url'),p256dh:p256dh.getPublicKey().toString('base64url')};
  const valid={endpoint:'https://fcm.googleapis.com/fcm/send/abc123',keys:validKeys};
  const result=await api.subscribePush(valid,first.room.code,'Test');
  validateSchema('SubscriptionResult',result);
  assert.ok(seen.some(r=>r.path==='/api/notifications/subscribe'&&r.method==='POST'&&r.status===200));
  for(const subscription of [
    null,[],{},
    {...valid,endpoint:5},
    {...valid,endpoint:'javascript:alert(1)'},
    {...valid,keys:[]},
    {...valid,keys:{auth:4,p256dh:validKeys.p256dh}},
    {...valid,keys:{auth:validKeys.auth}},
  ]) await assert.rejects(()=>api.subscribePush(subscription,first.room.code),fail(400,'INVALID_INPUT'));
  await assert.rejects(()=>api.subscribePush(valid,first.room.code,'x'.repeat(101)),fail(400,'INVALID_INPUT'));
  const offCurve=Buffer.from(validKeys.p256dh,'base64url');offCurve[1]^=0xff;
  for(const subscription of [
    {...valid,endpoint:'https://push.example.test/not-a-known-provider'},
    {...valid,keys:{...validKeys,p256dh:offCurve.toString('base64url')}},
    {...valid,keys:{...validKeys,p256dh:validKeys.p256dh.slice(0,-2)}},
  ]) await assert.rejects(()=>api.subscribePush(subscription,first.room.code),fail(400,'INVALID_SUBSCRIPTION'));
  assert.equal((await db.listSubscriptions(first.room.code)).length,1);
}));

test('every planning method/path exists in runtime spec; all schemas compile and required shapes are present',async()=>{
  const contract=fs.readFileSync(new URL('../flow/05-contract.md',import.meta.url),'utf8');
  const planned=[...contract.matchAll(/^\| (GET|POST|PATCH|DELETE) \| `([^`]+)`/gm)].map(([,method,path])=>[method.toLowerCase(),path.replace(/:([a-z_]+)/g,'{$1}')]);
  assert.ok(planned.length>=29);
  const served=(await raw('/api/openapi.json')).body;
  assert.deepEqual(served,schema);
  const generated=JSON.parse(execFileSync(process.execPath,['server/build-openapi.js','--stdout'],{encoding:'utf8'}));
  assert.deepEqual(generated,schema,'committed runtime spec must match its source');
  for(const [method,path] of planned) {
    const op=served.paths[path]?.[method];assert.ok(op,`${method} ${path}`);
    assert.ok(Object.keys(op.responses).some(code=>code.startsWith('2')));
    for(const response of Object.values(op.responses)) ajv.compile({...converted(response.content['application/json'].schema),definitions:converted(schema.components.schemas)});
  }
  for(const name of Object.keys(schema.components.schemas)) ajv.compile({$ref:`#/definitions/${name}`,definitions:converted(schema.components.schemas)});
  for(const [name,required] of Object.entries({FoodList:['items','total'],ShoppingList:['items','total'],Deleted:['success','deleted_id'],RoomDetail:['id','code','name','created_at','active_food_count','urgent_food_count'],RecipeSuggestion:['food_ids','ingredients_missing','instructions'],RecipeResult:['source','generated_at','suggestions']})) for(const field of required) assert.ok(schema.components.schemas[name].required.includes(field),`${name}.${field}`);
});

test('planned session renewal is authenticated and explicitly unavailable without changing the session',async()=>{
  const path='/api/auth/session';
  const operation=(await raw('/api/openapi.json')).body.paths[path].patch;
  assert.deepEqual(operation.security,[{RoomBearer:[]}]);
  assert.match(operation['x-availability'],/C026/);
  assert.deepEqual(operation.responses[200].content['application/json'].schema,{$ref:'#/components/schemas/AuthSession'});
  const validate=ajv.compile(operation.requestBody.content['application/json'].schema);
  for(const nickname of ['A','x'.repeat(100)]) assert.equal(validate({nickname}),true);
  for(const input of [{},{nickname:''},{nickname:'x'.repeat(101)},{nickname:4},{nickname:'New',room_code:second.room.code}]) assert.equal(validate(input),false);

  for(const token of [null,'invalid.token']) {
    const result=await raw(path,'PATCH',{nickname:'New nickname'},token);
    assert.equal(result.status,401);
    assert.deepEqual(result.body,{error:'A valid room session is required.',code:'UNAUTHORIZED'});
  }
  const before=await raw('/api/auth/verify-token','POST',{token:first.token});
  const unavailable=await raw(path,'PATCH',{nickname:'New nickname'});
  assert.equal(unavailable.status,503);
  assert.deepEqual(unavailable.body,{error:'Session updates are not available yet.',code:'SERVICE_UNAVAILABLE'});
  const after=await raw('/api/auth/verify-token','POST',{token:first.token});
  assert.equal(before.status,200);
  assert.deepEqual(after,before,'the placeholder must not alter or renew the existing session');
});

test('actual recipe client consumes exact IDs atomically and retries the same operation', async () => {
  const firstLot = await api.addFood({ room_code:first.room.code,name:'Trứng gà',compartment:'DOOR',shelf_life_days:3 });
  const secondLot = await api.addFood({ room_code:first.room.code,name:'Trứng gà',compartment:'DOOR',shelf_life_days:3 });
  const suggestions = await api.suggestRecipes(first.room.code);
  validateSchema('RecipeResult', suggestions);
  assert.equal(suggestions.source, 'heuristic');
  const selected = suggestions.suggestions.find(recipe => recipe.food_ids.includes(firstLot.id));
  assert.ok(selected); assert.ok(selected.food_ids.includes(secondLot.id));
  const key = crypto.randomUUID();
  const result = await api.consumeBatch([secondLot.id, firstLot.id], key, true);
  validateSchema('ConsumeBatchResult', result);
  assert.deepEqual(result.items.map(item => item.id).sort(), [firstLot.id,secondLot.id].sort());
  assert.deepEqual(await api.consumeBatch([firstLot.id,secondLot.id], key, true),result);
  await assert.rejects(() => api.consumeBatch([firstLot.id], key, true), fail(409,'IDEMPOTENCY_CONFLICT'));
  const remaining = await api.addFood({ room_code:first.room.code,name:'Untouched',compartment:'DOOR',shelf_life_days:3 });
  await assert.rejects(() => api.consumeBatch([remaining.id,firstLot.id], crypto.randomUUID(), false), fail(409,'FOOD_UNAVAILABLE'));
  assert.ok((await api.getFoods(first.room.code)).items.some(item => item.id === remaining.id));
  for (const ids of [[],[remaining.id,remaining.id],Array.from({length:51},(_,i)=>`id-${i}`)]) assert.equal((await raw('/api/foods/consume-batch','POST',{food_ids:ids,idempotency_key:crypto.randomUUID()})).status,400);
});

test('all actual client HTTP responses match the corresponding runtime operation schema',()=>{
  for(const result of seen.filter(item=>!item.fault)) {
    const path=new URL(result.path,base).pathname;
    const template=Object.keys(schema.paths).find(key=>key===path) || Object.keys(schema.paths).find(key=>new RegExp(`^${key.replace(/\{[^}]+\}/g,'[^/]+')}$`).test(path));
    assert.ok(template,`${result.method} ${path}`);
    const responseSchema=schema.paths[template][result.method.toLowerCase()].responses[result.status].content['application/json'].schema;
    const validate=ajv.compile({...converted(responseSchema),definitions:converted(schema.components.schemas)});
    assert.equal(validate(result.body),true,`${result.method} ${path} ${result.status}: ${JSON.stringify(validate.errors)}`);
  }
});

test('future integrations expose explicit unavailable responses, config works without a database',async()=>{
  for(const [path,method] of [['/api/auth/google','POST'],['/api/realtime-token','GET'],['/api/cron/expiry','GET']]) {
    const result=await raw(path,method,method==='GET'?undefined:{});assert.equal(result.status,503,`${method} ${path}`);validateSchema('Error',result.body);
  }
  let status,body;
  await createApiHandler()({url:'/api/config',method:'GET',headers:{}},{writeHead:value=>status=value,end:value=>body=JSON.parse(value)});
  assert.equal(status,200);validateSchema('PublicConfig',body);assert.deepEqual(body,{google_client_id:null,capabilities:{google:false,push:false,photos:false,realtime:false}});
});

test('C025 photos: without SUPABASE_SERVICE_ROLE_KEY, upload is a clean 503, not a stub',async()=>{
  const upload=await raw('/api/photos','POST',{image_base64:'AAAA',mime_type:'image/jpeg'});
  assert.equal(upload.status,503);assert.equal(upload.body.code,'PHOTOS_UNAVAILABLE');
  const remove=await raw('/api/photos','DELETE',{});
  assert.equal(remove.status,400);assert.equal(remove.body.code,'INVALID_INPUT');
});

test('C024 push config/unsubscribe are implemented, not future stubs: no VAPID means disabled-but-served',async()=>{
  const config=await raw('/api/notifications/config');
  assert.equal(config.status,200);validateSchema('NotificationConfig',config.body);
  assert.deepEqual(config.body,{enabled:false,public_key:null});
  const missing=await raw('/api/notifications/subscribe','DELETE',{});
  assert.equal(missing.status,400);assert.equal(missing.body.code,'INVALID_INPUT');
});
