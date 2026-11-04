// Restores the latest consistent snapshot locally, rehearses both migrations,
// and prepares one guarded production transaction. Never connects to Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
process.on('uncaughtException',error=>{console.error(JSON.stringify({error:String(error.message),code:error.code}));process.exit(1);});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const backup=(await fs.readFile(path.join(root,'.local/ultima-etapa6.txt'),'utf8')).trim();
const snap=JSON.parse(await fs.readFile(path.join(backup,'respaldo-consistente-v2.json'),'utf8'));
const cat=snap.catalogo,data=snap.datos,tables=['config_billetera','categorias','sueldos_mes','movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos'],owners=snap.auth_users.map(u=>u.id);
assert(snap.huella_datos&&snap.huella_catalogo&&snap.huella_auth,'Faltan las huellas del servidor');
assert.deepEqual(cat.tablas.map(t=>t.tabla).sort(),tables.slice().sort(),'Hay tablas públicas no revisadas');
const q=s=>'"'+s.replaceAll('"','""')+'"';
const literal=v=>v===null?'NULL':typeof v==='boolean'?(v?'TRUE':'FALSE'):typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const schema=['-- Recuperación del esquema de aplicación; solo para destino vacío. Auth se conserva por separado.','CREATE SCHEMA IF NOT EXISTS public;'];
for(const table of tables){
  schema.push(`CREATE TABLE public.${q(table)} (`+cat.columnas.filter(c=>c.table_name===table).map(c=>{
    const type=cat.tipos_sql.find(t=>t.tabla===table&&t.columna===c.column_name).tipo;
    return q(c.column_name)+' '+type+(c.is_identity==='YES'?' GENERATED '+c.identity_generation+' AS IDENTITY':c.column_default?' DEFAULT '+c.column_default:'')+(c.is_nullable==='NO'?' NOT NULL':'');
  }).join(',')+');');
}
for(const c of [...cat.restricciones].sort((a,b)=>Number(a.definicion.startsWith('FOREIGN KEY'))-Number(b.definicion.startsWith('FOREIGN KEY'))))schema.push(`ALTER TABLE public.${q(c.tabla.replace(/^public\./,''))} ADD CONSTRAINT ${q(c.nombre)} ${c.definicion};`);
const constraints=new Set(cat.restricciones.map(c=>c.nombre));
for(const i of cat.indices)if(!constraints.has(i.indexname))schema.push(i.indexdef+';');
for(const t of cat.tablas)if(t.rls)schema.push(`ALTER TABLE public.${q(t.tabla)} ENABLE ROW LEVEL SECURITY;`);
for(const p of cat.politicas)schema.push(`CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`);
for(const f of cat.funciones_publicas||[])schema.push(f.definicion.trim()+';');
for(const t of cat.triggers||[])schema.push(t.definicion+';');
for(const g of cat.permisos||[])schema.push(`GRANT ${g.privilege_type} ON TABLE public.${q(g.table_name)} TO ${q(g.grantee)}${g.is_grantable==='YES'?' WITH GRANT OPTION':''};`);
schema.push('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;','GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;');
const inserts=['-- Solo en destino vacío, después de restaurar esquema y conservar los propietarios de Auth.'];
for(const table of tables){
  for(const row of data[table])inserts.push(`INSERT INTO public.${q(table)}(${Object.keys(row).map(q).join(',')}) OVERRIDING SYSTEM VALUE VALUES(${Object.values(row).map(literal).join(',')});`);
  const sequence=cat.secuencias.find(s=>s.sequencename===table+'_id_seq');
  const last=Math.max(Number(sequence?.last_value)||1,...data[table].map(r=>Number(r.id)));
  inserts.push(`SELECT setval(pg_get_serial_sequence('public.${table}','id'),${last},${data[table].length||sequence?.last_value?'true':'false'});`);
}
await fs.writeFile(path.join(backup,'esquema-public-recuperacion.sql'),schema.join('\n'));
await fs.writeFile(path.join(backup,'datos-public-recuperacion.sql'),inserts.join('\n'));
const sql1=await fs.readFile(path.join(root,'supabase/migrations/202611030001_billeteras.sql'),'utf8');
const sql2=await fs.readFile(path.join(root,'supabase/migrations/202611030002_consistencia_pagos.sql'),'utf8');
const transaction=sql=>sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
const body=transaction(sql1)+'\n'+transaction(sql2);
const target=path.join(backup,'postgres-ensayo-'+Date.now());
const db=new PGlite(target);let checks=0;
const check=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Falló la comprobación de integridad '+(checks+1));checks++;};
const normalize=row=>Object.fromEntries(Object.keys(row).filter(k=>!['billetera_id','fecha_referencia','archivada'].includes(k)).sort().map(k=>[k,k.endsWith('_el')&&row[k]?new Date(row[k]).toISOString():row[k]]));
async function preserved(){for(const table of tables){const rows=(await db.query(`SELECT to_jsonb(t) AS row FROM public.${q(table)} t ORDER BY id`)).rows.map(r=>normalize(r.row));check(rows,data[table].map(normalize).sort((a,b)=>a.id-b.id));}}
try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;");
  for(const owner of owners)await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
  await db.exec(schema.join('\n'));await db.exec(inserts.join('\n'));await preserved();
  await db.exec('BEGIN;'+body+'COMMIT;');await preserved();
  check(Number((await db.query('SELECT count(*) n FROM public.billeteras')).rows[0].n),owners.length);
  for(const owner of owners)await db.transaction(async tx=>{
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.exec('SET LOCAL ROLE authenticated');
    check((await tx.query('SELECT * FROM billeteras')).rows.length,1);
    for(const table of tables)check((await tx.query(`SELECT id FROM public.${q(table)} ORDER BY id`)).rows.map(r=>Number(r.id)),data[table].filter(r=>r.user_id===owner).map(r=>r.id).sort((a,b)=>a-b));
  });
  await db.exec(await fs.readFile(path.join(root,'supabase/rollback/202611030002_consistencia_pagos.sql'),'utf8'));
  await db.exec(await fs.readFile(path.join(root,'supabase/rollback/202611030001_billeteras.sql'),'utf8'));await preserved();
}finally{await db.close();}

// Reuse exactly the catalog/data expression from the snapshot query. The guard
// embeds hashes only: it never uploads account passwords or financial rows.
const snapshotSql=await fs.readFile(path.join(backup,'01-respaldo-consistente-v2.sql'),'utf8');
const expression=snapshotSql.slice(snapshotSql.indexOf('SELECT jsonb_build_object(')+'SELECT '.length,snapshotSql.indexOf(' AS contenido)'));
const guard=`DO $guard_etapa6$ DECLARE actual jsonb; BEGIN SELECT ${expression} INTO actual;
 IF md5((actual->'datos')::text)<>${literal(snap.huella_datos)} THEN RAISE EXCEPTION 'Los datos cambiaron desde el respaldo; renovar la copia antes de migrar.'; END IF;
 IF md5(((actual->'catalogo')-'fecha_utc'-'version'-'secuencias')::text)<>${literal(snap.huella_catalogo)} THEN RAISE EXCEPTION 'El catálogo cambió desde el respaldo; revisar antes de migrar.'; END IF;
 IF md5(jsonb_build_object('users',actual->'auth_users','identities',actual->'auth_identities')::text)<>${literal(snap.huella_auth)} THEN RAISE EXCEPTION 'Auth cambió desde el respaldo; renovar la copia antes de migrar.'; END IF;
 END $guard_etapa6$;`;
const locks="LOCK TABLE auth.users,auth.identities IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE "+tables.map(t=>'public.'+q(t)).join(',')+' IN ACCESS EXCLUSIVE MODE;';
const report="SELECT jsonb_build_object('migraciones',(SELECT jsonb_agg(version ORDER BY version) FROM wallet_internal.migraciones),'billeteras',(SELECT count(*) FROM public.billeteras),'filas',jsonb_build_object("+tables.map(t=>literal(t)+`,(SELECT count(*) FROM public.${q(t)})`).join(',')+"),'auth_users',(SELECT count(*) FROM auth.users),'auth_identities',(SELECT count(*) FROM auth.identities)) AS resultado_etapa6;";
await fs.writeFile(path.join(backup,'02-migracion-atomica.sql'),"-- Publicación autorizada: ambas migraciones en una transacción, con guardas de respaldo.\nBEGIN;\nSET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';\n"+locks+'\n'+guard+'\n'+body+'\n'+report+'\nCOMMIT;\n');
await fs.writeFile(path.join(backup,'ensayo-etapa6.json'),JSON.stringify({ok:true,checks,target,auth:'Solo IDs en el ensayo; el respaldo de Auth permanece separado y no se altera',snapshot:snap.fecha_utc},null,2));
const manifest=JSON.parse(await fs.readFile(path.join(backup,'manifest.json'),'utf8'));manifest.sql_snapshot_pending=false;manifest.rehearsal={ok:true,checks};
await fs.writeFile(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({rehearsal:'passed',checks,records:tables.reduce((n,t)=>n+data[t].length,0),authUsers:owners.length,atomicMigrationPrepared:true}));
