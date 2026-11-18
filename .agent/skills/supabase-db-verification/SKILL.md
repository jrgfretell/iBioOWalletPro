---
name: supabase-db-verification
description: Checklist obligatorio de verificación en Supabase (esquema, privilegios GRANT, políticas RLS y RPCs) antes de dar por terminada cualquier funcionalidad nueva o modificación que lea, inserte, actualice o elimine datos en PostgreSQL/Supabase.
---

# Verificación Obligatoria en Supabase

Cada vez que se implemente o modifique una funcionalidad en el frontend que interactúe con tablas o funciones de Supabase (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `rpc`), **verifica en la base de datos antes de finalizar**:

## 1. Esquema de Tablas y Columnas
Confirmar que las tablas, columnas, tipos y valores por defecto coincidan con lo que envía/espera el frontend:
```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('<tabla>');
```

## 2. Privilegios de Tabla (`GRANT`) — Requisito Previo a RLS
En PostgreSQL/Supabase, aunque exista una política RLS, **el rol `authenticated` (o `anon`) no podrá ejecutar la operación si no tiene el `GRANT` correspondiente**. Verificar siempre:
```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('<tabla>')
  AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;
```
Si falta algún privilegio necesario (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), otorgarlo explícitamente:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<tabla> TO authenticated;
```

## 3. Políticas RLS (`pg_policies`)
Confirmar que existan políticas activas para cada comando (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) que vaya a ejecutar la funcionalidad:
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('<tabla>')
ORDER BY tablename, cmd;
```

## 4. Funciones RPC y Triggers
Si la operación depende de funciones o triggers en PostgreSQL, verificar su existencia y firma en `information_schema.routines`.

## 5. Manejo de Errores en el Cliente
- En operaciones `delete()` o `update()` críticas, encadenar `.select('id')` cuando sea necesario confirmar que al menos una fila fue afectada.
- Propagar o mostrar siempre los errores de PostgREST (`if (error) throw error;`) mediante `reportarError(error)` para evitar fallos silenciosos.
