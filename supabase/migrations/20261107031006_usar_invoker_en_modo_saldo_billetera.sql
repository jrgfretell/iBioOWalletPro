-- The wrapper functions execute the existing, owner-checked SECURITY DEFINER
-- procedures, then update only the caller's config row under its RLS policy.
ALTER FUNCTION public.crear_billetera(text, text, text, numeric, date)
  SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.crear_billetera(text, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_billetera(text, text, text, numeric, date) TO authenticated;

ALTER FUNCTION public.actualizar_billetera(bigint, text, text, numeric, date)
  SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.actualizar_billetera(bigint, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_billetera(bigint, text, text, numeric, date) TO authenticated;
