"""Build verificado con variables públicas de Cloudflare. No publica ni migra."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,re,subprocess
ROOT=Path(__file__).resolve().parents[2]
backup=Path((ROOT/'.local/ultima-etapa6.txt').read_text(encoding='utf8').strip())
public=json.loads((backup/'cloudflare-build-env.json').read_text(encoding='utf8'))
if public['VITE_SUPABASE_URL']!='https://qylhstryjbiqjpiofvhn.supabase.co' or not public['VITE_SUPABASE_ANON_KEY'].startswith('sb_publishable_'):raise RuntimeError('Variables públicas no verificadas')
child={k:v for k,v in os.environ.items() if not k.startswith('VITE_') and 'SERVICE_ROLE' not in k}
child.update(public)
subprocess.run(['npm.cmd','run','build'],cwd=ROOT/'frontend',env=child,check=True)
secret=None
for line in (ROOT/'.env.local').read_text(encoding='utf-8-sig').splitlines():
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):secret=line.split('=',1)[1].strip().strip('"').strip("'").encode()
if not secret:raise RuntimeError('Falta la referencia local para comprobar exclusión de secretos')
files={}
for file in (ROOT/'frontend/dist').rglob('*'):
    if not file.is_file():continue
    content=file.read_bytes()
    if secret in content or any(marker in content for marker in [b'127.0.0.1:54330',b'local-preview-anon',b'PruebaLocal123!',b'pruebas@example.test']):raise RuntimeError('Contenido de prueba o secreto detectado en '+file.name)
    files[file.relative_to(ROOT/'frontend/dist').as_posix()]=hashlib.sha256(content).hexdigest()
(backup/'release-verificada.json').write_text(json.dumps({'built_at':datetime.now(timezone.utc).isoformat(),'supabase':public['VITE_SUPABASE_URL'],'key_type':'publishable','secrets_excluded':True,'test_environment_excluded':True,'files':files},indent=2),encoding='utf8')
print(json.dumps({'release_verified':True,'assets':len(files),'supabase_project':'qylhstryjbiqjpiofvhn','test_data_excluded':True,'service_key_excluded':True}))
