export type Moneda = 'PEN' | 'USD' | 'EUR';
export interface Billetera {
  id: number;
  user_id: string;
  nombre: string;
  moneda: Moneda;
  archivada: boolean;
  es_principal: boolean;
  monto_base?: number;
  fecha_referencia?: string | null;
  creado_el?: string;
  actualizado_el?: string;
}
export const MONEDAS: Record<Moneda, { nombre: string; simbolo: string }> = {
  PEN: { nombre: 'Soles', simbolo: 'S/' },
  USD: { nombre: 'Dólares', simbolo: 'US$' },
  EUR: { nombre: 'Euros', simbolo: '€' },
};

export interface Categoria {
  id: number;
  user_id?: string;
  billetera_id?: number;
  nombre: string;
  color: string;
  icono: string;
}

export interface SueldoMes {
  id?: number;
  user_id?: string;
  billetera_id?: number;
  anio: number;
  mes: number; // 0 = Enero, 11 = Diciembre
  sueldo_15: number;
  sueldo_30: number;
}

export interface MovimientoRecurrente {
  id: number;
  user_id?: string;
  billetera_id?: number;
  tipo: 'gasto' | 'ingreso';
  descripcion: string;
  monto: number;
  dia_pago: number;
  categoria_id: number | null;
  periodos?: string | null;
  tipo_recurrencia: 'mensual' | 'semanal';
}

export interface MovimientoAgenda {
  id: number;
  user_id?: string;
  billetera_id?: number;
  tipo: 'gasto' | 'ingreso';
  descripcion: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  categoria_id: number | null;
  es_recurrente: boolean;
  recurrente_id: number | null;
  pago_confirmado: boolean;
  fecha_pago: string | null;
}

export interface Deuda {
  archivada?: boolean;
  id: number;
  user_id?: string;
  billetera_id?: number;
  nombre: string;
  monto_recibido: number;
  categoria_id: number | null;
  creado_el?: string;
}

export interface DeudaCuota {
  id: number;
  user_id?: string;
  billetera_id?: number;
  deuda_id: number;
  numero: number;
  monto: number;
  fecha: string; // YYYY-MM-DD
}

export interface DeudaPago {
  id: number;
  user_id?: string;
  billetera_id?: number;
  cuota_id: number;
  monto: number;
  fecha: string; // YYYY-MM-DD
  movimiento_id: number | null;
  solicitud?: string | null;
}

export type ActiveTab = 'dashboard' | 'movimientos' | 'pagos' | 'categorias';

export const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function formatearMoneda(monto: number, moneda: Moneda): string {
  if (!Number.isFinite(monto)) return '—';
  const normalizado = Math.abs(monto) < 0.005 ? 0 : monto;
  return `${normalizado < 0 ? '-' : ''}${MONEDAS[moneda].simbolo} ${Math.abs(normalizado).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function obtenerUltimoDiaMes(anio: number, mesIndex0: number): number {
  return new Date(anio, mesIndex0 + 1, 0).getDate();
}

export function fechaHoyISO(): string {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fechaRealMovimiento(m: MovimientoAgenda): string {
  return m.pago_confirmado ? (m.fecha_pago || m.fecha) : m.fecha;
}

export function obtenerMesInicioRecurrente(
  rec: MovimientoRecurrente,
  anioDefault: number,
  mesIndex0Default: number
): { anio: number; mes: number } {
  if (rec.periodos && /^\d{4}-\d{2}$/.test(rec.periodos.trim())) {
    const [y, m] = rec.periodos.trim().split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return { anio: y, mes: m - 1 };
    }
  }
  return { anio: anioDefault, mes: mesIndex0Default };
}

export function recurrenteAplicaEnMes(
  rec: MovimientoRecurrente,
  anio: number,
  mesIndex0: number
): boolean {
  if (!rec.periodos) return true;
  const valor = rec.periodos.trim();
  if (/^\d{4}-\d{2}$/.test(valor)) {
    const prefijoTarget = `${anio}-${String(mesIndex0 + 1).padStart(2, '0')}`;
    return prefijoTarget >= valor;
  }
  return true;
}


