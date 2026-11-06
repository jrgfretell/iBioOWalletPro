-- Migración 202611060002: validar el catálogo activo en toda alta/cambio de moneda de billetera
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.validar_moneda_activa_billetera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_activa boolean;
BEGIN
  SELECT m.activo
    INTO v_activa
    FROM public.monedas AS m
   WHERE m.codigo = NEW.moneda
   FOR SHARE;

  IF NOT FOUND OR NOT COALESCE(v_activa, false) THEN
    RAISE EXCEPTION 'La moneda % no está registrada o no está activa en el catálogo.', COALESCE(NEW.moneda, '(vacía)')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$funcion$;

REVOKE ALL ON FUNCTION public.validar_moneda_activa_billetera() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS billeteras_validar_moneda_activa ON public.billeteras;
CREATE TRIGGER billeteras_validar_moneda_activa
  BEFORE INSERT OR UPDATE OF moneda ON public.billeteras
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_moneda_activa_billetera();

INSERT INTO wallet_internal.migraciones(version)
VALUES ('202611060002_validar_moneda_activa_billetera')
ON CONFLICT (version) DO NOTHING;

COMMIT;
