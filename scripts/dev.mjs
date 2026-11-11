import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import handler from '../api/rutax.js';
const root=resolve(import.meta.dirname,'..'),port=Number(process.env.PORT)||4173;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/rutax'){
      const chunks=[];let total=0;for await(const part of req){total+=part.length;if(total>4000000){res.writeHead(413);res.end();return;}chunks.push(part);}
      req.body=JSON.parse(Buffer.concat(chunks).toString()||'{}');res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};return handler(req,res);
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root+sep)||/\/(?:\.|node_modules|scripts|tests|lib|db|api)(?:\/|$)/.test(url.pathname)){res.writeHead(404);res.end();return;}
    const data=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end('No encontrado');}
}).listen(port,'0.0.0.0',()=>console.log('Ruta X en http://localhost:'+port));
