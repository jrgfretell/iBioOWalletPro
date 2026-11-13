import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';

// Opciones base con estilos acordes al diseño de Mi Billete Pro
const getThemePopupColors = () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return isDark
    ? { background: '#0f172a', color: '#f8fafc' }
    : { background: '#ffffff', color: '#0f172a' };
};

const customClass = {
  popup: 'rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 font-sans',
  title: 'text-slate-900 dark:text-slate-50 font-bold text-lg',
  htmlContainer: 'text-slate-600 dark:text-slate-300 text-sm mt-2',
  confirmButton: 'px-5 py-2.5 rounded-xl font-semibold text-xs cursor-pointer shadow-sm mx-1',
  cancelButton: 'px-5 py-2.5 rounded-xl font-semibold text-xs cursor-pointer shadow-sm mx-1',
};

const toastClass = {
  container: 'app-toast-container',
  popup: 'app-toast-popup',
  title: 'app-toast-title',
};

export const confirmarAccion = async ({
  title,
  text,
  confirmButtonText = 'Sí, eliminar',
  cancelButtonText = 'Cancelar',
  isDanger = true,
  icon = 'warning' as SweetAlertIcon,
  compact = false,
}: {
  title: string;
  text?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  isDanger?: boolean;
  icon?: SweetAlertIcon;
  compact?: boolean;
}): Promise<boolean> => {
  const result = await Swal.fire({
    ...getThemePopupColors(),
    title,
    text,
    icon: compact ? undefined : icon,
    showCancelButton: true,
    confirmButtonColor: isDanger ? '#e11d48' : '#0d9488',
    cancelButtonColor: '#64748b',
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    customClass: compact ? { ...customClass, popup: 'payment-cancel-popup' } : customClass,
    buttonsStyling: true,
    width: compact ? 'min(24rem, calc(100vw - 2rem))' : 'min(30rem, calc(100vw - 2rem))',
    padding: '1.5rem',
  });

  return result.isConfirmed;
};

export const alertaExito = (title: string, text?: string) => {
  return Swal.fire({
    title,
    text,
    icon: 'success',
    confirmButtonColor: '#0d9488',
    confirmButtonText: 'Entendido',
    customClass,
    ...getThemePopupColors(),
  });
};

export const alertaError = (title: string, text?: string) => {
  return Swal.fire({
    title,
    text,
    icon: 'error',
    confirmButtonColor: '#e11d48',
    confirmButtonText: 'Cerrar',
    customClass,
    ...getThemePopupColors(),
  });
};

export const alertaInfo = (title: string, text?: string) => {
  return Swal.fire({
    title,
    text,
    icon: 'info',
    confirmButtonColor: '#0d9488',
    confirmButtonText: 'Aceptar',
    customClass,
    ...getThemePopupColors(),
  });
};

export const toastExito = (title: string) => {
  return Swal.fire({
    toast: true,
    position: 'bottom-end',
    iconHtml: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg>',
    title,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: false,
    customClass: toastClass,
  });
};

export default Swal;
