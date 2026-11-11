import {createHmac} from 'node:crypto';
// El aviso no contiene destinos ni datos personales. El canal no se puede enumerar por código.
export function routeTopic(code){return 'rx-route-'+createHmac('sha256',String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()).update('rutax:route:'+code).digest('hex');}
export function routeLiveConfig(code){
  const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
  return publishableKey?{enabled:true,url:process.env.SUPABASE_URL,publishableKey,topic:routeTopic(code)}:{enabled:false};
}
export async function notifyRouteChanged(code){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||!process.env.SUPABASE_PUBLISHABLE_KEY)return false;
  try {
    const response=await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`,{
      method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{topic:routeTopic(code),event:'route_changed',payload:{changed:true},private:false}]}),
      signal:AbortSignal.timeout(3500)
    });
    if(!response.ok)console.warn('Route broadcast failed',response.status);
    return response.ok;
  }catch{console.warn('Route broadcast unavailable');return false;}
}
