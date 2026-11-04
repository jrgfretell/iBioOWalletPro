// Adaptador PostgREST/Auth mínimo para pruebas LOCALES. Nunca sirve producción.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=(await fs.readFile(path.join(root,'.local/ultima-etapa2.txt'),'utf8')).trim();
const resume=process.argv.includes('--resume');
const dir=resume?path.resolve((await fs.readFile(path.join(root,'.local/ultima-etapa3-preview.txt'),'utf8')).trim()):path.join(root,'.local','etapa3-preview-'+Date.now());
if(path.dirname(dir)!==path.join(root,'.local')||!path.basename(dir).startsWith('etapa3-preview-'))throw Error('Ruta de pruebas no válida');
if(!resume){
 await fs.mkdir(dir);
 await fs.cp(path.join(baseline,'postgres'),path.join(dir,'postgres'),{recursive:true,errorOnExist:true,force:false});
}
await fs.writeFile(path.join(root,'.local/ultima-etapa3-preview.txt'),dir);
const db=new PGlite(path.join(dir,'postgres'));
if(process.argv.includes('--refresh-stage5'))
 await db.exec(await fs.readFile(path.join(root,'supabase/rollback/202611030002_consistencia_pagos.sql'),'utf8'));
if(!(await db.query("SELECT 1 FROM wallet_internal.migraciones WHERE version='202611030002_consistencia_pagos'")).rows.length)
 await db.exec(await fs.readFile(path.join(root,'supabase/migrations/202611030002_consistencia_pagos.sql'),'utf8'));
const owners=(await db.query('SELECT user_id FROM public.billeteras WHERE es_principal ORDER BY id')).rows.map(r=>r.user_id);
const secret=crypto.randomBytes(32);
const q=x=>'"'+x.replaceAll('"','""')+'"';
const metadata=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
const tables=new Map();
for(const row of metadata){if(!tables.has(row.table_name))tables.set(row.table_name,new Set());tables.get(row.table_name).add(row.column_name);}
const sign=(payload)=>{const p=Buffer.from(JSON.stringify(payload)).toString('base64url');const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const text=h+'.'+p;return text+'.'+crypto.createHmac('sha256',secret).update(text).digest('base64url');};
const user=(id)=>({id,aud:'authenticated',role:'authenticated',email:id===owners[0]?'pruebas@example.test':'segunda@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Cuenta de pruebas'},created_at:'2026-11-03T00:00:00Z'});
const session=id=>({access_token:sign({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)}),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'local-refresh-'+owners.indexOf(id),user:user(id)});
function identity(req){
 const value=req.headers.authorization?.replace(/^Bearer /i,'')||'';
 const parts=value.split('.');
 if(parts.length!==3)throw Object.assign(Error('Inicia sesión en el entorno de pruebas'),{code:'42501'});
 const mac=crypto.createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest('base64url');
 if(mac!==parts[2])throw Object.assign(Error('Sesión de pruebas inválida'),{code:'42501'});
 const payload=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(!owners.includes(payload.sub)||payload.exp<Date.now()/1000)throw Object.assign(Error('Sesión caducada'),{code:'42501'});
 return payload.sub;
}
const faults=[];
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!['http://127.0.0.1:5174','http://localhost:5174'].includes(origin)){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://127.0.0.1:5174');
 res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,prefer,x-client-info,range,range-unit,x-supabase-api-version,accept-profile,content-profile');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,HEAD,OPTIONS');
 res.setHeader('Access-Control-Expose-Headers','content-range');
 const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1:54330');
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw Error('Request too large');}
  const body=raw?JSON.parse(raw):{};
  if(url.pathname==='/__test/fault'&&req.method==='POST'){faults.push(body);send(200,{ok:true});return;}
  if(url.pathname==='/__test/info'){send(200,{local_only:true,wallets_schema:true,directory:dir});return;}
  if(url.pathname==='/auth/v1/token'){
   const index=body.email==='segunda@example.test'?1:0;
   if(url.searchParams.get('grant_type')==='refresh_token'){const i=Number(String(body.refresh_token).replace('local-refresh-',''));send(200,session(owners[i]));return;}
   if(!['pruebas@example.test','segunda@example.test'].includes(body.email)||body.password!=='PruebaLocal123!'){send(400,{msg:'Invalid login credentials'});return;}
   send(200,session(owners[index]));return;
  }
  if(url.pathname==='/auth/v1/logout'){send(200,{});return;}
  const uid=identity(req);
  if(url.pathname==='/auth/v1/user'){send(200,user(uid));return;}
  const table=url.pathname.replace('/rest/v1/','');
  const faultIndex=faults.findIndex(f=>f.table===table&&(!f.method||f.method===req.method));
  if(faultIndex>=0){const fault=faults.splice(faultIndex,1)[0];if(fault.delay)await new Promise(r=>setTimeout(r,Math.min(fault.delay,5000)));if(fault.fail){send(500,{code:'TEST_FAILURE',message:'Fallo simulado en pruebas'});return;}}
  const rows=await db.transaction(async tx=>{
   await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);
   await tx.exec('SET LOCAL ROLE authenticated');
   if(table==='rpc/crear_billetera'&&req.method==='POST')return (await tx.query('SELECT * FROM public.crear_billetera($1,$2)',[body.p_nombre,body.p_moneda])).rows;
   if(table==='rpc/operacion_billetera'&&req.method==='POST')return [(await tx.query('SELECT public.operacion_billetera($1,$2,$3,$4::jsonb) AS result',[body.p_billetera_id,body.p_solicitud,body.p_accion,JSON.stringify(body.p_datos)])).rows[0].result];
   if(!tables.has(table))throw Object.assign(Error('Table unavailable'),{code:'PGRST205'});
   const cols=tables.get(table);
   const valid=c=>{if(!cols.has(c))throw Error('Unsupported column');return q(c);};
   const params=[];const param=v=>{params.push(v);return '$'+params.length;};
   const filters=[];
   for(const [key,value] of url.searchParams){
    if(['select','order','offset','limit','on_conflict','columns'].includes(key))continue;
    if(!value.startsWith('eq.'))throw Error('Unsupported test filter');
    filters.push(valid(key)+'='+param(value.slice(3)));
   }
   const where=filters.length?' WHERE '+filters.join(' AND '):'';
   const selection=url.searchParams.get('select')||'*';
   const selected=selection==='*'?'*':selection.split(',').map(valid).join(',');
   if(['GET','HEAD'].includes(req.method)){
    const count=(await tx.query(`SELECT count(*)::int AS count FROM public.${q(table)}${where}`,params)).rows[0].count;
    const order=(url.searchParams.get('order')||'id.asc').split(',').map(part=>{const [col,direction]=part.split('.');return valid(col)+(direction==='desc'?' DESC':' ASC');}).join(',');
    const offset=Math.max(0,Number(url.searchParams.get('offset')||0));const limit=Math.min(500,Math.max(0,Number(url.searchParams.get('limit')||500)));
    res.setHeader('Content-Range',`${offset}-${Math.max(offset,Math.min(count,offset+limit)-1)}/${count}`);
    return (await tx.query(`SELECT ${selected} FROM public.${q(table)}${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,params)).rows;
   }
   if(req.method==='POST'){
    const output=[];
    for(const row of Array.isArray(body)?body:[body]){
     const keys=Object.keys(row);keys.forEach(valid);
     const conflict=url.searchParams.get('on_conflict');
     const upsert=conflict?` ON CONFLICT (${conflict.split(',').map(valid).join(',')}) DO UPDATE SET ${keys.filter(k=>k!=='id').map(k=>`${valid(k)}=excluded.${valid(k)}`).join(',')}`:'';
     const placeholders=keys.map((_,i)=>'$'+(i+1));
     output.push(...(await tx.query(`INSERT INTO public.${q(table)}(${keys.map(valid).join(',')}) VALUES(${placeholders})${upsert} RETURNING ${selected}`,Object.values(row))).rows);
    }return output;
   }
   if(req.method==='PATCH'){
    const setters=Object.entries(body).map(([k,v])=>valid(k)+'='+param(v));
    return (await tx.query(`UPDATE public.${q(table)} SET ${setters.join(',')}${where} RETURNING ${selected}`,params)).rows;
   }
   if(req.method==='DELETE')return (await tx.query(`DELETE FROM public.${q(table)}${where} RETURNING ${selected}`,params)).rows;
   throw Error('Unsupported test method');
  });
  if(String(req.headers.accept).includes('application/vnd.pgrst.object+json')){
   if(rows.length!==1){send(406,{code:'PGRST116',message:'Expected one row'});return;}send(200,rows[0]);
  }else if(req.method==='GET'||String(req.headers.prefer).includes('return=representation')||table.startsWith('rpc/'))send(200,rows);
  else{res.writeHead(204);res.end();}
 }catch(error){send(error.code==='42501'?403:400,{code:error.code||'TEST_ERROR',message:error.message});}
});
server.listen(54330,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:54330',preview:dir,login:'pruebas@example.test',password:'PruebaLocal123!',localOnly:true})));
const stop=()=>server.close(async()=>{await db.close();process.exit(0);});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
