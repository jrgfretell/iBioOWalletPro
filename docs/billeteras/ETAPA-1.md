# Etapa 1 — Inventario, respaldo y entorno de pruebas

Fecha: 3 de noviembre de 2026, America/Lima.

## Alcance y estado

Se revisó el código actual, se exportaron los datos de la aplicación mediante operaciones GET y se restauraron en un PostgreSQL aislado. No se ejecutaron migraciones ni escrituras en Supabase. No se modificó el funcionamiento de React en esta etapa.

**Etapa completada para el alcance de la aplicación.** Tras el inicio de sesión del propietario se ejecutó la consulta de catálogo en SQL Editor dentro de una transacción de solo lectura. Se respaldaron las definiciones reales y se reconstruyeron en otra base de pruebas. La copia no sustituye un respaldo completo de Supabase Auth y Storage; antes del despliegue remoto se debe renovar la copia y confirmar el mecanismo de recuperación del proyecto.

## Entornos confirmados

| Entorno | Dirección | Datos |
|---|---|---|
| React local | http://127.0.0.1:5173/ | Supabase remoto |
| Cloudflare publicado | https://ibioowalletpro.jrgfretell.workers.dev/ | El mismo Supabase remoto |
| Proyecto Supabase | https://qylhstryjbiqjpiofvhn.supabase.co | Datos actuales compartidos |
| PostgreSQL de pruebas inicial | `.local/etapa1-billeteras-20261103-171730/postgres-pruebas` | Esquema local y datos exportados |
| PostgreSQL con catálogo real | `.local/etapa1-billeteras-20261103-171730/postgres-catalogo-real-v2` | Esquema remoto reconstruido y datos restaurados |

La coincidencia de producción se verificó en el JavaScript público `/assets/index-Bu00tzvx.js`. No se usó únicamente el nombre del Worker como evidencia. La app local no es un entorno de datos separado: sus operaciones habituales escriben en el mismo proyecto que producción.

## Respaldo disponible

Ruta: `.local/etapa1-billeteras-20261103-171730`. El archivo `.local/ultima-etapa1.txt` conserva la ruta absoluta.

| Tabla | Filas exportadas |
|---|---:|
| config_billetera | 2 |
| categorias | 10 |
| sueldos_mes | 14 |
| movimientos_recurrentes | 7 |
| movimientos_agenda | 1 |
| deudas | 11 |
| deuda_cuotas | 103 |
| deuda_pagos | 0 |
| **Total** | **148** |

Artefactos:

- Un JSON por tabla; lectura paginada, ordenada por ID y con conteo exacto.
- `datos-aplicacion.sql`: inserciones para destino vacío con esquema compatible y propietarios de Auth ya creados. No borra ni sobrescribe registros.
- `openapi-remoto.json`: columnas, tipos y metadatos que expone la API real.
- `esquema-local.sql`: copia del esquema del repositorio, identificada como local.
- `catalogo-remoto.json`: tablas y RLS, políticas, columnas y tipos SQL exactos, secuencias, restricciones, índices, función, trigger y permisos de tablas del servidor.
- `esquema-public-remoto.sql`: DDL de recuperación del esquema de aplicación, reconstruido de ese catálogo y probado en destino vacío. Los permisos de secuencias se indican como supuestos de recuperación, no como copia exacta de todas las ACL del servidor.
- `codigo-react.zip`: fuente, configuración y lockfile de React, incluidos archivos nuevos aún sin commit. Excluye `.env`, dependencias, compilación y cachés.
- `cambios-locales.patch`: diferencias de los archivos versionados.
- `manifest.json`, `sha256.json`: conteos, procedencia e integridad.
- `validacion-restauracion.json`, `diagnostico-proyeccion.json`, `verificacion-cloudflare.json`: evidencias de las comprobaciones.

Se hicieron dos lecturas completas de las tablas y coincidieron los hashes. Esto verifica estabilidad durante la exportación, pero **no equivale a una transacción única del servidor**. La copia contiene datos de aplicación de los propietarios existentes; no contiene claves de servicio, contraseñas, tokens ni cuentas de Supabase Auth.

No es un `pg_dump` completo: no permite reconstruir por sí sola usuarios de Auth, archivos de Storage, roles, secretos ni la configuración interna de Supabase. Las políticas y la función de la aplicación sí se capturaron del servidor, además del trigger sobre auth.users. Antes de una migración remota se requiere disponer de un respaldo lógico del servidor o de una recuperación equivalente comprobada que conserve Auth; el esquema public y los datos de aplicación ya se restauraron correctamente en pruebas. Una nueva copia debe tomarse inmediatamente antes de la migración, porque el usuario puede seguir registrando operaciones.

## Entorno aislado y resultados

Se instaló PGlite 0.5.15 exclusivamente en `.local/etapa1-tools`. Es PostgreSQL ejecutado localmente, sin conexión remota. La app y sus dependencias no se modificaron.

Se restauró el esquema local y las ocho tablas exportadas. Los usuarios de prueba son identificadores locales sin credenciales, en una tabla mínima `auth.users`. `auth.uid()` se simula mediante una variable de sesión; no se reproduce el servicio de autenticación de Supabase.

Pasaron 33 comprobaciones:

- Igualdad de datos restaurados frente a cada JSON original.
- Correspondencia de columnas entre el esquema local y el OpenAPI remoto.
- Relaciones existentes sin referencias huérfanas o a propietarios diferentes.
- Aislamiento de lectura de las ocho tablas para cada uno de los dos propietarios, usando las políticas **locales**.

Después se reconstruyó el **catálogo real** en `postgres-catalogo-real-v2` y se importó `datos-aplicacion.sql`. Pasaron otras **34 comprobaciones**: igualdad de las ocho tablas, aislamiento con las ocho políticas remotas para ambos propietarios, ausencia de filas visibles para anon y concordancia de políticas y restricciones principales con el repositorio. En total pasaron **67 comprobaciones de respaldo y esquema**.

La auditoría real confirmó: ocho tablas con RLS, ocho políticas `auth.uid() = user_id` para `authenticated`, 34 restricciones, 26 índices, una función `SECURITY DEFINER` de inicialización y un trigger de alta sobre `auth.users`. Las políticas y restricciones PK/FK/CHECK/UNIQUE coinciden con el esquema local. PGlite usa una versión de PostgreSQL distinta que representa NOT NULL adicionalmente en pg_constraint; se comparan estas condiciones en las columnas, no como diferencias funcionales de PK/FK.

El catálogo no define restricciones de propietario en las claves foráneas: esto debe reforzarse al introducir billeteras. La función de inicialización no fija `search_path`; se debe fijar explícitamente al adaptar esa función. Los permisos actuales de tablas incluyen privilegios amplios; al diseñar los nuevos roles/políticas se debe conservar únicamente el acceso requerido por la aplicación.

También se verificó en la API real que las consultas de prueba sin sesión de usuario no devolvieron filas en las ocho tablas. Esto no demuestra por sí solo todas las propiedades de seguridad, ni verifica las restricciones de escritura entre usuarios.

El entorno sirve para ensayar SQL y migraciones. No es todavía un segundo frontend con Supabase Auth y PostgREST: la aplicación de http://127.0.0.1:5173/ sigue conectada al proyecto compartido. No deben hacerse pruebas financieras de escritura en ella.

Comandos de diagnóstico, desde la raíz:

```powershell
node .local/etapa1-tools/verificar-proyeccion.mjs
node .local/etapa1-tools/validar-catalogo.mjs
```

`restaurar-pruebas.mjs` crea la copia inicial y se niega a sobrescribir un directorio de pruebas existente. `exportar.py` solo realiza GET al proyecto configurado y crea una carpeta nueva de respaldo.

## Cálculos revisados y problemas reproducidos

Se ejecutó el cuerpo real del cálculo de `DashboardView.tsx` con datos sintéticos, sin modificar registros remotos:

1. Con saldo base 3,956.84, agregar un gasto histórico de enero por 100 cambia el cierre actual a 3,856.84. Si el saldo base ya incluía ese pago, se produce un segundo descuento. Falta fecha de referencia y definición de movimientos incluidos.
2. Con ese saldo y una cuota impagada de enero por 100, sin movimientos ni sueldos antiguos, el saldo actual permanece en 3,956.84. La cuota anterior al inicio de la proyección no se incorpora como pendiente actual.

Otros puntos confirmados por lectura de código:

- Registrar pagos de cuotas usa la fecha actual. Falta un flujo explícito para cargar pagos históricos y su fecha real.
- Crear deuda y cuotas, o gasto y abono, utiliza peticiones separadas. Los errores de varias peticiones no se comprueban. Hace falta atomicidad y tratamiento de fallos antes de ampliar las operaciones financieras.
- `solicitud` usa timestamps nuevos por intento; no asegura la misma identidad ante reintentos del mismo pago.
- `WalletContext` consulta todas las tablas sin paginación. Se debe paginar antes de superar el límite configurado de la API; no basta con asumir que `select('*')` carga todo.
- El formato de moneda está fijado a soles. No hay `billetera_id`, moneda ni separación de configuración de sueldos por billetera.
- El esquema local valida `user_id` de cada fila, pero las claves foráneas no incorporan el propietario. La futura migración debe impedir relaciones entre billeteras y usuarios distintos mediante restricciones del servidor.
- Los sueldos son únicos por usuario/año/mes y el saldo por usuario. Estas claves deben incorporar billetera en la etapa 2.
- El trigger de alta de usuarios debe adaptarse para crear billetera, configuración y categorías de forma coherente.

## Recuperación y condiciones para la etapa 2

El respaldo de fuente permite comparar o recuperar los archivos de esta versión. La copia de datos se restauró en una base independiente para probar compatibilidad; nunca debe cargarse indiscriminadamente encima del proyecto activo.

La revisión real se ejecutó con `auditoria-supabase-solo-lectura.sql` en SQL Editor. Devuelve una columna JSON y no cambia tablas ni registros. Supabase guardó automáticamente una consulta privada de auditoría; su resultado se exportó localmente. No se aplicaron migraciones.

La etapa 2 puede prepararse sobre `postgres-catalogo-real-v2`. El catálogo real y la recuperación del esquema de aplicación ya están verificados. Antes de aplicar cambios remotos, tomar una captura reciente y revisar el respaldo de Auth o el procedimiento para conservarlo; la restauración probada no reproduce los servicios de autenticación de Supabase.

## Referencias

- [Respaldo y restauración de Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Seguridad por filas y credenciales de servicio](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [PGlite y ejecución local de PostgreSQL](https://pglite.dev/docs/).
