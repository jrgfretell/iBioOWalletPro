BEGIN;

-- Extiende la RPC versionada sin reescribir ni alterar las operaciones existentes.
DO $migration$
DECLARE
  definicion text;
  marcador text := '  WHEN ''confirmar_recurrente'' THEN';
BEGIN
  SELECT pg_get_functiondef(
    'public.operacion_billetera(bigint,text,text,jsonb)'::regprocedure
  ) INTO definicion;

  IF position('WHEN ''crear_recurrente'' THEN' IN definicion) > 0
     OR position('WHEN ''editar_recurrente'' THEN' IN definicion) > 0 THEN
    RAISE EXCEPTION 'Las operaciones de ingresos recurrentes ya existen; revisa la migración.';
  END IF;
  IF position(marcador IN definicion) = 0 THEN
    RAISE EXCEPTION 'La RPC operacion_billetera no tiene la estructura esperada.';
  END IF;

  definicion := replace(definicion, marcador, $acciones$
  WHEN 'crear_recurrente' THEN
    IF char_length(btrim(COALESCE(p_datos->>'descripcion',''))) NOT BETWEEN 1 AND 160
       OR COALESCE(p_datos->>'dia_pago','') !~ '^[0-9]{1,2}$'
       OR COALESCE(p_datos->>'periodo_inicio','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'Los datos del ingreso fijo no son válidos.';
    END IF;
    monto := (p_datos->>'monto')::numeric;
    n := (p_datos->>'dia_pago')::integer;
    c := NULLIF(p_datos->>'categoria_id','')::bigint;
    IF monto IS NULL OR monto::text IN ('NaN','Infinity','-Infinity')
       OR monto <= 0 OR monto > 99999999.99 OR monto <> round(monto,2)
       OR n NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'El monto o día de cobro del ingreso fijo no es válido.';
    END IF;
    IF c IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categorias cat
      WHERE cat.id=c AND cat.user_id=uid AND cat.billetera_id=p_billetera_id
    ) THEN
      RAISE EXCEPTION 'La categoría no pertenece a esta billetera.';
    END IF;
    INSERT INTO public.movimientos_recurrentes
      (user_id,billetera_id,tipo,descripcion,monto,dia_pago,categoria_id,periodos,tipo_recurrencia)
    VALUES
      (uid,p_billetera_id,'ingreso',btrim(p_datos->>'descripcion'),monto,n,c,p_datos->>'periodo_inicio','mensual')
    RETURNING id INTO d;
    respuesta := jsonb_build_object('recurrente_id',d);

  WHEN 'editar_recurrente' THEN
    IF char_length(btrim(COALESCE(p_datos->>'descripcion',''))) NOT BETWEEN 1 AND 160
       OR COALESCE(p_datos->>'dia_pago','') !~ '^[0-9]{1,2}$'
       OR COALESCE(p_datos->>'periodo_inicio','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'Los datos del ingreso fijo no son válidos.';
    END IF;
    monto := (p_datos->>'monto')::numeric;
    n := (p_datos->>'dia_pago')::integer;
    c := NULLIF(p_datos->>'categoria_id','')::bigint;
    IF monto IS NULL OR monto::text IN ('NaN','Infinity','-Infinity')
       OR monto <= 0 OR monto > 99999999.99 OR monto <> round(monto,2)
       OR n NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'El monto o día de cobro del ingreso fijo no es válido.';
    END IF;
    IF c IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categorias cat
      WHERE cat.id=c AND cat.user_id=uid AND cat.billetera_id=p_billetera_id
    ) THEN
      RAISE EXCEPTION 'La categoría no pertenece a esta billetera.';
    END IF;
    SELECT * INTO rec FROM public.movimientos_recurrentes
      WHERE id=(p_datos->>'recurrente_id')::bigint AND user_id=uid
        AND billetera_id=p_billetera_id AND tipo='ingreso' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El ingreso fijo no está disponible.'; END IF;
    UPDATE public.movimientos_recurrentes
      SET descripcion=btrim(p_datos->>'descripcion'),monto=(p_datos->>'monto')::numeric,
          dia_pago=(p_datos->>'dia_pago')::integer,
          categoria_id=c,periodos=p_datos->>'periodo_inicio',tipo_recurrencia='mensual'
      WHERE id=rec.id AND user_id=uid AND billetera_id=p_billetera_id;
    respuesta := jsonb_build_object('recurrente_id',rec.id);

  WHEN 'confirmar_recurrente' THEN$acciones$);

  EXECUTE definicion;
END $migration$;

INSERT INTO wallet_internal.migraciones(version)
VALUES ('20261110223624_habilitar_ingresos_recurrentes');

NOTIFY pgrst, 'reload schema';
COMMIT;
