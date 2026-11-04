# Etapa 4 — Monedas y proyección de cada billetera

Fecha: 3 de noviembre de 2026, America/Lima.

## Estado

Implementada y probada en la demostración local `http://127.0.0.1:5174/`. No se modificó el esquema ni se escribieron datos en Supabase remoto; no se publicó en Cloudflare. Se reutiliza la copia de pruebas de etapa 3, sin modificar registros financieros para esta validación.

## Cambios

- Un único formato monetario, con moneda obligatoria: PEN (`S/`), USD (`US$`) y EUR (`€`). El contexto lo proporciona a Dashboard, Movimientos, Pagos y Categorías. Se eliminó el formato anterior fijado a soles.
- Dos decimales, separador de miles y signo negativo coherentes. El cero redondeado no muestra un signo negativo; un valor no finito se representa con un guion en lugar de aparentar un saldo cero.
- Los campos de sueldo identifican la moneda de entrada y la cabecera de proyección indica su código ISO.
- Motor mensual extraído de `DashboardView.tsx` a `frontend/src/lib/projection.ts`, como función independiente de React. Recibe billetera, fecha de cálculo, configuración y registros, y devuelve meses con la identidad y moneda de la billetera.
- El motor excluye filas de otra billetera o propietario, incluso si recibe accidentalmente un conjunto mezclado. En compatibilidad anterior acepta solo las filas del propietario sin `billetera_id`.
- Saldos, ingresos, gastos, sueldos y pendientes de cuotas se calculan en céntimos enteros; se convierten a unidades monetarias al devolver los resultados. Evita arrastrar residuos decimales entre meses.
- Se conservan los tramos quincenales, el horizonte actual, los recurrentes pendientes sin duplicar su registro en agenda y el descuento de abonos de cuotas. No hay conversión, consolidación ni transferencias entre monedas.

El saldo base procede de la configuración ya filtrada por billetera en `WalletContext`. No se copia sueldo ni saldo al cambiar de billetera. Las categorías y los pagos que entran al cálculo pertenecen al mismo ámbito.

## Validación

`npm --prefix tools/billeteras run test:etapa4`: 51 comprobaciones correctas sobre las funciones reales de producción, sin red ni escrituras. Incluyen:

- Las mismas cifras en PEN, USD y EUR producen los mismos resultados numéricos: no existe conversión implícita.
- Los cuatro tramos del mes y el arrastre noviembre/diciembre/enero.
- Datos mezclados de otra billetera, otro usuario y filas sin ámbito: no alteran ningún resultado.
- Cuota parcialmente abonada y movimiento del abono; el gasto combina lo pagado y lo pendiente una sola vez.
- Recurrente ya materializado en agenda: se cuenta una vez.
- Precisión decimal, cero, negativos, moneda y año bisiesto.
- Compatibilidad con el esquema anterior y ausencia de mutaciones sobre los datos de entrada.

También se repitieron las 97 comprobaciones de etapa 3. Compilación correcta; lint sin errores, con las advertencias React existentes. El build conserva el aviso de tamaño del bundle.

En navegador se comprobó Personal en soles y Viajes Europa en euros: esta última muestra sueldo 100 + 200, gasto 5, saldos -5 / 95 / 95 / 295 y cierre 295. El detalle contiene exactamente el gasto y ambos sueldos en euros. Se revisaron 390 px y 320 px sin desbordamiento horizontal. Evidencia local: `.local/billeteras-etapa4-movil.png`.

## Límites y etapa siguiente

Esta etapa separa monedas y hace comprobable el cálculo; no corrige aún la semántica del saldo base respecto a movimientos históricos incluidos, ni las cuotas vencidas anteriores al inicio de proyección. Los dos casos reproducidos en etapa 1 siguen pendientes de etapa 5, junto con pagos históricos y operaciones financieras atómicas. No interpretar estas pruebas como validación de esos casos aún no implementados.

La publicación coordinada de migraciones y aplicación continúa reservada para etapa 6. La demostración se inicia con las instrucciones de `ETAPA-3.md` y conserva las credenciales ficticias de ese entorno.
