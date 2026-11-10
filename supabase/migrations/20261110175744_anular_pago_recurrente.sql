BEGIN;
-- Añadir la acción a la RPC existente, conservando todas sus operaciones.
DO $migration$
DECLARE definicion text; marcador text := '  WHEN ''retirar_recurrente'' THEN';
BEGIN
  SELECT pg_get_functiondef('public.operacion_billetera(bigint,text,text,jsonb)'::regprocedure) INTO definicion;
  IF position('WHEN ''anular_recurrente'' THEN' in definicion)>0 THEN
    RAISE EXCEPTION 'La acción anular_recurrente ya existe; revisa la migración.';
  END IF;
  IF position(marcador in definicion)=0 THEN RAISE EXCEPTION 'RPC incompatible.'; END IF;
  definicion := replace(definicion,marcador,$action$
  WHEN 'anular_recurrente' THEN
    SELECT * INTO mov FROM public.movimientos_agenda
      WHERE id=(p_datos->>'movimiento_id')::bigint AND user_id=uid AND billetera_id=p_billetera_id FOR UPDATE;
    IF NOT FOUND OR mov.recurrente_id IS NULL OR NOT mov.es_recurrente THEN
      RAISE EXCEPTION 'El pago recurrente no está disponible. Actualiza la vista.';
    END IF;
    IF NOT mov.pago_confirmado THEN
      RAISE EXCEPTION 'Este pago ya está pendiente. Actualiza la vista.';
    END IF;
    UPDATE public.movimientos_agenda SET pago_confirmado=false,fecha_pago=NULL
      WHERE id=mov.id AND user_id=uid AND billetera_id=p_billetera_id;
    respuesta:=jsonb_build_object('movimiento_id',mov.id,'pago_confirmado',false);

  WHEN 'retirar_recurrente' THEN$action$);
  EXECUTE definicion;
END $migration$;
INSERT INTO wallet_internal.migraciones(version) VALUES ('20261110175653_anular_pago_recurrente');
NOTIFY pgrst, 'reload schema';
COMMIT;
