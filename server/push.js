import crypto from 'node:crypto';
import https from 'node:https';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import webpush from 'web-push';
import { HttpError } from './http.js';

const bad = () => { throw new HttpError(400,'INVALID_SUBSCRIPTION','Đăng ký thông báo không hợp lệ.'); };
export function decodePushKey(value, length) {
  if (typeof value!=='string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length>100) bad();
  const bytes=Buffer.from(value,'base64url');
  if(bytes.length!==length || bytes.toString('base64url')!==value.replace(/=+$/,'')) bad();
  return bytes;
}
export function pushEndpoint(value) {
  let url;
  if(typeof value!=='string'||value.length>8192) bad();
  try {url=new URL(value);} catch {bad();}
  const host=url.hostname;
  // Only supported browser push providers. Endpoint paths remain opaque.
  const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||/^[a-z0-9-]+\.push\.apple\.com$/.test(host)||host==='web.push.apple.com'||host==='wns2-db5p.notify.windows.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!allowed||!url.pathname||url.pathname==='/')bad();
  return url;
}
export function validatePushSubscription(subscription) {
  if(!subscription||typeof subscription!=='object'||Array.isArray(subscription))bad();
  pushEndpoint(subscription.endpoint);
  const publicKey=decodePushKey(subscription.keys?.p256dh,65);
  if(publicKey[0]!==4)bad();
  try {crypto.ECDH.convertKey(publicKey,'prime256v1');}catch{bad();}
  decodePushKey(subscription.keys?.auth,16);
  return {endpoint:subscription.endpoint,keys:{auth:subscription.keys.auth,p256dh:subscription.keys.p256dh}};
}
export function pushConfig(env=process.env) {
  try {
    const publicKey=decodePushKey(env.VAPID_PUBLIC_KEY,65),privateKey=decodePushKey(env.VAPID_PRIVATE_KEY,32);
    const ecdh=crypto.createECDH('prime256v1');ecdh.setPrivateKey(privateKey);
    if(!crypto.timingSafeEqual(publicKey,ecdh.getPublicKey()))return null;
    const subject=env.VAPID_SUBJECT;
    if(typeof subject!=='string'||subject.length>200||!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))return null;
    return {publicKey:publicKey.toString('base64url'),privateKey:privateKey.toString('base64url'),subject};
  }catch{return null;}
}
export function authorizeCron(header, secret=process.env.CRON_SECRET) {
  if(typeof secret!=='string'||secret.length<32)throw new HttpError(503,'PUSH_UNAVAILABLE','Thông báo theo lịch chưa được cấu hình.');
  const expected=Buffer.from(`Bearer ${secret}`),given=Buffer.from(typeof header==='string'?header:'');
  if(given.length!==expected.length||!crypto.timingSafeEqual(given,expected))throw new HttpError(401,'UNAUTHORIZED','A valid scheduler credential is required.');
}
export function vietnamSchedule(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`;
  return {day,due:Number(parts.hour)*60+Number(parts.minute)>=990,expires:new Date(Date.parse(`${day}T00:00:00+07:00`)+86400000).toISOString()};
}
export function publicAddress(address) {
  try {let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()==='unicast';}catch{return false;}
}

// generateRequestDetails performs RFC encryption/VAPID. Own transport adds a total
// deadline, bounded response and DNS pinning; web-push's timeout is socket-idle only.
export async function postPush(details,{timeoutMs=5000,resolve=dns.lookup,request=https.request}={}) {
  const url=pushEndpoint(details.endpoint);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let abortListener;
  try {
    const addresses=await Promise.race([
      resolve(url.hostname,{all:true,verbatim:true}),
      new Promise((_,reject)=>{abortListener=()=>reject(new Error('PUSH_TIMEOUT'));controller.signal.addEventListener('abort',abortListener,{once:true});})
    ]);
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(row=>!publicAddress(row.address)))throw new Error('PUSH_ADDRESS_REJECTED');
    const address=addresses[0];
    return await new Promise((resolveResponse,reject)=>{
      const req=request({protocol:'https:',hostname:url.hostname,servername:url.hostname,port:443,path:url.pathname+url.search,
        method:'POST',headers:details.headers,agent:false,signal:controller.signal,
        lookup:(_host,options,callback)=>callback(null,options?.all?[address]:address.address,address.family)
      },res=>{
        let bytes=0;
        res.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)req.destroy(new Error('PUSH_RESPONSE_TOO_LARGE'));});
        res.on('error',reject);
        res.on('end',()=>resolveResponse({status:res.statusCode,retryAfter:res.headers['retry-after']}));
      });
      req.on('error',reject);req.end(details.body);
    });
  }finally{clearTimeout(timer);if(abortListener)controller.signal.removeEventListener('abort',abortListener);}
}

export function createPushService({configuration=pushConfig,transport=postPush,now=()=>Date.now()}={}) {
  return {
    async config(db) {const config=configuration();const enabled=!!config&&await db.pushReady();return {enabled,public_key:enabled?config.publicKey:null};},
    async dispatch(db,roomCode=null,{budgetMs=6000,maximum=20}={}) {
      const config=configuration();
      if(!config||!await db.pushReady())throw new HttpError(503,'PUSH_UNAVAILABLE','Thông báo hiện chưa khả dụng.');
      const started=Date.now();let sent=0,skipped=0,failed=0,processed=0;
      while(processed<maximum&&Date.now()-started<budgetMs-100) {
        const claimed=await db.claimPush(Math.min(4,maximum-processed),30,roomCode);
        if(!claimed.length)break;
        processed+=claimed.length;
        await Promise.all(claimed.map(async delivery=>{
          let outcome;
          try {
            validatePushSubscription(delivery.subscription);
            const payload=JSON.stringify({...delivery.payload,event_id:delivery.notification_id,room_code:delivery.room_code,url:'/'});
            const ttl=Math.max(0,Math.min(3600,Math.floor((new Date(delivery.expires_at).getTime()-now())/1000)));
            const details=webpush.generateRequestDetails(delivery.subscription,payload,{vapidDetails:config,TTL:ttl,topic:crypto.createHash('sha256').update(delivery.notification_id).digest('base64url').slice(0,32),urgency:'normal'});
            const response=await transport(details,{timeoutMs:Math.max(1,Math.min(5000,budgetMs-(Date.now()-started)))});
            const status=response.status;
            const retryAfter=/^\d+$/.test(String(response.retryAfter))?Number(response.retryAfter):Math.max(0,(Date.parse(response.retryAfter)-now())/1000);
            outcome={accepted:status>=200&&status<300,expired:[404,410].includes(status),retry:status===429||status>=500,code:`HTTP_${Number.isInteger(status)?status:0}`,retryAfter:Number.isFinite(retryAfter)?retryAfter:undefined};
          }catch(error){outcome={accepted:false,expired:false,retry:!(error instanceof HttpError),code:error instanceof HttpError?'INVALID_SUBSCRIPTION':'TRANSPORT_FAILURE'};}
          if(outcome.accepted)sent++; // Provider acceptance is independent of durable finalization.
          try {
            const recorded=await db.finishPush(delivery,outcome);
            if(!recorded){skipped++;if(outcome.accepted)failed++;}else if(outcome.expired)skipped++;else if(!outcome.accepted)failed++;
          }catch{failed++;}
        }));
      }
      const pending=await db.pendingPush(roomCode);
      return {success:failed===0&&pending===0,sent,skipped,failed,pending};
    },
    async cron(db) {
      if(!(await this.config(db)).enabled)throw new HttpError(503,'PUSH_UNAVAILABLE','Thông báo hiện chưa khả dụng.');
      const date=new Date(now()),schedule=vietnamSchedule(date);
      if(schedule.due)await db.queueExpiry(schedule.day,date.toISOString(),schedule.expires);
      // C025 may invoke independent bounded photo cleanup here; push counters stay unchanged.
      return this.dispatch(db,null,{budgetMs:20000,maximum:100});
    }
  };
}
export const pushService=createPushService();
