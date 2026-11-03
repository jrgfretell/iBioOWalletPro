# iBioO Wallet local

Abre **Iniciar-Local.cmd** con doble clic. Inicia PHP en segundo plano y abre http://127.0.0.1:8080. Requiere que el servicio MySQL267 esté activo. No hace falta iniciar Apache ni MySQL desde XAMPP.

Conexión en `config.local.php`: servidor `127.0.0.1`, puerto `3306`, base `ibioo_wallet`, usuario `root`, con la clave local proporcionada. En MySQL Workbench puedes utilizar esos datos y seleccionar `ibioo_wallet` como esquema.

Se usa PHP de `C:\xampp\php\php.exe`, con PDO MySQL y zona horaria America/Lima. El servidor solo escucha en esta computadora. Los registros están en `.local/server.err.log`.

## Restauración

La base se restauró inicialmente desde `MySQL/BackUp_02-11-26/ezyro_42390480_billetera_db.sql`. El 2 de noviembre de 2026 se vaciaron todos los registros por pedido del usuario para comenzar desde cero. El saldo inicial y los sueldos predeterminados son cero. Crea tus categorías, configura tus sueldos y registra tus nuevos movimientos desde la aplicación.

Respaldo completo anterior al vaciado: `.local/respaldo-antes-vaciado-20261102-155353.sql`. El respaldo original del hosting también se conserva intacto. No ejecutes la restauración si deseas mantener la aplicación vacía.

Para instalar en otra base vacía, cambia `database` en `config.local.php` y ejecuta en PowerShell, desde esta carpeta:

```powershell
& 'C:\xampp\php\php.exe' local/restaurar.php
```

El restaurador rechaza bases con tablas para evitar sobrescribir datos. Iniciar la aplicación nunca vuelve a importar el respaldo.

## Detener

Abre `Detener-Local.cmd`. Detiene únicamente el servidor PHP de esta aplicación y deja MySQL activo. Para volver a abrir la aplicación, ejecuta `Iniciar-Local.cmd`.

## Cronogramas unificados (actualización)

Los gastos recurrentes se administran como cronogramas. **Nuevo pago programado** permite elegir cantidad de cuotas, último mes de pago incluido o hasta cancelar. Los continuos se amplían automáticamente hasta doce meses después del mes actual; su total corresponde a los vencimientos generados, no a una deuda final.

**Duración e importe** permite acortar o ampliar el límite y aplicar cambios de importe desde una fecha. También permite convertir un cronograma de cantidad definida a duración por fecha o continua, indicando la frecuencia. Los vencimientos con abonos conservan sus datos. **Omitir** excluye un vencimiento de la proyección sin borrarlo; **Restaurar** lo reincorpora. Las fechas e importes individuales se editan desde el detalle. Los ingresos recurrentes siguen en Ingresos programados.

La migración CLI `local/migrar_cronogramas.php` es idempotente, conserva los gastos pagados mediante sus vínculos originales y evita que las plantillas migradas vuelvan a generar proyecciones. Los préstamos existentes conservan su duración. Respaldo previo: `.local/antes-cronogramas-20261102-215412/base.sql`.

## Pagos programados

Abre `pagos.html`. La agenda mensual reúne gastos recurrentes y cuotas por vencimiento, con filtros de tipo y estado y totales de programado, pagado, pendiente y vencido. El filtro de estado afecta las filas; los totales siguen mostrando todo el mes y tipo seleccionado. **Nuevo pago programado** permite elegir recurrente o en cuotas. Las secciones **Recurrentes** y **En cuotas** conservan sus editores y opciones de eliminación. Los sueldos y cobros recurrentes están en **Ingresos programados**. Los enlaces antiguos redirigen a la sección correspondiente.

Los nuevos recurrentes se crean pendientes: solo **Registrar pago** o **Confirmar ingreso** los incorpora al historial, con su fecha real. La agenda conserva la fecha de vencimiento. **Anular pago** devuelve el compromiso a pendiente. El dashboard proyecta los pendientes una sola vez y muestra únicamente los confirmados como movimientos realizados. Los pagos recurrentes son completos; las cuotas permiten abonos parciales. Los recurrentes sin meses específicos se generan desde el mes actual hasta doce meses adelante.

La migración `local/migrar_programados.php` añade `pago_confirmado` y `fecha_pago` sin borrar registros. Los movimientos existentes conservan su condición anterior de realizados; no se intenta deducir cuáles se pagaron realmente. Editar o eliminar un recurrente conserva sus pagos confirmados. El respaldo previo está en `.local/antes-unificar-20261102-164728/base.sql`.

### Cronogramas en cuotas

Abre **Pagos programados → En cuotas**. En **Nuevo cronograma**, registra el nombre, monto recibido (informativo), categoría, número e importe de cuotas, primer vencimiento y frecuencia mensual, cada 15 días o semanal. **Generar cuotas** crea una vista previa editable, sin guardar datos todavía. Los vencimientos mensuales mantienen el día original y se ajustan al último día cuando un mes es más corto.

Para trasladar un cronograma de Excel, puedes comenzar en un mes anterior, ajustar fechas e importes y marcar las cuotas completas ya pagadas indicando su fecha real. Los abonos parciales se registran después de crear el cronograma. No vuelvas a importar un pago que ya registraste manualmente como gasto: el módulo genera su propio gasto vinculado.

**Registrar pago** acepta abonos completos o parciales hasta cubrir el saldo de la cuota. Un vencimiento nunca marca la cuota como pagada automáticamente. **Ver pagos** muestra los abonos y permite anularlos: se elimina el gasto vinculado y se repone el saldo pendiente. Los pagos se administran desde este módulo; no se editan ni se borran como gastos manuales.

Cada tarjeta tiene botones visibles **Editar cronograma** y **Eliminar cronograma**, incluso cuando está cerrada. La edición permite cambiar nombre, monto recibido, categoría, fechas e importes de cuotas sin pagos, y agregar o quitar cuotas al final. Las cuotas con abonos mantienen su fecha, importe y numeración. El cambio de categoría se aplica a pagos nuevos: no modifica los gastos históricos. Antes de eliminar un cronograma con pagos, eliges si conservar esos gastos en Movimientos o eliminarlos también. Si los conservas, quedan como gastos independientes y siguen afectando al balance. En ambos casos se retiran el cronograma y sus compromisos pendientes.

El dashboard muestra próximos vencimientos. Su proyección combina los gastos realizados con el saldo pendiente de las cuotas, sin duplicar los abonos. Las cuotas vencidas sin pagar se proyectan para hoy; conservan su vencimiento original en el cronograma. El gráfico de gastos por categoría incluye únicamente gastos registrados, no compromisos pendientes.

La instalación local ya tiene las tablas `deudas`, `deuda_cuotas` y `deuda_pagos`. Para actualizar otra base que ya tiene la estructura original:

```powershell
& 'C:\xampp\php\php.exe' local/migrar_deudas.php
```

La migración no borra datos. El restaurador de la copia original también instala estas tablas. Los datos existentes se respaldaron antes de implementar este módulo en `.local/antes-deudas-20261102-161607/base.sql`. Las pruebas de integración se ejecutan con `& 'C:\xampp\php\php.exe' .local/verificar-correccion.php` sobre una base temporal independiente.

La interfaz conserva sus dependencias CDN (Bootstrap, FontAwesome, SweetAlert2 y Chart.js), por lo que necesita conexión a Internet para cargar estilos, iconos y gráficos. Los datos y el backend funcionan con MySQL local. Esta configuración corresponde al entorno local; no la subas al hosting.

## Saldo real con fecha de referencia

El dashboard puede partir de un saldo conciliado en una fecha, sin reconstruir el ahorro de años anteriores. Se configuró S/3,858.84 al 02/11/2026. Los movimientos ya registrados hasta esa fecha se consideran incluidos; un nuevo movimiento del mismo día sí modifica la proyección. Los sueldos de fechas posteriores y todos los compromisos pendientes se aplican una sola vez. Los pagos previos quedan consultables en Movimientos y en el gráfico de gastos; la proyección empieza en el mes de referencia. En ese primer mes los gastos mostrados corresponden solo a los que quedan por aplicar.

Para conciliar nuevamente usa **Actualizar saldo real** e indica el dinero disponible y su fecha. El saldo es una referencia confirmada, no un contador de dinero en tiempo real. El día de referencia incluye los sueldos de ese día; los movimientos registrados después se aplican al saldo.

Respaldo previo del código y base: `.local/antes-saldo-fechado-20261102-230858/`. Para revertir únicamente esta mejora, conservando movimientos y cronogramas posteriores:

```powershell
& 'C:\xampp\php\php.exe' .local/antes-saldo-fechado-20261102-230858/rollback.php
```

El rollback restaura el código del cálculo y la configuración anterior del saldo. El respaldo `base.sql` permite una restauración completa si se requiere volver exactamente al estado previo, descartando las modificaciones posteriores. No se restaura automáticamente.

## Dashboard compacto y desglose mensual

Las tarjetas muestran saldo inicial, saldos proyectados antes del 15, después de quincena, antes de fin de mes y al cierre. Cada tramo indica cantidad e importe de pagos e ingresos y abre **Ver desglose**. **Ver todos los movimientos** abre el mes completo. El número de movimientos no agrega filas a la tarjeta.

El desglose abre un panel lateral en escritorio y ocupa la pantalla en móvil. Permite buscar, filtrar por tramo y estado, revisar totales y consultar opcionalmente movimientos ya incluidos en el saldo real, señalados como consulta sin volver a aplicarlos. Los sueldos previstos aparecen como ingresos programados. El cierre devuelve el foco al botón de origen. No se modificó el cálculo financiero.

Respaldo de la interfaz anterior: `.local/antes-detalle-panel-20261102-233516/`.

## Historial de Movimientos adaptado

Movimientos distingue registros manuales y pagos de cronogramas mediante su vínculo de pago, además de reconocer los registros programados antiguos. Los totales y filtros comparten esa clasificación. Cada pago enlaza directamente a su cronograma. Los registros ya incluidos en el saldo real se identifican para explicar por qué permanecen en el historial sin volver a descontarse.

El formulario registra ingresos recibidos o gastos realizados hasta hoy (validación en interfaz y servidor). Para operaciones futuras se usa Pagos programados. Los registros antiguos con fecha futura se conservan y se advierten para su revisión. El neto de los filtros no es el saldo disponible. La eliminación masiva de manuales está en Más opciones, abarca todos los meses y conserva pagos vinculados a cronogramas. Respaldo anterior: `.local/antes-movimientos-20261102-235633/`.

La agenda mensual usa una grilla de filas neutras, estados suaves, importes alineados y acciones de pago/detalle diferenciadas. En pantallas de menos de 768 px los mismos registros se presentan como tarjetas con etiquetas por campo. El rediseño conserva filtros, importes y acciones existentes.

Las tarjetas de cronogramas integran nombre, modalidad, importes y progreso en una cabecera compacta. Duración/importe, edición y eliminación se acceden mediante iconos con título y nombre accesible, fuera del control de expansión. Los vencimientos usan el mismo lenguaje visual de la agenda: estados suaves, importes alineados y botones de pago diferenciados. Los abonos se consultan desde Pagos; la edición y la omisión conservan sus confirmaciones y protecciones. En móvil, los vencimientos se presentan como tarjetas. Respaldo de interfaz previo: `.local/antes-tarjetas-cronogramas-20261103-001607/`.
