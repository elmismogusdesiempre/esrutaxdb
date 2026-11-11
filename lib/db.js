export async function db(path, {method='GET', body, prefer, range}={}) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key || !process.env.SUPABASE_URL) throw Object.assign(new Error('Falta configurar Supabase en el servidor'),{status:503});
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  if(prefer) headers.Prefer=prefer;
  if(range) headers.Range=range;
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const raw=await response.text();
  if(!response.ok) { console.error('Supabase error',response.status,raw.slice(0,300)); throw Object.assign(new Error('No se pudo completar la operación de base de datos'),{status:500}); }
  return raw?JSON.parse(raw):null;
}
export const eq = value => encodeURIComponent(String(value));
export const rpc = (name,body) => db(`rpc/${name}`,{method:'POST',body});
export async function allRows(path) {
  const rows=[];
  for(let offset=0;;offset+=1000) {
    const page=await db(path,{range:`${offset}-${offset+999}`});
    rows.push(...page); if(page.length<1000) return rows;
  }
}
export const upsert = (table,body,conflict) => db(`${table}?on_conflict=${conflict}`,{method:'POST',body,prefer:'resolution=merge-duplicates,return=representation'});
