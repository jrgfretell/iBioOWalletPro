# Etapa 3 — Selector y datos por billetera

Fecha: 3 de noviembre de 2026, America/Lima.

## Estado y alcance

Implementada en React y validada con una copia PostgreSQL local aislada. No se aplicó la migración al Supabase remoto ni se publicó en Cloudflare. El despliegue coordinado de esquema y frontend sigue reservado para la etapa 6.

La versión habitual de desarrollo, puerto 5173, mantiene las variables de su entorno y usa el Supabase existente. Mientras no exista `billeteras`, un modo de compatibilidad muestra Personal en PEN, con las consultas y claves anteriores. Solo los errores de tabla ausente PGRST205/42P01 activan esa compatibilidad; los demás errores se muestran al usuario. No se insertan categorías al leer datos.

La demostración completa de esta etapa está en el puerto 5174 y apunta exclusivamente al adaptador local del puerto 54330. No utiliza claves ni sesiones del proyecto remoto. Sus datos son una copia de las pruebas de etapa 2 más registros ficticios de validación.

## Comportamiento implementado

- Selector disponible en los cuatro módulos; recuerda la última billetera activa por cuenta en este navegador.
- Crear con nombre y moneda PEN/USD/EUR; inicialización transaccional de saldo cero y seis categorías sugeridas mediante la RPC de etapa 2. No copia sueldos, cronogramas ni movimientos.
- Renombrar, archivar, consultar el historial archivado y reactivar. No hay eliminación de billeteras. La moneda se elige al crear y no se modifica desde este formulario.
- Archivo de la billetera actual: cambia a otra activa o muestra un estado vacío. Una billetera archivada se consulta sin permitir escrituras. Si no queda ninguna activa, se puede crear o reactivar desde el selector.
- Saldo, categorías, sueldos, movimientos, recurrentes, deudas, cuotas y pagos filtrados por usuario y billetera.
- Cambio de billetera limpia formularios y filtros mediante un montaje nuevo de la vista. Los formularios abiertos requieren confirmar su descarte. Durante una escritura se bloquea el cambio.
- Cargas paginadas, cancelación de solicitudes anteriores y comprobación de versión/propietario antes de publicar resultados. No se muestra el conjunto anterior durante la carga de otra billetera.
- Importes y campos básicos usan el símbolo de la billetera seleccionada, sin conversión ni suma entre monedas. La revisión integral de monedas y proyecciones corresponde a la siguiente etapa.
- Los errores de escritura detienen el flujo de éxito. Los formularios modales muestran el error y conservan lo escrito para reintentar.

## Implementación

`frontend/src/lib/walletClient.ts` captura el ámbito al iniciar la operación. Añade propietario y billetera a inserciones/upserts y filtros a lecturas, actualizaciones y borrados. Rechaza valores de otro ámbito y tablas fuera de la lista autorizada. Usa `throwOnError` para que no se cierre un formulario tras un rechazo del servidor. Las vistas reciben este cliente desde `WalletContext`; las políticas RLS y restricciones de etapa 2 siguen siendo la protección del servidor.

`WalletContext.tsx` coordina la selección, cargas, operaciones de billeteras y configuración de sueldos/saldo. `WalletSwitcher.tsx` incorpora el selector y su administrador accesible mediante el modal compartido. Los cuatro módulos utilizan datos y formato monetario del contexto seleccionado.

La selección es local al navegador y cuenta, no una configuración global que cambie otros dispositivos.

## Validación

- `npm --prefix tools/billeteras run test:etapa3`: 97 comprobaciones correctas del cliente real con el SDK Supabase instalado y transporte simulado sin red. Cubre las ocho tablas, escrituras en lote, filtros de actualización/borrado, rechazo de otro propietario/billetera, error del servidor, operación con ámbito obsoleto y compatibilidad anterior.
- `npm --prefix frontend run build`: correcto.
- `npm --prefix frontend run lint`: sin errores; conserva advertencias de reglas React/compilador (incluidas referencias de coordinación en callbacks y actualización de estado al cargar una sesión). El build avisa del tamaño del bundle; no se hizo una optimización ajena a esta etapa.
- Navegador sobre PostgreSQL local con la migración real: alta en USD/EUR, gasto exclusivo en USD, categorías separadas, renombrado, archivo y consulta sin edición, reactivación, selección recordada tras recargar, aviso de cambios sin guardar con cancelación y confirmación, sueldo EUR independiente y fallo simulado con reintento de gasto EUR. Se verificó que el sueldo original de Personal permanece en 1.500 + 1.500 soles y que la cuenta secundaria no ve las billeteras creadas por la primera.
- Diseño revisado a 390 px y 320 px. A 320 px los controles del administrador pasan a otra línea sin desbordamiento horizontal.

## Ejecutar la demostración aislada

Requiere haber ejecutado las pruebas de etapa 2, que dejan un PostgreSQL cerrado en la ruta indicada por `.local/ultima-etapa2.txt`.

Desde la raíz, en una terminal:

```powershell
npm --prefix tools/billeteras ci
npm --prefix tools/billeteras run preview:api
```

Crea una copia nueva bajo `.local/etapa3-preview-*`. Para retomar la última copia, con el servidor anterior cerrado:

```powershell
npm --prefix tools/billeteras run preview:api -- --resume
```

En otra terminal, dentro de `frontend`:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54330'
$env:VITE_SUPABASE_ANON_KEY='local-preview-anon'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Estas variables afectan solo a esa terminal; no se cambian archivos `.env`. Abrir `http://127.0.0.1:5174/`. Cuenta ficticia: `pruebas@example.test`, contraseña de prueba `PruebaLocal123!`. Cuenta secundaria ficticia: `segunda@example.test`, misma contraseña. No son credenciales reales de Supabase.

El adaptador es una herramienta limitada de pruebas locales, no un servidor de producción ni un reemplazo completo de PostgREST/Auth. Se enlaza solo a loopback y acepta el origen local 5174. Permite simular fallos mediante `/__test/fault`. No debe desplegarse.

## Trabajo posterior

Quedan fuera de etapa 3 la migración remota/publicación, la revisión integral de proyecciones por moneda y los ajustes de históricos/saldo con fecha. Los flujos existentes de varias escrituras financieras aún no se convierten en transacciones atómicas; eso corresponde a la etapa de consistencia de pagos. No se introducen transferencias, conversiones ni consolidación entre billeteras.
