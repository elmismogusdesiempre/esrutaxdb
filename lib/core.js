import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCb);
export const sha = s => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(String(pin), salt, 64)).toString('hex')}`;
}
export async function verifyPin(pin, encoded) {
  const [salt, key] = String(encoded || '').split(':');
  if (!salt || !key || key.length !== 128) return false;
  const actual = await scrypt(String(pin), salt, 64);
  return timingSafeEqual(Buffer.from(key, 'hex'), actual);
}
export function fail(message, status=400) { throw Object.assign(new Error(message), {status}); }
export function text(value, max=200) { return String(value ?? '').trim().slice(0,max); }
export function validPin(pin, admin=false) { return (admin ? /^\d{6}$/ : /^\d{4}$/).test(String(pin)); }
export function validCode(code) { return /^[A-Z0-9_-]{1,40}$/.test(code); }
export function settingsPatch(value) {
  const patch = {};
  for (const key of ['requireRecipient','allowNoPhoto','promptWhatsApp','requireSignature']) {
    if (Object.hasOwn(value,key)) {
      if (typeof value[key] !== 'boolean') fail('Opción inválida: '+key);
      patch[key]=value[key];
    }
  }
  if (Object.hasOwn(value,'geocodeCountry')) patch.geocodeCountry=text(value.geocodeCountry,120);
  if (Object.hasOwn(value,'signatureColor')) {
    if (!/^#[0-9a-f]{6}$/i.test(value.signatureColor)) fail('Color inválido');
    patch.signatureColor=value.signatureColor;
  }
  if (!Object.keys(patch).length) fail('Selecciona al menos una opción');
  return patch;
}
export function cleanPackage(p, index=0) {
  if (!p || !text(p.id,120)) fail('Paquete inválido');
  const out = {id:text(p.id,120), order:Number.isFinite(+p.order)?Math.trunc(+p.order):index+1,
    guide:text(p.guide,120), client:text(p.client),address:text(p.address,500),phone:text(p.phone,40),
    type:p.type==='pickup'?'pickup':'delivery',status:'pending',retry:false,
    fromCSV:!!p.fromCSV,fromManual:!!p.fromManual};
  if(typeof p.lat==='number' && typeof p.lng==='number' && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180) {out.lat=p.lat;out.lng=p.lng;}
  return out;
}
export function validateDelivery(event, photos, settings) {
  if(!event || !text(event.id,120) || !text(event.packageId,120)) fail('Entrega inválida');
  if(!['delivered','issue'].includes(event.status)) fail('Estado inválido');
  if(!Array.isArray(photos) || photos.length>8) fail('Máximo 8 fotos por entrega');
  for(const photo of photos) if(typeof photo!=='string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length>900000) fail('Foto inválida o demasiado grande');
  if(event.status==='delivered') {
    if(!photos.length && !(settings.allowNoPhoto && event.noPhoto)) fail('Se requiere una foto');
    if(settings.requireRecipient && !text(event.recipient)) fail('Se requiere el nombre de quien recibe');
    if(settings.requireSignature && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(event.signature||'')) fail('Se requiere firma');
  }
  if(event.signature && (typeof event.signature!=='string' || event.signature.length>500000)) fail('Firma demasiado grande');
}
export function validatePush(subscription) {
  let u; try {u=new URL(subscription?.endpoint);} catch {fail('Suscripción inválida');}
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com','notify.windows.com'];
  if(u.protocol!=='https:' || u.port || !hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))) fail('Proveedor de notificaciones inválido');
  if(!/^[\w-]{80,100}$/.test(subscription.keys?.p256dh||'') || !/^[\w-]{20,30}$/.test(subscription.keys?.auth||'')) fail('Claves de notificación inválidas');
  return {endpoint:u.href,expirationTime:null,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};
}
export function publicProfile(p) {return {code:p.code,name:p.name,zone:p.zone,active:p.active,avatar:p.avatar,theme:p.theme};}

export function locationEdit(payload){
 const address=String(payload.address??'').trim();
 if(!address||address.length>500)fail('Escribe una dirección de hasta 500 caracteres');
 if(!Number.isSafeInteger(payload.locationVersion)||payload.locationVersion<0)fail('Actualiza el destino antes de editarlo');
 let pin=null;
 if(payload.pin!==null){if(!payload.pin||typeof payload.pin.lat!=='number'||typeof payload.pin.lng!=='number'||!Number.isFinite(payload.pin.lat)||!Number.isFinite(payload.pin.lng)||Math.abs(payload.pin.lat)>90||Math.abs(payload.pin.lng)>180)fail('Elige un punto válido en el mapa');pin={lat:payload.pin.lat,lng:payload.pin.lng};}
 return {address,pin,locationVersion:payload.locationVersion};
}
export function routePlanItems(items){
 if(!Array.isArray(items)||!items.length||items.length>250)fail('La optimización admite hasta 250 destinos');
 const seen=new Set();
 return items.map(item=>{if(typeof item.id!=='string'||!item.id||item.id.length>120||seen.has(item.id)||!Number.isInteger(item.order)||item.order<1||item.order>1000000||!Number.isSafeInteger(item.locationVersion)||item.locationVersion<0)fail('La ruta cambió; actualízala y vuelve a optimizar');seen.add(item.id);const out={id:item.id,order:item.order,locationVersion:item.locationVersion};if(item.lat!==undefined||item.lng!==undefined){if(typeof item.lat!=='number'||typeof item.lng!=='number'||!Number.isFinite(item.lat)||!Number.isFinite(item.lng)||Math.abs(item.lat)>90||Math.abs(item.lng)>180)fail('Coordenadas inválidas');out.lat=item.lat;out.lng=item.lng;}return out;});
}
