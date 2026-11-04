-- ==============================================================================
-- Migración: 202611030006_admin_bloqueo_y_eliminar_usuario.sql
-- Propósito:
--   1. Revocación inmediata de sesiones activas al suspender/bloquear un usuario.
--   2. Bloqueo en triggers de escritura para cuentas suspendidas (validando auth.users directamente).
--   3. Función RPC public.verificar_mi_estado() para validación en tiempo real en cliente.
--   4. Función RPC public.admin_eliminar_usuario() con borrado en cascada seguro y
--      protección estricta para cuentas administradoras.
--   5. Mantener la política RLS limpia de billeteras sin dependencias cruzadas de esquemas.
-- ==============================================================================

BEGIN;

-- 1. Restaurar política RLS limpia para lectura de billeteras (evita errores de permisos en esquemas)
DROP POLICY IF EXISTS billeteras_lectura ON public.billeteras;
CREATE POLICY billeteras_lectura ON public.billeteras FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Función RPC para que el cliente valide el estado de su propia cuenta
CREATE OR REPLACE FUNCTION public.verificar_mi_estado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
  v_banned_until timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('activo', false, 'motivo', 'no_autenticado');
  END IF;

  SELECT banned_until INTO v_banned_until FROM auth.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('activo', false, 'motivo', 'usuario_inexistente');
  END IF;

  IF v_banned_until IS NOT NULL AND v_banned_until > now() THEN
    RETURN jsonb_build_object('activo', false, 'motivo', 'suspendido');
  END IF;

  RETURN jsonb_build_object('activo', true);
END;
$funcion$;

REVOKE ALL ON FUNCTION public.verificar_mi_estado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_mi_estado() TO authenticated;

-- 3. Actualizar admin_cambiar_estado_usuario para revocar sesiones activas inmediatamente
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
  v_target_email text;
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'No puedes suspender tu propia cuenta de administrador' USING ERRCODE = '23514';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario indicado no existe' USING ERRCODE = '23503';
  END IF;

  IF lower(coalesce(v_target_email, '')) = 'jrgfretell@gmail.com' THEN
    RAISE EXCEPTION 'No se puede suspender la cuenta del SuperAdmin principal' USING ERRCODE = '42501';
  END IF;

  -- Actualizar estado de suspensión en auth.users
  UPDATE auth.users
  SET banned_until = CASE WHEN p_bloquear THEN '2099-01-01 00:00:00+00'::timestamptz ELSE NULL END,
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('banned', p_bloquear),
      updated_at = now()
  WHERE id = p_target_user_id;

  -- Al suspender, destruir de inmediato todas sus sesiones y tokens de refresco
  IF p_bloquear THEN
    DELETE FROM auth.refresh_tokens
    WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = p_target_user_id);

    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;
  END IF;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_cambiar_estado_usuario(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_estado_usuario(uuid, boolean) TO authenticated;

-- 4. Crear función RPC public.admin_eliminar_usuario con borrado en cascada
CREATE OR REPLACE FUNCTION public.admin_eliminar_usuario(
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid := auth.uid();
  v_target_email text;
BEGIN
  IF NOT wallet_internal.es_admin(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta de administrador' USING ERRCODE = '23514';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario indicado no existe' USING ERRCODE = '23503';
  END IF;

  IF lower(coalesce(v_target_email, '')) = 'jrgfretell@gmail.com' THEN
    RAISE EXCEPTION 'No se puede eliminar la cuenta del SuperAdmin principal' USING ERRCODE = '42501';
  END IF;

  -- Desarchivar billeteras para permitir el borrado de sus registros sin bloqueos por trigger
  UPDATE public.billeteras SET archivada = false WHERE user_id = p_target_user_id;

  -- Borrado ordenado de todas las tablas de la aplicación que pertenecen al usuario
  DELETE FROM public.deuda_pagos WHERE user_id = p_target_user_id;
  DELETE FROM public.deuda_cuotas WHERE user_id = p_target_user_id;
  DELETE FROM public.deudas WHERE user_id = p_target_user_id;
  DELETE FROM public.movimientos_agenda WHERE user_id = p_target_user_id;
  DELETE FROM public.movimientos_recurrentes WHERE user_id = p_target_user_id;
  DELETE FROM public.sueldos_mes WHERE user_id = p_target_user_id;
  DELETE FROM public.categorias WHERE user_id = p_target_user_id;
  DELETE FROM public.config_billetera WHERE user_id = p_target_user_id;
  DELETE FROM public.operaciones_billetera WHERE user_id = p_target_user_id;
  DELETE FROM public.billeteras WHERE user_id = p_target_user_id;
  DELETE FROM wallet_internal.administradores WHERE user_id = p_target_user_id;

  -- Borrado de sesiones, tokens e identidades en auth
  DELETE FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = p_target_user_id);
  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  DELETE FROM auth.identities WHERE user_id = p_target_user_id;

  -- Borrado final de la cuenta de usuario en auth.users
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_eliminar_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_usuario(uuid) TO authenticated;

-- 5. Actualizar trigger validar_escritura_billetera para denegar escrituras a suspendidos consultando auth.users
CREATE OR REPLACE FUNCTION public.validar_escritura_billetera() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
DECLARE
  bid bigint;
  propietario uuid;
  archivada_actual boolean;
  v_caller uuid := auth.uid();
  v_suspendido boolean := false;
BEGIN
  -- Denegar cualquier escritura si el usuario que llama está suspendido
  IF v_caller IS NOT NULL THEN
    SELECT (banned_until IS NOT NULL AND banned_until > now()) INTO v_suspendido
    FROM auth.users
    WHERE id = v_caller;

    IF coalesce(v_suspendido, false) THEN
      RAISE EXCEPTION 'Tu cuenta ha sido suspendida por un administrador' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.billetera_id IS DISTINCT FROM OLD.billetera_id) THEN
    RAISE EXCEPTION 'No se puede trasladar un registro a otra billetera o usuario' USING ERRCODE='23514';
  END IF;

  IF TG_OP='DELETE' THEN
    bid := OLD.billetera_id;
    propietario := OLD.user_id;
  ELSE
    bid := NEW.billetera_id;
    propietario := NEW.user_id;
  END IF;

  SELECT b.archivada INTO archivada_actual
  FROM public.billeteras b
  WHERE b.id = bid AND b.user_id = propietario
  FOR UPDATE;

  -- En borrado por administración o cascada, permitir si ya no existe la billetera
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Billetera no disponible' USING ERRCODE='23503';
  END IF;

  IF archivada_actual AND NOT (TG_OP = 'DELETE' AND wallet_internal.es_admin(v_caller)) THEN
    RAISE EXCEPTION 'Reactiva la billetera para modificar sus registros' USING ERRCODE='23514';
  END IF;

  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$funcion$;

-- 6. Limpieza de función previa si existiera en wallet_internal
DROP FUNCTION IF EXISTS wallet_internal.usuario_esta_suspendido(uuid);

-- 7. Registrar versión de migración
INSERT INTO wallet_internal.migraciones (version)
VALUES ('202611030006_admin_bloqueo_y_eliminar_usuario')
ON CONFLICT (version) DO NOTHING;

COMMIT;
