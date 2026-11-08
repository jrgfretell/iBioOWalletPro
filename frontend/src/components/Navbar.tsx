import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { supabase } from '../lib/supabase';
import { AnimatedModal } from './AnimatedModal';
import { toastExito } from '../lib/alerts';
import { recurrenteAplicaEnMes } from '../types/wallet';
import type { ActiveTab } from '../types/wallet';
import {
  Wallet,
  LayoutDashboard,
  History,
  CalendarClock,
  Repeat,
  Tags,
  LogOut,
  ShieldCheck,
  KeyRound,
  Eye,
  Menu,
  EyeOff,
  X,
  Lock,
  Bell,
  CheckCircle2,
  WalletCards,
  TrendingUp,
} from 'lucide-react';
import { WalletQuickSwitcher } from './WalletQuickSwitcher';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  children?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  children,
}) => {
  const { user, esAdmin, isPasswordRecovery, setIsPasswordRecovery, signOut } = useAuth();
  const { cuotas, pagosDeuda, movimientos, recurrentes, formatearMoneda } = useWallet();

  // Estado del modal de perfil y seguridad
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [nuevoPassword, setNuevoPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  // Estado de la campanita de avisos informativos
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Estado del drawer lateral en móvil
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Evita que los gestos del drawer móvil desplacen el contenido que queda detrás.
  useLayoutEffect(() => {
    if (!mobileDrawerOpen) return;

    const scrollY = window.scrollY;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };

    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      body.style.overscrollBehavior = previousBodyStyles.overscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [mobileDrawerOpen]);

  // Apertura automática si viene desde enlace de recuperación de contraseña
  useEffect(() => {
    if (isPasswordRecovery) {
      setProfileModalOpen(true);
    }
  }, [isPasswordRecovery]);

  // Cerrar popover de avisos al hacer clic fuera o con tecla Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);

  // Cálculo consolidado de avisos (Resumen Ejecutivo sin listas ruidosas)
  const resumenAlertas = useMemo(() => {
    const d = new Date();
    const hoyStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d3 = new Date(d);
    d3.setDate(d3.getDate() + 3);
    const en3DiasStr = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}-${String(d3.getDate()).padStart(2, '0')}`;

    const vencidos = { count: 0, total: 0 };
    const vencenHoy = { count: 0, total: 0 };
    const proximos = { count: 0, total: 0 };

    // 1. Cuotas de deudas / préstamos
    for (const c of cuotas) {
      const totalAbonado = pagosDeuda
        .filter((p) => p.cuota_id === c.id)
        .reduce((sum, p) => sum + p.monto, 0);
      const pendiente = Math.max(0, Math.round((c.monto - totalAbonado) * 100) / 100);
      if (pendiente > 0.009) {
        if (c.fecha < hoyStr) {
          vencidos.count++;
          vencidos.total += pendiente;
        } else if (c.fecha === hoyStr) {
          vencenHoy.count++;
          vencenHoy.total += pendiente;
        } else if (c.fecha <= en3DiasStr) {
          proximos.count++;
          proximos.total += pendiente;
        }
      }
    }

    // 2. Movimientos independientes no confirmados (que no sean recurrentes)
    for (const m of movimientos) {
      if (m.tipo === 'gasto' && !m.pago_confirmado && !m.es_recurrente) {
        if (m.fecha < hoyStr) {
          vencidos.count++;
          vencidos.total += m.monto;
        } else if (m.fecha === hoyStr) {
          vencenHoy.count++;
          vencenHoy.total += m.monto;
        } else if (m.fecha <= en3DiasStr) {
          proximos.count++;
          proximos.total += m.monto;
        }
      }
    }

    // 3. Recurrentes continuos del mes
    const anio = d.getFullYear();
    const mes = d.getMonth();
    const prefijoMes = hoyStr.slice(0, 7);
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();

    for (const r of recurrentes) {
      if (r.tipo === 'gasto' && recurrenteAplicaEnMes(r, anio, mes)) {
        const diaReal = Math.min(r.dia_pago, ultimoDia);
        const fechaEstimada = `${prefijoMes}-${String(diaReal).padStart(2, '0')}`;
        const mov = movimientos.find(
          (m) => m.recurrente_id === r.id && m.fecha.startsWith(prefijoMes)
        );
        const confirmado = mov ? mov.pago_confirmado : false;
        if (!confirmado) {
          const fecha = mov ? mov.fecha : fechaEstimada;
          const monto = mov ? mov.monto : r.monto;
          if (fecha < hoyStr) {
            vencidos.count++;
            vencidos.total += monto;
          } else if (fecha === hoyStr) {
            vencenHoy.count++;
            vencenHoy.total += monto;
          } else if (fecha <= en3DiasStr) {
            proximos.count++;
            proximos.total += monto;
          }
        }
      }
    }

    return { vencidos, vencenHoy, proximos };
  }, [cuotas, pagosDeuda, movimientos, recurrentes]);

  const totalAlertas =
    resumenAlertas.vencidos.count +
    resumenAlertas.vencenHoy.count +
    resumenAlertas.proximos.count;

  const handleGuardarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevoPassword.length < 6) {
      setErrorPassword('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (nuevoPassword !== confirmarPassword) {
      setErrorPassword('Las contraseñas no coinciden.');
      return;
    }

    try {
      setGuardandoPassword(true);
      setErrorPassword(null);
      const { error } = await supabase.auth.updateUser({ password: nuevoPassword });
      if (error) throw error;

      await toastExito('Contraseña actualizada con éxito');
      setNuevoPassword('');
      setConfirmarPassword('');
      setProfileModalOpen(false);
      if (isPasswordRecovery) {
        setIsPasswordRecovery(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorPassword(err.message);
      } else {
        setErrorPassword('Ocurrió un error al actualizar la contraseña.');
      }
    } finally {
      setGuardandoPassword(false);
    }
  };

  const coreNavItems = [
    { id: 'dashboard' as ActiveTab, label: 'Inicio', desktopLabel: 'Inicio', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'movimientos' as ActiveTab, label: 'Movimientos', desktopLabel: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'pagos' as ActiveTab, label: 'Pagos', desktopLabel: 'Pagos programados', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'categorias' as ActiveTab, label: 'Categorías', desktopLabel: 'Categorías', icon: <Tags className="w-4 h-4" /> },
  ];

  const fullNavItems = [
    { id: 'dashboard' as ActiveTab, label: 'Inicio', desktopLabel: 'Inicio', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'billeteras' as ActiveTab, label: 'Billeteras', desktopLabel: 'Mis Billeteras', icon: <WalletCards className="w-4 h-4" /> },
    { id: 'ingresos' as ActiveTab, label: 'Ingresos', desktopLabel: 'Sueldos e Ingresos', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'movimientos' as ActiveTab, label: 'Movimientos', desktopLabel: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'pagos' as ActiveTab, label: 'Pagos', desktopLabel: 'Pagos programados', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'recurrentes' as ActiveTab, label: 'Recurrentes', desktopLabel: 'Pagos recurrentes', icon: <Repeat className="w-4 h-4" /> },
    { id: 'categorias' as ActiveTab, label: 'Categorías', desktopLabel: 'Categorías', icon: <Tags className="w-4 h-4" /> },
  ];

  const tabTitles: Record<ActiveTab, string> = {
    dashboard: 'Dashboard',
    billeteras: 'Gestión de Billeteras',
    ingresos: 'Sueldos e Ingresos',
    movimientos: 'Historial de Movimientos',
    pagos: 'Pagos programados',
    recurrentes: 'Pagos recurrentes',
    categorias: 'Categorías',
    admin: 'Panel de Administración',
  };

  return (
    <>
      {/* 1. Desktop Sidebar (Barra Lateral Izquierda Fija en Pantalla Completa con Scroll Independiente) */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 fixed inset-y-0 left-0 z-30 select-none">
        {/* Header del Sidebar */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center shadow-xs">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-white tracking-tight text-base">Mi Billete</span>
            <span className="font-extrabold text-teal-400 text-base">Pro</span>
          </div>
        </div>

        {/* Quick Switcher de Billetera en el Sidebar */}
        <div className="p-3 border-b border-slate-800/80 shrink-0">
          <WalletQuickSwitcher
            onNavigateToBilleteras={() => setActiveTab('billeteras')}
          />
        </div>

        {/* Lista de Navegación con Scroll Vertical */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 block mb-2">
              Menú Principal
            </span>
            <nav className="space-y-1">
              {fullNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                      isActive
                        ? 'bg-teal-500/15 text-teal-300 font-bold border-l-2 border-teal-400 shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {item.icon}
                    <span>{item.desktopLabel}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {esAdmin && (
            <div className="border-t border-slate-700/70 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80 px-3 block mb-2">
                Administración
              </span>
              <button
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeTab === 'admin'
                    ? 'bg-amber-500/15 text-amber-300 font-bold border-l-2 border-amber-400 shadow-xs'
                    : 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Panel Admin</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer del Sidebar: Cuenta y cierre de sesión */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 shrink-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-extrabold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  {(user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {user?.user_metadata?.full_name || 'Mi Cuenta'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                title="Seguridad y Perfil"
                aria-label="Seguridad y Perfil"
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Columna Principal de Contenido (con padding izquierdo en md para no solaparse con el sidebar fijo) */}
      <div className="md:pl-64 flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar Superior */}
        <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md border-b border-slate-800 app-safe-top shrink-0">
          <div className="w-full px-4 sm:px-6 lg:px-8 safe-area-horizontal h-full flex items-center justify-between">
            {/* Izquierda: Hamburguesa en Móvil / Breadcrumb en Escritorio */}
            <div className="flex items-center gap-3">
              {/* Botón Hamburguesa en Móvil */}
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Abrir menú de navegación"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Logo en Móvil */}
              <div className="flex items-center gap-2 md:hidden">
                <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-white text-base tracking-tight">
                  Mi Billete <span className="text-teal-400">Pro</span>
                </span>
              </div>

              {/* Título en Escritorio */}
              <div className="hidden md:flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Sección activa</span>
                <span className="text-slate-600">/</span>
                <span className="text-sm font-extrabold text-white tracking-wide">
                  {tabTitles[activeTab] || 'Dashboard'}
                </span>
              </div>
            </div>

            {/* Right User Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
            {/* Campanita de Avisos Informativos */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                title="Avisos de pagos"
                aria-label="Avisos y vencimientos"
                className={`p-2 rounded-xl transition-all cursor-pointer relative ${
                  notifOpen
                    ? 'bg-slate-800 text-teal-400 border border-teal-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <Bell className="w-4 h-4" />
                {totalAlertas > 0 && (
                  <span
                    className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-slate-900 ${
                      resumenAlertas.vencidos.count > 0
                        ? 'bg-rose-500'
                        : resumenAlertas.vencenHoy.count > 0
                        ? 'bg-amber-400'
                        : 'bg-sky-400'
                    }`}
                  />
                )}
              </button>

              {/* Popover de Avisos */}
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    role="dialog"
                    aria-label="Resumen de compromisos"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="fixed sm:absolute top-16 sm:top-12 left-4 sm:left-auto right-4 sm:right-0 max-w-sm sm:max-w-none sm:w-88 mx-auto sm:mx-0 z-50 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl p-4 text-white overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-white tracking-wide">
                          Avisos de Pagos
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Resumen de Avisos (Sin botones, consolidado) */}
                    <div className="py-3 space-y-2.5">
                      {resumenAlertas.vencidos.count > 0 && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-rose-300">
                              {resumenAlertas.vencidos.count}{' '}
                              {resumenAlertas.vencidos.count === 1
                                ? 'pago vencido'
                                : 'pagos vencidos'}
                            </p>
                            <p className="text-xs text-rose-200/80 mt-0.5 font-medium">
                              Total pendiente:{' '}
                              <span className="font-bold text-rose-100">
                                {formatearMoneda(resumenAlertas.vencidos.total)}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}

                      {resumenAlertas.vencenHoy.count > 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-amber-300">
                              {resumenAlertas.vencenHoy.count}{' '}
                              {resumenAlertas.vencenHoy.count === 1
                                ? 'pago vence hoy'
                                : 'pagos vencen hoy'}
                            </p>
                            <p className="text-xs text-amber-200/80 mt-0.5 font-medium">
                              Total a pagar hoy:{' '}
                              <span className="font-bold text-amber-100">
                                {formatearMoneda(resumenAlertas.vencenHoy.total)}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}

                      {resumenAlertas.proximos.count > 0 && (
                        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-sky-300">
                              {resumenAlertas.proximos.count}{' '}
                              {resumenAlertas.proximos.count === 1
                                ? 'pago en los próximos 3 días'
                                : 'pagos en los próximos 3 días'}
                            </p>
                            <p className="text-xs text-sky-200/80 mt-0.5 font-medium">
                              Total estimado:{' '}
                              <span className="font-bold text-sky-100">
                                {formatearMoneda(resumenAlertas.proximos.total)}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}

                      {totalAlertas === 0 && (
                        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <p className="text-xs font-medium">
                            ¡Todo al día! No tienes pagos vencidos ni próximos a vencer.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer informativo */}
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 text-center">
                      Compromisos de tu billetera activa
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Perfil & Seguridad */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="Mi Perfil y Seguridad"
              className="flex items-center gap-2 py-1 px-2 sm:px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-slate-700 border border-slate-700/60 text-slate-200 transition-all cursor-pointer group shadow-xs"
            >
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || 'Avatar'}
                  className="w-6 h-6 rounded-full border border-teal-500/50 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center text-xs font-bold border border-teal-500/30">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <span className="text-xs text-slate-300 hidden sm:inline-block max-w-[130px] truncate font-medium group-hover:text-white">
                {user?.user_metadata?.full_name || user?.email}
              </span>
              <KeyRound className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-400 transition-colors" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal (Children) */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>

      {/* 3. Mobile Bottom Navigation Bar (Exactamente 4 accesos principales) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom">
        {coreNavItems.map((item) => {
          const isActive = activeTab === item.id || (item.id === 'pagos' && activeTab === 'recurrentes');
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-teal-400 bg-teal-500/15'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className={`mt-1 text-[10px] tracking-tight text-center w-full block truncate ${
                isActive ? 'font-bold text-teal-300' : 'font-medium'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 4. Mobile Lateral Drawer (Menú Desplegable) */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop oscuro con blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs cursor-pointer"
              aria-hidden="true"
            />

            {/* Panel Deslizante Lateral */}
            <motion.aside
              data-drawer="mobile"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="relative w-72 max-w-[85vw] h-full bg-slate-900 border-r border-slate-800 text-white flex flex-col shadow-2xl z-10 select-none safe-area-inset"
            >
              {/* Header del Drawer */}
              <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center shadow-xs">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-white tracking-tight text-base">Mi Billete</span>
                    <span className="font-extrabold text-teal-400 text-base">Pro</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Switcher de Billetera en el Drawer Móvil */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 block mb-1.5">
                  Billetera Activa
                </span>
                <WalletQuickSwitcher
                  onNavigateToBilleteras={() => {
                    setMobileDrawerOpen(false);
                    setActiveTab('billeteras');
                  }}
                />
              </div>

              {/* Contenido con Scroll Independiente */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-6">
                {/* Sección: Menú Principal */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 block mb-2">
                    Menú Principal
                  </span>
                  <nav className="space-y-1">
                    {fullNavItems.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileDrawerOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                            isActive
                              ? 'bg-teal-500/15 text-teal-300 font-bold border-l-2 border-teal-400 shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                          }`}
                        >
                          {item.icon}
                          <span>{item.desktopLabel}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {/* Sección: Administración (si es admin) */}
                {esAdmin && (
                  <div className="border-t border-slate-700/70 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80 px-3 block mb-2">
                      Administración
                    </span>
                    <button
                      onClick={() => {
                        setActiveTab('admin');
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                        activeTab === 'admin'
                          ? 'bg-amber-500/15 text-amber-300 font-bold border-l-2 border-amber-400 shadow-xs'
                          : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      <span>Panel Admin</span>
                    </button>
                  </div>
                )}

                {/* Sección: Accesos de Configuración y Seguridad */}
                <div className="border-t border-slate-700/70 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 block mb-2">
                    Ajustes
                  </span>
                  <button
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer text-left"
                  >
                    <KeyRound className="w-4 h-4 text-teal-400" />
                    <span>Perfil y Seguridad</span>
                  </button>
                </div>
              </div>

              {/* Footer del Drawer: Usuario & Cerrar sesión */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/80 shrink-0 space-y-3">
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-extrabold flex items-center justify-center text-xs shrink-0 shadow-xs">
                    {(user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">
                      {user?.user_metadata?.full_name || 'Mi Cuenta'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Mi Perfil y Seguridad */}
      <AnimatedModal open={profileModalOpen} label="Mi Perfil y Seguridad">
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-5 sm:p-6 text-white shadow-2xl relative">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Mi Perfil & Seguridad</h3>
                <p className="text-xs text-slate-400">Gestiona tus credenciales de acceso</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileModalOpen(false);
                setErrorPassword(null);
                setNuevoPassword('');
                setConfirmarPassword('');
                if (isPasswordRecovery) setIsPasswordRecovery(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info Card */}
          <div className="mt-4 p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl flex items-center gap-3">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-10 h-10 rounded-full border border-teal-500/50 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center text-sm font-bold border border-teal-500/40">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {user?.user_metadata?.full_name || 'Usuario'}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                esAdmin
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
              }`}
            >
              {esAdmin ? 'Admin' : 'Usuario'}
            </span>
          </div>

          {isPasswordRecovery && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Modo recuperación activo: Ingresa tu nueva contraseña para completar el restablecimiento.</span>
            </div>
          )}

          {/* Formulario de Cambio de Contraseña */}
          <form onSubmit={handleGuardarPassword} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Nueva Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={nuevoPassword}
                  onChange={(e) => {
                    setNuevoPassword(e.target.value);
                    setErrorPassword(null);
                  }}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Confirmar Nueva Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmarPassword}
                  onChange={(e) => {
                    setConfirmarPassword(e.target.value);
                    setErrorPassword(null);
                  }}
                  placeholder="Repite la contraseña"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
            </div>

            {errorPassword && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                {errorPassword}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setErrorPassword(null);
                  setNuevoPassword('');
                  setConfirmarPassword('');
                  if (isPasswordRecovery) setIsPasswordRecovery(false);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoPassword || !nuevoPassword || !confirmarPassword}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-md shadow-teal-500/20 flex items-center gap-2 cursor-pointer transition-all"
              >
                {guardandoPassword ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Guardar Contraseña</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>
    </>
  );
};
