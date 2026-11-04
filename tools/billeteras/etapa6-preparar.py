"""Preparación de despliegue: únicamente GET remotos, respaldo local y build.
No ejecuta migraciones ni publica. Nunca imprime claves ni filas financieras.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import hashlib, json, os, re, subprocess, zipfile

ROOT=Path(__file__).resolve().parents[2]
TABLES=['config_billetera','categorias','sueldos_mes','movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
def env(path):
    result={}
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        match=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)',line)
        if match: result[match[1]]=match[2].strip().strip('"').strip("'")
    return result
cfg=env(ROOT/'.env.local'); front=env(ROOT/'frontend/.env.local')
base=cfg['VITE_SUPABASE_URL'].rstrip('/')
if base!='https://qylhstryjbiqjpiofvhn.supabase.co' or front['VITE_SUPABASE_URL'].rstrip('/')!=base: raise RuntimeError('Los entornos no apuntan al proyecto esperado')
service=cfg['SUPABASE_SERVICE_ROLE_KEY']
stamp=datetime.now(timezone(timedelta(hours=-5))).strftime('%Y%m%d-%H%M%S')
out=ROOT/'.local'/('etapa6-'+stamp);out.mkdir()
(ROOT/'.local/ultima-etapa6.txt').write_text(str(out),encoding='utf8')
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def get(path,key=service,extra=None):
    try:
        with urlopen(Request(base+path,headers={'apikey':key,'Authorization':'Bearer '+key,**(extra or {})}),timeout=45) as response:
            return json.load(response),dict(response.headers)
    except HTTPError as error: raise RuntimeError(f'GET {path.split("?")[0]}: HTTP {error.code}') from None
def rows(table):
    result=[];offset=0;total=None
    while total is None or offset<total:
        page,headers=get(f'/rest/v1/{table}?select=*&order=id.asc&offset={offset}&limit=500',extra={'Prefer':'count=exact'})
        count=next((v for k,v in headers.items() if k.lower()=='content-range'),'').split('/')[-1]
        if not count.isdigit():raise RuntimeError('Falta conteo exacto: '+table)
        if total is not None and total!=int(count):raise RuntimeError('La tabla cambió durante la copia: '+table)
        total=int(count);result.extend(page);offset+=len(page)
        if not page and offset<total:raise RuntimeError('Copia incompleta: '+table)
    return result
schema,_=get('/rest/v1/',extra={'Accept':'application/openapi+json'})
if 'billeteras' in schema.get('definitions',{}):raise RuntimeError('El esquema remoto ya tiene billeteras; revisar su versión antes de volver a migrar')
data={table:rows(table) for table in TABLES}
if any(canonical(data[t])!=canonical(rows(t)) for t in TABLES):raise RuntimeError('Cambios durante la exportación: repetir antes de migrar')
for table,value in data.items():(out/(table+'.json')).write_bytes(canonical(value))
(out/'openapi-remoto.json').write_bytes(canonical(schema))

issues=[]
for table,fields in [('sueldos_mes',['user_id','anio','mes']),('deuda_cuotas',['user_id','deuda_id','numero']),('movimientos_agenda',['user_id','recurrente_id','fecha'])]:
    seen=set()
    for record in data[table]:
        if table=='movimientos_agenda' and record.get('recurrente_id') is None:continue
        key=tuple(record.get(f) for f in fields)
        if key in seen:issues.append('Duplicado en '+table)
        seen.add(key)
for table,field,parent in [('deuda_cuotas','deuda_id','deudas'),('deuda_pagos','cuota_id','deuda_cuotas'),('deuda_pagos','movimiento_id','movimientos_agenda')]+[(t,'categoria_id','categorias') for t in ['movimientos_agenda','movimientos_recurrentes','deudas']]+[('movimientos_agenda','recurrente_id','movimientos_recurrentes')]:
    parents={r['id']:r for r in data[parent]}
    for record in data[table]:
        value=record.get(field)
        if value is not None and (value not in parents or parents[value]['user_id']!=record['user_id']):issues.append('Relación incompatible '+table+'.'+field)
if issues:raise RuntimeError('; '.join(sorted(set(issues))))

with zipfile.ZipFile(out/'fuente-etapas-1-a-5.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for folder in ['frontend','supabase','docs','tools/billeteras']:
        for file in (ROOT/folder).rglob('*'):
            rel=file.relative_to(ROOT)
            if not file.is_file() or any(p in {'node_modules','dist','.wrangler','.git','__pycache__'} for p in rel.parts) or file.name.startswith('.env') or 'credentials' in file.name:continue
            archive.write(file,rel.as_posix())
(out/'cambios-locales.patch').write_bytes(subprocess.check_output(['git','diff','--binary'],cwd=ROOT))

# Preserve currently published assets as a frontend recovery artifact.
published='https://ibioowalletpro.jrgfretell.workers.dev'
with urlopen(Request(published,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as response:index=response.read()
prod=out/'frontend-anterior';prod.mkdir();(prod/'index.html').write_bytes(index)
for asset in set(re.findall(rb'(?:src|href)="(/assets/[^"?#]+)"',index)):
    relative=asset.decode().lstrip('/')
    if '..' in relative:raise RuntimeError('Ruta de asset no válida')
    target=prod/relative;target.parent.mkdir(exist_ok=True)
    with urlopen(Request(published+'/'+relative,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as response:target.write_bytes(response.read())
if not any(base.encode() in f.read_bytes() for f in prod.rglob('*.js')):raise RuntimeError('No se confirmó Supabase en el bundle publicado')

table_sql=','.join(f"'{t}',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.{t} t)" for t in TABLES)
snapshot="""-- Respaldo consistente. Contiene datos de aplicación y Auth: guardar solo localmente.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
 'fecha_utc',now(),'version',version(),
 'datos',jsonb_build_object(TABLE_DATA),
 'auth_users',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM auth.users t),
 'auth_identities',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM auth.identities t),
 'storage_objects',(SELECT count(*) FROM storage.objects),
 'catalogo',jsonb_build_object(
 'version',version(),'fecha_utc',now(),
 'tablas',(SELECT jsonb_agg(jsonb_build_object('esquema',n.nspname,'tabla',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
 'columnas',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
 'tipos_sql',(SELECT jsonb_agg(jsonb_build_object('tabla',c.relname,'columna',a.attname,'tipo',format_type(a.atttypid,a.atttypmod)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
 'restricciones',(SELECT jsonb_agg(jsonb_build_object('tabla',c.conrelid::regclass::text,'nombre',c.conname,'definicion',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'indices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
 'politicas',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
 'permisos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY table_name,grantee,privilege_type) FROM information_schema.role_table_grants p WHERE table_schema='public'),
 'secuencias',(SELECT jsonb_agg(to_jsonb(s) ORDER BY sequencename) FROM pg_sequences s WHERE schemaname='public'),
 'funciones_publicas',(SELECT jsonb_agg(jsonb_build_object('firma',p.oid::regprocedure::text,'definicion',pg_get_functiondef(p.oid),'security_definer',p.prosecdef,'configuracion',p.proconfig,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('tabla',t.tgrelid::regclass::text,'nombre',t.tgname,'funcion',t.tgfoid::regprocedure::text,'definicion',pg_get_triggerdef(t.oid),'habilitado',t.tgenabled) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND NOT t.tgisinternal)
 )) AS respaldo_etapa6;
COMMIT;
""".replace('TABLE_DATA',table_sql)
snapshot=snapshot.replace('SELECT jsonb_build_object(', 'WITH respaldo AS (SELECT jsonb_build_object(',1).replace('AS respaldo_etapa6;', "AS contenido) SELECT contenido || jsonb_build_object('huella_datos',md5((contenido->'datos')::text),'huella_catalogo',md5(((contenido->'catalogo')-'fecha_utc'-'version'-'secuencias')::text),'huella_auth',md5(jsonb_build_object('users',contenido->'auth_users','identities',contenido->'auth_identities')::text)) AS respaldo_etapa6 FROM respaldo;")
(out/'01-respaldo-consistente.sql').write_text(snapshot,encoding='utf8')
manifest={'created_lima':datetime.now(timezone(timedelta(hours=-5))).isoformat(),'project_url':base,'public_url':published,'git_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tables':{t:{'rows':len(data[t]),'sha256':hashlib.sha256(canonical(data[t])).hexdigest()} for t in TABLES},'preflight_issues':issues,'sql_snapshot_pending':True}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps({'backup':str(out),'rows':{t:len(data[t]) for t in TABLES},'preflight':'compatible','consistent_sql_snapshot':'pendiente'},indent=2))
