import { confirmarAccion, toastExito } from './alerts';

interface PagoRecurrente {
  movimientoId: number;
  nombre: string;
  vencimiento: string;
  importe: string;
}

type EjecutarOperacion = (accion: string, datos: Record<string, unknown>, solicitud: string) => Promise<unknown>;

/** Una misma confirmación y operación para todas las pantallas. */
export async function anularPagoRecurrente(pago: PagoRecurrente, ejecutar: EjecutarOperacion) {
  const periodo = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' })
    .format(new Date(`${pago.vencimiento}T12:00:00`));
  const confirmado = await confirmarAccion({
    title: '¿Anular este pago?',
    text: `${pago.nombre} · ${periodo} · ${pago.importe}. Volverá a quedar pendiente. Los próximos pagos seguirán programados.`,
    confirmButtonText: 'Anular pago',
    isDanger: false,
    compact: true,
  });
  if (!confirmado) return false;
  const resultado = await ejecutar('anular_recurrente', { movimiento_id: pago.movimientoId }, crypto.randomUUID());
  if (!resultado || typeof resultado !== 'object' || !('movimiento_id' in resultado) || Number(resultado.movimiento_id) !== pago.movimientoId || !('pago_confirmado' in resultado) || resultado.pago_confirmado !== false) {
    throw new Error('No se pudo verificar la anulación. Actualiza la vista antes de reintentar.');
  }
  toastExito('Pago anulado');
  return true;
}
