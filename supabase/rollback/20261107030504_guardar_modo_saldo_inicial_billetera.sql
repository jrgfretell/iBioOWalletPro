BEGIN;
DROP FUNCTION IF EXISTS public.actualizar_billetera(bigint, text, text, numeric, date);
DROP FUNCTION IF EXISTS public.crear_billetera(text, text, text, numeric, date);
ALTER TABLE public.config_billetera DROP CONSTRAINT IF EXISTS config_billetera_modo_saldo_inicial_check;
ALTER TABLE public.config_billetera DROP COLUMN IF EXISTS modo_saldo_inicial;
COMMIT;

