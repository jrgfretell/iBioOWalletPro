export interface Categoria {
  id: number;
  user_id?: string;
  nombre: string;
  color: string;
  icono: string;
}

export interface SueldoMes {
  id?: number;
  user_id?: string;
  anio: number;
  mes: number; // 0 = Enero, 11 = Diciembre
  sueldo_15: number;
  sueldo_30: number;
}

export interface MovimientoRecurrente {
  id: number;
  user_id?: string;
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
  id: number;
  user_id?: string;
  nombre: string;
  monto_recibido: number;
  categoria_id: number | null;
  creado_el?: string;
}

export interface DeudaCuota {
  id: number;
  user_id?: string;
  deuda_id: number;
  numero: number;
  monto: number;
  fecha: string; // YYYY-MM-DD
}

export interface DeudaPago {
  id: number;
  user_id?: string;
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

export function formatearMoneda(monto: number): string {
  return `S/. ${Number(monto || 0).toLocaleString('es-PE', {
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

