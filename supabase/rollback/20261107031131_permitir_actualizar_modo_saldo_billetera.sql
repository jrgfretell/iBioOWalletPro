BEGIN;
REVOKE UPDATE (modo_saldo_inicial) ON TABLE public.config_billetera FROM authenticated;
COMMIT;

