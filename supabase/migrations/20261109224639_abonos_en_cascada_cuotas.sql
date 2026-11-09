-- ==============================================================================
-- Migración: 20261109224639_abonos_en_cascada_cuotas.sql
-- Propósito:
--   Distribuir en cascada los abonos superiores al saldo de la cuota
--   seleccionada, sin superar el saldo pendiente del cronograma.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.operacion_billetera(p_billetera_id bigint,p_solicitud text,p_accion text,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE
  uid uuid:=auth.uid(); prev public.operaciones_billetera;
  respuesta jsonb:='{}'; d bigint; c bigint; m bigint; pago bigint;
  item jsonb; n integer:=0; fecha date; monto numeric; rec public.movimientos_recurrentes;
  abono public.deuda_pagos; mov public.movimientos_agenda;
  cuota_base record; cuota_actual record; restante numeric; asignar numeric; distribucion jsonb:='[]'::jsonb; distribucion_solicitada jsonb; pagos_ids jsonb:='[]'::jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Billetera no disponible.' USING ERRCODE='42501'; END IF;
  -- Mismo bloqueo que el archivo/cambio de moneda; serializa las operaciones de esta billetera.
  PERFORM 1 FROM public.billeteras WHERE id=p_billetera_id AND user_id=uid AND NOT archivada FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billetera no disponible o archivada.' USING ERRCODE='42501'; END IF;
  IF p_solicitud IS NULL OR char_length(p_solicitud) NOT BETWEEN 1 AND 100 OR p_datos IS NULL OR jsonb_typeof(p_datos)<>'object' THEN
    RAISE EXCEPTION 'El registro de solicitud no es válido.';
  END IF;
  SELECT * INTO prev FROM public.operaciones_billetera WHERE user_id=uid AND solicitud=p_solicitud;
  IF FOUND THEN
    IF prev.billetera_id<>p_billetera_id OR prev.accion<>p_accion OR prev.datos<>p_datos THEN
      RAISE EXCEPTION 'El registro de solicitud ya se usó con otros datos.';
    END IF;
    RETURN prev.resultado;
  END IF;

  CASE p_accion
  WHEN 'saldo_referencia' THEN
    fecha:=(p_datos->>'fecha')::date; monto:=(p_datos->>'monto')::numeric;
    IF fecha IS NULL OR fecha>(now() AT TIME ZONE 'America/Lima')::date OR monto IS NULL OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2) THEN
      RAISE EXCEPTION 'El registro de saldo necesita una fecha no futura y dos decimales.';
    END IF;
    INSERT INTO public.config_billetera(user_id,billetera_id,monto_base,fecha_referencia,actualizado_el)
      VALUES(uid,p_billetera_id,monto,fecha,now()) ON CONFLICT(user_id,billetera_id)
      DO UPDATE SET monto_base=excluded.monto_base,fecha_referencia=excluded.fecha_referencia,actualizado_el=excluded.actualizado_el;
    respuesta:=jsonb_build_object('fecha',fecha,'monto',monto);

  WHEN 'crear_cronograma' THEN
    IF char_length(btrim(COALESCE(p_datos->>'nombre',''))) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_datos->'cuotas') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_datos->'cuotas') NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'El registro de cronograma no es válido.'; END IF;
    INSERT INTO public.deudas(user_id,billetera_id,nombre,monto_recibido,categoria_id)
      VALUES(uid,p_billetera_id,btrim(p_datos->>'nombre'),COALESCE((p_datos->>'monto_recibido')::numeric,0),(p_datos->>'categoria_id')::bigint) RETURNING id INTO d;
    FOR item IN SELECT value FROM jsonb_array_elements(p_datos->'cuotas') LOOP
      n:=n+1; monto:=(item->>'monto')::numeric; fecha:=(item->>'fecha')::date;
      IF fecha IS NULL OR monto IS NULL OR monto<=0 OR monto<>round(monto,2) THEN RAISE EXCEPTION 'El registro de cuota no es válido.'; END IF;
      INSERT INTO public.deuda_cuotas(user_id,billetera_id,deuda_id,numero,monto,fecha) VALUES(uid,p_billetera_id,d,n,monto,fecha) RETURNING id INTO c;
      IF COALESCE((item->>'pagada')::boolean,false) THEN
        PERFORM wallet_internal.abonar_cuota(uid,p_billetera_id,c,monto,(item->>'fecha_pago')::date,p_solicitud||':'||n);
      END IF;
    END LOOP;
    respuesta:=jsonb_build_object('deuda_id',d);

  WHEN 'pagar_cuota' THEN
    c:=(p_datos->>'cuota_id')::bigint;
    monto:=(p_datos->>'monto')::numeric;
    IF monto IS NULL OR monto<=0 OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2) THEN
      RAISE EXCEPTION 'El importe del abono debe ser mayor que cero y tener hasta dos decimales.';
    END IF;
    SELECT q.* INTO cuota_base
      FROM public.deuda_cuotas q
      JOIN public.deudas deuda ON deuda.id=q.deuda_id AND deuda.user_id=uid AND deuda.billetera_id=p_billetera_id AND NOT deuda.archivada
      WHERE q.id=c AND q.user_id=uid AND q.billetera_id=p_billetera_id
      FOR UPDATE OF q;
    IF NOT FOUND THEN RAISE EXCEPTION 'La cuota no está disponible.'; END IF;
    -- Bloquea desde la cuota elegida hacia adelante; la billetera ya está bloqueada arriba.
    PERFORM q.id FROM public.deuda_cuotas q
      WHERE q.deuda_id=cuota_base.deuda_id AND q.user_id=uid AND q.billetera_id=p_billetera_id AND q.numero>=cuota_base.numero
      ORDER BY q.numero FOR UPDATE;
    restante:=monto;
    distribucion:='[]'::jsonb;
    FOR cuota_actual IN
      SELECT q.id,q.numero,GREATEST(0,ROUND((q.monto-COALESCE((SELECT SUM(dp.monto) FROM public.deuda_pagos dp WHERE dp.cuota_id=q.id AND dp.user_id=uid AND dp.billetera_id=p_billetera_id),0))*100)/100) AS pendiente
      FROM public.deuda_cuotas q
      WHERE q.deuda_id=cuota_base.deuda_id AND q.user_id=uid AND q.billetera_id=p_billetera_id AND q.numero>=cuota_base.numero
      ORDER BY q.numero
    LOOP
      EXIT WHEN restante<=0;
      asignar:=LEAST(restante,cuota_actual.pendiente);
      IF asignar>0 THEN
        distribucion:=distribucion||jsonb_build_array(jsonb_build_object('cuota_id',cuota_actual.id,'monto',asignar));
        restante:=ROUND((restante-asignar)*100)/100;
      END IF;
    END LOOP;
    IF restante>0 THEN RAISE EXCEPTION 'El importe supera el saldo pendiente de esta cuota y las siguientes.'; END IF;
    distribucion_solicitada:=p_datos->'distribucion';
    IF jsonb_typeof(distribucion_solicitada) IS DISTINCT FROM 'array' OR distribucion_solicitada<>distribucion THEN
      RAISE EXCEPTION 'El cronograma cambió. Actualiza y revisa la distribución del abono.';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(distribucion) LOOP
      pago:=wallet_internal.abonar_cuota(uid,p_billetera_id,(item->>'cuota_id')::bigint,(item->>'monto')::numeric,(p_datos->>'fecha')::date,p_solicitud||':'||(item->>'cuota_id'));
      pagos_ids:=pagos_ids||jsonb_build_array(pago);
    END LOOP;
    respuesta:=jsonb_build_object('pago_ids',pagos_ids,'distribucion',distribucion,'total_abonado',monto);

  WHEN 'anular_abono' THEN
    SELECT * INTO abono FROM public.deuda_pagos WHERE id=(p_datos->>'pago_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro de abono no está disponible.'; END IF;
    DELETE FROM public.deuda_pagos WHERE id=abono.id;
    IF abono.movimiento_id IS NOT NULL THEN DELETE FROM public.movimientos_agenda WHERE id=abono.movimiento_id AND user_id=uid AND billetera_id=p_billetera_id; END IF;
    respuesta:=jsonb_build_object('pago_id',abono.id);

  WHEN 'retirar_cronograma' THEN
    UPDATE public.deudas SET archivada=true WHERE id=(p_datos->>'deuda_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id RETURNING id INTO d;
    IF d IS NULL THEN RAISE EXCEPTION 'El registro de cronograma no está disponible.'; END IF;
    respuesta:=jsonb_build_object('deuda_id',d);

  WHEN 'eliminar_cronograma' THEN
    PERFORM 1 FROM public.deudas WHERE id=(p_datos->>'deuda_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro de cronograma no está disponible.'; END IF;

    -- 1. Recopilar IDs de movimientos_agenda generados por abonos de este cronograma
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_movs_cronograma (id bigint) ON COMMIT DROP;
    TRUNCATE tmp_movs_cronograma;

    INSERT INTO tmp_movs_cronograma (id)
    SELECT p.movimiento_id
    FROM public.deuda_pagos p
    JOIN public.deuda_cuotas c ON c.id = p.cuota_id
    WHERE c.deuda_id = (p_datos->>'deuda_id')::bigint
      AND p.user_id = uid
      AND p.billetera_id = p_billetera_id
      AND p.movimiento_id IS NOT NULL;

    -- 2. Eliminar deuda_pagos primero para liberar trigger proteger_movimiento_pagado
    DELETE FROM public.deuda_pagos
    WHERE cuota_id IN (
      SELECT id FROM public.deuda_cuotas
      WHERE deuda_id = (p_datos->>'deuda_id')::bigint AND user_id = uid AND billetera_id = p_billetera_id
    );

    -- 3. Eliminar movimientos de agenda asociados
    DELETE FROM public.movimientos_agenda
    WHERE id IN (SELECT id FROM tmp_movs_cronograma)
      AND user_id = uid
      AND billetera_id = p_billetera_id;

    -- 4. Eliminar deuda_cuotas
    DELETE FROM public.deuda_cuotas
    WHERE deuda_id = (p_datos->>'deuda_id')::bigint
      AND user_id = uid
      AND billetera_id = p_billetera_id;

    -- 5. Eliminar la deuda definitivamente
    DELETE FROM public.deudas
    WHERE id = (p_datos->>'deuda_id')::bigint
      AND user_id = uid
      AND billetera_id = p_billetera_id;

    respuesta:=jsonb_build_object('deuda_id', (p_datos->>'deuda_id')::bigint);

  WHEN 'ajustar_fin_mes' THEN
    PERFORM 1 FROM public.deudas WHERE id=(p_datos->>'deuda_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id AND NOT archivada;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro de cronograma no está disponible.'; END IF;
    UPDATE public.deuda_cuotas q SET fecha=(date_trunc('month',q.fecha)+interval '1 month - 1 day')::date
      WHERE q.deuda_id=(p_datos->>'deuda_id')::bigint AND q.user_id=uid AND q.billetera_id=p_billetera_id
      AND NOT EXISTS(SELECT 1 FROM public.deuda_pagos p WHERE p.cuota_id=q.id);

  WHEN 'confirmar_recurrente' THEN
    SELECT * INTO rec FROM public.movimientos_recurrentes WHERE id=(p_datos->>'recurrente_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro recurrente no está disponible.'; END IF;
    fecha:=(p_datos->>'fecha_pago')::date;
    IF fecha IS NULL OR fecha>(now() AT TIME ZONE 'America/Lima')::date OR (p_datos->>'vencimiento')::date IS NULL THEN RAISE EXCEPTION 'El registro necesita una fecha real de pago no futura.'; END IF;
    INSERT INTO public.movimientos_agenda(user_id,billetera_id,tipo,descripcion,monto,fecha,categoria_id,es_recurrente,recurrente_id,pago_confirmado,fecha_pago)
      VALUES(uid,p_billetera_id,rec.tipo,rec.descripcion,rec.monto,(p_datos->>'vencimiento')::date,rec.categoria_id,true,rec.id,true,fecha)
      ON CONFLICT(user_id,billetera_id,recurrente_id,fecha) WHERE recurrente_id IS NOT NULL
      DO UPDATE SET pago_confirmado=true,fecha_pago=CASE WHEN movimientos_agenda.pago_confirmado THEN movimientos_agenda.fecha_pago ELSE excluded.fecha_pago END RETURNING id INTO m;
    respuesta:=jsonb_build_object('movimiento_id',m);

  WHEN 'retirar_recurrente' THEN
    PERFORM 1 FROM public.movimientos_recurrentes WHERE id=(p_datos->>'recurrente_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro recurrente no está disponible.'; END IF;
    DELETE FROM public.movimientos_agenda WHERE recurrente_id=(p_datos->>'recurrente_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id AND NOT pago_confirmado;
    DELETE FROM public.movimientos_recurrentes WHERE id=(p_datos->>'recurrente_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id;

  ELSE RAISE EXCEPTION 'No se puede ejecutar esta operación.';
  END CASE;
  INSERT INTO public.operaciones_billetera(user_id,solicitud,billetera_id,accion,datos,resultado)
    VALUES(uid,p_solicitud,p_billetera_id,p_accion,p_datos,respuesta);
  RETURN respuesta;
END $$;

REVOKE ALL ON FUNCTION public.operacion_billetera(bigint,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operacion_billetera(bigint,text,text,jsonb) TO authenticated;

-- Registrar migración
INSERT INTO wallet_internal.migraciones (version)
VALUES ('20261109224639_abonos_en_cascada_cuotas')
ON CONFLICT (version) DO NOTHING;

COMMIT;
