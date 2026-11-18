---
name: proposal-evidence-verification
description: Checklist obligatorio para verificar el estado real del código fuente y de la base de datos Supabase antes de proponer mejoras, optimizaciones, diagnósticos o nuevas funcionalidades.
---

# Verificación Previa a Propuestas, Revisiones y Optimizaciones

Cada vez que el usuario solicite una revisión, auditoría, idea de mejora, optimización o cambio funcional, **no asumas ni supongas el estado actual**: verifica primero la realidad en código y base de datos.

## 1. Verificación en Código Fuente
- Inspeccionar los componentes, contextos y utilidades directamente relacionados (`WalletContext.tsx`, vistas en `frontend/src/components/`, `types/wallet.ts`, `lib/`).
- Confirmar qué existe realmente, qué reglas de negocio se aplican en el cliente y qué limitaciones o acoplamientos hay hoy.

## 2. Verificación en Base de Datos (Supabase)
- Consultar el esquema real (`information_schema.columns`), restricciones, índices, políticas RLS (`pg_policies`), privilegios (`information_schema.role_table_grants`) y funciones/triggers (`information_schema.routines`) de las tablas involucradas.
- Si aplica a datos concretos del usuario, consultar los registros reales afectados antes de diagnosticar o proponer cambios.

## 3. Regla de Veracidad en la Propuesta
- Toda propuesta de mejora u optimización debe basarse **exclusivamente** en lo observado en el código y en Supabase.
- Indicar con claridad qué ya existe, qué falta, qué impacto tendría en datos existentes y qué ajustes se requieren tanto en frontend como en base de datos.
