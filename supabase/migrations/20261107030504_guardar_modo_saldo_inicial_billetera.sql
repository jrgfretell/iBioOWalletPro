-- Persist the setup choice independently from the reference date. The date alone
-- cannot distinguish a snapshot created with "hoy" from a historical snapshot.
ALTER TABLE public.config_billetera
  ADD COLUMN modo_saldo_inicial text;

ALTER TABLE public.config_billetera
  ADD CONSTRAINT config_billetera_modo_saldo_inicial_check
  CHECK (modo_saldo_inicial IS NULL OR modo_saldo_inicial IN ('hoy', 'pasado'));

COMMENT ON COLUMN public.config_billetera.modo_saldo_inicial IS
  'Modo elegido al definir el saldo de referencia: hoy o pasado.';

-- Best-effort backfill for existing records. A reference on or after the
-- wallet creation date is treated as a current snapshot; earlier dates are
-- historical. The confirmed wallet is explicitly corrected after deployment.
UPDATE public.config_billetera AS c
SET modo_saldo_inicial = CASE
  WHEN c.fecha_referencia >= (w.creado_el AT TIME ZONE 'America/Lima')::date THEN 'hoy'
  ELSE 'pasado'
END
FROM public.billeteras AS w
WHERE c.billetera_id = w.id
  AND c.user_id = w.user_id
  AND c.fecha_referencia IS NOT NULL
  AND c.modo_saldo_inicial IS NULL;

-- New signature; the original signature stays available for older clients.
CREATE FUNCTION public.crear_billetera(
  p_nombre text,
  p_moneda text,
  p_modo_saldo_inicial text,
  p_monto_base numeric,
  p_fecha_referencia date
)
RETURNS public.billeteras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  resultado public.billeteras;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para crear una billetera' USING ERRCODE = '42501';
  END IF;

  IF p_modo_saldo_inicial IS NULL OR p_modo_saldo_inicial NOT IN ('hoy', 'pasado') THEN
    RAISE EXCEPTION 'El modo del saldo inicial no es válido' USING ERRCODE = '23514';
  END IF;

  resultado := public.crear_billetera(p_nombre, p_moneda, p_monto_base, p_fecha_referencia);

  UPDATE public.config_billetera
  SET modo_saldo_inicial = p_modo_saldo_inicial
  WHERE user_id = v_uid AND billetera_id = resultado.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo guardar el modo del saldo inicial' USING ERRCODE = '23503';
  END IF;

  RETURN resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_billetera(text, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_billetera(text, text, text, numeric, date) TO authenticated;

-- New signature; edits store the chosen mode as well as the amount/date.
CREATE FUNCTION public.actualizar_billetera(
  p_billetera_id bigint,
  p_nombre text,
  p_modo_saldo_inicial text,
  p_monto_base numeric,
  p_fecha_referencia date
)
RETURNS public.billeteras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  resultado public.billeteras;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para editar la billetera' USING ERRCODE = '42501';
  END IF;

  IF p_modo_saldo_inicial IS NULL OR p_modo_saldo_inicial NOT IN ('hoy', 'pasado') THEN
    RAISE EXCEPTION 'El modo del saldo inicial no es válido' USING ERRCODE = '23514';
  END IF;

  resultado := public.actualizar_billetera(p_billetera_id, p_nombre, p_monto_base, p_fecha_referencia);

  UPDATE public.config_billetera
  SET modo_saldo_inicial = p_modo_saldo_inicial
  WHERE user_id = v_uid AND billetera_id = p_billetera_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo guardar el modo del saldo inicial' USING ERRCODE = '23503';
  END IF;

  RETURN resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.actualizar_billetera(bigint, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_billetera(bigint, text, text, numeric, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
