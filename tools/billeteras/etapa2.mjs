import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Solo archivos + PostgreSQL local. No se lee .env ni se usa Supabase remoto.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backup = (await fs.readFile(path.join(root, '.local/ultima-etapa1.txt'), 'utf8')).trim();
const out = path.join(root, '.local', 'etapa2-billeteras-' + Date.now());
await fs.mkdir(out);
await fs.writeFile(path.join(root, '.local/ultima-etapa2.txt'), out);
const manifest = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
const tables = Object.keys(manifest.tables);
const data = Object.fromEntries(await Promise.all(tables.map(async t => [t, JSON.parse(await fs.readFile(path.join(backup, t+'.json'), 'utf8'))])));
const owners = [...new Set(Object.values(data).flat().map(r => r.user_id))];
if (owners.length < 2) throw Error('Two owners required to exercise isolation');
const migration = await fs.readFile(path.join(root, 'supabase/migrations/202611030001_billeteras.sql'), 'utf8');
const rollback = await fs.readFile(path.join(root, 'supabase/rollback/202611030001_billeteras.sql'), 'utf8');
const db = new PGlite(path.join(out, 'postgres'));
const checks = [];
const check = (name, ok) => { checks.push({ name, ok }); if (!ok) throw Error(name); };
const query = async (sql, params=[]) => (await db.query(sql, params)).rows;
const scalar = async (sql, params=[]) => Object.values((await query(sql, params))[0])[0];
const normalize = r => Object.fromEntries(Object.keys(r).filter(k => k!=='billetera_id').sort().map(k => [k, k.endsWith('_el') && r[k] ? new Date(r[k]).toISOString() : r[k]]));
async function preserved(suffix) {
  for (const t of tables) {
    const rows = await query(`SELECT to_jsonb(t) AS row FROM public.${t} t ORDER BY id`);
    check('original records preserved '+suffix+' '+t, JSON.stringify(rows.map(r => normalize(r.row)))===JSON.stringify(data[t].map(normalize)));
  }
}
async function actor(id) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('SET LOCAL ROLE authenticated');
}
async function fails(name, fn, allowed=['23503','23514','23505','42501','P0001']) {
  await db.exec('SAVEPOINT expected_error');
  let error;
  try { await fn(); } catch(e) { error=e; }
  await db.exec('ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error');
  check(name, !!error && allowed.includes(error.code));
}

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  for (const id of owners) await query('INSERT INTO auth.users(id) VALUES($1)',[id]);
  await db.exec(await fs.readFile(path.join(backup, 'esquema-public-remoto.sql'), 'utf8'));
  await db.exec(await fs.readFile(path.join(backup, 'datos-aplicacion.sql'), 'utf8'));
  await preserved('baseline');
  await db.exec(migration);
  await preserved('migration');
  check('one Personal PEN per existing owner', Number(await scalar("SELECT count(*) FROM public.billeteras WHERE nombre='Personal' AND moneda='PEN' AND es_principal AND NOT archivada"))===owners.length);
  for (const t of tables) check('wallet assigned '+t, Number(await scalar(`SELECT count(*) FROM public.${t} WHERE billetera_id IS NULL`))===0);
  check('nine tables have RLS', Number(await scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity"))===9);
  try { await db.exec(migration); throw Error('Repeated migration unexpectedly applied'); }
  catch(e) { if(e.code!=='23505') throw e; await db.exec('ROLLBACK'); check('repeated migration fails atomically',true); }
  await preserved('repeat refused');

  const principals = Object.fromEntries((await query('SELECT user_id,id FROM public.billeteras WHERE es_principal')).map(r=>[r.user_id,r.id]));
  await db.exec('BEGIN');
  for (const owner of owners) {
    await actor(owner);
    check('owner sees one original wallet '+owners.indexOf(owner), Number(await scalar('SELECT count(*) FROM public.billeteras'))===1);
    for (const t of tables) {
      const ids = (await query(`SELECT id FROM public.${t} ORDER BY id`)).map(r=>Number(r.id));
      check('RLS original '+t+' owner '+owners.indexOf(owner), JSON.stringify(ids)===JSON.stringify(data[t].filter(r=>r.user_id===owner).map(r=>r.id)));
      check('no TRUNCATE '+t, await scalar("SELECT has_table_privilege(current_user,$1,'TRUNCATE')",['public.'+t])===false);
    }
  }
  const a = owners[0], b=owners[1];
  await actor(a);
  const usd = (await query("SELECT * FROM public.crear_billetera('  Ahorros  ','USD')"))[0];
  const eur = (await query("SELECT * FROM public.crear_billetera('Viajes','EUR')"))[0];
  check('new currency wallets and trimmed name', usd.nombre==='Ahorros' && usd.moneda==='USD' && eur.moneda==='EUR');
  for (const bill of [usd,eur]) {
    check('new wallet has six categories '+bill.moneda, Number(await scalar('SELECT count(*) FROM public.categorias WHERE billetera_id=$1',[bill.id]))===6);
    check('new wallet starts with zero balance '+bill.moneda, Number(await scalar('SELECT monto_base FROM public.config_billetera WHERE billetera_id=$1',[bill.id]))===0);
    check('new wallet has no salaries '+bill.moneda, Number(await scalar('SELECT count(*) FROM public.sueldos_mes WHERE billetera_id=$1',[bill.id]))===0);
  }
  await fails('reject unsupported currency',()=>query("SELECT * FROM public.crear_billetera('Invalid','GBP')"));
  await fails('reject blank name',()=>query("SELECT * FROM public.crear_billetera('  ','PEN')"));
  await fails('reject name longer than 80 characters',()=>query("SELECT * FROM public.crear_billetera(repeat('a',81),'PEN')"));
  await fails('cannot create wallet for another owner',()=>query("INSERT INTO public.billeteras(user_id,nombre,moneda) VALUES($1,'Foreign','PEN')",[b]));
  await fails('cannot create extra principal',()=>query("INSERT INTO public.billeteras(user_id,nombre,moneda,es_principal) VALUES($1,'Principal','PEN',true)",[a]));
  await fails('cannot delete wallets',()=>query('DELETE FROM public.billeteras WHERE id=$1',[usd.id]));
  await fails('cannot reassign wallet owner',()=>query('UPDATE public.billeteras SET user_id=$1 WHERE id=$2',[b,usd.id]));
  await fails('cannot change principal flag',()=>query('UPDATE public.billeteras SET es_principal=true WHERE id=$1',[usd.id]));

  const usdCat=await scalar('SELECT id FROM public.categorias WHERE billetera_id=$1 ORDER BY id LIMIT 1',[usd.id]);
  const eurCat=await scalar('SELECT id FROM public.categorias WHERE billetera_id=$1 ORDER BY id LIMIT 1',[eur.id]);
  const movement = {user_id:a,billetera_id:usd.id,tipo:'gasto',descripcion:'Prueba aislada',monto:12,fecha:'2026-11-03',categoria_id:usdCat};
  async function insert(t,row) {
    const keys=Object.keys(row);
    return (await query(`INSERT INTO public.${t}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(row)))[0];
  }
  await fails('foreign wallet insert denied',()=>insert('movimientos_agenda',{...movement,user_id:b,billetera_id:principals[b],categoria_id:null}));
  await fails('same owner cross-wallet category denied',()=>insert('movimientos_agenda',{...movement,categoria_id:eurCat}));
  await fails('mandatory wallet on new data',()=>{ const {billetera_id,...missing}=movement; return insert('movimientos_agenda',missing); },['23502','23503']);
  await query('UPDATE public.billeteras SET moneda=$1 WHERE id=$2',['EUR',usd.id]);
  check('currency editable before financial records',await scalar('SELECT moneda FROM public.billeteras WHERE id=$1',[usd.id])==='EUR');
  const mov=await insert('movimientos_agenda',movement);
  await fails('currency frozen after financial records',()=>query("UPDATE public.billeteras SET moneda='USD' WHERE id=$1",[usd.id]));
  await fails('movement cannot be reassigned',()=>query('UPDATE public.movimientos_agenda SET billetera_id=$1 WHERE id=$2',[eur.id,mov.id]));
  await fails('movement owner immutable',()=>query('UPDATE public.movimientos_agenda SET user_id=$1 WHERE id=$2',[b,mov.id]));

  const ownSalary=data.sueldos_mes.find(s=>s.user_id===a);
  const salary=await insert('sueldos_mes',{user_id:a,billetera_id:usd.id,anio:ownSalary?.anio||2026,mes:ownSalary?.mes||0,sueldo_15:50,sueldo_30:80});
  check('same salary period allowed across wallets',Number(salary.sueldo_15)===50);
  await fails('duplicate salary period in one wallet refused',()=>insert('sueldos_mes',{user_id:a,billetera_id:usd.id,anio:salary.anio,mes:salary.mes,sueldo_15:0,sueldo_30:0}));
  await query(`INSERT INTO public.config_billetera(user_id,billetera_id,monto_base) VALUES($1,$2,99) ON CONFLICT(user_id,billetera_id) DO UPDATE SET monto_base=excluded.monto_base`,[a,usd.id]);
  check('balance upsert scoped to wallet',Number(await scalar('SELECT monto_base FROM public.config_billetera WHERE billetera_id=$1',[usd.id]))===99);
  const rec=await insert('movimientos_recurrentes',{user_id:a,billetera_id:usd.id,tipo:'gasto',descripcion:'Recurrente aislado',monto:10,dia_pago:15,categoria_id:usdCat});
  await fails('cross-wallet recurring category denied',()=>insert('movimientos_recurrentes',{user_id:a,billetera_id:usd.id,tipo:'gasto',descripcion:'Invalid',monto:10,dia_pago:15,categoria_id:eurCat}));
  await fails('cross-wallet recurring relation denied',()=>insert('movimientos_agenda',{...movement,billetera_id:eur.id,categoria_id:eurCat,recurrente_id:rec.id}));
  const debt=await insert('deudas',{user_id:a,billetera_id:usd.id,nombre:'Deuda aislada',monto_recibido:24,categoria_id:usdCat});
  await fails('cross-wallet debt category denied',()=>insert('deudas',{user_id:a,billetera_id:usd.id,nombre:'Invalid',categoria_id:eurCat}));
  const cuota=await insert('deuda_cuotas',{user_id:a,billetera_id:usd.id,deuda_id:debt.id,numero:1,monto:12,fecha:'2026-11-15'});
  await fails('cross-wallet installment denied',()=>insert('deuda_cuotas',{user_id:a,billetera_id:eur.id,deuda_id:debt.id,numero:1,monto:12,fecha:'2026-11-15'}));
  const eurDebt=await insert('deudas',{user_id:a,billetera_id:eur.id,nombre:'Deuda euros',categoria_id:eurCat});
  const eurCuota=await insert('deuda_cuotas',{user_id:a,billetera_id:eur.id,deuda_id:eurDebt.id,numero:1,monto:12,fecha:'2026-11-15'});
  await fails('cross-wallet payment installment denied',()=>insert('deuda_pagos',{user_id:a,billetera_id:usd.id,cuota_id:eurCuota.id,monto:12,fecha:'2026-11-03',movimiento_id:mov.id}));
  const eurMov=await insert('movimientos_agenda',{...movement,billetera_id:eur.id,categoria_id:eurCat});
  await fails('cross-wallet payment movement denied',()=>insert('deuda_pagos',{user_id:a,billetera_id:usd.id,cuota_id:cuota.id,monto:12,fecha:'2026-11-03',movimiento_id:eurMov.id}));
  await insert('deuda_pagos',{user_id:a,billetera_id:usd.id,cuota_id:cuota.id,monto:12,fecha:'2026-11-03',movimiento_id:mov.id});

  // Financial records other than movements must also lock the currency.
  for(const kind of ['balance','salary','recurring','debt']) {
    await db.exec('SAVEPOINT currency_fixture');
    const bill=(await query("SELECT * FROM public.crear_billetera($1,'USD')",['Moneda '+kind]))[0];
    const row={user_id:a,billetera_id:bill.id};
    if(kind==='balance') await query('UPDATE public.config_billetera SET monto_base=1 WHERE billetera_id=$1',[bill.id]);
    if(kind==='salary') await insert('sueldos_mes',{...row,anio:2026,mes:0,sueldo_15:1});
    if(kind==='recurring') await insert('movimientos_recurrentes',{...row,tipo:'ingreso',descripcion:'Synthetic',monto:1,dia_pago:15});
    if(kind==='debt') await insert('deudas',{...row,nombre:'Synthetic'});
    await fails('currency locked by '+kind,()=>query("UPDATE public.billeteras SET moneda='EUR' WHERE id=$1",[bill.id]));
    await db.exec('ROLLBACK TO SAVEPOINT currency_fixture; RELEASE SAVEPOINT currency_fixture');
  }

  await actor(b);
  const foreignBill=(await query("SELECT * FROM public.crear_billetera('Owner B','USD')"))[0];
  const foreignCategory=await scalar('SELECT id FROM public.categorias WHERE billetera_id=$1 ORDER BY id LIMIT 1',[foreignBill.id]);
  await actor(a);
  await fails('cross-owner category reference rejected by composite FK',()=>insert('movimientos_agenda',{...movement,categoria_id:foreignCategory}));
  await actor(b);
  check('another owner cannot see new wallets',Number(await scalar('SELECT count(*) FROM public.billeteras WHERE id IN ($1,$2)',[usd.id,eur.id]))===0);
  for(const t of tables) check('another owner cannot see new '+t,Number(await scalar(`SELECT count(*) FROM public.${t} WHERE billetera_id=$1`,[usd.id]))===0);
  await actor(a);
  await query('UPDATE public.billeteras SET archivada=true WHERE id=$1',[usd.id]);
  check('archived data remains readable',Number(await scalar('SELECT count(*) FROM public.movimientos_agenda WHERE billetera_id=$1',[usd.id]))===1);
  for(const t of tables) {
    const before=Number(await scalar(`SELECT count(*) FROM public.${t} WHERE billetera_id=$1`,[usd.id]));
    check('archived '+t+' test has data',before>0);
    const updated=await query(`UPDATE public.${t} SET user_id=user_id WHERE billetera_id=$1 RETURNING id`,[usd.id]);
    check('archived update denied '+t,updated.length===0);
    const deleted=await query(`DELETE FROM public.${t} WHERE billetera_id=$1 RETURNING id`,[usd.id]);
    check('archived delete denied '+t,deleted.length===0);
  }
  await fails('archived insert denied',()=>insert('movimientos_agenda',movement));
  await query('UPDATE public.billeteras SET archivada=false,nombre=$1 WHERE id=$2',['Reactivada',usd.id]);
  check('reactivated writes work',(await query('UPDATE public.movimientos_agenda SET descripcion=$1 WHERE id=$2 RETURNING id',['Editado',mov.id])).length===1);
  await query('DELETE FROM public.categorias WHERE id=$1',[usdCat]);
  check('category deletion clears only category ID',await scalar('SELECT categoria_id IS NULL AND billetera_id=$1 AND user_id=$2 FROM public.movimientos_agenda WHERE id=$3',[usd.id,a,mov.id])===true);
  check('category deletion preserves debt scope',await scalar('SELECT categoria_id IS NULL AND billetera_id=$1 FROM public.deudas WHERE id=$2',[usd.id,debt.id])===true);

  await db.exec('RESET ROLE; SET LOCAL ROLE anon');
  for(const t of ['billeteras',...tables]) await fails('anonymous read denied '+t,()=>query(`SELECT * FROM public.${t}`),['42501']);
  await fails('anonymous RPC denied',()=>query("SELECT * FROM public.crear_billetera('Anon','PEN')"),['42501']);
  await db.exec('RESET ROLE');
  const newUser='e18f57c2-0048-45ea-9e91-222222222222';
  await query('INSERT INTO auth.users(id) VALUES($1)',[newUser]);
  check('new signup gets Personal PEN wallet',Number(await scalar("SELECT count(*) FROM public.billeteras WHERE user_id=$1 AND es_principal AND moneda='PEN'",[newUser]))===1);
  check('new signup gets exactly one zero config',Number(await scalar('SELECT count(*) FROM public.config_billetera WHERE user_id=$1 AND monto_base=0',[newUser]))===1);
  check('new signup gets exactly six categories',Number(await scalar('SELECT count(*) FROM public.categorias WHERE user_id=$1',[newUser]))===6);
  await fails('rollback refuses extra wallets',()=>db.exec(rollback));
  await db.exec('ROLLBACK'); // All synthetic users, wallets and financial records disappear.

  await db.exec('BEGIN');
  await query("UPDATE public.billeteras SET nombre='Renombrada' WHERE id=$1",[principals[a]]);
  await fails('rollback preserves renamed wallet metadata',()=>db.exec(rollback));
  await db.exec('ROLLBACK');

  await db.exec(rollback);
  check('rollback removes wallet structure',await scalar("SELECT to_regclass('public.billeteras')")===null);
  await preserved('rollback');
  await db.exec('BEGIN');
  await query('INSERT INTO auth.users(id) VALUES($1)',[newUser]);
  check('legacy signup restored',Number(await scalar('SELECT count(*) FROM public.config_billetera WHERE user_id=$1',[newUser]))===1);
  await db.exec('ROLLBACK');

  // Rejection of pre-existing cross-owner data must also roll back the migration.
  await db.exec('BEGIN');
  const foreignCat=await scalar("INSERT INTO public.categorias(user_id,nombre) VALUES($1,'Cross-owner fixture') RETURNING id",[b]);
  await query('UPDATE public.deudas SET categoria_id=$1 WHERE id=$2',[foreignCat,data.deudas[0].id]);
  await fails('migration rejects inconsistent legacy owner relations',()=>db.exec(migration),['23503']);
  check('failed migration leaves no wallet table',await scalar("SELECT to_regclass('public.billeteras')")===null);
  await db.exec('ROLLBACK');
  await db.exec(migration);
  await preserved('reapplied');
  const result={scope:'Etapa 2 local only',remote_writes:false,backup,environment:path.join(out,'postgres'),checks,passed:checks.filter(c=>c.ok).length,all_passed:checks.every(c=>c.ok),original_rows:tables.reduce((n,t)=>n+data[t].length,0),wallets:Number(await scalar('SELECT count(*) FROM public.billeteras'))};
  await fs.writeFile(path.join(out,'resultado.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({result:path.join(out,'resultado.json'),passed:result.passed,original_rows:result.original_rows,wallets:result.wallets}));
} catch(e) {
  await fs.writeFile(path.join(out,'fallo.json'),JSON.stringify({checks,error:e.message,code:e.code},null,2));
  throw e;
} finally { await db.close(); }
