# Estructura de base de datos

El esquema base anterior a billeteras está en `../supabase_schema.sql`.

La migración de billeteras es `migrations/202611030001_billeteras.sql`. Está implementada y probada **solo en PostgreSQL local aislado**. No está aplicada al proyecto Supabase compartido por la app local y Cloudflare.

Para una instalación nueva con Supabase Auth disponible: aplicar el esquema base y después las migraciones, en orden. Para actualizar una instalación existente: aplicar únicamente las migraciones pendientes sobre un respaldo reciente. No volver a ejecutar el esquema base como sustituto de una migración.

La migración exige adaptar las consultas y escrituras de React para incluir billetera. Desplegarla junto con esa versión de la aplicación, durante la etapa de publicación coordinada. Repetirla provoca un error transaccional sin reasignar datos ni duplicar billeteras.

Validación local:

```powershell
npm --prefix tools/billeteras ci
npm --prefix tools/billeteras run test:etapa2
```

Los resultados quedan en `.local`; la prueba no usa credenciales ni la red. Detalles, contrato de consultas y límites de rollback en `../docs/billeteras/ETAPA-2.md`.

La integración React de etapa 3 está preparada y se prueba en una demostración local aislada, sin aplicar todavía el esquema remoto. Ver `../docs/billeteras/ETAPA-3.md` para el selector, aislamiento de datos y ejecución de esa demostración.

La migración siguiente, `migrations/202611030002_consistencia_pagos.sql`, incorpora referencia de saldo y operaciones financieras transaccionales. Su contrato, pruebas y límites de reversión se documentan en `../docs/billeteras/ETAPA-5.md`. Ambas migraciones siguen pendientes de publicación remota coordinada con el frontend.
