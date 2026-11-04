-- ETAPA 5. Aplicar después de 202611030001, junto con el frontend correspondiente.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
INSERT INTO wallet_internal.migraciones(version) VALUES ('202611030002_consistencia_pagos');

-- NULL conserva el cálculo anterior hasta que el propietario confirme una referencia.
ALTER TABLE public.config_billetera ADD COLUMN fecha_referencia date;
ALTER TABLE public.deudas ADD COLUMN archivada boolean NOT NULL DEFAULT false;
DO $$ DECLARE tabla text; BEGIN
  FOREACH tabla IN ARRAY ARRAY['movimientos_agenda','movimientos_recurrentes','deuda_cuotas','deuda_pagos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (monto NOT IN (''NaN''::numeric,''Infinity''::numeric,''-Infinity''::numeric))',tabla,tabla||'_monto_finito');
  END LOOP;
END $$;
CREATE UNIQUE INDEX cuotas_numero_cronograma ON public.deuda_cuotas(user_id,billetera_id,deuda_id,numero);
CREATE UNIQUE INDEX ocurrencia_recurrente_unica ON public.movimientos_agenda(user_id,billetera_id,recurrente_id,fecha) WHERE recurrente_id IS NOT NULL;

CREATE TABLE public.operaciones_billetera (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  solicitud text NOT NULL CHECK (char_length(solicitud) BETWEEN 1 AND 100),
  billetera_id bigint NOT NULL,
  accion text NOT NULL,
  datos jsonb NOT NULL,
  resultado jsonb NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,solicitud),
  FOREIGN KEY(billetera_id,user_id) REFERENCES public.billeteras(id,user_id)
);
ALTER TABLE public.operaciones_billetera ENABLE ROW LEVEL SECURITY;
CREATE POLICY operaciones_propias ON public.operaciones_billetera FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.operaciones_billetera FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.operaciones_billetera TO authenticated;

-- Un gasto vinculado se modifica anulando el abono completo, nunca por separado.
CREATE FUNCTION wallet_internal.proteger_movimiento_pagado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.deuda_pagos WHERE movimiento_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'El registro pertenece a un abono. Anúlalo desde su cronograma.'; END IF;
    IF (NEW.monto,NEW.tipo,NEW.fecha,NEW.fecha_pago,NEW.pago_confirmado) IS DISTINCT FROM (OLD.monto,OLD.tipo,OLD.fecha,OLD.fecha_pago,OLD.pago_confirmado) THEN
      RAISE EXCEPTION 'El registro pertenece a un abono. Anúlalo desde su cronograma.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger_movimiento_pagado BEFORE UPDATE OR DELETE ON public.movimientos_agenda
FOR EACH ROW EXECUTE FUNCTION wallet_internal.proteger_movimiento_pagado();

CREATE FUNCTION wallet_internal.validar_cuota_pagada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.monto < COALESCE((SELECT sum(monto) FROM public.deuda_pagos WHERE cuota_id=OLD.id),0) THEN
    RAISE EXCEPTION 'No se puede reducir la cuota por debajo de sus abonos.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_cuota_pagada BEFORE UPDATE ON public.deuda_cuotas
FOR EACH ROW EXECUTE FUNCTION wallet_internal.validar_cuota_pagada();

CREATE FUNCTION wallet_internal.abonar_cuota(p_uid uuid,p_wallet bigint,p_cuota bigint,p_monto numeric,p_fecha date,p_solicitud text)
RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public.deuda_cuotas; d public.deudas; abonado numeric; mov bigint; pago bigint;
BEGIN
  SELECT * INTO c FROM public.deuda_cuotas WHERE id=p_cuota AND user_id=p_uid AND billetera_id=p_wallet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El registro de cuota no está disponible.'; END IF;
  SELECT * INTO d FROM public.deudas WHERE id=c.deuda_id AND user_id=p_uid AND billetera_id=p_wallet AND NOT archivada;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se puede pagar un cronograma retirado.'; END IF;
  IF p_monto IS NULL OR p_monto<=0 OR p_monto<>round(p_monto,2) OR p_fecha IS NULL OR p_fecha>(now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'El registro necesita un importe positivo con dos decimales y una fecha no futura.';
  END IF;
  SELECT COALESCE(sum(monto),0) INTO abonado FROM public.deuda_pagos WHERE cuota_id=c.id;
  IF p_monto>c.monto-abonado THEN RAISE EXCEPTION 'El registro supera el saldo pendiente de la cuota. Actualiza la vista.'; END IF;
  INSERT INTO public.movimientos_agenda(user_id,billetera_id,tipo,descripcion,monto,fecha,categoria_id,es_recurrente,pago_confirmado,fecha_pago)
    VALUES(p_uid,p_wallet,'gasto',d.nombre||' · Cuota '||c.numero,p_monto,p_fecha,d.categoria_id,false,true,p_fecha) RETURNING id INTO mov;
  INSERT INTO public.deuda_pagos(user_id,billetera_id,cuota_id,monto,fecha,movimiento_id,solicitud)
    VALUES(p_uid,p_wallet,c.id,p_monto,p_fecha,mov,p_solicitud) RETURNING id INTO pago;
  RETURN pago;
END $$;

-- Se revoca la escritura fragmentada: las altas/abonos y bajas pasan por la RPC.
REVOKE INSERT,UPDATE,DELETE ON public.deuda_pagos FROM authenticated;
REVOKE INSERT,DELETE ON public.deuda_cuotas FROM authenticated;
REVOKE INSERT,DELETE ON public.deudas FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.config_billetera FROM authenticated;
REVOKE DELETE ON public.movimientos_recurrentes FROM authenticated;

CREATE FUNCTION public.operacion_billetera(p_billetera_id bigint,p_solicitud text,p_accion text,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE
  uid uuid:=auth.uid(); prev public.operaciones_billetera;
  respuesta jsonb:='{}'; d bigint; c bigint; m bigint; pago bigint;
  item jsonb; n integer:=0; fecha date; monto numeric; rec public.movimientos_recurrentes;
  abono public.deuda_pagos; mov public.movimientos_agenda;
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
    pago:=wallet_internal.abonar_cuota(uid,p_billetera_id,(p_datos->>'cuota_id')::bigint,(p_datos->>'monto')::numeric,(p_datos->>'fecha')::date,p_solicitud);
    respuesta:=jsonb_build_object('pago_id',pago);

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
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wallet_internal FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
