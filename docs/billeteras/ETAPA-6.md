# Etapa 6 — Publicación coordinada

## Destinos

- Repositorio existente: `https://github.com/jrgfretell/iBioOWalletPro`.
- Worker existente: `ibioowalletpro`, URL `https://ibioowalletpro.jrgfretell.workers.dev/`.
- Integración de Cloudflare confirmada: rama de producción `main`, raíz `frontend`, build `npm run build`, despliegue `npx wrangler deploy`.
- Supabase existente: proyecto `qylhstryjbiqjpiofvhn`.

Se utiliza la integración GitHub → Cloudflare existente. No se crea otro Worker ni se cambia el dominio o la vinculación del repositorio. Los scripts de herramientas y la copia de pruebas no forman parte de los assets publicados.

## Preparación y respaldo

`tools/billeteras/etapa6-preparar.py` exporta datos con GET paginados y dos lecturas coincidentes; revisa duplicados y relaciones entre propietarios. Guarda una copia del frontend actualmente publicado y del código de las etapas 1–5. No aplica migraciones ni publica.

El SQL de respaldo consistente se ejecuta en SQL Editor con una transacción de solo lectura y captura catálogo, datos de aplicación, usuarios e identidades de Auth. El resultado se guarda bajo `.local/etapa6-*`, excluido de Git. Contiene datos privados: no debe adjuntarse a incidencias, subirse al repositorio ni incorporarse al frontend. También guarda huellas del catálogo, los datos y Auth para impedir migrar sobre una copia desactualizada.

Esta recuperación cubre las tablas y objetos de aplicación y conserva el Auth existente. La prueba local utiliza únicamente los IDs de Auth; no reproduce los servicios administrados de Supabase. Los datos completos de usuarios e identidades se conservan por separado en el respaldo. No equivale a restaurar desde cero todos los servicios internos de Supabase. Se comprobó que este proyecto no tiene objetos de Storage al tomar la copia.

`etapa6-validar.mjs` restaura el catálogo real y sus datos en PGlite, prueba ambas migraciones en una sola transacción, comprueba filas originales y aislamiento por propietario y ensaya la reversión cuando aún no hay operaciones nuevas. Genera un SQL de publicación que:

1. Bloquea las tablas relevantes durante la transacción.
2. Verifica las huellas contra el respaldo consistente.
3. Aplica las dos migraciones de forma atómica.
4. Devuelve conteos y versiones; ante cualquier fallo revierte toda la transacción.

`etapa6-release.py` compila con las mismas variables públicas de Cloudflare, comprueba el proyecto de destino y verifica que los assets no contengan la clave de servicio ni referencias o credenciales del entorno de pruebas. No altera archivos `.env`.

## Secuencia de publicación

1. Completar respaldo, ensayo, pruebas y revisión del código; registrar el commit y la versión anterior del Worker.
2. Preparar el commit en la rama local de trabajo sin activar una compilación de producción.
3. Ejecutar la transacción de migración previamente ensayada en Supabase. Si la guarda detecta cambios, renovar respaldo y ensayo antes de continuar.
4. Incorporar ese commit a `main` y enviarlo al repositorio existente. Cloudflare construye y publica mediante su integración configurada.
5. Verificar el commit y la versión realmente desplegados, los assets publicados y las políticas/RPC del proyecto real.

Entre la confirmación del esquema y la actualización del frontend anterior puede haber una breve ventana de incompatibilidad: las escrituras antiguas carecen de billetera y se rechazan. No se elimina ninguna validación para permitirlas. Las sesiones ya abiertas deben recargar la aplicación actualizada.

Las verificaciones financieras de servidor se realizan en transacciones que se revierten; no se conservan billeteras ni pagos ficticios en producción. La cuenta y los movimientos de la demostración local no se importan. El saldo existente conserva su importe y no recibe una fecha inventada: el propietario debe confirmar su saldo y fecha de referencia.

## Recuperación

La versión anterior del Worker se registra antes de publicar, junto con sus assets y commit. Volver solo al frontend anterior no hace compatible el esquema nuevo. Una recuperación completa requiere coordinar aplicación y esquema.

Los rollbacks preparados se permiten únicamente si no hay datos nuevos que deban conservarse: primero consistencia de pagos, después billeteras. Si ya existen nuevas billeteras, referencias u operaciones, se requiere una corrección que preserve esos datos; no se restaura indiscriminadamente una copia antigua.

Los artefactos, resultados y versión final de esta ejecución quedan en `.local/etapa6-*`. No contienen datos de prueba importados al proyecto remoto.

## Referencias

- [Versiones y despliegues de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/).
- [Recuperación de una versión de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
- [Respaldo de bases de datos de Supabase](https://supabase.com/docs/guides/platform/backups).
