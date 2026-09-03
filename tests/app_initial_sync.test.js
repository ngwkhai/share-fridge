import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';

// Render the actual App and child components. Only the browser transport hook is
// replaced; its state comes from the production controller, including failures.
const require = createRequire(import.meta.url);
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hookUrl = moduleUrl(`
  import { useSyncExternalStore } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
  let controller;
  export function setController(value) { controller = value; }
  export function useRoomSync() {
    const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
    return { ...state, refresh: controller.refresh, logout: () => controller.activate(null),
      mutate: operation => controller.mutate(state.session?.token || '', operation) };
  }
`);
const loaded = new Map();
function compile(file) {
  if (file.endsWith('/hooks/useRoomSync.ts')) return hookUrl;
  if (loaded.has(file)) return loaded.get(file);
  let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.ES2020, true);
  for (const statement of [...parsed.statements].reverse()) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier.text;
    let target;
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(dependency, `Cannot resolve ${specifier} from ${file}`);
      target = compile(dependency);
    } else target = pathToFileURL(require.resolve(specifier)).href;
    code = code.slice(0, statement.moduleSpecifier.getStart(parsed)) + JSON.stringify(target) + code.slice(statement.moduleSpecifier.end);
  }
  const url = moduleUrl(code);
  loaded.set(file, url);
  return url;
}
const { default: App } = await import(compile(fileURLToPath(new URL('../src/App.tsx', import.meta.url))));
const { createRoomSyncController } = await import(compile(fileURLToPath(new URL('../src/services/roomSync.ts', import.meta.url))));
const { setController } = await import(hookUrl);
const room = { id: 'room-a', code: '721021', name: 'Phòng kiểm thử', created_at: '2026-01-01T00:00:00.000Z', active_food_count: 0, urgent_food_count: 0 };
const session = { code: room.code, name: room.name, nickname: 'A', token: 'session-a', cached_at: 0, room };
const empty = () => ({ room, foods: [], consumed: [], shopping: [], savedAt: Date.now() });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node?.children ? text(node.children) : '';
const renderedText = renderer => text(renderer.toJSON());
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => text(node.children).trim() === label);
const assertNoEmptyClaim = renderer => {
  assert.doesNotMatch(renderedText(renderer), /Chưa có món nào ở mục này|Chưa có món nào đã nấu|Danh sách đi chợ trống/);
  assert.equal(button(renderer, 'Thêm món ngay'), undefined);
  assert.equal(button(renderer, 'Nấu gì?'), undefined);
};

for (const hasRoomMetadata of [true, false]) {
  test(`App first load and retry never claim an empty fridge (${hasRoomMetadata ? 'cached room' : 'legacy room-less session'})`, async () => {
    const first = deferred(), retry = deferred();
    let calls = 0;
    const controller = createRoomSyncController({ read: () => ++calls === 1 ? first.promise : retry.promise, cached: () => null, save: () => {}, invalidate: () => {}, online: () => true });
    controller.activate({ ...session, room: hasRoomMetadata ? room : undefined });
    setController(controller);
    let renderer;
    await act(async () => { renderer = create(React.createElement(App)); });
    try {
      let request;
      await act(async () => { request = controller.refresh(); });
      assert.match(renderedText(renderer), /Đang tải dữ liệu phòng/);
      assertNoEmptyClaim(renderer);
      await act(async () => { first.reject(new Error('Không thể kết nối máy chủ.')); await request; });
      assert.match(renderedText(renderer), /Chưa tải được dữ liệu phòng/);
      assert.match(renderedText(renderer), /Không thể kết nối máy chủ/);
      assertNoEmptyClaim(renderer);
      assert.ok(button(renderer, 'Vào phòng khác'));
      await act(async () => { button(renderer, 'Thử tải lại').props.onClick(); });
      assert.equal(calls, 2, 'retry button must call the controller, not just dismiss the error');
      assertNoEmptyClaim(renderer);
      await act(async () => { retry.resolve(empty()); await retry.promise; });
      assert.match(renderedText(renderer), /Chưa có món nào ở mục này/);
      assert.ok(button(renderer, 'Thêm món ngay'));
      for (const [tab, emptyLabel] of [['Đã dùng', /Chưa có món nào đã nấu/], ['Đi chợ', /Danh sách đi chợ trống/]]) {
        await act(async () => { button(renderer, tab).props.onClick(); });
        assert.match(renderedText(renderer), emptyLabel);
        await act(async () => { controller.activate({ ...session, token: `replacement-${tab}`, room: hasRoomMetadata ? room : undefined }); });
        assertNoEmptyClaim(renderer);
        assert.match(renderedText(renderer), /Đang tải dữ liệu phòng/);
        await act(async () => { controller.capture().error(new Error('Tải phòng mới thất bại.')); });
        assertNoEmptyClaim(renderer);
        assert.match(renderedText(renderer), /Chưa tải được dữ liệu phòng/);
        await act(async () => { await controller.refresh(); });
      }
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}

test('App keeps the last complete snapshot visible when refreshing fails', async () => {
  const snapshot = { ...empty(), foods: [{ id: 'original-food', room_code: room.code, name: 'Rau còn trong bản lưu', compartment: 'CRISPER', added_date: '2026-09-01T00:00:00.000Z', expiry_date: '2026-09-10T00:00:00.000Z', status: 'FRESH', days_remaining: 7 }] };
  const controller = createRoomSyncController({ read: async () => { throw new Error('Mất kết nối.'); }, cached: () => snapshot, save: () => {}, invalidate: () => {}, online: () => true });
  controller.activate(session);
  setController(controller);
  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); await controller.refresh(); });
  try {
    assert.match(renderedText(renderer), /Rau còn trong bản lưu/);
    assert.match(renderedText(renderer), /Dữ liệu có thể chưa cập nhật/);
    assert.match(renderedText(renderer), /Mất kết nối/);
    assert.doesNotMatch(renderedText(renderer), /Chưa tải được dữ liệu phòng|Đang tải dữ liệu phòng/);
    assert.equal(controller.getState().snapshot, snapshot);
  } finally { await act(async () => { renderer.unmount(); }); }
});

test('App displays verified profile in header/settings and clears it on external session logout', async () => {
  const { api } = await import(compile(fileURLToPath(new URL('../src/services/api.ts', import.meta.url))));
  const oldFetch = globalThis.fetch, oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  const cache = new Map(); let signedOut = 0;
  globalThis.localStorage = { getItem: key => cache.get(key) || null, setItem: (key,value) => cache.set(key,value), removeItem: key => cache.delete(key) };
  globalThis.fetch = async () => new Response(JSON.stringify({ google_client_id:null,capabilities:{google:false,push:false,photos:false,realtime:false} }),{status:200});
  globalThis.window = { google:{accounts:{id:{cancel(){},disableAutoSelect(){signedOut++;}}}} };
  const controller = createRoomSyncController({read:async()=>empty(),cached:()=>null,save:()=>{},invalidate:()=>{},online:()=>true});
  controller.activate(null); setController(controller);
  let renderer;
  const profile={sub:'fixture-sub-one',name:'Verified One',email:'verified-one@example.com',picture:'https://example.com/profile-one.png'};
  try {
    await act(async()=>{renderer=create(React.createElement(App));});
    assert.match(renderedText(renderer),/Google hiện chưa khả dụng/);
    const googleButton=renderer.root.find(node=>node.type?.name==='GoogleAuthButton');
    // The component callback boundary receives an already server-verified identity.
    await act(async()=>{googleButton.props.onSuccess({profile,identity_token:'fixture-verified-identity',expires_at:new Date(Date.now()+60000).toISOString()});});
    assert.match(renderedText(renderer),/verified-one@example.com/);
    await act(async()=>{controller.activate({...session,nickname:profile.name,google_profile:profile});await controller.refresh();});
    const header=renderer.root.findByType('header');
    assert.ok(header.findAllByType('img').some(image=>image.props.src===profile.picture));
    await act(async()=>{renderer.root.findAllByType('button').find(node=>node.props.title==='Cài đặt phòng & tài khoản').props.onClick();});
    assert.match(renderedText(renderer),/verified-one@example.com/);
    assert.ok(renderer.root.findAllByType('img').filter(image=>image.props.src===profile.picture).length>=2);
    // Cross-tab logout / expired session changes the production controller state,
    // without calling App's explicit logout handler.
    await act(async()=>{controller.activate(null);});
    assert.doesNotMatch(renderedText(renderer),/verified-one@example.com|Verified One/);
    assert.ok(!renderer.root.findAllByType('img').some(image=>image.props.src===profile.picture));
    assert.ok(signedOut>0);
    assert.equal(api.sessionCache.get(),null);
  } finally {
    if(renderer) await act(async()=>renderer.unmount());
    globalThis.fetch=oldFetch;
    if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});

test('actual Google button ignores cancelled credentials and exposes verification errors without profiles', async () => {
  const { GoogleAuthButton } = await import(compile(fileURLToPath(new URL('../src/components/GoogleAuthButton.tsx', import.meta.url))));
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
  const buttons=[];let receive, calls=0;const successes=[];
  globalThis.window={google:{accounts:{id:{initialize:options=>{receive=options.callback;},renderButton:(_element,options)=>buttons.push(options),cancel(){},disableAutoSelect(){}}}}};
  let pending;
  globalThis.fetch=async path=>{
    if(path==='/api/config')return new Response(JSON.stringify({google_client_id:'ui-test.apps.googleusercontent.com',capabilities:{google:true,push:false,photos:false,realtime:false}}),{status:200});
    calls++;return pending.promise;
  };
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(GoogleAuthButton,{onSuccess:identity=>successes.push(identity)}),{createNodeMock:()=>({clientWidth:280,replaceChildren(){}})});});
    assert.equal(buttons.length,1);
    const first=buttons[0];
    await act(async()=>first.click_listener());
    assert.match(renderedText(renderer),/Nếu đã đóng cửa sổ/);
    await act(async()=>button(renderer,'Hủy đăng nhập Google').props.onClick());
    assert.equal(buttons.length,2);
    await act(async()=>receive({state:first.state,credential:'cancelled'}));
    assert.equal(calls,0);assert.equal(successes.length,0);
    pending=deferred();
    await act(async()=>receive({state:buttons[1].state,credential:'verify-after-click'}));
    assert.match(renderedText(renderer),/Đang xác minh/);
    await act(async()=>button(renderer,'Hủy đăng nhập Google').props.onClick());
    await act(async()=>pending.resolve(new Response(JSON.stringify({profile:{sub:'late',name:'Late',email:'late@example.com'},identity_token:'late-token',expires_at:new Date(Date.now()+60000).toISOString()}),{status:200})));
    assert.equal(successes.length,0,'a late success after cancellation must be discarded');
    pending=deferred();
    await act(async()=>receive({state:buttons.at(-1).state,credential:'bad'}));
    await act(async()=>pending.resolve(new Response(JSON.stringify({error:'Không thể xác minh tài khoản Google.',code:'INVALID_GOOGLE_CREDENTIAL'}),{status:401})));
    assert.match(renderedText(renderer),/Không thể xác minh tài khoản/);assert.ok(button(renderer,'Thử lại Google'));
    assert.equal(successes.length,0);
  } finally {if(renderer)await act(async()=>renderer.unmount());globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('actual App cooks recipe exact IDs once, disables competing actions, shows missing ingredients and retries the same key', async () => {
  const { api } = await import(compile(fileURLToPath(new URL('../src/services/api.ts', import.meta.url))));
  const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
  const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  api.sessionCache.save(session);
  const lots=['lot-one','lot-two','lot-three'].map(id=>({id,room_code:room.code,name:'Trứng gà',compartment:'DOOR',added_date:new Date().toISOString(),expiry_date:new Date(Date.now()+86400000).toISOString(),status:'COOK_SOON',days_remaining:1}));
  const selected={id:'recipe-picked',title:'Trứng chiên',cook_time_minutes:10,food_ids:['lot-two','lot-three'],ingredients_used:['Trứng gà','Trứng gà'],ingredients_missing:['Dầu ăn'],instructions:['Chiên đến khi chín.']};
  const choices=[selected,{...selected,id:'recipe-other',food_ids:['lot-one'],ingredients_used:['Trứng gà']}];
  let snapshot={...empty(),foods:lots},pending=deferred();const sent=[];
  globalThis.fetch=async(path,options)=>{
    if(path==='/api/ai/suggest-recipes')return new Response(JSON.stringify({suggestions:choices,source:'heuristic',generated_at:new Date().toISOString()}));
    sent.push({path,method:options.method,body:JSON.parse(options.body)});return pending.promise;
  };
  const controller=createRoomSyncController({read:async()=>snapshot,cached:()=>snapshot,save:()=>{},invalidate:()=>{},online:()=>true});controller.activate(session);setController(controller);
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(App));await controller.refresh();});
    await act(async()=>button(renderer,'Nấu gì?').props.onClick());
    assert.match(renderedText(renderer),/Cần chuẩn bị thêm/);assert.match(renderedText(renderer),/Dầu ăn/);assert.match(renderedText(renderer),/Gợi ý cơ bản/);
    await act(async()=>button(renderer,'Đã nấu món này').props.onClick());
    assert.equal(sent.length,1);assert.equal(sent[0].path,'/api/foods/consume-batch');assert.equal(sent[0].method,'POST');assert.deepEqual(sent[0].body.food_ids,['lot-two','lot-three']);
    assert.ok(renderer.root.findAllByType('button').filter(node=>/Đang cập nhật|Đã nấu món này|Lấy gợi ý mới/.test(text(node.children))).every(node=>node.props.disabled));
    await act(async()=>pending.resolve(new Response(JSON.stringify({error:'Tạm thời chưa lưu được.',code:'BATCH_BUSY'}),{status:503})));
    assert.match(renderedText(renderer),/Tạm thời chưa lưu được/);
    pending=deferred();await act(async()=>button(renderer,'Đã nấu món này').props.onClick());
    assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);
    const consumedAt=new Date().toISOString();const used=lots.slice(1).map(item=>({...item,status:'CONSUMED',consumed_at:consumedAt,consumed_by:'A'}));snapshot={...empty(),foods:[lots[0]],consumed:used};
    await act(async()=>pending.resolve(new Response(JSON.stringify({items:used,consumed_at:consumedAt}))));
    assert.equal(renderer.root.findAll(node=>node.props.role==='dialog'&&node.props['aria-labelledby']==='recipe-title').length,0);
    assert.deepEqual(controller.getState().snapshot.foods.map(item=>item.id),['lot-one']);
  } finally {if(renderer)await act(async()=>renderer.unmount());globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});

test('actual voice modal reviews source then rendered QuickAdd preserves zero days and clears absent quantity/tag', async () => {
  const {VoiceInputModal}=await import(compile(fileURLToPath(new URL('../src/components/VoiceInputModal.tsx',import.meta.url))));
  const {QuickAddModal}=await import(compile(fileURLToPath(new URL('../src/components/QuickAddModal.tsx',import.meta.url))));
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;globalThis.window={};
  const parsed={name:'Rau muống',quantity:'0.5 kg',compartment:'FRIDGE_BOTTOM',container_tag:'Hộp xanh',shelf_life_days:0};let applied,closed=0,submitted;
  globalThis.fetch=async()=>new Response(JSON.stringify({parsed,confidence:0.7,source:'heuristic'}));
  let renderer,form;
  try {
    await act(async()=>{renderer=create(React.createElement(VoiceInputModal,{isOpen:true,onClose:()=>closed++,onParsed:value=>applied=value}));});
    await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'Nửa ký rau muống trong hộp xanh ngăn mát dưới dùng trong 0 ngày'}}));
    await act(async()=>button(renderer,'Phân tích lời nói').props.onClick());
    assert.equal(applied,undefined);assert.equal(closed,0);assert.match(renderedText(renderer),/cách cơ bản/);assert.match(renderedText(renderer),/0\s+ngày/);
    await act(async()=>button(renderer,'Điền vào phiếu thêm').props.onClick());assert.deepEqual(applied,parsed);assert.equal(closed,1);
    const props={isOpen:true,onClose:()=>{},onAdd:async value=>submitted=value,roomCode:room.code,initialData:applied};
    await act(async()=>{form=create(React.createElement(QuickAddModal,props));});
    assert.match(renderedText(form),/0\s+ngày/);assert.equal(form.root.find(node=>node.props['aria-label']==='Số lượng').props.value,'0.5 kg');assert.equal(form.root.find(node=>node.props['aria-label']==='Dấu hiệu nhận biết').props.value,'Hộp xanh');
    await act(async()=>form.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(submitted.shelf_life_days,0);assert.equal(submitted.compartment,'FRIDGE_BOTTOM');assert.equal(submitted.quantity,'0.5 kg');
    await act(async()=>form.update(React.createElement(QuickAddModal,{...props,initialData:{name:'Trứng',compartment:'DOOR',shelf_life_days:0}})));
    assert.equal(form.root.find(node=>node.props['aria-label']==='Số lượng').props.value,'');assert.equal(form.root.find(node=>node.props['aria-label']==='Dấu hiệu nhận biết').props.value,'');
  } finally {if(renderer)await act(async()=>renderer.unmount());if(form)await act(async()=>form.unmount());globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('closing voice input discards a delayed parse and reopening starts without a stale draft', async () => {
  const {VoiceInputModal}=await import(compile(fileURLToPath(new URL('../src/components/VoiceInputModal.tsx',import.meta.url))));
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;globalThis.window={};const pending=deferred();globalThis.fetch=()=>pending.promise;let applied=0,renderer;
  const props={isOpen:true,onClose:()=>{},onParsed:()=>applied++};
  try {
    await act(async()=>{renderer=create(React.createElement(VoiceInputModal,props));});
    await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'Trứng'}}));
    await act(async()=>{button(renderer,'Phân tích lời nói').props.onClick();});
    await act(async()=>renderer.update(React.createElement(VoiceInputModal,{...props,isOpen:false})));
    await act(async()=>pending.resolve(new Response(JSON.stringify({parsed:{name:'Late',compartment:'DOOR',shelf_life_days:3},confidence:0.7,source:'heuristic'}))));
    await act(async()=>renderer.update(React.createElement(VoiceInputModal,props)));
    assert.equal(applied,0);assert.equal(renderer.root.findByType('textarea').props.value,'');assert.doesNotMatch(renderedText(renderer),/Late/);
  } finally {if(renderer)await act(async()=>renderer.unmount());globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('editing voice transcript invalidates its pending parse and displays actionable date validation', async () => {
  const {VoiceInputModal}=await import(compile(fileURLToPath(new URL('../src/components/VoiceInputModal.tsx',import.meta.url))));
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;globalThis.window={};let pending=deferred();globalThis.fetch=()=>pending.promise;let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(VoiceInputModal,{isOpen:true,onClose:()=>{},onParsed:()=>{throw new Error('Unexpected apply');}}));});
    await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'Transcript A'}}));
    await act(async()=>{button(renderer,'Phân tích lời nói').props.onClick();});
    await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'Transcript B'}}));
    await act(async()=>pending.resolve(new Response(JSON.stringify({parsed:{name:'Stale A',compartment:'DOOR',shelf_life_days:3},confidence:0.7,source:'heuristic'}))));
    assert.doesNotMatch(renderedText(renderer),/Stale A/);assert.equal(button(renderer,'Điền vào phiếu thêm'),undefined);
    pending=deferred();await act(async()=>{button(renderer,'Phân tích lời nói').props.onClick();});
    await act(async()=>pending.resolve(new Response(JSON.stringify({error:'Hạn bảo quản phải là số nguyên từ 0 đến 365 ngày. Hãy sửa lời nói.',code:'INVALID_SHELF_LIFE'}),{status:400})));
    assert.match(renderedText(renderer),/Hãy sửa lời nói/);assert.doesNotMatch(renderedText(renderer),/Kiểm tra kết nối/);
  } finally {if(renderer)await act(async()=>renderer.unmount());globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
