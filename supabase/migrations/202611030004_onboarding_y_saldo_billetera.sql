-- Migración 202611030004: Onboarding sin billetera por defecto y Saldo Base consolidado en Billetera
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO wallet_internal.migraciones(version) VALUES ('202611030004_onboarding_y_saldo_billetera')
ON CONFLICT (version) DO NOTHING;

-- 1. Los usuarios nuevos ya no reciben una billetera 'Personal' automática:
--    deben crear su primera billetera desde el asistente de bienvenida (Onboarding).
CREATE OR REPLACE FUNCTION public.handle_new_user_setup() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
BEGIN
  RETURN NEW;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;

-- 2. Reemplazar crear_billetera para aceptar saldo inicial y fecha de referencia,
--    y marcar automáticamente como principal la primera billetera del usuario.
DROP FUNCTION IF EXISTS public.crear_billetera(text, text);

CREATE OR REPLACE FUNCTION public.crear_billetera(
  p_nombre text,
  p_moneda text DEFAULT 'PEN',
  p_monto_base numeric DEFAULT 0,
  p_fecha_referencia date DEFAULT NULL
)
RETURNS public.billeteras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid;
  v_es_principal boolean;
  v_fecha date;
  v_monto numeric;
  resultado public.billeteras;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para crear una billetera' USING ERRCODE = '42501';
  END IF;

  v_monto := round(COALESCE(p_monto_base, 0), 2);
  v_fecha := COALESCE(p_fecha_referencia, (now() AT TIME ZONE 'America/Lima')::date);

  IF v_fecha > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'El registro de saldo necesita una fecha no futura y dos decimales.' USING ERRCODE = '23514';
  END IF;

  -- Si el usuario no tiene ninguna billetera principal aún, esta será su principal
  v_es_principal := NOT EXISTS (
    SELECT 1 FROM public.billeteras WHERE user_id = v_uid AND es_principal
  );

  INSERT INTO public.billeteras(user_id, nombre, moneda, es_principal)
  VALUES (v_uid, btrim(p_nombre), COALESCE(p_moneda, 'PEN'), v_es_principal)
  RETURNING * INTO resultado;

  -- Actualizar el saldo base y fecha de referencia creados por el trigger inicializar_billetera
  UPDATE public.config_billetera
  SET monto_base = v_monto,
      fecha_referencia = v_fecha,
      actualizado_el = now()
  WHERE user_id = v_uid AND billetera_id = resultado.id;

  RETURN resultado;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.crear_billetera(text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_billetera(text, text, numeric, date) TO authenticated;

-- 3. Función atómica para editar nombre, saldo base y fecha de referencia de una billetera
CREATE OR REPLACE FUNCTION public.actualizar_billetera(
  p_billetera_id bigint,
  p_nombre text,
  p_monto_base numeric DEFAULT NULL,
  p_fecha_referencia date DEFAULT NULL
)
RETURNS public.billeteras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_uid uuid;
  v_fecha date;
  v_monto numeric;
  resultado public.billeteras;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para editar la billetera' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO resultado
  FROM public.billeteras
  WHERE id = p_billetera_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billetera no disponible o no encontrada' USING ERRCODE = '23503';
  END IF;

  IF resultado.archivada THEN
    RAISE EXCEPTION 'Reactiva la billetera para modificar sus registros' USING ERRCODE = '23514';
  END IF;

  UPDATE public.billeteras
  SET nombre = btrim(p_nombre),
      actualizado_el = now()
  WHERE id = p_billetera_id AND user_id = v_uid
  RETURNING * INTO resultado;

  IF p_monto_base IS NOT NULL THEN
    v_monto := round(p_monto_base, 2);
    v_fecha := COALESCE(p_fecha_referencia, (now() AT TIME ZONE 'America/Lima')::date);

    IF v_fecha > (now() AT TIME ZONE 'America/Lima')::date THEN
      RAISE EXCEPTION 'El registro de saldo necesita una fecha no futura y dos decimales.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.config_billetera(user_id, billetera_id, monto_base, fecha_referencia, actualizado_el)
    VALUES (v_uid, p_billetera_id, v_monto, v_fecha, now())
    ON CONFLICT (user_id, billetera_id)
    DO UPDATE SET
      monto_base = EXCLUDED.monto_base,
      fecha_referencia = EXCLUDED.fecha_referencia,
      actualizado_el = EXCLUDED.actualizado_el;
  END IF;

  RETURN resultado;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.actualizar_billetera(bigint, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_billetera(bigint, text, numeric, date) TO authenticated;

-- 4. Ajustar eliminar_billetera para limpiar operaciones_billetera si solo hubo ajustes de saldo a 0
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

  SELECT * INTO v_billetera
  FROM public.billeteras
  WHERE id = p_billetera_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billetera no disponible o no encontrada' USING ERRCODE = '23503';
  END IF;

  IF v_billetera.es_principal THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera principal' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.config_billetera
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND monto_base <> 0
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene saldo configurado. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimientos_agenda
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene movimientos registrados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deudas
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene deudas o cronogramas registrados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimientos_recurrentes
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene pagos recurrentes programados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sueldos_mes
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND (sueldo_15 <> 0 OR sueldo_30 <> 0)
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar la billetera porque tiene sueldos configurados. Puedes archivarla para conservar el historial.' USING ERRCODE = '23514';
  END IF;

  IF v_billetera.archivada THEN
    UPDATE public.billeteras SET archivada = false WHERE id = p_billetera_id AND user_id = v_user_id;
  END IF;

  DELETE FROM public.operaciones_billetera WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.sueldos_mes WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.categorias WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.config_billetera WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
  DELETE FROM public.billeteras WHERE id = p_billetera_id AND user_id = v_user_id;

  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.eliminar_billetera(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_billetera(bigint) TO authenticated;

COMMIT;
