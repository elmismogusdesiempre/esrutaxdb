// Solo utiliza la API del mismo dominio; las claves de Supabase permanecen en Vercel.
const TOKEN_KEY='rx_session_marker_v2';
let activeSession=false,version=null,sessionEpoch=0;
async function apiRequest(action,payload={}) {
  const requestEpoch=sessionEpoch;
  if(action==='pull'&&version!==null)payload={...payload,version};
  const response=await fetch('/api/rutax',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});
  const data=await response.json();
  if(action==='pull'&&requestEpoch!==sessionEpoch)return {ok:true,unchanged:true};
  if(!response.ok||data.ok===false) {
    if(response.status===401){localStorage.removeItem(TOKEN_KEY);activeSession=false;}
    throw Object.assign(new Error(data.error||'Error del servidor'),{status:response.status});
  }
  if(action==='pull'&&version!==null&&data.version!=null&&Number(data.version)<Number(version))return {ok:true,unchanged:true,version};
  window.RutaXPeople?.remember(data.messengers || []);
  if(data.messenger) window.RutaXPeople?.remember(data.messenger);
  if((action==='pull'||action==='login')&&!data.unchanged) {
    if(action==='login')sessionEpoch++;
    version=data.version??null;
    activeSession=true;localStorage.setItem(TOKEN_KEY,'1');
    window.dispatchEvent(new CustomEvent('rutax:session',{detail:data}));
  }
  return data;
}
async function logout() {
  let endpoint='';
  if('serviceWorker' in navigator) {
    const reg=await navigator.serviceWorker.getRegistration();
    const sub=await reg?.pushManager?.getSubscription();endpoint=sub?.endpoint||'';
  }
  await apiRequest('logout',{endpoint});
  localStorage.removeItem(TOKEN_KEY);activeSession=false;version=null;sessionEpoch++;
  window.dispatchEvent(new Event('rutax:logout'));
}
window.RutaXAPI={
  request:apiRequest,
  publicList:async()=> (await apiRequest('public_list')).messengers,
  login:(code,pin)=>apiRequest('login',{code,pin}),
  logout,clearSession:logout,
  isLoggedIn:()=>!!localStorage.getItem(TOKEN_KEY),
  pull:()=>apiRequest('pull'),
  saveEvent:async(event,photos)=>{
    const clean={...event};delete clean.localPhotos;delete clean.photos;delete clean.photo;
    const key=event.messengerCode+'|'+event.id;
    await RutaXOutbox.put({key,code:event.messengerCode,event:clean,photos});
    const result=await apiRequest('save_event',{event:clean,photos});
    await RutaXOutbox.remove(key);return result;
  },
  saveSettings:settings=>apiRequest('save_settings',{settings}),
  addPackages:packages=>apiRequest('add_packages',{packages}),
  undoDelivery:(eventId,reason)=>apiRequest('undo_delivery',{eventId,reason}),
  updatePackage:(packageId,status)=>apiRequest('update_package',{packageId,status}),
  deletePackage:packageId=>apiRequest('delete_package',{packageId}),
  adminListMessengers:()=>apiRequest('admin_list_messengers'),
  adminAddMessenger:p=>apiRequest('admin_add_messenger',p),
  adminUpdateMessenger:p=>apiRequest('admin_update_messenger',p),
  adminDeleteMessenger:code=>apiRequest('admin_delete_messenger',{code}),
  adminAssignRoute:(code,items,mode)=>apiRequest('admin_assign_route',{code,items,mode}),
  adminLive:(since,until)=>apiRequest('admin_live',{since,until}),
  adminDeletePending:(code,ids)=>apiRequest('admin_delete_pending',{code,ids}),
  adminGetRoutes:code=>apiRequest('admin_get_routes',{code})
};
