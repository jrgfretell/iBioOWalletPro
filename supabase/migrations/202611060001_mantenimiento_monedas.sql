-- Migración 202611060001: Mantenimiento dinámico de monedas para administradores
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO wallet_internal.migraciones(version) VALUES ('202611060001_mantenimiento_monedas')
ON CONFLICT (version) DO NOTHING;

-- 1. Crear tabla pública de monedas
CREATE TABLE IF NOT EXISTS public.monedas (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  simbolo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_el timestamptz NOT NULL DEFAULT now(),
  actualizado_el timestamptz NOT NULL DEFAULT now()
);

-- Asegurar restricción de código en mayúsculas sin espacios
ALTER TABLE public.monedas
  DROP CONSTRAINT IF EXISTS ck_monedas_codigo_valido;

ALTER TABLE public.monedas
  ADD CONSTRAINT ck_monedas_codigo_valido
  CHECK (btrim(codigo) = codigo AND upper(codigo) = codigo AND char_length(codigo) BETWEEN 2 AND 5);

-- Habilitar RLS
ALTER TABLE public.monedas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS monedas_select_authenticated ON public.monedas;
CREATE POLICY monedas_select_authenticated ON public.monedas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS monedas_admin_all ON public.monedas;
CREATE POLICY monedas_admin_all ON public.monedas
  FOR ALL TO authenticated
  USING (wallet_internal.es_admin(auth.uid()))
  WITH CHECK (wallet_internal.es_admin(auth.uid()));

-- 2. Poblar monedas iniciales
INSERT INTO public.monedas (codigo, nombre, simbolo, activo, orden)
VALUES
  ('PEN', 'Soles', 'S/', true, 1),
  ('USD', 'Dólares', 'US$', true, 2),
  ('EUR', 'Euros', '€', true, 3)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      simbolo = EXCLUDED.simbolo,
      activo = EXCLUDED.activo,
      orden = EXCLUDED.orden;

-- 3. Actualizar la restricción en billeteras para admitir cualquier moneda registrada en la tabla monedas
ALTER TABLE public.billeteras
  DROP CONSTRAINT IF EXISTS billeteras_moneda_check;

-- Relación de clave foránea a la tabla monedas (con ON UPDATE CASCADE y ON DELETE RESTRICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'billeteras_moneda_fk' AND table_name = 'billeteras'
  ) THEN
    ALTER TABLE public.billeteras
      ADD CONSTRAINT billeteras_moneda_fk
      FOREIGN KEY (moneda) REFERENCES public.monedas(codigo)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Funciones RPC para administración segura de monedas
CREATE OR REPLACE FUNCTION public.admin_listar_monedas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT wallet_internal.es_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'codigo', m.codigo,
      'nombre', m.nombre,
      'simbolo', m.simbolo,
      'activo', m.activo,
      'orden', m.orden,
      'creado_el', m.creado_el,
      'actualizado_el', m.actualizado_el,
      'total_billeteras', (SELECT count(*) FROM public.billeteras b WHERE b.moneda = m.codigo)
    ) ORDER BY m.orden ASC, m.codigo ASC
  ), '[]'::jsonb)
  INTO v_res
  FROM public.monedas m;

  RETURN v_res;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_listar_monedas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_monedas() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_guardar_moneda(
  p_codigo text,
  p_nombre text,
  p_simbolo text,
  p_activo boolean DEFAULT true,
  p_orden integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_codigo text;
  v_nombre text;
  v_simbolo text;
  v_res record;
BEGIN
  IF NOT wallet_internal.es_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  v_codigo := upper(btrim(p_codigo));
  v_nombre := btrim(p_nombre);
  v_simbolo := btrim(p_simbolo);

  IF v_codigo IS NULL OR char_length(v_codigo) < 2 OR char_length(v_codigo) > 5 THEN
    RAISE EXCEPTION 'El código de moneda debe tener entre 2 y 5 caracteres (ej. USD, PEN, EUR, GBP).' USING ERRCODE = '22000';
  END IF;

  IF v_nombre IS NULL OR char_length(v_nombre) < 2 THEN
    RAISE EXCEPTION 'El nombre de la moneda es requerido.' USING ERRCODE = '22000';
  END IF;

  IF v_simbolo IS NULL OR char_length(v_simbolo) < 1 THEN
    RAISE EXCEPTION 'El símbolo monetario es requerido (ej. S/, $, €, £).' USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.monedas (codigo, nombre, simbolo, activo, orden, actualizado_el)
  VALUES (v_codigo, v_nombre, v_simbolo, coalesce(p_activo, true), coalesce(p_orden, 0), now())
  ON CONFLICT (codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        simbolo = EXCLUDED.simbolo,
        activo = EXCLUDED.activo,
        orden = EXCLUDED.orden,
        actualizado_el = now()
  RETURNING * INTO v_res;

  RETURN jsonb_build_object(
    'codigo', v_res.codigo,
    'nombre', v_res.nombre,
    'simbolo', v_res.simbolo,
    'activo', v_res.activo,
    'orden', v_res.orden
  );
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_guardar_moneda(text, text, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_guardar_moneda(text, text, text, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_eliminar_moneda(p_codigo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_codigo text;
  v_usado integer;
BEGIN
  IF NOT wallet_internal.es_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador' USING ERRCODE = '42501';
  END IF;

  v_codigo := upper(btrim(p_codigo));

  SELECT count(*) INTO v_usado FROM public.billeteras WHERE moneda = v_codigo;
  IF v_usado > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar la moneda % porque está en uso en % billetera(s). Puedes desactivarla para que no aparezca en nuevas creaciones.', v_codigo, v_usado USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.monedas WHERE codigo = v_codigo;
  RETURN true;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.admin_eliminar_moneda(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_moneda(text) TO authenticated;

COMMIT;

