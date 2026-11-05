-- ==============================================================================
-- Rollback: 202611050001_categorias_unicas_por_billetera.sql
-- Propósito:
--   Revertir el índice de unicidad para nombres de categoría por billetera.
-- ==============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_categorias_billetera_nombre_ci;

COMMIT;
