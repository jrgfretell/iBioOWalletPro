-- Reversión de 202611030004
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.actualizar_billetera(bigint, text, numeric, date);
DROP FUNCTION IF EXISTS public.crear_billetera(text, text, numeric, date);

CREATE OR REPLACE FUNCTION public.crear_billetera(p_nombre text, p_moneda text DEFAULT 'PEN')
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

CREATE OR REPLACE FUNCTION public.handle_new_user_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $funcion$
BEGIN
  INSERT INTO public.billeteras(user_id,nombre,moneda,es_principal)
  VALUES(NEW.id,'Personal','PEN',true);
  RETURN NEW;
END;
$funcion$;
REVOKE ALL ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;

DELETE FROM wallet_internal.migraciones WHERE version = '202611030004_onboarding_y_saldo_billetera';

COMMIT;
