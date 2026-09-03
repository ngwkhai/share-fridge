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
