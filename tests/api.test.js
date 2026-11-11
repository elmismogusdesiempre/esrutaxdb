import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/rutax.js';
import {sha,hashPin} from '../lib/core.js';
const token='a'.repeat(43);
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
async function request(action,payload={},role='messenger',extra={}) {
 const operations=[];const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const p=new URL(url);operations.push({path:p.pathname,query:p.search,method:options.method,body:options.body?JSON.parse(options.body):null});
  let data=[];
  if(p.pathname.endsWith('/rx_sessions')) data=[{code:role==='admin'?'ADMIN':'M1'}];
  if(p.pathname.endsWith('/rx_profiles')) data=[{code:role==='admin'?'ADMIN':'M1',name:'Prueba',zone:'Centro',role,active:true,pin_hash:await hashPin('1234'),settings:{}}];
  if(p.pathname.endsWith('/rx_settings'))data=[{settings:{allowNoPhoto:false,requireRecipient:true,requireSignature:true}}];
  if(p.pathname.endsWith('/rx_rate_limit'))data=true;
  return new Response(JSON.stringify(data),{status:200});
 };
 const req={method:'POST',headers:{host:'app.example',origin:'https://app.example',cookie:`rx_session=${token}`},body:{action,payload},...extra};
 const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.body=data;}};
 try{await handler(req,response);return {response,operations};}finally{globalThis.fetch=previous;}
}
test('un repartidor no puede ejecutar ninguna acción admin',async()=>{for(const action of ['admin_settings','admin_broadcast','admin_delete_deliveries','admin_assign_route']){const {response,operations}=await request(action,{});assert.equal(response.statusCode,403);assert.equal(operations.filter(x=>x.method!=='GET').length,0);}});
test('un repartidor no puede cambiar reglas, borrar entregas o marcar estado sin evidencia',async()=>{for(const action of ['save_settings','delete_package','update_package']){const {response}=await request(action,{settings:{allowNoPhoto:true}});assert.equal(response.statusCode,403);}});
test('el servidor rechaza una entrega sin evidencia aunque el cliente la acepte',async()=>{const {response,operations}=await request('save_event',{event:{id:'e',packageId:'p',status:'delivered',noPhoto:true},photos:[]});assert.equal(response.statusCode,400);assert.equal(operations.some(x=>x.path.endsWith('rx_commit_event')),false);});
test('sesión ausente y origen ajeno no acceden a datos',async()=>{let result=await request('pull',{},'messenger',{headers:{host:'app.example'}});assert.equal(result.response.statusCode,401);assert.equal(result.operations.length,0);result=await request('pull',{},'messenger',{headers:{host:'app.example',origin:'https://evil.example',cookie:`rx_session=${token}`}});assert.equal(result.response.statusCode,403);assert.equal(result.operations.length,0);});
test('cerrar sesión revoca el token del servidor y elimina cookie HttpOnly',async()=>{const {response,operations}=await request('logout');assert.equal(response.statusCode,200);assert.match(response.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert.match(response.headers['Set-Cookie'],/Max-Age=0/);assert.ok(operations.some(x=>x.path.endsWith('/rx_sessions')&&x.method==='DELETE'&&x.query.includes(sha(token))));});
test('ajustes en grupo pasan al RPC únicamente los campos autorizados',async()=>{const {response,operations}=await request('admin_settings',{codes:['M1'],all:false,patch:{allowNoPhoto:true,pin:'0000',role:'admin'}},'admin');assert.equal(response.statusCode,200);const op=operations.find(x=>x.path.endsWith('/rx_apply_settings'));assert.deepEqual(op.body,{p_codes:['M1'],p_patch:{allowNoPhoto:true},p_all:false});});
