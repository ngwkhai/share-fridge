import { api, type SessionCache, type PushDevice } from './api';

type State = { enabled:boolean; busy:boolean; available:boolean; message:string };
const initial:State={enabled:false,busy:false,available:false,message:''};
const unavailable='Thông báo chưa khả dụng trên thiết bị này. Trên iPhone, hãy thêm ứng dụng vào Màn hình chính rồi mở lại.';
const changed=()=>new Error('Phiên đã thay đổi. Hãy mở lại phần thông báo.');
const bounded = <T,>(promise:Promise<T>,ms:number,onTimeout=()=>{}) => new Promise<T>((resolve,reject)=>{
  const timer=setTimeout(()=>{onTimeout();reject(new Error('Chưa hoàn tất kết nối thông báo. Vui lòng thử lại.'));},ms);
  promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});
export function createPushClient({client=api,browser=()=>({navigator,window,Notification}),deadline=15000}={}) {
  let session:SessionCache|null=null, generation=0, state={...initial}, config:{enabled:boolean;public_key:string|null}|null=null;
  const listeners=new Set<()=>void>();
  const update=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const supported=()=>{try {const b=browser();return b.window.isSecureContext&&!!b.navigator.serviceWorker&&!!b.navigator.locks&&'PushManager' in b.window&&!!b.Notification;}catch{return false;}};
  const locked=<T,>(operation:()=>Promise<T>)=>{
    const b=browser(),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),deadline);
    return b.navigator.locks.request('sharefridge-push-device',{mode:'exclusive',signal:controller.signal},async()=>{
      clearTimeout(timer);return operation();
    }).finally(()=>clearTimeout(timer));
  };
  const registration=()=>bounded(browser().navigator.serviceWorker.ready,deadline);
  const cleanup=async(record:PushDevice,token?:string)=>{
    const current=client.pushDevice.get();
    if(current&&current.owner!==record.owner)return; // A newer activation owns the browser endpoint.
    let failure:unknown;
    if(token)try{await client.unsubscribePush(record.endpoint,token);}catch(error){failure=error;}
    const sub=await (await registration()).pushManager.getSubscription();
    if(sub?.endpoint===record.endpoint)await sub.unsubscribe();
    client.pushDevice.clear(record.owner);
    if(failure)throw new Error('Thiết bị đã tắt thông báo; chưa xác nhận xóa đăng ký trên máy chủ.');
  };
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>state,
    setSession(next:SessionCache|null) {
      if(session?.token===next?.token)return;
      const previous=session,roomChanged=previous?.code!==next?.code;
      session=next;generation++;
      if(!roomChanged)return; // Nickname token renewal retains the same registration.
      config=null;update({...initial});
      const record=client.pushDevice.get();
      if(record&&record.room_code!==next?.code) {
        // The cleanup remains serialized even if the caller leaves this screen.
        if(supported())void bounded(locked(()=>cleanup(record,previous?.code===record.room_code?previous.token:undefined)),deadline).catch(()=>{});
        else client.pushDevice.clear(record.owner);
      }
    },
    async inspect() {
      const captured=session,epoch=generation;
      if(!captured)return;
      if(!supported()){update({...initial,message:unavailable});return;}
      update({busy:true,message:''});
      try {
        const result=await client.getPushConfig(captured.token);
        if(epoch!==generation)return;
        config=result;
        if(!result.enabled){update({enabled:false,available:false,message:'Thông báo của tủ hiện chưa được thiết lập.'});return;}
        // A local permission/subscription alone is never server confirmation.
        // Reconcile only a previously enabled registration for this room.
        const record=client.pushDevice.get();
        let enabled=false;
        if(record?.room_code===captured.code)await locked(async()=>{
          if(epoch!==generation)return;
          const sub=await (await registration()).pushManager.getSubscription();
          if(sub?.endpoint===record.endpoint&&browser().Notification.permission==='granted') {
            const reply=await client.subscribePush(sub.toJSON(),captured.code,undefined,captured.token);
            if(epoch===generation){client.pushDevice.save({...record,subscriber_id:reply.subscriber_id});enabled=true;}
          }else client.pushDevice.clear(record.owner);
        });
        if(epoch===generation)update({enabled,available:true});
      }catch(error){if(epoch===generation)update({enabled:false,message:error instanceof Error?error.message:'Không thể kiểm tra thông báo.'});}
      finally{if(epoch===generation)update({busy:false});}
    },
    async enable() {
      const captured=session,epoch=generation;
      if(!captured||!supported()||!config?.enabled||!config.public_key){update({message:'Thông báo hiện chưa sẵn sàng. Hãy thử mở lại.'});return;}
      const publicKey=config.public_key;
      // Invoke synchronously from the button gesture, before lock/network awaits.
      const permission=browser().Notification.requestPermission();
      update({busy:true,enabled:false,message:''});
      let cancelled=false;
      const operation=locked(async()=>{
        if(await permission!=='granted')throw new Error('Chưa được cấp quyền thông báo. Bạn có thể bật lại trong cài đặt trình duyệt.');
        if(epoch!==generation||cancelled)throw changed();
        const reg=await registration();
        let sub=await reg.pushManager.getSubscription();
        const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
        if(sub&&sub.options.applicationServerKey&&Array.from(new Uint8Array(sub.options.applicationServerKey)).join(',')!==Array.from(key).join(',')){await sub.unsubscribe();sub=null;}
        if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        let record:PushDevice={room_code:captured.code,subscriber_id:'',endpoint:sub.endpoint,owner:crypto.randomUUID()};
        try {
          if(epoch!==generation||cancelled)throw changed();
          const reply=await client.subscribePush(sub.toJSON(),captured.code,undefined,captured.token);
          record={...record,subscriber_id:reply.subscriber_id};
          // Save ownership while holding the origin-wide lock before any cleanup.
          client.pushDevice.save(record);
          if(epoch!==generation||cancelled)throw changed();
          update({enabled:true,message:'Đã đăng ký thông báo trên thiết bị này.'});
        }catch(error){
          // No new activation can enter this lock before compensation finishes.
          // An earlier record is replaced only while this operation owns the lock.
          client.pushDevice.save(record);
          await cleanup(record,captured.token).catch(()=>{});
          throw error;
        }
      });
      try{await bounded(operation,deadline,()=>{cancelled=true;});}
      catch(error){if(epoch===generation)update({enabled:false,message:error instanceof Error?error.message:'Không thể bật thông báo.'});}
      finally{if(epoch===generation)update({busy:false});}
    },
    async disable() {
      const captured=session,record=client.pushDevice.get(),epoch=generation;
      if(!record||record.room_code!==captured?.code){update({enabled:false});return;}
      update({busy:true,message:''});
      try{await bounded(locked(()=>cleanup(record,captured.token)),deadline);if(epoch===generation)update({enabled:false,message:'Đã tắt thông báo trên thiết bị này.'});}
      catch(error){if(epoch===generation)update({enabled:false,message:error instanceof Error?error.message:'Chưa tắt được thông báo. Vui lòng thử lại.'});}
      finally{if(epoch===generation)update({busy:false});}
    },
    async beforeLogout() {await this.disable();}
  };
}
export const pushClient=createPushClient();
