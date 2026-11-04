-- Migración 202611030003: Eliminación condicional de billetera vacía
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO wallet_internal.migraciones(version) VALUES ('202611030003_eliminar_billetera_vacia')
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.eliminar_billetera(p_billetera_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_user_id uuid;
  v_billetera public.billeteras%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para realizar esta operación' USING ERRCODE = '42501';
  END IF;

  -- 1. Bloquear y verificar la existencia de la billetera del usuario
  SELECT * INTO v_billetera
  FROM public.billeteras
  WHERE id = p_billetera_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billetera no disponible o no encontrada' USING ERRCODE = '23503';
  END IF;

  -- 2. Impedir eliminar la billetera principal
  IF v_billetera.es_principal THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera principal' USING ERRCODE = '23514';
  END IF;

  -- 3. Validar que no tenga saldo base asignado (monto <> 0)
  IF EXISTS (
    SELECT 1 FROM public.config_billetera
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND monto_base <> 0
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene saldo configurado. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- 4. Validar que no tenga movimientos registrados en agenda
  IF EXISTS (
    SELECT 1 FROM public.movimientos_agenda
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene movimientos registrados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- 5. Validar que no tenga deudas o cronogramas
  IF EXISTS (
    SELECT 1 FROM public.deudas
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene deudas o cronogramas registrados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- 6. Validar que no tenga movimientos recurrentes
  IF EXISTS (
    SELECT 1 FROM public.movimientos_recurrentes
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene pagos recurrentes programados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- 7. Validar que no tenga sueldos configurados
  IF EXISTS (
    SELECT 1 FROM public.sueldos_mes
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND (sueldo_15 <> 0 OR sueldo_30 <> 0)
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene sueldos configurados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- 8. Validar que no tenga operaciones registradas
  IF EXISTS (
    SELECT 1 FROM public.operaciones_billetera
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene operaciones registradas. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  -- Si estaba archivada, la reactivamos para que el trigger de verificación permita eliminar tablas secundarias
  IF v_billetera.archivada THEN
    UPDATE public.billeteras SET archivada = false WHERE id = p_billetera_id AND user_id = v_user_id;
  END IF;

  -- Limpiar registros base asociados
  DELETE FROM public.sueldos_mes WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.categorias WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.config_billetera WHERE billetera_id = p_billetera_id AND user_id = v_user_id;

  -- Eliminar la billetera definitivamente
  DELETE FROM public.billeteras WHERE id = p_billetera_id AND user_id = v_user_id;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.eliminar_billetera(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_billetera(bigint) TO authenticated;

COMMIT;
