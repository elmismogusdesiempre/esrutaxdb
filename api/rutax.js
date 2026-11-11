import {routeLiveConfig,notifyRouteChanged} from '../lib/route-live.js';
import { db, eq, rpc, upsert, allRows } from '../lib/db.js';
import { sha,newToken,hashPin,verifyPin,fail,text,validPin,validCode,settingsPatch,cleanPackage,validateDelivery,validatePush,publicProfile,locationEdit,routePlanItems } from '../lib/core.js';
import { sendNotice } from '../lib/push.js';
const cookieName='rx_session';
const filter = (code) => `code=eq.${eq(code)}`;
const profile = async code => (await db(`rx_profiles?${filter(code)}&limit=1`))[0];
async function effective(p) {const [row]=await db('rx_settings?id=eq.true');return {...row.settings,...p.settings};}
async function rate(key,max=10,seconds=900) {if(!await rpc('rx_rate_limit',{p_key:key,p_max:max,p_seconds:seconds})) fail('Demasiados intentos. Intenta más tarde.',429);}
async function session(req) {
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!raw || !/^[\w-]{43}$/.test(raw)) fail('Sesión expirada',401);
  const [s]=await db(`rx_sessions?token_hash=eq.${sha(raw)}&expires_at=gt.${eq(new Date().toISOString())}&limit=1`);
  if(!s) fail('Sesión expirada',401);
  const p=await profile(s.code);
  if(!p?.active) fail('Sesión expirada',401);
  return {p,hash:sha(raw)};
}
const cookie = (res,value,maxAge=2592000) => res.setHeader('Set-Cookie',`${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
async function pull(p,version) {
  if(version && String(version)===String(p.data_version)) return {ok:true,unchanged:true,version:p.data_version};
  if(p.role==='admin') return {ok:true,version:p.data_version,role:'admin',messenger:publicProfile(p),settings:await effective(p)};
  const [route,events,settings]=await Promise.all([
    allRows(`rx_packages?${filter(p.code)}&deleted_at=is.null&or=(status.neq.delivered,completed_at.gte.${eq(new Date(Date.now()-86400000).toISOString())})&order=position.asc,id.asc`),
    db(`rx_events?${filter(p.code)}&deleted_at=is.null&order=timestamp.desc,id.desc&limit=100&select=data`),effective(p)]);
  return {ok:true,version:p.data_version,role:p.role,messenger:publicProfile(p),route:route.map(r=>({...r.data,status:r.status,locationVersion:r.location_version})),events:events.map(e=>e.data),settings};
}
async function upload(code,id,photos,signature) {
  if(!photos.length&&!signature) return {photoUrls:[],photoIds:[],signature:''};
  if(!process.env.DRIVE_BRIDGE_URL||!process.env.DRIVE_BRIDGE_SECRET) fail('Falta configurar el almacenamiento de evidencias',503);
  const res=await fetch(process.env.DRIVE_BRIDGE_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'upload',secret:process.env.DRIVE_BRIDGE_SECRET,code,id,photos,signature}),signal:AbortSignal.timeout(45000)});
  const data=await res.json();if(!res.ok||!data.ok || data.photoUrls?.length!==photos.length || (signature&&!data.signature)) fail('No se pudo guardar toda la evidencia. Reintenta.',502);
  return data;
}
async function ownedPackage(p,id) {
  const [row]=await db(`rx_packages?${filter(p.code)}&id=eq.${eq(id)}&deleted_at=is.null&limit=1`);
  if(!row) fail('Paquete no disponible',404);return row;
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try {
    if(req.method!=='POST') fail('Método no permitido',405);
    const site=process.env.APP_ORIGIN || `https://${req.headers.host}`;
    if(req.headers.origin && req.headers.origin!==site) fail('Origen no permitido',403);
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(Buffer.byteLength(JSON.stringify(b))>4000000) fail('Carga demasiado grande; reduce las fotos',413);
    const action=text(b.action,60), payload=b.payload||{};
    if(action==='public_list') {
      const rows=await db("rx_profiles?role=eq.messenger&active=eq.true&select=code,name,zone,avatar&order=code.asc");return res.status(200).json({ok:true,messengers:rows});
    }
    if(action==='login') {
      const code=text(payload.code,40).toUpperCase(),pin=String(payload.pin||'');
      const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
      await rate('ip:'+sha(ip),60);await rate('account:'+sha(code),10);
      let p=validCode(code)?await profile(code):null;
      if(!p && code==='ADMIN' && validPin(process.env.INITIAL_ADMIN_PIN,true) && pin===process.env.INITIAL_ADMIN_PIN) {
        await db('rx_profiles?on_conflict=code',{method:'POST',prefer:'resolution=ignore-duplicates',body:{code:'ADMIN',name:'Administrador',zone:'Administración',role:'admin',pin_hash:await hashPin(pin)}});
        p=await profile(code);
      }
      if(!p?.active || !validPin(pin,p.role==='admin') || !await verifyPin(pin,p.pin_hash)) fail('Código o PIN incorrecto',401);
      const token=newToken();await db('rx_sessions',{method:'POST',body:{token_hash:sha(token),code:p.code,expires_at:new Date(Date.now()+2592000000).toISOString()}});
      cookie(res,token);return res.status(200).json(await pull(p));
    }
    const {p,hash}=await session(req);
    if(action.startsWith('admin_') && p.role!=='admin') fail('Solo el administrador puede realizar esta acción',403);
    let result={ok:true};
    switch(action) {
      case 'logout':
        await db(`rx_push?${filter(p.code)}&endpoint=eq.${eq(payload.endpoint||'')}`,{method:'DELETE'});
        await db(`rx_sessions?token_hash=eq.${hash}`,{method:'DELETE'});cookie(res,'',0);break;
      case 'pull': result=await pull(p,payload.version);break;
      case 'route_live': if(p.role!=='messenger')fail('Solo repartidores',403);result={ok:true,...routeLiveConfig(p.code)};break;
      case 'delivery_config': result.settings=await effective(p);break;
      case 'history': {
        const before=Number(payload.before),id=text(payload.id,120);
        if(!Number.isFinite(before)||!/^[-A-Za-z0-9_]{1,120}$/.test(id)) fail('Página inválida');
        result.events=(await db(`rx_events?${filter(p.code)}&deleted_at=is.null&or=(timestamp.lt.${before},and(timestamp.eq.${before},id.lt.${eq(id)}))&order=timestamp.desc,id.desc&limit=100&select=data`)).map(row=>row.data);break;
      }
      case 'package_location_get': {
        const code=p.role==='admin'?text(payload.code,40):p.code;
        if(!validCode(code))fail('Repartidor inválido');
        const target=code===p.code?p:await profile(code);if(!target||target.role!=='messenger')fail('Repartidor no disponible',404);
        const [pkg]=await db(`rx_packages?${filter(code)}&id=eq.${eq(text(payload.id,120))}&deleted_at=is.null&limit=1`);
        if(!pkg)fail('El destino ya no está en la ruta',404);
        result.package={...pkg.data,id:pkg.id,status:pkg.status,locationVersion:pkg.location_version};result.messenger=publicProfile(target);result.region=(await effective(target)).geocodeCountry||'';break;
      }
      case 'package_location_save': {
        const code=p.role==='admin'?text(payload.code,40):p.code;
        if(!validCode(code)||!text(payload.id,120))fail('Destino inválido');
        const edit=locationEdit(payload);
        const saved=await rpc('rx_edit_location',{p_actor:p.code,p_code:code,p_id:text(payload.id,120),p_address:edit.address,p_pin:edit.pin,p_version:edit.locationVersion});
        if(!saved.ok)fail(saved.reason==='forbidden'?'No tienes permiso para editar este destino':saved.reason==='delivered'?'La entrega ya fue completada':saved.reason==='missing'?'El destino ya no está en la ruta':'La dirección cambió en otro dispositivo. Cierra y vuelve a abrir la edición.',saved.reason==='forbidden'?403:409);
        result=saved;await notifyRouteChanged(code);break;
      }
      case 'save_route_plan': {
        if(p.role!=='messenger')fail('Solo el repartidor puede ordenar su ruta',403);
        const items=routePlanItems(payload.items),saved=await rpc('rx_save_route_plan',{p_actor:p.code,p_items:items});
        if(!saved.ok)fail('La ruta cambió mientras se calculaba. Vuelve a optimizar.',409);
        result=await pull(await profile(p.code));await notifyRouteChanged(p.code);break;
      }
      case 'save_settings': fail('Los ajustes operativos los configura el administrador',403);break;
      case 'profile': {
        const patch={};
        if(Object.hasOwn(payload,'theme')) {if(!['light','dark','system'].includes(payload.theme)) fail('Tema inválido');patch.theme=payload.theme;}
        if(Object.hasOwn(payload,'avatar')) {
          if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(payload.avatar)||payload.avatar.length>100000) fail('Foto de perfil inválida');patch.avatar=payload.avatar;
        }
        if(payload.newPin) {
          await rate('change:'+p.code,10);
          if(!await verifyPin(String(payload.currentPin),p.pin_hash)) fail('PIN actual incorrecto');
          if(!validPin(payload.newPin,p.role==='admin')) fail('El PIN debe tener '+(p.role==='admin'?6:4)+' dígitos');
          patch.pin_hash=await hashPin(payload.newPin);
        }
        if(Object.keys(patch).length) await db(`rx_profiles?${filter(p.code)}`,{method:'PATCH',body:patch});
        if(patch.pin_hash) await db(`rx_sessions?${filter(p.code)}&token_hash=neq.${hash}`,{method:'DELETE'});
        result.messenger=publicProfile({...p,...patch});break;
      }
      case 'add_packages': {
        if(!Array.isArray(payload.packages)||payload.packages.length>1000) fail('Lista inválida');
        const rows=payload.packages.map((pkg,i)=>{const data=cleanPackage(pkg,i);return {code:p.code,id:data.id,position:data.order,data};});
        if(rows.length) await db('rx_packages?on_conflict=code,id',{method:'POST',body:rows,prefer:'resolution=ignore-duplicates'});break;
      }
      case 'save_event': {
        if(p.role!=='messenger') fail('Solo repartidores',403);
        const e=payload.event,photos=payload.photos||[];
        const settings=await effective(p);validateDelivery(e,photos,settings);
        const [existing]=await db(`rx_events?${filter(p.code)}&id=eq.${eq(e.id)}&limit=1`);
        if(existing) {result={ok:true,photoUrls:existing.data.photos,photoIds:existing.data.photoIds,signature:existing.data.signature};break;}
        const pkg=await ownedPackage(p,e.packageId);
        if(pkg.status==='delivered') fail('Este paquete ya tiene un registro. Actualiza la ruta.');
        const up=await upload(p.code,e.id,photos,e.signature);
        const event={id:text(e.id,120),packageId:pkg.id,guide:pkg.data.guide,client:pkg.data.client,address:pkg.data.address,phone:pkg.data.phone,
          recipient:text(e.recipient),status:e.status,type:pkg.data.type,noPhoto:!photos.length,signed:!!up.signature,signature:up.signature,
          signatureColor:settings.signatureColor,note:text(e.note,1000),messengerCode:p.code,messengerName:p.name,timestamp:Date.now(),photos:up.photoUrls,photo:up.photoUrls[0]||null,photoIds:up.photoIds};
        if(e.gps && Number.isFinite(e.gps.lat) && Number.isFinite(e.gps.lng) && Math.abs(e.gps.lat)<=90 && Math.abs(e.gps.lng)<=180) event.gps={lat:e.gps.lat,lng:e.gps.lng,accuracy:Number(e.gps.accuracy)||0};
        const saved=await rpc('rx_commit_event',{p_code:p.code,p_event:event});
        result={ok:true,photoUrls:saved.photos,photoIds:saved.photoIds,signature:saved.signature};break;
      }
      case 'undo_delivery': await rpc('rx_undo',{p_code:p.code,p_id:text(payload.eventId,120),p_reason:text(payload.reason,500)});break;
      case 'update_package': fail('Registra o deshaz la entrega para cambiar el estado',403);break;
      case 'delete_package': fail('La eliminación se realiza desde administración',403);break;
      case 'notices': {
        const rows=await db(`rx_notice_receipts?${filter(p.code)}&select=read_at,rx_notices(*)&order=rx_notices(created_at).desc&limit=50`);
        result.notices=rows.map(r=>({...r.rx_notices,readAt:r.read_at}));break;
      }
      case 'read_notice': await db(`rx_notice_receipts?${filter(p.code)}&notice_id=eq.${eq(payload.id)}`,{method:'PATCH',body:{read_at:new Date().toISOString()}});break;
      case 'push_config': result.publicKey=process.env.VAPID_PUBLIC_KEY||null;break;
      case 'push_subscribe': {
        const sub=validatePush(payload.subscription);await upsert('rx_push',{code:p.code,endpoint:sub.endpoint,subscription:sub},'endpoint');break;
      }
      case 'admin_list_messengers': result.messengers=(await db('rx_profiles?role=eq.messenger&order=code.asc')).map(publicProfile);break;
      case 'admin_add_messenger': {
        const code=text(payload.code||('M'+newToken().slice(0,7)),40).toUpperCase();
        if(!validCode(code)||code==='ADMIN'||!text(payload.name)||!validPin(payload.pin)) fail('Nombre, código y PIN de 4 dígitos obligatorios');
        await db('rx_profiles',{method:'POST',body:{code,name:text(payload.name),zone:text(payload.zone),pin_hash:await hashPin(payload.pin)}});result.code=code;break;
      }
      case 'admin_update_messenger': {
        const target=await profile(text(payload.code,40));if(!target||target.role!=='messenger') fail('Repartidor no disponible');
        const patch={};for(const k of ['name','zone']) if(Object.hasOwn(payload,k)) patch[k]=text(payload[k]);
        if(Object.hasOwn(payload,'active')) {if(typeof payload.active!=='boolean') fail('Estado inválido');patch.active=payload.active;}
        if(payload.pin) {if(!validPin(payload.pin)) fail('El PIN debe tener 4 dígitos');patch.pin_hash=await hashPin(payload.pin);}
        await db(`rx_profiles?${filter(target.code)}`,{method:'PATCH',body:patch});
        if(patch.pin_hash||patch.active===false) await db(`rx_sessions?${filter(target.code)}`,{method:'DELETE'});break;
      }
      case 'admin_delete_messenger': {
        const code=text(payload.code,40);if(code==='ADMIN') fail('No se puede eliminar al administrador');
        // Conserva el historial: baja operativa del repartidor.
        await db(`rx_profiles?${filter(code)}&role=eq.messenger`,{method:'PATCH',body:{active:false}});
        await db(`rx_sessions?${filter(code)}`,{method:'DELETE'});await db(`rx_push?${filter(code)}`,{method:'DELETE'});break;
      }
      case 'admin_settings': {
        if(!payload.patch) {
          result.defaults=(await db('rx_settings?id=eq.true'))[0].settings;
          result.messengers=(await db('rx_profiles?role=eq.messenger&order=code.asc')).map(x=>({...publicProfile(x),settings:{...result.defaults,...x.settings}}));
        } else {
          const patch=settingsPatch(payload.patch),codes=Array.isArray(payload.codes)?payload.codes.filter(validCode):[];
          if(!payload.all&&!codes.length) fail('Selecciona repartidores');
          await rpc('rx_apply_settings',{p_codes:codes,p_patch:patch,p_all:payload.all===true});
        }break;
      }
      case 'admin_assign_route': {
        const target=await profile(text(payload.code,40));if(!target||target.role!=='messenger') fail('Repartidor no disponible');
        if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>1000) fail('Carga entre 1 y 1000 filas');
        // Reemplazar solo archiva pendientes; nunca elimina evidencias.
        if(!['append','replace'].includes(payload.mode)) fail('Modo inválido');
        const items=payload.items.map((item,i)=>cleanPackage({...item,id:'pkg-'+newToken(),order:i+1,fromCSV:true},i));
        result.added=await rpc('rx_assign_route',{p_code:target.code,p_rows:items,p_replace:payload.mode==='replace'});await notifyRouteChanged(target.code);break;
      }
      case 'admin_delete_pending': {
        const code=text(payload.code,40);
        if(!validCode(code)||!Array.isArray(payload.ids)||!payload.ids.length||payload.ids.length>1000||payload.ids.some(id=>typeof id!=='string'||!id.trim()||id.length>120)) fail('Selecciona entre 1 y 1000 destinos pendientes');
        const target=await profile(code);if(!target||target.role!=='messenger') fail('Repartidor no disponible');
        const removed=await rpc('rx_delete_pending',{p_code:code,p_ids:[...new Set(payload.ids)],p_admin:p.code});
        result={ok:true,...removed};if(removed.deleted?.length)await notifyRouteChanged(code);break;
      }
      case 'admin_get_routes': {
        const code=text(payload.code,40);
        const [rows,events]=await Promise.all([allRows(`rx_packages?${filter(code)}&deleted_at=is.null&order=position.asc`),allRows(`rx_events?${filter(code)}&deleted_at=is.null&order=timestamp.desc&select=data`)]);
        const byPkg=new Map();for(const e of events) if(!byPkg.has(e.data.packageId)) byPkg.set(e.data.packageId,e.data);
        result.routes=rows.map(r=>({...r.data,status:r.status,locationVersion:r.location_version,event:byPkg.get(r.id)}));break;
      }
      case 'admin_live': {
        const since=+payload.since||Date.now()-86400000,until=+payload.until||since+86400000;
        if(until<=since||until-since>32*86400000) fail('Rango máximo 31 días');
        const [people,events,packages]=await Promise.all([db('rx_profiles?role=eq.messenger&active=eq.true&order=code.asc'),allRows(`rx_events?timestamp=gte.${since}&timestamp=lt.${until}&deleted_at=is.null&order=timestamp.desc&select=code,data`),allRows('rx_packages?deleted_at=is.null&select=code,status&order=code,id')]);
        result={ok:true,since,until,messengers:people.map(m=>{const ev=events.filter(e=>e.code===m.code).map(e=>e.data).filter(e=>!e.undoneAt);return {...publicProfile(m),stats:{delivered:ev.filter(e=>e.status==='delivered').length,issues:ev.filter(e=>e.status==='issue').length,signed:ev.filter(e=>e.signed).length,routeTotal:packages.filter(r=>r.code===m.code).length,lastActivity:ev[0]?.timestamp||0},events:ev};})};break;
      }
      case 'admin_deliveries': {
        const since=+payload.since||Date.now()-86400000,until=+payload.until||Date.now();
        if(until<=since||until-since>32*86400000) fail('Rango máximo 31 días');
        result.events=await db(`rx_events?deleted_at=is.null&timestamp=gte.${since}&timestamp=lt.${until}&order=timestamp.desc,code.asc,id.asc&offset=${Math.max(0,Math.trunc(+payload.offset||0))}&limit=200&select=code,id,data`);break;
      }
      case 'admin_delete_deliveries': {
        if(!Array.isArray(payload.keys)||!payload.keys.length||payload.keys.length>200) fail('Selecciona entre 1 y 200 entregas');
        result.deleted=await rpc('rx_delete_deliveries',{p_keys:payload.keys.map(k=>({id:text(k.id,120),code:text(k.code,40)})),p_admin:p.code});break;
      }
      case 'admin_broadcast': {
        const title=text(payload.title,100),body=text(payload.body,1500),level=payload.level;
        if(!title||!body||!['urgent','info','friendly'].includes(level)) fail('Completa título, mensaje y prioridad');
        await rate('broadcast:'+p.code,20,3600);
        const id=await rpc('rx_broadcast',{p_admin:p.code,p_title:title,p_body:body,p_level:level});
        try {
          const subs=await allRows('rx_push?select=*,rx_profiles!inner(active)&rx_profiles.active=eq.true&order=id');
          result.push=await sendNotice({id,title,body,level},subs);
        } catch {result.push={sent:0,failed:0,configured:true,error:'El aviso se guardó, pero falló el envío push'};}
        result.id=id;break;
      }
      default: fail('Acción desconocida',404);
    }
    return res.status(200).json(result);
  } catch(error) {
    if(error.status===401) cookie(res,'',0);
    if(!error.status) console.error('RutaX',error.name,error.message);
    return res.status(error.status||500).json({ok:false,error:error.status?error.message:'No se pudo completar la operación. Reintenta.'});
  }
}
