import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Tags,
  LogOut,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  X,
  Lock,
  Bell,
  CheckCircle2,
} from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
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

  const navItems: { id: ActiveTab; label: string; mobileLabel?: string; icon: React.ReactNode; isAdmin?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'movimientos', label: 'Movimientos', mobileLabel: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'pagos', label: 'Pagos programados', mobileLabel: 'Pagos', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'categorias', label: 'Categorías', mobileLabel: 'Categorías', icon: <Tags className="w-4 h-4" /> },
  ];

  if (esAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin',
      mobileLabel: 'Admin',
      icon: <ShieldCheck className="w-4 h-4 text-amber-400" />,
      isAdmin: true,
    });
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-white tracking-tight text-lg">Mi Billete</span>
              <span className="font-extrabold text-teal-400 text-lg">Pro</span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/70 p-1 rounded-xl border border-slate-700/60">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? item.isAdmin
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                        : 'bg-teal-500 text-white shadow-sm'
                      : item.isAdmin
                      ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

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
            <button
              onClick={signOut}
              title="Cerrar sesión"
              className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-1 py-1.5 flex items-center justify-between gap-0.5 shadow-2xl safe-area-bottom">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? item.isAdmin
                    ? 'text-amber-400 bg-amber-500/15'
                    : 'text-teal-400 bg-teal-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold tracking-tight text-center w-full block truncate">
                {item.mobileLabel || item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </nav>

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
