-- Solo antes de usar las operaciones nuevas. Si existen operaciones, restaurar
-- un respaldo revisado o preparar una migración de corrección que preserve el historial.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.operaciones_billetera)
     OR EXISTS(SELECT 1 FROM public.config_billetera WHERE fecha_referencia IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.deudas WHERE archivada) THEN
    RAISE EXCEPTION 'Rollback rechazado: hay operaciones, referencias o cronogramas retirados que se deben conservar.';
  END IF;
END $$;
DROP FUNCTION public.operacion_billetera(bigint,text,text,jsonb);
DROP FUNCTION wallet_internal.abonar_cuota(uuid,bigint,bigint,numeric,date,text);
DROP TRIGGER proteger_movimiento_pagado ON public.movimientos_agenda;
DROP FUNCTION wallet_internal.proteger_movimiento_pagado();
DROP TRIGGER validar_cuota_pagada ON public.deuda_cuotas;
DROP FUNCTION wallet_internal.validar_cuota_pagada();
DROP TABLE public.operaciones_billetera;
DROP INDEX public.cuotas_numero_cronograma;
DROP INDEX public.ocurrencia_recurrente_unica;
DO $$ DECLARE tabla text; BEGIN
  FOREACH tabla IN ARRAY ARRAY['movimientos_agenda','movimientos_recurrentes','deuda_cuotas','deuda_pagos'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',tabla,tabla||'_monto_finito');
  END LOOP;
END $$;
ALTER TABLE public.config_billetera DROP COLUMN fecha_referencia;
ALTER TABLE public.deudas DROP COLUMN archivada;
GRANT INSERT,UPDATE,DELETE ON public.config_billetera,public.deuda_pagos,public.deuda_cuotas,public.deudas,public.movimientos_recurrentes TO authenticated;
DELETE FROM wallet_internal.migraciones WHERE version='202611030002_consistencia_pagos';
NOTIFY pgrst, 'reload schema';
COMMIT;
