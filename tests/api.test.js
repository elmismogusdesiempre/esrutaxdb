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
  if(p.pathname.endsWith('/rx_profiles')&&p.searchParams.get('code')==='eq.M1')data=[{code:'M1',role:'messenger',active:true}];
  if(p.pathname.endsWith('/rx_settings'))data=[{settings:{allowNoPhoto:false,requireRecipient:true,requireSignature:true}}];
  if(p.pathname.endsWith('/rx_rate_limit'))data=true;
  if(p.pathname.endsWith('/rx_delete_pending'))data={deleted:JSON.parse(options.body).p_ids,skipped:[]};
  if(p.pathname.endsWith('/rx_edit_location'))data={ok:true,package:{id:'p1',address:JSON.parse(options.body).p_address,locationVersion:1}};
  if(p.pathname.endsWith('/rx_save_route_plan'))data={ok:true};
  if(p.pathname.endsWith('/rx_assign_route'))data=JSON.parse(options.body).p_rows.length;
  return new Response(JSON.stringify(data),{status:200});
 };
 const req={method:'POST',headers:{host:'app.example',origin:'https://app.example',cookie:`rx_session=${token}`},body:{action,payload},...extra};
 const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.body=data;}};
 try{await handler(req,response);return {response,operations};}finally{globalThis.fetch=previous;}
}
test('un repartidor no puede ejecutar ninguna acción admin',async()=>{for(const action of ['admin_settings','admin_broadcast','admin_delete_deliveries','admin_assign_route','admin_delete_pending']){const {response,operations}=await request(action,{});assert.equal(response.statusCode,403);assert.equal(operations.filter(x=>x.method!=='GET').length,0);}});
test('un repartidor no puede cambiar reglas, borrar entregas o marcar estado sin evidencia',async()=>{for(const action of ['save_settings','delete_package','update_package']){const {response}=await request(action,{settings:{allowNoPhoto:true}});assert.equal(response.statusCode,403);}});
test('el servidor rechaza una entrega sin evidencia aunque el cliente la acepte',async()=>{const {response,operations}=await request('save_event',{event:{id:'e',packageId:'p',status:'delivered',noPhoto:true},photos:[]});assert.equal(response.statusCode,400);assert.equal(operations.some(x=>x.path.endsWith('rx_commit_event')),false);});
test('sesión ausente y origen ajeno no acceden a datos',async()=>{let result=await request('pull',{},'messenger',{headers:{host:'app.example'}});assert.equal(result.response.statusCode,401);assert.equal(result.operations.length,0);result=await request('pull',{},'messenger',{headers:{host:'app.example',origin:'https://evil.example',cookie:`rx_session=${token}`}});assert.equal(result.response.statusCode,403);assert.equal(result.operations.length,0);});
test('cerrar sesión revoca el token del servidor y elimina cookie HttpOnly',async()=>{const {response,operations}=await request('logout');assert.equal(response.statusCode,200);assert.match(response.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert.match(response.headers['Set-Cookie'],/Max-Age=0/);assert.ok(operations.some(x=>x.path.endsWith('/rx_sessions')&&x.method==='DELETE'&&x.query.includes(sha(token))));});
test('ajustes en grupo pasan al RPC únicamente los campos autorizados',async()=>{const {response,operations}=await request('admin_settings',{codes:['M1'],all:false,patch:{allowNoPhoto:true,pin:'0000',role:'admin'}},'admin');assert.equal(response.statusCode,200);const op=operations.find(x=>x.path.endsWith('/rx_apply_settings'));assert.deepEqual(op.body,{p_codes:['M1'],p_patch:{allowNoPhoto:true},p_all:false});});

test('retirar pendientes exige selección válida y envía admin y repartidor desde sesión',async()=>{
 const invalid=await request('admin_delete_pending',{code:'M1',ids:[]},'admin');assert.equal(invalid.response.statusCode,400);
 const {response,operations}=await request('admin_delete_pending',{code:'M1',ids:['p1','p1','p2'],admin:'otro'},'admin');assert.equal(response.statusCode,200);
 const op=operations.find(x=>x.path.endsWith('/rx_delete_pending'));assert.deepEqual(op.body,{p_code:'M1',p_ids:['p1','p2'],p_admin:'ADMIN'});
});

test('configuración realtime usa el repartidor de la sesión e ignora uno enviado por el cliente',async()=>{
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 const {response}=await request('route_live',{code:'OTRO'});assert.equal(response.statusCode,200);
 const {routeTopic}=await import('../lib/route-live.js');assert.equal(response.body.topic,routeTopic('M1'));assert.ok(!JSON.stringify(response.body).includes('test-only'));
});
test('asignar y retirar destinos avisa después de guardar los cambios',async()=>{
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 for(const [action,payload,rpc] of [['admin_assign_route',{code:'M1',mode:'append',items:[{client:'Cliente',address:'Calle'}]},'rx_assign_route'],['admin_delete_pending',{code:'M1',ids:['p1']},'rx_delete_pending']]){
  const {response,operations}=await request(action,payload,'admin');assert.equal(response.statusCode,200);
  const mutation=operations.findIndex(x=>x.path.endsWith('/'+rpc)),broadcast=operations.findIndex(x=>x.path.endsWith('/api/broadcast'));assert.ok(mutation>=0&&broadcast>mutation);
 }
});

test('editar destino usa propietario de sesión y publica solo después de guardar',async()=>{const {response,operations}=await request('package_location_save',{code:'OTRO',id:'p1',address:'Calle nueva',locationVersion:0,pin:{lat:3.4,lng:-76.5,role:'admin'}});assert.equal(response.statusCode,200);const i=operations.findIndex(x=>x.path.endsWith('/rx_edit_location'));assert.deepEqual(operations[i].body,{p_actor:'M1',p_code:'M1',p_id:'p1',p_address:'Calle nueva',p_pin:{lat:3.4,lng:-76.5},p_version:0});assert.ok(operations.findIndex(x=>x.path.endsWith('/api/broadcast'))>i);});
test('admin edita destinos ajenos y no puede usar optimización de repartidor',async()=>{const {response,operations}=await request('package_location_save',{code:'M1',id:'p1',address:'Calle',locationVersion:0,pin:null},'admin');assert.equal(response.statusCode,200);assert.equal(operations.find(x=>x.path.endsWith('/rx_edit_location')).body.p_actor,'ADMIN');assert.equal((await request('save_route_plan',{items:[]},'admin')).response.statusCode,403);});
