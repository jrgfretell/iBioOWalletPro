-- Reversión de 202611060001
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.admin_eliminar_moneda(text);
DROP FUNCTION IF EXISTS public.admin_guardar_moneda(text, text, text, boolean, integer);
DROP FUNCTION IF EXISTS public.admin_listar_monedas();

ALTER TABLE public.billeteras DROP CONSTRAINT IF EXISTS billeteras_moneda_fk;
ALTER TABLE public.billeteras ADD CONSTRAINT billeteras_moneda_check CHECK (moneda IN ('PEN', 'USD', 'EUR'));

DROP TABLE IF EXISTS public.monedas;

DELETE FROM wallet_internal.migraciones WHERE version = '202611060001_mantenimiento_monedas';

COMMIT;

