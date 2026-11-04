-- Reversión de 202611030003
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.eliminar_billetera(bigint);
DELETE FROM wallet_internal.migraciones WHERE version = '202611030003_eliminar_billetera_vacia';

COMMIT;
