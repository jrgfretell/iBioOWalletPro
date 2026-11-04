-- Reversión de 202611030005
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.admin_cambiar_estado_usuario(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_cambiar_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_listar_usuarios();
DROP FUNCTION IF EXISTS public.admin_obtener_estadisticas();
DROP FUNCTION IF EXISTS public.admin_verificar_acceso();
DROP FUNCTION IF EXISTS wallet_internal.es_admin(uuid);
DROP TABLE IF EXISTS wallet_internal.administradores;

DELETE FROM wallet_internal.migraciones WHERE version = '202611030005_panel_administrativo';

COMMIT;
