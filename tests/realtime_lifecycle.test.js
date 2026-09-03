import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const apiURL=`data:text/javascript;base64,${Buffer.from(compile('../src/services/api.ts')).toString('base64')}`;
const source=compile('../src/services/supabaseClient.ts').replace("'@supabase/supabase-js'",JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href)).replace("'./api'",JSON.stringify(apiURL));
const {createRealtimeSubscription}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
class Events extends EventTarget {
  listeners=new Set();
  addEventListener(type,fn){this.listeners.add(fn);super.addEventListener(type,fn);}
  removeEventListener(type,fn){this.listeners.delete(fn);super.removeEventListener(type,fn);}
}
test('actual realtime lifecycle refreshes token, recreates failed channels, and cleans timers/listeners/stale callbacks',async()=>{
  const originals={window:globalThis.window,document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),setTimeout,clearTimeout,setInterval,clearInterval};
  const timers=new Map();let id=0;
  globalThis.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay,interval:false});return id;};globalThis.setInterval=(fn,delay)=>{timers.set(++id,{fn,delay,interval:true});return id;};globalThis.clearTimeout=globalThis.clearInterval=key=>timers.delete(key);
  const win=new Events(),doc=new Events();doc.visibilityState='visible';globalThis.window=win;globalThis.document=doc;Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  const clients=[],modes=[];let credentials=0,reads=0,errors=0;
  const factory=()=>{
    const channels=[];const client={authCalls:[],disconnected:false,getChannels:()=>channels,realtime:{setAuth:async token=>client.authCalls.push(token),disconnect:()=>client.disconnected=true},removeAllChannels:async()=>{for(const ch of channels)ch.callback('CLOSED');channels.length=0;},channel:()=>{const ch={changes:[],on(_event,filter,callback){this.changes.push({filter,callback});return this;},subscribe(callback){this.callback=callback;return this;}};channels.push(ch);return ch;}};clients.push(client);return client;
  };
  const runTimer=async predicate=>{const entry=[...timers].find(([,timer])=>predicate(timer));assert.ok(entry,'expected timer exists');if(!entry[1].interval)timers.delete(entry[0]);entry[1].fn();await flush();};
  let stop;
  try{
    stop=createRealtimeSubscription('721021',{refresh:async()=>reads++,transport:mode=>modes.push(mode),error:()=>errors++},{config:{url:'https://fixture.supabase.co',anonKey:'public-fixture'},clientFactory:factory,getToken:async()=>({token:`room-token-${++credentials}`,expires_at:new Date(Date.now()+300000).toISOString()})});
    await flush();assert.equal(clients.length,1);const firstChannel=clients[0].getChannels()[0];assert.deepEqual(firstChannel.changes.map(x=>x.filter.event),['INSERT','UPDATE']);assert.ok(firstChannel.changes.every(x=>x.filter.table==='room_sync_versions'&&x.filter.filter==='room_code=eq.721021'));
    firstChannel.callback('SUBSCRIBED');await flush();assert.equal(modes.at(-1),'connected');assert.equal(reads,1);
    await runTimer(t=>!t.interval&&t.delay>100000);assert.equal(credentials,2);assert.equal(clients.length,1);assert.equal(clients[0].authCalls.length,2);
    firstChannel.callback('CHANNEL_ERROR');assert.equal(modes.at(-1),'polling');assert.equal(clients[0].disconnected,true);
    await runTimer(t=>!t.interval&&t.delay===5000);assert.equal(clients.length,2);const secondChannel=clients[1].getChannels()[0];secondChannel.callback('SUBSCRIBED');await flush();
    firstChannel.callback('CLOSED');assert.equal(modes.at(-1),'connected','stale channel callback ignored');
    secondChannel.changes[0].callback();await runTimer(t=>!t.interval&&t.delay===30);assert.ok(reads>=3);
    navigator.onLine=false;win.dispatchEvent(new Event('offline'));assert.equal(clients[1].disconnected,true);
    navigator.onLine=true;win.dispatchEvent(new Event('online'));await flush();assert.equal(clients.length,3);
    const readsBeforeStop=reads;stop();await flush();assert.equal(timers.size,0);assert.equal(win.listeners.size,0);assert.equal(doc.listeners.size,0);
    firstChannel.changes[0].callback();secondChannel.callback('SUBSCRIBED');await flush();assert.equal(reads,readsBeforeStop);assert.equal(errors,0);
  }finally{
    stop?.();globalThis.setTimeout=originals.setTimeout;globalThis.clearTimeout=originals.clearTimeout;globalThis.setInterval=originals.setInterval;globalThis.clearInterval=originals.clearInterval;
    if(originals.window===undefined)delete globalThis.window;else globalThis.window=originals.window;if(originals.document===undefined)delete globalThis.document;else globalThis.document=originals.document;
    if(originals.navigator)Object.defineProperty(globalThis,'navigator',originals.navigator);else delete globalThis.navigator;
  }
});
