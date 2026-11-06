BEGIN;
DROP TRIGGER IF EXISTS billeteras_validar_moneda_activa ON public.billeteras;
DROP FUNCTION IF EXISTS public.validar_moneda_activa_billetera();
DELETE FROM wallet_internal.migraciones WHERE version = '202611060002_validar_moneda_activa_billetera';
COMMIT;
