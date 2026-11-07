BEGIN;
ALTER FUNCTION IF EXISTS public.crear_billetera(text, text, text, numeric, date) SECURITY DEFINER;
ALTER FUNCTION IF EXISTS public.actualizar_billetera(bigint, text, text, numeric, date) SECURITY DEFINER;
COMMIT;
