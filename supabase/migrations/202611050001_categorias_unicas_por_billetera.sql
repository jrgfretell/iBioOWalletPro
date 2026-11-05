-- ==============================================================================
-- Migración: 202611050001_categorias_unicas_por_billetera.sql
-- Propósito:
--   Impedir la creación de categorías con nombres duplicados dentro de la misma
--   billetera (insensible a mayúsculas/minúsculas y espacios en blanco).
-- ==============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_billetera_nombre_ci 
ON public.categorias (billetera_id, lower(btrim(nombre)));

COMMIT;
