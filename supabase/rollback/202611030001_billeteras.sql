-- Reversión compatible con la app anterior, solo antes de usar varias billeteras.
-- Conserva las filas financieras. Se niega a mezclar monedas o billeteras nuevas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.billeteras, public.config_billetera, public.categorias,
  public.sueldos_mes, public.movimientos_recurrentes, public.movimientos_agenda,
  public.deudas, public.deuda_cuotas, public.deuda_pagos IN ACCESS EXCLUSIVE MODE;
DO $comprobar$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM wallet_internal.migraciones WHERE version='202611030001_billeteras') THEN
    RAISE EXCEPTION 'La migración no está aplicada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billeteras WHERE NOT es_principal OR moneda<>'PEN' OR archivada OR nombre<>'Personal') THEN
    RAISE EXCEPTION 'Hay billeteras nuevas, renombradas, archivadas o monedas diferentes: requiere reversión específica sin perder datos';
  END IF;
END;
$comprobar$;

DO $triggers$
DECLARE tabla text; politica record;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP
    EXECUTE format('DROP TRIGGER validar_ambito_billetera ON public.%I',tabla);
    FOR politica IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tabla
    LOOP EXECUTE format('DROP POLICY %I ON public.%I',politica.policyname,tabla); END LOOP;
    EXECUTE format('CREATE POLICY usuario_propietario ON public.%I FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id)',tabla);
  END LOOP;
END;
$triggers$;

ALTER TABLE public.movimientos_recurrentes DROP CONSTRAINT recurrentes_categoria_ambito_fk;
ALTER TABLE public.movimientos_agenda DROP CONSTRAINT movimientos_categoria_ambito_fk;
ALTER TABLE public.movimientos_agenda DROP CONSTRAINT movimientos_recurrente_ambito_fk;
ALTER TABLE public.deudas DROP CONSTRAINT deudas_categoria_ambito_fk;
ALTER TABLE public.deuda_cuotas DROP CONSTRAINT cuotas_deuda_ambito_fk;
ALTER TABLE public.deuda_pagos DROP CONSTRAINT pagos_cuota_ambito_fk;
ALTER TABLE public.deuda_pagos DROP CONSTRAINT pagos_movimiento_ambito_fk;

DO $columnas$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP EXECUTE format('ALTER TABLE public.%I DROP COLUMN billetera_id',tabla); END LOOP;
END;
$columnas$;

ALTER TABLE public.config_billetera ADD CONSTRAINT uq_config_billetera_user UNIQUE(user_id);
ALTER TABLE public.sueldos_mes ADD CONSTRAINT uq_sueldos_mes_periodo UNIQUE(user_id,anio,mes);
ALTER TABLE public.movimientos_recurrentes ADD CONSTRAINT movimientos_recurrentes_categoria_id_fkey FOREIGN KEY(categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;
ALTER TABLE public.movimientos_agenda ADD CONSTRAINT movimientos_agenda_categoria_id_fkey FOREIGN KEY(categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;
ALTER TABLE public.movimientos_agenda ADD CONSTRAINT movimientos_agenda_recurrente_id_fkey FOREIGN KEY(recurrente_id) REFERENCES public.movimientos_recurrentes(id) ON DELETE SET NULL;
ALTER TABLE public.deudas ADD CONSTRAINT deudas_categoria_id_fkey FOREIGN KEY(categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;
ALTER TABLE public.deuda_cuotas ADD CONSTRAINT deuda_cuotas_deuda_id_fkey FOREIGN KEY(deuda_id) REFERENCES public.deudas(id) ON DELETE CASCADE;
ALTER TABLE public.deuda_pagos ADD CONSTRAINT deuda_pagos_cuota_id_fkey FOREIGN KEY(cuota_id) REFERENCES public.deuda_cuotas(id) ON DELETE CASCADE;
ALTER TABLE public.deuda_pagos ADD CONSTRAINT deuda_pagos_movimiento_id_fkey FOREIGN KEY(movimiento_id) REFERENCES public.movimientos_agenda(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
BEGIN
  INSERT INTO public.config_billetera(user_id,monto_base) VALUES(NEW.id,0) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.categorias(user_id,nombre,color,icono) VALUES
    (NEW.id,'Otros','#7f8c8d','fa-folder'),
    (NEW.id,'Alimentación','#e67e22','fa-utensils'),
    (NEW.id,'Servicios','#3498db','fa-bolt'),
    (NEW.id,'Transporte','#9b59b6','fa-bus'),
    (NEW.id,'Vivienda','#1abc9c','fa-home'),
    (NEW.id,'Salud','#e74c3c','fa-heartbeat');
  RETURN NEW;
END;
$funcion$;
DROP FUNCTION public.crear_billetera(text,text);
DROP TRIGGER inicializar_billetera ON public.billeteras;
DROP TRIGGER validar_cambios_billetera ON public.billeteras;
DROP FUNCTION public.inicializar_billetera();
DROP FUNCTION public.validar_cambios_billetera();
DROP FUNCTION public.validar_escritura_billetera();
DROP TABLE public.billeteras;
DELETE FROM wallet_internal.migraciones WHERE version='202611030001_billeteras';
-- Se conservan search_path fijo y permisos mínimos de las ocho tablas.
COMMIT;
