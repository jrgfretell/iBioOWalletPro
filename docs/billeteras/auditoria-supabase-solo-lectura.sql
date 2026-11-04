-- ETAPA 1. Ejecutar en SQL Editor del proyecto Supabase actual.
-- Solo consultas, sin cambiar esquema, datos, funciones ni permisos.
-- Exportar la columna auditoria como JSON y guardarla junto al respaldo local.
BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'fecha_utc', now(),
  'version', version(),
  'tablas', (
    SELECT jsonb_agg(jsonb_build_object(
      'esquema', n.nspname, 'tabla', c.relname,
      'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity
    ) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  ),
  'columnas', (
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.ordinal_position)
    FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_name,
                 is_nullable,column_default,is_identity,identity_generation
          FROM information_schema.columns WHERE table_schema='public') x
  ),
  'tipos_sql', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla',c.relname,'columna',a.attname,'tipo',format_type(a.atttypid,a.atttypmod)
    ) ORDER BY c.relname,a.attnum)
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  ),
  'secuencias', (
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequencename)
    FROM pg_sequences s WHERE s.schemaname='public'
  ),
  'politicas', (
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname)
    FROM pg_policies p WHERE p.schemaname='public'
  ),
  'restricciones', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', c.conrelid::regclass::text, 'nombre', c.conname,
      'definicion', pg_get_constraintdef(c.oid)
    ) ORDER BY c.conrelid::regclass::text,c.conname)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname='public'
  ),
  'indices', (
    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname)
    FROM pg_indexes i WHERE i.schemaname='public'
  ),
  'triggers', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', c.oid::regclass::text, 'nombre', t.tgname,
      'definicion', pg_get_triggerdef(t.oid),
      'funcion', t.tgfoid::regprocedure::text
    ) ORDER BY c.oid::regclass::text,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users'))
  ),
  'funciones_publicas', (
    SELECT jsonb_agg(jsonb_build_object(
      'firma', p.oid::regprocedure::text, 'security_definer', p.prosecdef,
      'configuracion', p.proconfig, 'definicion', pg_get_functiondef(p.oid)
    ) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  ),
  'permisos', (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_name,g.grantee,g.privilege_type)
    FROM information_schema.role_table_grants g
    WHERE g.table_schema='public' AND g.grantee IN ('anon','authenticated','service_role','PUBLIC')
  )
) AS auditoria;

COMMIT;
