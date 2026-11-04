-- ==============================================================================
-- Rollback: 202611030006_admin_bloqueo_y_eliminar_usuario.sql
-- ==============================================================================

BEGIN;

-- 1. Restaurar política original de lectura de billeteras
DROP POLICY IF EXISTS billeteras_lectura ON public.billeteras;
CREATE POLICY billeteras_lectura ON public.billeteras FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Eliminar función admin_eliminar_usuario
DROP FUNCTION IF EXISTS public.admin_eliminar_usuario(uuid);

-- 3. Eliminar función verificar_mi_estado
DROP FUNCTION IF EXISTS public.verificar_mi_estado();

-- 4. Revertir admin_cambiar_estado_usuario a su versión previa (202611030005)
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

-- 5. Revertir validar_escritura_billetera a versión previa
CREATE OR REPLACE FUNCTION public.validar_escritura_billetera() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $funcion$
DECLARE bid bigint; propietario uuid; archivada_actual boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.billetera_id IS DISTINCT FROM OLD.billetera_id) THEN
    RAISE EXCEPTION 'No se puede trasladar un registro a otra billetera o usuario' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN bid:=OLD.billetera_id; propietario:=OLD.user_id;
  ELSE bid:=NEW.billetera_id; propietario:=NEW.user_id; END IF;
  SELECT b.archivada INTO archivada_actual FROM public.billeteras b
    WHERE b.id=bid AND b.user_id=propietario FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billetera no disponible' USING ERRCODE='23503'; END IF;
  IF archivada_actual THEN RAISE EXCEPTION 'Reactiva la billetera para modificar sus registros' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$funcion$;

-- 6. Eliminar helper interno si persistiera
DROP FUNCTION IF EXISTS wallet_internal.usuario_esta_suspendido(uuid);

-- 7. Eliminar registro de migración
DELETE FROM wallet_internal.migraciones
WHERE version = '202611030006_admin_bloqueo_y_eliminar_usuario';

COMMIT;
