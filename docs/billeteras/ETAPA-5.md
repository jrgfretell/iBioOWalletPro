# Etapa 5 — Referencia de saldo, históricos y pagos consistentes

Fecha: 3 de noviembre de 2026, America/Lima.

## Estado

Implementada en React y PostgreSQL local aislado. La migración `202611030002_consistencia_pagos.sql` se prepara para desplegarse después de `202611030001_billeteras.sql`, junto con el frontend, durante la etapa 6. No se aplicó nada al Supabase remoto ni se publicó en Cloudflare.

La demostración está en `http://127.0.0.1:5174/`, sobre el adaptador local del puerto 54330. La billetera **Validación históricos** y sus registros son ficticios, dentro de la copia de pruebas. No deben trasladarse como datos reales a producción.

## Saldo con fecha: contrato explícito

`config_billetera.fecha_referencia` representa el **saldo al cierre del día elegido**. Los ingresos y gastos confirmados cuya fecha real sea anterior o igual ya están incluidos en ese importe. Se conservan en el historial, pero no se aplican otra vez en la proyección. Los movimientos posteriores y los compromisos pendientes sí se aplican.

Cada propietario debe confirmar una vez el saldo y fecha de cada billetera. La migración deja la fecha en NULL: no supone que el saldo actual correspondía a hoy ni cambia importes existentes. La interfaz avisa cuando falta esa referencia. Mientras no se confirme, se conserva el cálculo sin fecha anterior.

La precisión de la referencia es diaria, al cierre; no es una conciliación por hora dentro del mismo día. Si el saldo no incluye aún los movimientos de hoy, debe elegirse el cierre del día anterior.

Al confirmar una referencia se comienza a proyectar desde su mes. No se inventan saldos previos a ese punto; los tramos quincenales anteriores se muestran con un guion. El historial anterior se revisa en Movimientos.

## Históricos y vencidos

- La fecha real de un movimiento confirmado es `fecha_pago`, con respaldo en `fecha` para registros anteriores.
- Una cuota impagada antigua se mantiene pendiente y entra en el siguiente día proyectado, aunque no existan movimientos ni sueldos de su mes original. El vencimiento original se conserva y se muestra en el detalle.
- Una cuota parcialmente pagada aporta solo el saldo restante como compromiso. El gasto del abono aparece en su fecha real.
- El creador de cronogramas genera una vista de vencimientos, incluyendo fin de mes y febrero bisiesto. Se pueden marcar cuotas completas ya pagadas e indicar la fecha real de cada una. Para abonos parciales se crea el cronograma y se utiliza Registrar pago.
- Registrar pago permite importe parcial o completo y fecha real no futura. Cuando esa fecha ya está incluida en la referencia, se explica por qué disminuye el pendiente sin descontar otra vez el gasto histórico.
- Movimientos muestra los pagos históricos en su fecha real, con la etiqueta de incluidos en referencia. Bloquea la edición, cambio de confirmación y borrado aislado de gastos vinculados a abonos.
- Se corrigió el tramo del día 30 en meses de 31 días: reduce el bolsillo antes del último día. El cierre mensual mantiene el mismo total, pero el saldo intermedio ahora refleja el gasto en el tramo correcto.

## Transacciones y protección de reintentos

La RPC `operacion_billetera(p_billetera_id,p_solicitud,p_accion,p_datos)` obtiene al propietario de `auth.uid()`, verifica la billetera activa y bloquea su fila durante la operación. No recibe un propietario como dato confiable del cliente. Sus consultas fijan usuario y billetera; las relaciones compuestas de etapa 2 también impiden enlazar categorías, cuotas y movimientos de otro ámbito.

Acciones disponibles:

| Acción | Operación indivisible |
|---|---|
| `saldo_referencia` | Saldo, fecha y actualización de configuración |
| `crear_cronograma` | Deuda, todas las cuotas y pagos históricos con sus gastos |
| `pagar_cuota` | Gasto y abono vinculado, con validación del saldo pendiente |
| `anular_abono` | Anulación del abono y retiro de su gasto vinculado |
| `retirar_cronograma` | Retiro de compromisos pendientes conservando abonos e historial |
| `ajustar_fin_mes` | Ajuste conjunto de cuotas que no tienen abonos |
| `confirmar_recurrente` | Confirmación de una ocurrencia única, con vencimiento y fecha real separados |
| `retirar_recurrente` | Retiro de plantilla y ocurrencias pendientes, conservando confirmadas |

`operaciones_billetera` guarda la solicitud, datos y resultado. Repetir la misma solicitud con el mismo contenido devuelve el resultado original. Reutilizarla con otro contenido o billetera se rechaza. La RPC valida importes, fechas y límites antes de completar la transacción. Un fallo revierte todos sus pasos.

El navegador conserva el identificador de una operación pendiente, con un hash de su contenido y ámbito, para reutilizarlo incluso después de recargar si se reenvían los mismos datos. No guarda el contenido financiero en ese registro local. Al recibir confirmación se elimina el identificador pendiente. Si el navegador bloquea almacenamiento, la protección se conserva mientras siga abierto el formulario; el servidor sigue aplicando la idempotencia por solicitud.

No se promete deduplicar dos pagos distintos enviados intencionalmente con solicitudes diferentes. Las sesiones de distintos dispositivos tampoco comparten el registro local de solicitudes; el servidor sí impide sobrepagar una cuota.

Las escrituras fragmentadas de abonos, altas/bajas de cuotas y cronogramas, configuración de saldo y eliminación de plantillas dejan de estar concedidas directamente al rol `authenticated`. Pasan por la RPC. Los triggers impiden modificar o borrar por separado los campos financieros de un gasto con abono y reducir una cuota por debajo de lo ya abonado. Se conserva la limpieza de relaciones de categoría cuando corresponda.

La RPC usa `SECURITY DEFINER` con búsqueda de esquema fijada, validación explícita del propietario y tablas calificadas. Su ejecución se concede solo a `authenticated`; los ayudantes internos no son ejecutables por los roles de la aplicación. El registro de operaciones es de lectura solo para su propietario.

## Correcciones y retiro de compromisos

Pagos incluye **Abonos registrados**, con importe, fecha e indicación de inclusión en referencia. Para corregir fecha o importe se anula el abono completo y se registra de nuevo. La anulación devuelve el pendiente de una cuota activa y retira también su gasto, dentro de la misma transacción.

Retirar un cronograma no borra gastos pagados. Los compromisos retirados dejan de proyectarse; sus abonos siguen disponibles para revisión y corrección. Retirar una plantilla recurrente también conserva sus movimientos confirmados.

## Validación realizada

```powershell
npm --prefix tools/billeteras run test:etapa3
npm --prefix tools/billeteras run test:etapa4
npm --prefix tools/billeteras run test:etapa5
npm --prefix frontend run build
npm --prefix frontend run lint
```

- Etapa 5 SQL: **51 comprobaciones**, en una copia del catálogo real restaurado en PGlite, sin red. Preservación de filas al migrar; referencia; creación con históricos; abonos parciales; reintentos; sobrepago, fechas futuras e importes inválidos; aislamiento entre propietarios y billeteras; prohibición de escrituras fragmentadas; anulación; retiro sin pérdida de pagos; recurrentes únicos y conservación de sus confirmados; fin de mes; rollback limpio y rechazo de rollback con operaciones.
- Se forzó un fallo después de insertar el gasto y antes de insertar el abono: ambos se revirtieron y la solicitud pudo reintentarse. También se verificó la reversión completa de un cronograma cuya segunda cuota era inválida después de haber creado un pago histórico en la primera.
- Proyección y cliente de solicitudes: **28 comprobaciones**, incluyendo los dos errores de etapa 1, referencia a mitad de mes, pago tardío en otro mes sin duplicar recurrentes, día 30 de un mes de 31, año bisiesto, almacenamiento de solicitudes por usuario/billetera y reutilización tras recargar.
- Se repitieron las 97 comprobaciones de etapa 3 y las 51 de etapa 4. Build correcto; lint sin errores y con las advertencias React conocidas. Persiste el aviso de tamaño del bundle.
- Navegador: billetera ficticia con referencia S/3.858,84 al cierre del 02/11/2026; cronograma enero-marzo con cuota de enero pagada S/100; abono parcial de febrero S/40 tras fallo simulado y reintento. Quedaron dos abonos en historial, S/160 pendientes y proyección de S/3.698,84. Los S/140 históricos no se descontaron otra vez. Movimientos conserva fechas y bloquea la edición aislada de esos abonos. Vista revisada a 390 y 320 px.
- La anulación se validó en PostgreSQL local. La RPC incorpora bloqueos para serializar operaciones; no se ejecutaron pruebas de carga ni pruebas con conexiones concurrentes independientes contra Supabase real. La validación del despliegue corresponde a etapa 6.

Evidencia móvil: `.local/billeteras-etapa5-movil.png`.

## Recuperación y despliegue

El rollback de etapa 5 se encuentra en `supabase/rollback/202611030002_consistencia_pagos.sql`. Solo se permite antes de usar las funciones nuevas: se rechaza si existen operaciones, referencias fechadas o cronogramas retirados. No elimina historial para forzar una reversión. Después de registrar operaciones se necesita una migración correctiva o un respaldo revisado, conservando los datos y Auth.

Antes del despliegue se debe tomar un respaldo reciente y revisar duplicados de número de cuota y ocurrencias recurrentes, porque los índices únicos rechazan inconsistencias existentes sin borrar filas. Esquema y frontend deben publicarse de forma coordinada; la aplicación anterior no tiene permisos para realizar las escrituras fragmentadas una vez aplicada esta migración.

La demostración se inicia con las instrucciones de etapa 3; el adaptador aplica etapa 5 solo a la copia local cuando falta. `--refresh-stage5` es una ayuda de desarrollo que usa el rollback protegido; no funciona sobre una copia que ya tenga operaciones. No se debe desplegar este adaptador.
