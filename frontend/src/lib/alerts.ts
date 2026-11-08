import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';

// Opciones base con estilos acordes al diseño de Mi Billete Pro
const customClass = {
  popup: 'rounded-2xl border border-slate-200 shadow-2xl p-6 font-sans',
  title: 'text-slate-900 font-extrabold text-lg',
  htmlContainer: 'text-slate-600 text-sm mt-2',
  confirmButton: 'px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer shadow-sm mx-1',
  cancelButton: 'px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer shadow-sm mx-1',
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
}: {
  title: string;
  text?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  isDanger?: boolean;
  icon?: SweetAlertIcon;
}): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonColor: isDanger ? '#e11d48' : '#0d9488',
    cancelButtonColor: '#64748b',
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    customClass,
    buttonsStyling: true,
    width: 'min(30rem, calc(100vw - 2rem))',
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
  });
};

export const toastExito = (title: string) => {
  return Swal.fire({
    toast: true,
    position: 'bottom-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: toastClass,
  });
};

export default Swal;
