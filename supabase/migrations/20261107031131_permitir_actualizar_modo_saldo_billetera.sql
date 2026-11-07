-- The invoker wrappers need permission for the single metadata field they write.
-- Existing RLS policies continue to restrict updates to owned, active wallets.
GRANT UPDATE (modo_saldo_inicial)
  ON TABLE public.config_billetera
  TO authenticated;
