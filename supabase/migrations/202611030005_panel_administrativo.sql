-- Migración 202611030005: Panel Administrativo con métricas, gestión de usuarios y contraseñas
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO wallet_internal.migraciones(version) VALUES ('202611030005_panel_administrativo')
ON CONFLICT (version) DO NOTHING;

-- Asegurar extensión pgcrypto en el esquema extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Tabla interna de administradores
CREATE TABLE IF NOT EXISTS wallet_internal.administradores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_el timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallet_internal.administradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_internal.administradores FROM PUBLIC, anon, authenticated;

-- Asignar cuenta inicial de SuperAdmin
INSERT INTO wallet_internal.administradores(user_id)
SELECT id FROM auth.users WHERE email = 'jrgfretell@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Función interna para validar si un usuario es administrador
CREATE OR REPLACE FUNCTION wallet_internal.es_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_uid
      AND (
        u.email = 'jrgfretell@gmail.com'
        OR EXISTS (SELECT 1 FROM wallet_internal.administradores a WHERE a.user_id = u.id)
      )
  );
$$;

-- 1. Verificar acceso admin desde el cliente
CREATE OR REPLACE FUNCTION public.admin_verificar_acceso()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
BEGIN
  RETURN wallet_internal.es_admin(auth.uid());
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_verificar_acceso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verificar_acceso() TO authenticated;

-- 2. Estadísticas globales para el Dashboard de Administración
CREATE OR REPLACE FUNCTION public.admin_obtener_estadisticas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
  resultado jsonb;
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_usuarios', (SELECT count(*) FROM auth.users),
    'usuarios_activos_mes', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days'),
    'total_billeteras', (SELECT count(*) FROM public.billeteras WHERE NOT archivada),
    'billeteras_pen', (SELECT count(*) FROM public.billeteras WHERE moneda = 'PEN' AND NOT archivada),
    'billeteras_usd', (SELECT count(*) FROM public.billeteras WHERE moneda = 'USD' AND NOT archivada),
    'billeteras_eur', (SELECT count(*) FROM public.billeteras WHERE moneda = 'EUR' AND NOT archivada),
    'total_movimientos', (SELECT count(*) FROM public.movimientos_agenda),
    'total_deudas', (SELECT count(*) FROM public.deudas WHERE NOT archivada),
    'total_recurrentes', (SELECT count(*) FROM public.movimientos_recurrentes),
    'migraciones', (SELECT COALESCE(jsonb_agg(jsonb_build_object('version', version, 'aplicada_el', aplicada_el) ORDER BY aplicada_el DESC), '[]'::jsonb) FROM wallet_internal.migraciones)
  ) INTO resultado;

  RETURN resultado;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_obtener_estadisticas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_obtener_estadisticas() TO authenticated;

-- 3. Listar usuarios para el directorio del panel
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
  resultado jsonb;
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'nombre', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
        'avatar_url', u.raw_user_meta_data->>'avatar_url',
        'proveedor', COALESCE(u.raw_app_meta_data->>'provider', 'email'),
        'creado_el', u.created_at,
        'ultimo_acceso', u.last_sign_in_at,
        'billeteras_count', (SELECT count(*) FROM public.billeteras b WHERE b.user_id = u.id),
        'es_admin', wallet_internal.es_admin(u.id),
        'bloqueado', (u.banned_until IS NOT NULL AND u.banned_until > now())
      ) ORDER BY u.created_at DESC
    ),
    '[]'::jsonb
  ) INTO resultado
  FROM auth.users u;

  RETURN resultado;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_listar_usuarios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios() TO authenticated;

-- 4. Cambiar contraseña directa de un usuario
CREATE OR REPLACE FUNCTION public.admin_cambiar_password(
  p_target_user_id uuid,
  p_nuevo_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  IF p_nuevo_password IS NULL OR char_length(p_nuevo_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'El usuario indicado no existe' USING ERRCODE = '23503';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_nuevo_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_cambiar_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_password(uuid, text) TO authenticated;

-- 5. Suspender o reactivar acceso de un usuario
CREATE OR REPLACE FUNCTION public.admin_cambiar_estado_usuario(
  p_target_user_id uuid,
  p_bloquear boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'No puedes suspender tu propia cuenta de administrador' USING ERRCODE = '23514';
  END IF;

  UPDATE auth.users
  SET banned_until = CASE WHEN p_bloquear THEN '2099-01-01 00:00:00+00'::timestamptz ELSE NULL END,
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_cambiar_estado_usuario(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_estado_usuario(uuid, boolean) TO authenticated;

COMMIT;
