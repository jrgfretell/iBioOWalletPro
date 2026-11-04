-- ETAPA 2. PostgreSQL 17+. Ejecutar una sola vez, con rol administrativo.
-- Aplicar primero en pruebas. La app antigua no entiende billetera_id.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS wallet_internal;
REVOKE ALL ON SCHEMA wallet_internal FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS wallet_internal.migraciones (
  version text PRIMARY KEY,
  aplicada_el timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallet_internal.migraciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_internal.migraciones FROM PUBLIC, anon, authenticated;
INSERT INTO wallet_internal.migraciones(version) VALUES ('202611030001_billeteras');

-- Impedir altas/operaciones concurrentes durante la asignación inicial.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.config_billetera, public.categorias, public.sueldos_mes,
  public.movimientos_recurrentes, public.movimientos_agenda, public.deudas,
  public.deuda_cuotas, public.deuda_pagos IN ACCESS EXCLUSIVE MODE;

CREATE TABLE public.billeteras (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 80),
  moneda text NOT NULL CHECK (moneda IN ('PEN', 'USD', 'EUR')),
  archivada boolean NOT NULL DEFAULT false,
  es_principal boolean NOT NULL DEFAULT false,
  creado_el timestamptz NOT NULL DEFAULT now(),
  actualizado_el timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billeteras_id_usuario_unique UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX billeteras_principal_usuario ON public.billeteras(user_id) WHERE es_principal;
CREATE INDEX billeteras_usuario_estado ON public.billeteras(user_id, archivada, id);

-- Los datos existentes mantienen sus IDs, fechas e importes originales.
INSERT INTO public.billeteras(user_id, nombre, moneda, es_principal)
SELECT id, 'Personal', 'PEN', true FROM auth.users;

DO $migrar$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN billetera_id bigint', tabla);
    EXECUTE format('UPDATE public.%I t SET billetera_id=b.id FROM public.billeteras b WHERE b.user_id=t.user_id AND b.es_principal', tabla);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN billetera_id SET NOT NULL', tabla);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (billetera_id,user_id) REFERENCES public.billeteras(id,user_id) ON DELETE RESTRICT', tabla, tabla||'_billetera_usuario_fk');
    EXECUTE format('CREATE INDEX %I ON public.%I(user_id,billetera_id)', 'idx_'||tabla||'_billetera', tabla);
  END LOOP;
END;
$migrar$;

ALTER TABLE public.config_billetera DROP CONSTRAINT uq_config_billetera_user;
ALTER TABLE public.config_billetera ADD CONSTRAINT uq_config_billetera_usuario_billetera UNIQUE (user_id,billetera_id);
ALTER TABLE public.sueldos_mes DROP CONSTRAINT uq_sueldos_mes_periodo;
ALTER TABLE public.sueldos_mes ADD CONSTRAINT uq_sueldos_mes_billetera_periodo UNIQUE (user_id,billetera_id,anio,mes);

-- La pertenencia del padre se valida también por usuario y billetera.
ALTER TABLE public.categorias ADD CONSTRAINT categorias_ambito_unique UNIQUE (id,user_id,billetera_id);
ALTER TABLE public.movimientos_recurrentes ADD CONSTRAINT recurrentes_ambito_unique UNIQUE (id,user_id,billetera_id);
ALTER TABLE public.movimientos_agenda ADD CONSTRAINT movimientos_ambito_unique UNIQUE (id,user_id,billetera_id);
ALTER TABLE public.deudas ADD CONSTRAINT deudas_ambito_unique UNIQUE (id,user_id,billetera_id);
ALTER TABLE public.deuda_cuotas ADD CONSTRAINT cuotas_ambito_unique UNIQUE (id,user_id,billetera_id);

ALTER TABLE public.movimientos_recurrentes DROP CONSTRAINT movimientos_recurrentes_categoria_id_fkey;
ALTER TABLE public.movimientos_recurrentes ADD CONSTRAINT recurrentes_categoria_ambito_fk
  FOREIGN KEY (categoria_id,user_id,billetera_id) REFERENCES public.categorias(id,user_id,billetera_id) ON DELETE SET NULL (categoria_id);
ALTER TABLE public.movimientos_agenda DROP CONSTRAINT movimientos_agenda_categoria_id_fkey;
ALTER TABLE public.movimientos_agenda ADD CONSTRAINT movimientos_categoria_ambito_fk
  FOREIGN KEY (categoria_id,user_id,billetera_id) REFERENCES public.categorias(id,user_id,billetera_id) ON DELETE SET NULL (categoria_id);
ALTER TABLE public.movimientos_agenda DROP CONSTRAINT movimientos_agenda_recurrente_id_fkey;
ALTER TABLE public.movimientos_agenda ADD CONSTRAINT movimientos_recurrente_ambito_fk
  FOREIGN KEY (recurrente_id,user_id,billetera_id) REFERENCES public.movimientos_recurrentes(id,user_id,billetera_id) ON DELETE SET NULL (recurrente_id);
ALTER TABLE public.deudas DROP CONSTRAINT deudas_categoria_id_fkey;
ALTER TABLE public.deudas ADD CONSTRAINT deudas_categoria_ambito_fk
  FOREIGN KEY (categoria_id,user_id,billetera_id) REFERENCES public.categorias(id,user_id,billetera_id) ON DELETE SET NULL (categoria_id);
ALTER TABLE public.deuda_cuotas DROP CONSTRAINT deuda_cuotas_deuda_id_fkey;
ALTER TABLE public.deuda_cuotas ADD CONSTRAINT cuotas_deuda_ambito_fk
  FOREIGN KEY (deuda_id,user_id,billetera_id) REFERENCES public.deudas(id,user_id,billetera_id) ON DELETE CASCADE;
ALTER TABLE public.deuda_pagos DROP CONSTRAINT deuda_pagos_cuota_id_fkey;
ALTER TABLE public.deuda_pagos ADD CONSTRAINT pagos_cuota_ambito_fk
  FOREIGN KEY (cuota_id,user_id,billetera_id) REFERENCES public.deuda_cuotas(id,user_id,billetera_id) ON DELETE CASCADE;
ALTER TABLE public.deuda_pagos DROP CONSTRAINT deuda_pagos_movimiento_id_fkey;
ALTER TABLE public.deuda_pagos ADD CONSTRAINT pagos_movimiento_ambito_fk
  FOREIGN KEY (movimiento_id,user_id,billetera_id) REFERENCES public.movimientos_agenda(id,user_id,billetera_id) ON DELETE CASCADE;

CREATE INDEX idx_movimientos_billetera_fecha ON public.movimientos_agenda(user_id,billetera_id,fecha,id);
CREATE INDEX idx_cuotas_billetera_fecha ON public.deuda_cuotas(user_id,billetera_id,fecha,id);
CREATE INDEX idx_pagos_billetera_fecha ON public.deuda_pagos(user_id,billetera_id,fecha,id);

ALTER TABLE public.billeteras ENABLE ROW LEVEL SECURITY;
CREATE POLICY billeteras_lectura ON public.billeteras FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY billeteras_creacion ON public.billeteras FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND NOT es_principal AND NOT archivada);
CREATE POLICY billeteras_edicion ON public.billeteras FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
-- No hay DELETE para billeteras: el historial se conserva al archivar.

DO $politicas$
DECLARE tabla text; politica record; acceso text; escritura text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP
    FOR politica IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tabla
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', politica.policyname, tabla);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
    acceso := format('user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.billeteras b WHERE b.id=%I.billetera_id AND b.user_id=%I.user_id)',tabla,tabla);
    escritura := format('user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.billeteras b WHERE b.id=%I.billetera_id AND b.user_id=%I.user_id AND NOT b.archivada)',tabla,tabla);
    EXECUTE format('CREATE POLICY billetera_lectura ON public.%I FOR SELECT TO authenticated USING (%s)',tabla,acceso);
    EXECUTE format('CREATE POLICY billetera_creacion ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',tabla,escritura);
    EXECUTE format('CREATE POLICY billetera_edicion ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',tabla,escritura,escritura);
    EXECUTE format('CREATE POLICY billetera_eliminacion ON public.%I FOR DELETE TO authenticated USING (%s)',tabla,escritura);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',tabla);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',tabla);
  END LOOP;
END;
$politicas$;
REVOKE ALL ON public.billeteras FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billeteras TO authenticated;
GRANT ALL ON public.billeteras TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;

DO $secuencias$
DECLARE tabla text; secuencia text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['billeteras','config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP
    secuencia := pg_get_serial_sequence('public.'||tabla,'id');
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',secuencia);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role',secuencia);
  END LOOP;
END;
$secuencias$;

-- Bloqueo por billetera: serializa escrituras con archivo/cambio de moneda.
CREATE FUNCTION public.validar_escritura_billetera() RETURNS trigger
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
REVOKE ALL ON FUNCTION public.validar_escritura_billetera() FROM PUBLIC, anon, authenticated;

DO $triggers$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['config_billetera','categorias','sueldos_mes',
    'movimientos_recurrentes','movimientos_agenda','deudas','deuda_cuotas','deuda_pagos']
  LOOP
    EXECUTE format('CREATE TRIGGER validar_ambito_billetera BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validar_escritura_billetera()',tabla);
  END LOOP;
END;
$triggers$;

CREATE FUNCTION public.validar_cambios_billetera() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.es_principal IS DISTINCT FROM OLD.es_principal THEN
    RAISE EXCEPTION 'No se puede cambiar el propietario ni la designación principal' USING ERRCODE='23514';
  END IF;
  IF NEW.moneda IS DISTINCT FROM OLD.moneda AND (
    EXISTS (SELECT 1 FROM public.config_billetera WHERE billetera_id=OLD.id AND monto_base<>0) OR
    EXISTS (SELECT 1 FROM public.sueldos_mes WHERE billetera_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.movimientos_agenda WHERE billetera_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.movimientos_recurrentes WHERE billetera_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.deudas WHERE billetera_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.deuda_cuotas WHERE billetera_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.deuda_pagos WHERE billetera_id=OLD.id)
  ) THEN
    RAISE EXCEPTION 'La moneda no puede cambiar cuando existen registros financieros' USING ERRCODE='23514';
  END IF;
  NEW.creado_el:=OLD.creado_el;
  NEW.actualizado_el:=now();
  RETURN NEW;
END;
$funcion$;
REVOKE ALL ON FUNCTION public.validar_cambios_billetera() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_cambios_billetera BEFORE UPDATE ON public.billeteras
  FOR EACH ROW EXECUTE FUNCTION public.validar_cambios_billetera();

CREATE FUNCTION public.inicializar_billetera() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
BEGIN
  INSERT INTO public.config_billetera(user_id,billetera_id,monto_base) VALUES(NEW.user_id,NEW.id,0);
  INSERT INTO public.categorias(user_id,billetera_id,nombre,color,icono) VALUES
    (NEW.user_id,NEW.id,'Otros','#7f8c8d','fa-folder'),
    (NEW.user_id,NEW.id,'Alimentación','#e67e22','fa-utensils'),
    (NEW.user_id,NEW.id,'Servicios','#3498db','fa-bolt'),
    (NEW.user_id,NEW.id,'Transporte','#9b59b6','fa-bus'),
    (NEW.user_id,NEW.id,'Vivienda','#1abc9c','fa-home'),
    (NEW.user_id,NEW.id,'Salud','#e74c3c','fa-heartbeat');
  RETURN NEW;
END;
$funcion$;
REVOKE ALL ON FUNCTION public.inicializar_billetera() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inicializar_billetera AFTER INSERT ON public.billeteras
  FOR EACH ROW EXECUTE FUNCTION public.inicializar_billetera();

-- Solo completa configuración ausente, sin cambiar importes ni categorías existentes.
INSERT INTO public.config_billetera(user_id,billetera_id,monto_base)
SELECT b.user_id,b.id,0 FROM public.billeteras b
WHERE NOT EXISTS (SELECT 1 FROM public.config_billetera c WHERE c.billetera_id=b.id);

CREATE OR REPLACE FUNCTION public.handle_new_user_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
BEGIN
  INSERT INTO public.billeteras(user_id,nombre,moneda,es_principal)
  VALUES(NEW.id,'Personal','PEN',true);
  RETURN NEW;
END;
$funcion$;
REVOKE ALL ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.crear_billetera(p_nombre text,p_moneda text DEFAULT 'PEN')
RETURNS public.billeteras LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $funcion$
DECLARE resultado public.billeteras;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para crear una billetera' USING ERRCODE='42501'; END IF;
  INSERT INTO public.billeteras(user_id,nombre,moneda)
  VALUES(auth.uid(),btrim(p_nombre),p_moneda) RETURNING * INTO resultado;
  RETURN resultado;
END;
$funcion$;
REVOKE ALL ON FUNCTION public.crear_billetera(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_billetera(text,text) TO authenticated;

COMMIT;
