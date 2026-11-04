# Etapa 2 — Estructura de billeteras y migración

Fecha: 3 de noviembre de 2026, America/Lima.

## Estado

Implementada y validada en PostgreSQL local aislado. **No se ejecutó contra el Supabase remoto ni se publicó una versión de React.** Localhost y Cloudflare siguen usando su esquema actual sin billeteras.

La migración cambia las claves de saldo y sueldos y exige `billetera_id` en los registros nuevos. La app anterior utiliza `onConflict: 'user_id'` para el saldo, `onConflict: 'user_id,anio,mes'` para sueldos, e inserta movimientos sin billetera. Por ello, aplicar esta migración remotamente antes de adaptar React interrumpiría operaciones. El despliegue de esquema y aplicación será coordinado en la etapa 6, tras completar las etapas intermedias.

## Archivos

- `supabase/migrations/202611030001_billeteras.sql`: migración transaccional de una sola aplicación.
- `supabase/rollback/202611030001_billeteras.sql`: reversión guardada para volver al modelo de una billetera en soles.
- `tools/billeteras/etapa2.mjs`: restauración de una copia del respaldo, migración, pruebas y reversión, sin leer credenciales ni conectarse a Supabase.
- `tools/billeteras/package.json` y `package-lock.json`: dependencias de las pruebas, independientes de React.

## Modelo

`billeteras` incorpora ID, propietario, nombre, moneda PEN/USD/EUR, estado archivado, designación principal y fechas de creación/actualización. Solo puede existir una principal por propietario.

La migración crea `Personal`, en PEN, para cada cuenta existente y asigna sus filas conservando IDs, fechas, importes y todas sus demás propiedades originales. No convierte montos ni mezcla monedas. La configuración de saldo ausente se inicializa en cero; no se duplican las categorías existentes.

Las ocho tablas existentes reciben `billetera_id` obligatorio y una relación compuesta con `(billetera_id,user_id)` de billeteras. Las relaciones entre categorías, movimientos, recurrentes, deudas, cuotas y pagos incluyen ID del padre, usuario y billetera. Esto impide enlazar registros de distintas billeteras incluso si pertenecen al mismo usuario.

Saldo: único por `(user_id,billetera_id)`.

Sueldos: únicos por `(user_id,billetera_id,anio,mes)`; se mantiene mes 0–11.

La identidad de solicitud de pagos sigue siendo única por usuario, como antes. Su atomicidad y las fechas de referencia/históricos corresponden a las siguientes etapas.

## Inicialización

`crear_billetera(p_nombre text,p_moneda text DEFAULT 'PEN')` es la RPC prevista para React:

- Actúa con los permisos y el usuario de la sesión; no acepta un propietario como argumento.
- Recorta espacios en el nombre y valida longitud 1–80 y moneda permitida.
- Crea saldo cero y seis categorías sugeridas mediante trigger, dentro de la misma transacción.
- No copia sueldos, movimientos, deudas ni pagos de otra billetera.

El trigger de alta en `auth.users` ahora crea la billetera principal y utiliza esa inicialización común. La migración no modifica usuarios, identidades ni contraseñas.

## Seguridad y archivo

- RLS verifica al propietario tanto en la billetera como en las tablas asociadas.
- Las billeteras archivadas y su historial se pueden consultar, pero sus registros no se pueden insertar, modificar ni eliminar.
- Se permite reactivar y renombrar billeteras propias.
- La interfaz utilizará archivo; no existe permiso DELETE de billeteras para el usuario.
- El propietario, la designación principal y el ámbito de un registro existente son inmutables. Mover datos entre billeteras requiere un flujo explícito futuro.
- La moneda puede cambiar únicamente antes de tener saldo no cero, sueldos o compromisos/movimientos financieros. Las categorías iniciales y un saldo cero no bloquean la edición.
- Un bloqueo de fila por billetera en las escrituras evita que archivo/cambio de moneda y operaciones financieras se intercalen sin comprobar el estado. La suite local comprueba los estados resultantes, no realiza una prueba de carga concurrente de Supabase.
- Se eliminan permisos innecesarios como TRUNCATE para clientes normales. Solo se conceden operaciones de datos requeridas.
- Las funciones con privilegios de inicialización fijan `search_path` vacío, usan nombres de esquema explícitos y no son RPC públicas ejecutables por clientes.
- Los pagos y borrados de deudas conservan el comportamiento financiero anterior; esta etapa no implementa las mejoras de atomicidad/históricos ni un flujo para eliminar cuentas de Auth.

## Validación

Ejecutar desde la raíz del repositorio:

```powershell
npm --prefix tools/billeteras ci
npm --prefix tools/billeteras run test:etapa2
```

La prueba utiliza la ruta de respaldo de `.local/ultima-etapa1.txt`, crea un directorio nuevo y no modifica las bases de prueba de la etapa 1. No lee `.env`, no usa claves administrativas y no hace peticiones a servicios remotos.

Última ejecución: **178 comprobaciones aprobadas**, con los **148 registros originales conservados** y **dos billeteras principales** al finalizar.

Se verificaron:

- Igualdad de los datos originales antes y después de migrar, rechazar una repetición, revertir y volver a aplicar.
- Billetera obligatoria, RLS y acceso separado para ambos propietarios.
- Creación en USD/EUR, nombre válido, categorías propias y saldo cero.
- Sueldos y saldo independientes por billetera.
- Bloqueo de referencias entre billeteras y entre propietarios para las siete relaciones compuestas.
- Inmutabilidad del ámbito y de la moneda cuando existen movimientos, saldo, sueldos, recurrentes o deudas.
- Archivo, lectura histórica, rechazo de escrituras y reactivación.
- Eliminación de categorías sin borrar el usuario/billetera del movimiento o deuda enlazados.
- Denegación de acceso anónimo y de TRUNCATE para clientes normales.
- Inicialización automática de cuentas nuevas.
- Reversión y negativa a revertir cuando hay billeteras nuevas o metadatos renombrados.
- Rechazo y rollback de una migración sobre datos heredados con relaciones de propietario inconsistentes.

La base final de pruebas queda con la migración aplicada; los usuarios y movimientos sintéticos de las comprobaciones se revierten. Solo quedan los datos originales del respaldo con su asignación a Personal.

La ruta absoluta del resultado y de la base final está en `.local/ultima-etapa2.txt`, dentro de `resultado.json`. Auth se simula con IDs y `auth.uid()` en PostgreSQL local; no se clona el servicio completo de Supabase Auth.

## Reversión

El script de rollback se niega a actuar si hay billeteras adicionales, principales renombradas, billeteras archivadas o monedas distintas de PEN. Así evita combinar perfiles o descartar metadatos creados después de la migración. No elimina movimientos, sueldos, cuotas ni pagos.

Cuando procede, restaura las claves y relaciones del modelo anterior y la inicialización de usuarios. Conserva permisos mínimos y `search_path` fijo; no restaura permisos innecesarios de la versión antigua.

Ante datos nuevos de varias billeteras, se necesita una reversión específica que conserve esos datos. Restaurar indiscriminadamente el respaldo de la etapa 1 borraría trabajo posterior y no es el procedimiento de rollback.

## Contrato para la etapa 3

1. Cargar billeteras del usuario autenticado, incluidas archivadas para su administración.
2. Seleccionar una activa y recordar su ID por usuario. Una principal archivada no debe elegirse automáticamente para nuevas operaciones.
3. Todas las lecturas financieras deben filtrar por usuario **y** billetera seleccionada. RLS protege al propietario, pero no selecciona una billetera por la interfaz.
4. Todas las inserciones incluyen `user_id` y `billetera_id`; las ediciones no cambian esos campos.
5. Cambiar los conflictos de upsert a `user_id,billetera_id` y `user_id,billetera_id,anio,mes`.
6. Usar `crear_billetera` con el cliente normal autenticado, nunca una clave de servicio en React.
7. Cancelar/descartar respuestas de carga obsoletas al cambiar de billetera y resolver los formularios abiertos para que no guarden en otro perfil.
8. La moneda se obtiene de la billetera. Los registros actuales siguen teniendo montos originales sin conversión.
9. Los mensajes de error del servidor deben presentarse al usuario; no cerrar un formulario como si se hubiera guardado si falló una operación.

## Referencias

- [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Funciones de base de datos y search_path](https://supabase.com/docs/guides/database/functions).
- [Restricciones y claves foráneas compuestas en PostgreSQL](https://www.postgresql.org/docs/17/ddl-constraints.html).
