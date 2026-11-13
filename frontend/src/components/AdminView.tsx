import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Wallet,
  Activity,
  Database,
  Search,
  KeyRound,
  Mail,
  UserX,
  UserCheck,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Coins,
  Plus,
  Pencil,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AdminStats, AdminUser, MonedaConfig } from '../types/wallet';
import { confirmarAccion, alertaExito, alertaError, alertaInfo, toastExito } from '../lib/alerts';
import { AnimatedModal } from './AnimatedModal';

export const AdminView: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [subTab, setSubTab] = useState<'usuarios' | 'monedas' | 'metricas' | 'migraciones'>('usuarios');

  // Modal para cambio de contraseña
  const [modalPasswordOpen, setModalPasswordOpen] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<AdminUser | null>(null);
  const [nuevoPassword, setNuevoPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  // Mantenimiento de Monedas
  const [monedasAdmin, setMonedasAdmin] = useState<MonedaConfig[]>([]);
  const [cargandoMonedas, setCargandoMonedas] = useState(false);
  const [filtroMonedas, setFiltroMonedas] = useState('');
  const [modalMonedaOpen, setModalMonedaOpen] = useState(false);
  const [modalMonedaModo, setModalMonedaModo] = useState<'create' | 'edit'>('create');
  const [inputCodMoneda, setInputCodMoneda] = useState('');
  const [inputNomMoneda, setInputNomMoneda] = useState('');
  const [inputSimMoneda, setInputSimMoneda] = useState('');
  const [inputActivoMoneda, setInputActivoMoneda] = useState(true);
  const [inputOrdenMoneda, setInputOrdenMoneda] = useState('0');
  const [guardandoMoneda, setGuardandoMoneda] = useState(false);
  const [errorModalMoneda, setErrorModalMoneda] = useState<string | null>(null);

  const cargarMonedasAdmin = useCallback(async () => {
    setCargandoMonedas(true);
    try {
      const resRpc = await supabase.rpc('admin_listar_monedas');
      if (!resRpc.error && Array.isArray(resRpc.data) && resRpc.data.length > 0) {
        setMonedasAdmin(resRpc.data as MonedaConfig[]);
        return;
      }
      const resDirect = await supabase.from('monedas').select('*').order('orden');
      if (!resDirect.error && resDirect.data && resDirect.data.length > 0) {
        setMonedasAdmin(resDirect.data as MonedaConfig[]);
        return;
      }
      setMonedasAdmin([]);
    } catch {
      setMonedasAdmin([]);
    } finally {
      setCargandoMonedas(false);
    }
  }, []);

  const cargarDatosAdmin = useCallback(async () => {
    setLoading(true);
    setError(null);
    void cargarMonedasAdmin();
    try {
      const [resStats, resUsers] = await Promise.all([
        supabase.rpc('admin_obtener_estadisticas'),
        supabase.rpc('admin_listar_usuarios'),
      ]);

      if (resStats.error) throw resStats.error;
      if (resUsers.error) throw resUsers.error;

      setStats(resStats.data as AdminStats);
      setUsuarios((resUsers.data || []) as AdminUser[]);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Error cargando datos del panel.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatosAdmin();
  }, [cargarDatosAdmin]);

  // Filtrado de usuarios
  const usuariosFiltrados = useMemo(() => {
    if (!filtro.trim()) return usuarios;
    const q = filtro.toLowerCase().trim();
    return usuarios.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.nombre && u.nombre.toLowerCase().includes(q))
    );
  }, [usuarios, filtro]);

  // Manejador para abrir modal de contraseña
  const abrirModalPassword = (usuario: AdminUser) => {
    setUsuarioSeleccionado(usuario);
    setNuevoPassword('');
    setMostrarPassword(false);
    setModalPasswordOpen(true);
  };

  // Guardar nueva contraseña
  const handleGuardarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioSeleccionado || !nuevoPassword.trim() || nuevoPassword.length < 6) {
      await alertaError('Contraseña inválida', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const confirmado = await confirmarAccion({
      title: `¿Cambiar contraseña a ${usuarioSeleccionado.nombre}?`,
      text: `El usuario podrá iniciar sesión inmediatamente con esta nueva clave.`,
      confirmButtonText: 'Sí, cambiar contraseña',
      isDanger: false,
      icon: 'question',
    });

    if (!confirmado) return;

    setGuardandoPassword(true);
    try {
      const { error: errRpc } = await supabase.rpc('admin_cambiar_password', {
        p_target_user_id: usuarioSeleccionado.id,
        p_nuevo_password: nuevoPassword,
      });

      if (errRpc) throw errRpc;

      await alertaExito('Contraseña actualizada', `Se ha asignado la nueva contraseña para ${usuarioSeleccionado.email}.`);
      setModalPasswordOpen(false);
      setNuevoPassword('');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo actualizar la contraseña.';
      await alertaError('Error al cambiar contraseña', msg);
    } finally {
      setGuardandoPassword(false);
    }
  };

  // Enviar correo de restablecimiento
  const handleEnviarResetEmail = async (usuario: AdminUser) => {
    const confirmado = await confirmarAccion({
      title: `¿Enviar correo de recuperación?`,
      text: `Se enviará un enlace oficial de restablecimiento a ${usuario.email}.`,
      confirmButtonText: 'Sí, enviar correo',
      isDanger: false,
      icon: 'question',
    });

    if (!confirmado) return;

    try {
      const { error: errReset } = await supabase.auth.resetPasswordForEmail(usuario.email);
      if (errReset) throw errReset;
      await toastExito(`Enlace de restablecimiento enviado a ${usuario.email}`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo enviar el correo.';
      await alertaError('Error al enviar correo', msg);
    }
  };

  // Alternar estado de suspensión
  const handleToggleEstadoUsuario = async (usuario: AdminUser) => {
    const nuevoBloqueado = !usuario.bloqueado;
    const accion = nuevoBloqueado ? 'Suspender' : 'Reactivar';
    const confirmado = await confirmarAccion({
      title: `¿${accion} cuenta de ${usuario.nombre}?`,
      text: nuevoBloqueado
        ? 'Se cerrará de inmediato la sesión activa del usuario y no podrá operar hasta que sea reactivado.'
        : 'El usuario volverá a tener acceso normal a su billetera.',
      confirmButtonText: `Sí, ${accion.toLowerCase()}`,
      isDanger: nuevoBloqueado,
      icon: nuevoBloqueado ? 'warning' : 'question',
    });

    if (!confirmado) return;

    try {
      const { error: errRpc } = await supabase.rpc('admin_cambiar_estado_usuario', {
        p_target_user_id: usuario.id,
        p_bloquear: nuevoBloqueado,
      });

      if (errRpc) throw errRpc;

      if (nuevoBloqueado) {
        // Enviar broadcast para cierre inmediato de sesión si el usuario está conectado
        const canal = supabase.channel('canal_seguridad_auth');
        canal.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await canal.send({
              type: 'broadcast',
              event: 'usuario_bloqueado',
              payload: { userId: usuario.id },
            });
            setTimeout(() => void supabase.removeChannel(canal), 1000);
          }
        });
      }

      await toastExito(`Usuario ${nuevoBloqueado ? 'suspendido y sesión revocada' : 'reactivado'} con éxito`);
      await cargarDatosAdmin();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo actualizar el estado.';
      await alertaError('Error al cambiar estado', msg);
    }
  };

  // Eliminar usuario permanentemente
  const handleEliminarUsuario = async (usuario: AdminUser) => {
    if (usuario.es_admin || usuario.email.toLowerCase() === 'jrgfretell@gmail.com') {
      await alertaError('Acción restringida', 'No es posible eliminar una cuenta administradora.');
      return;
    }

    const confirmado = await confirmarAccion({
      title: `¿Eliminar cuenta de ${usuario.nombre || usuario.email}?`,
      text: `Esta acción es IRREVERSIBLE. Se eliminará la cuenta (${usuario.email}) y absolutamente todas sus billeteras, movimientos, deudas e historial completo.`,
      confirmButtonText: 'Sí, eliminar cuenta definitivamente',
      cancelButtonText: 'Cancelar',
      isDanger: true,
      icon: 'warning',
    });

    if (!confirmado) return;

    try {
      const { error: errRpc } = await supabase.rpc('admin_eliminar_usuario', {
        p_target_user_id: usuario.id,
      });

      if (errRpc) throw errRpc;

      // Enviar broadcast para cerrar sesión en tiempo real si el usuario está en línea
      const canal = supabase.channel('canal_seguridad_auth');
      canal.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await canal.send({
            type: 'broadcast',
            event: 'usuario_eliminado',
            payload: { userId: usuario.id },
          });
          setTimeout(() => void supabase.removeChannel(canal), 1000);
        }
      });

      await alertaExito('Usuario eliminado', `La cuenta de ${usuario.email} ha sido eliminada por completo.`);
      await cargarDatosAdmin();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo eliminar el usuario.';
      await alertaError('Error al eliminar usuario', msg);
    }
  };

  const monedasFiltradas = useMemo(() => {
    if (!filtroMonedas.trim()) return monedasAdmin;
    const q = filtroMonedas.toLowerCase().trim();
    return monedasAdmin.filter(
      (m) =>
        m.codigo.toLowerCase().includes(q) ||
        m.nombre.toLowerCase().includes(q) ||
        m.simbolo.toLowerCase().includes(q)
    );
  }, [monedasAdmin, filtroMonedas]);

  const abrirCrearMoneda = () => {
    setModalMonedaModo('create');
    setInputCodMoneda('');
    setInputNomMoneda('');
    setInputSimMoneda('');
    setInputActivoMoneda(true);
    setInputOrdenMoneda(String(monedasAdmin.length + 1));
    setErrorModalMoneda(null);
    setModalMonedaOpen(true);
  };

  const abrirEditarMoneda = (m: MonedaConfig) => {
    setModalMonedaModo('edit');
    setInputCodMoneda(m.codigo);
    setInputNomMoneda(m.nombre);
    setInputSimMoneda(m.simbolo);
    setInputActivoMoneda(m.activo !== false);
    setInputOrdenMoneda(String(m.orden || 0));
    setErrorModalMoneda(null);
    setModalMonedaOpen(true);
  };

  const handleGuardarMoneda = async (e: React.FormEvent) => {
    e.preventDefault();
    const cod = inputCodMoneda.trim().toUpperCase();
    const nom = inputNomMoneda.trim();
    const sim = inputSimMoneda.trim();

    if (!cod || cod.length < 2 || cod.length > 5) {
      setErrorModalMoneda('El código de moneda debe tener de 2 a 5 letras (ej: USD, PEN, EUR, GBP).');
      return;
    }
    if (!nom) {
      setErrorModalMoneda('El nombre de la moneda es requerido.');
      return;
    }
    if (!sim) {
      setErrorModalMoneda('El símbolo de la moneda es requerido (ej: S/, $, €, £).');
      return;
    }

    setGuardandoMoneda(true);
    setErrorModalMoneda(null);
    try {
      const rpcRes = await supabase.rpc('admin_guardar_moneda', {
        p_codigo: cod,
        p_nombre: nom,
        p_simbolo: sim,
        p_activo: inputActivoMoneda,
        p_orden: parseInt(inputOrdenMoneda, 10) || 0,
      });

      if (rpcRes.error) {
        // Fallback: direct table upsert
        const { error: upsertErr } = await supabase.from('monedas').upsert({
          codigo: cod,
          nombre: nom,
          simbolo: sim,
          activo: inputActivoMoneda,
          orden: parseInt(inputOrdenMoneda, 10) || 0,
          actualizado_el: new Date().toISOString(),
        });
        if (upsertErr) throw upsertErr;
      }

      await toastExito(`Moneda ${cod} guardada con éxito`);
      setModalMonedaOpen(false);
      await cargarMonedasAdmin();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo guardar la moneda.';
      setErrorModalMoneda(msg);
    } finally {
      setGuardandoMoneda(false);
    }
  };

  const handleToggleActivoMoneda = async (m: MonedaConfig) => {
    try {
      const nuevoEstado = !(m.activo !== false);
      const { error: errUp } = await supabase
        .from('monedas')
        .update({ activo: nuevoEstado, actualizado_el: new Date().toISOString() })
        .eq('codigo', m.codigo);
      if (errUp) throw errUp;
      await toastExito(`Moneda ${m.codigo} ${nuevoEstado ? 'activada' : 'desactivada'}`);
      await cargarMonedasAdmin();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Error al cambiar estado';
      await alertaError('Error', msg);
    }
  };

  const handleEliminarMoneda = async (m: MonedaConfig) => {
    if (['PEN', 'USD'].includes(m.codigo)) {
      await alertaInfo('Moneda protegida', 'Las monedas base del sistema no pueden ser eliminadas.');
      return;
    }
    const confirmado = await confirmarAccion({
      title: `¿Eliminar moneda ${m.codigo}?`,
      text: `Se eliminará "${m.nombre}". Solo procederá si ninguna billetera está registrada en esta moneda.`,
      confirmButtonText: 'Sí, eliminar',
      isDanger: true,
      icon: 'warning',
    });
    if (!confirmado) return;

    try {
      const { error: errRpc } = await supabase.rpc('admin_eliminar_moneda', { p_codigo: m.codigo });
      if (errRpc) {
        const { error: errDel } = await supabase.from('monedas').delete().eq('codigo', m.codigo);
        if (errDel) throw errDel;
      }
      await toastExito(`Moneda ${m.codigo} eliminada`);
      await cargarMonedasAdmin();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo eliminar.';
      await alertaError('No se pudo eliminar', msg);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Banner Principal del Panel */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-amber-900/40">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-400 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Control Global
                </span>
                <span className="text-[11px] text-slate-300">SuperAdmin</span>
              </div>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">
                Panel Administrativo
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={cargarDatosAdmin}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3.5 py-2 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar datos</span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Usuarios</span>
            <Users className="h-4 w-4 shrink-0 text-teal-600" />
          </div>
          <strong className="mt-2 block text-xl sm:text-2xl font-bold text-slate-900 truncate">
            {stats ? stats.total_usuarios : '—'}
          </strong>
          <span className="mt-1 block text-[11px] text-slate-500">
            {stats ? `${stats.usuarios_activos_mes} activos (últimos 30 días)` : 'Cargando…'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Billeteras Activas</span>
            <Wallet className="h-4 w-4 shrink-0 text-emerald-600" />
          </div>
          <strong className="mt-2 block text-xl sm:text-2xl font-bold text-slate-900 truncate">
            {stats ? stats.total_billeteras : '—'}
          </strong>
          <span className="mt-1 block text-[11px] text-slate-500 truncate">
            {stats ? `${stats.billeteras_pen} PEN · ${stats.billeteras_usd} USD · ${stats.billeteras_eur} EUR` : 'Cargando…'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Operaciones Globales</span>
            <Activity className="h-4 w-4 shrink-0 text-blue-600" />
          </div>
          <strong className="mt-2 block text-xl sm:text-2xl font-bold text-slate-900 truncate">
            {stats ? stats.total_movimientos : '—'}
          </strong>
          <span className="mt-1 block text-[11px] text-slate-500">
            {stats ? `${stats.total_deudas} deudas · ${stats.total_recurrentes} fijos` : 'Cargando…'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Salud de Base de Datos</span>
            <Database className="h-4 w-4 shrink-0 text-amber-600" />
          </div>
          <strong className="mt-2 block text-base sm:text-2xl font-bold text-slate-900 leading-tight">
            {stats ? `${stats.migraciones.length} migraciones` : '—'}
          </strong>
          <span className="mt-1 flex items-center gap-1 text-[11px] sm:text-[11px] font-semibold text-emerald-700 leading-tight">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Sistema 100% Operativo</span>
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Pestañas de Navegación del Panel */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto gap-1.5 sm:gap-2 rounded-2xl bg-slate-200/70 p-1.5">
          <button
            type="button"
            onClick={() => setSubTab('usuarios')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer min-w-0 ${
              subTab === 'usuarios'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Directorio ({usuarios.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('monedas')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer min-w-0 ${
              subTab === 'monedas'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-amber-500" />
            <span className="truncate">Monedas ({monedasAdmin.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('migraciones')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer min-w-0 ${
              subTab === 'migraciones'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">Migraciones</span>
              <span className="hidden sm:inline">Base de Datos y Versiones</span>
            </span>
          </button>
        </div>
      </div>

      {/* VISTA 1: Directorio de Usuarios */}
      {subTab === 'usuarios' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* Barra de Búsqueda */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full flex-1 sm:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar por nombre o correo electrónico…"
                className="min-h-10 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="text-xs text-slate-500 self-center">
              Mostrando <strong>{usuariosFiltrados.length}</strong> de <strong>{usuarios.length}</strong> usuarios
            </div>
          </div>

          {/* Fichas de usuario para móvil */}
          <div className="space-y-3 bg-slate-50/70 p-3 md:hidden">
            {usuariosFiltrados.map((u) => {
              const fechaRegistro = u.creado_el ? new Date(u.creado_el).toLocaleDateString('es-PE') : '—';
              const fechaAcceso = u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-PE') : 'Nunca';

              return (
                <article key={u.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.nombre} className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {(u.nombre || u.email).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-slate-900">{u.nombre}</h3>
                          {u.es_admin && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-amber-800">Admin</span>}
                        </div>
                        <p className="break-all text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                    {u.bloqueado ? (
                      <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Suspendido</span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Activo</span>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Proveedor</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">{u.proveedor}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Billeteras</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">{u.billeteras_count}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Registro</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">{fechaRegistro}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Último acceso</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">{fechaAcceso}</dd>
                    </div>
                  </dl>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones de soporte</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => abrirModalPassword(u)} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-teal-700">
                        <KeyRound className="h-4 w-4" /> Cambiar clave
                      </button>
                      <button type="button" onClick={() => handleEnviarResetEmail(u)} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700">
                        <Mail className="h-4 w-4" /> Enviar email
                      </button>
                      {!u.es_admin && (
                        <>
                          <button type="button" onClick={() => handleToggleEstadoUsuario(u)} className={`inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-[11px] font-semibold ${u.bloqueado ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                            {u.bloqueado ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                            {u.bloqueado ? 'Reactivar' : 'Bloquear'}
                          </button>
                          <button type="button" title="Eliminar cuenta definitivamente" aria-label={`Eliminar cuenta de ${u.nombre}`} onClick={() => handleEliminarUsuario(u)} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50/70 px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">
                            <Trash2 className="h-4 w-4" /> Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Tabla de Usuarios para escritorio */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4 text-center">Billeteras</th>
                  <th className="py-3 px-4">Registro / Acceso</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones de Soporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuariosFiltrados.map((u) => {
                  const fechaRegistro = u.creado_el ? new Date(u.creado_el).toLocaleDateString('es-PE') : '—';
                  const fechaAcceso = u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-PE') : 'Nunca';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={u.nombre}
                              className="h-8 w-8 rounded-full border border-slate-200 object-cover shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                              {(u.nombre || u.email).slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 truncate">{u.nombre}</span>
                              {u.es_admin && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-amber-800">
                                  Admin
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 block truncate">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            u.proveedor === 'google'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.proveedor}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 border border-teal-100">
                          {u.billeteras_count}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Alta: {fechaRegistro}</span>
                          <span className="font-medium text-[11px] block text-slate-700">Acceso: {fechaAcceso}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.bloqueado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                            Suspendido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            Activo
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="Cambiar contraseña directa"
                            onClick={() => abrirModalPassword(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-teal-700 cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Clave</span>
                          </button>

                          <button
                            type="button"
                            title="Enviar correo de restablecimiento"
                            onClick={() => handleEnviarResetEmail(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Email</span>
                          </button>

                          {!u.es_admin && (
                            <>
                              <button
                                type="button"
                                title={u.bloqueado ? 'Reactivar acceso' : 'Suspender acceso'}
                                onClick={() => handleToggleEstadoUsuario(u)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 cursor-pointer transition-colors ${
                                  u.bloqueado
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                }`}
                              >
                                {u.bloqueado ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                                <span className="hidden sm:inline">{u.bloqueado ? 'Reactivar' : 'Bloquear'}</span>
                              </button>

                              <button
                                type="button"
                                title="Eliminar cuenta y datos definitivamente"
                                onClick={() => handleEliminarUsuario(u)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 px-2 py-1 cursor-pointer transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Eliminar</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: Mantenimiento de Monedas y Divisas */}
      {subTab === 'monedas' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* Header con Búsqueda y Botón Nueva Moneda */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={filtroMonedas}
                onChange={(e) => setFiltroMonedas(e.target.value)}
                placeholder="Buscar por código, nombre o símbolo…"
                className="min-h-10 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <span className="whitespace-nowrap text-[11px] text-slate-500 sm:text-xs">
                Mostrando <strong>{monedasFiltradas.length}</strong> de <strong>{monedasAdmin.length}</strong> monedas
              </span>
              <button
                type="button"
                onClick={abrirCrearMoneda}
                className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 active:bg-teal-800 cursor-pointer sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Moneda</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de monedas para móvil */}
          <div className="space-y-3 bg-slate-50/70 p-3 md:hidden">
            {monedasFiltradas.map((m) => {
              const estaActiva = m.activo !== false;
              const totalUso = m.total_billeteras ?? (stats ? (m.codigo === 'PEN' ? stats.billeteras_pen : m.codigo === 'USD' ? stats.billeteras_usd : m.codigo === 'EUR' ? stats.billeteras_eur : 0) : 0);

              return (
                <article key={m.codigo} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-teal-100 bg-teal-50 text-lg font-bold text-teal-800">
                        {m.simbolo}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{m.nombre}</h3>
                          <span className="inline-flex rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-amber-300">
                            {m.codigo}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">Símbolo: <strong className="text-slate-700">{m.simbolo}</strong></p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleActivoMoneda(m)}
                      title={estaActiva ? 'Desactivar para nuevas billeteras' : 'Activar para nuevas billeteras'}
                      className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        estaActiva
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${estaActiva ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {estaActiva ? 'Activa' : 'Inactiva'}
                    </button>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Billeteras</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-slate-800">{totalUso} {totalUso === 1 ? 'billetera' : 'billeteras'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Orden del catálogo</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-slate-800">{m.orden ?? 0}</dd>
                    </div>
                  </dl>

                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => abrirEditarMoneda(m)}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-teal-700"
                    >
                      <Pencil className="h-4 w-4" /> Editar moneda
                    </button>
                    {!['PEN', 'USD'].includes(m.codigo) && (
                      <button
                        type="button"
                        title="Eliminar divisa"
                        disabled={totalUso > 0}
                        onClick={() => handleEliminarMoneda(m)}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Tabla de Monedas para escritorio */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Código ISO</th>
                  <th className="py-3 px-4">Símbolo</th>
                  <th className="py-3 px-4">Nombre de la Divisa</th>
                  <th className="py-3 px-4 text-center">Billeteras</th>
                  <th className="py-3 px-4 text-center">Orden</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monedasFiltradas.map((m) => {
                  const estaActiva = m.activo !== false;
                  const totalUso = m.total_billeteras ?? (stats ? (m.codigo === 'PEN' ? stats.billeteras_pen : m.codigo === 'USD' ? stats.billeteras_usd : m.codigo === 'EUR' ? stats.billeteras_eur : 0) : 0);

                  return (
                    <tr key={m.codigo} className="hover:bg-slate-50/70 transition-colors">
                      {/* Código */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider bg-slate-900 text-amber-300 font-mono shadow-2xs">
                          {m.codigo}
                        </span>
                      </td>

                      {/* Símbolo */}
                      <td className="py-3.5 px-4 font-bold text-sm text-slate-900">
                        {m.simbolo}
                      </td>

                      {/* Nombre */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                          {m.nombre}
                        </div>
                      </td>

                      {/* Billeteras que la usan */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block rounded-lg bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-100">
                          {totalUso} billetera(s)
                        </span>
                      </td>

                      {/* Orden */}
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-500">
                        {m.orden ?? 0}
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActivoMoneda(m)}
                          title={estaActiva ? 'Desactivar para nuevas billeteras' : 'Activar para nuevas billeteras'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                            estaActiva
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${estaActiva ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span>{estaActiva ? 'Activa' : 'Inactiva'}</span>
                        </button>
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Editar divisa"
                            onClick={() => abrirEditarMoneda(m)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-teal-700 transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {!['PEN', 'USD'].includes(m.codigo) && (
                            <button
                              type="button"
                              title="Eliminar divisa"
                              disabled={totalUso > 0}
                              onClick={() => handleEliminarMoneda(m)}
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {monedasFiltradas.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs">
              {cargandoMonedas ? 'Cargando catálogo de divisas…' : 'No se encontraron monedas para el filtro ingresado.'}
            </div>
          )}
        </div>
      )}

      {/* VISTA 3: Versiones y Migraciones de Base de Datos */}
      {subTab === 'migraciones' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4 overflow-hidden">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">Historial de Migraciones Supabase</h2>
              <p className="text-xs text-slate-500 break-words">
                Registro inmutable de versiones de base de datos aplicadas en <code className="font-mono text-slate-700">wallet_internal.migraciones</code>.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {stats?.migraciones.map((mig) => (
              <div
                key={mig.version}
                className="flex items-start sm:items-center justify-between gap-2.5 rounded-xl border border-slate-200 p-3 sm:p-3.5 hover:bg-slate-50 transition-colors overflow-hidden"
              >
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs sm:text-sm font-mono text-slate-900 break-all leading-snug">
                      {mig.version}
                    </strong>
                    <span className="mt-0.5 block text-[11px] sm:text-xs text-slate-400">
                      Aplicada el: {new Date(mig.aplicada_el).toLocaleString('es-PE')}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 sm:px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Activa
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Cambiar Contraseña Directa */}
      <AnimatedModal open={modalPasswordOpen} label="Cambiar Contraseña Directa">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Cambiar Contraseña</h3>
                <p className="text-xs text-slate-500">Asignar nueva clave para {usuarioSeleccionado?.nombre}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleGuardarPassword} className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">Usuario</span>
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800">
                {usuarioSeleccionado?.email}
              </p>
            </div>

            <div>
              <label htmlFor="admin-new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Nueva Contraseña (mínimo 6 caracteres)
              </label>
              <div className="relative">
                <input
                  id="admin-new-password"
                  type={mostrarPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={nuevoPassword}
                  onChange={(e) => setNuevoPassword(e.target.value)}
                  placeholder="Ej. ClaveSegura2026!"
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-3.5 pr-10 text-sm font-semibold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {mostrarPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              El usuario podrá iniciar sesión inmediatamente con esta clave. Puedes compartirle esta contraseña temporal por tu canal de soporte de confianza.
            </p>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={guardandoPassword}
                onClick={() => setModalPasswordOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoPassword || nuevoPassword.length < 6}
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {guardandoPassword ? 'Actualizando…' : 'Establecer Contraseña'}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>

      {/* Modal: Crear / Editar Moneda */}
      <AnimatedModal
        open={modalMonedaOpen}
        label={modalMonedaModo === 'create' ? 'Nueva Moneda' : 'Editar Moneda'}
      >
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl relative">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {modalMonedaModo === 'create' ? 'Agregar Nueva Moneda' : 'Editar Moneda'}
                </h3>
                <p className="text-xs text-slate-500">
                  {modalMonedaModo === 'create'
                    ? 'Habilita una nueva divisa para todos los usuarios de la plataforma.'
                    : 'Modifica el nombre o símbolo de la divisa.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModalMonedaOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleGuardarMoneda} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Código ISO (2-5 letras)
                </label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  disabled={modalMonedaModo === 'edit'}
                  value={inputCodMoneda}
                  onChange={(e) => setInputCodMoneda(e.target.value.toUpperCase())}
                  placeholder="Ej: GBP, MXN, COP"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 uppercase font-mono focus:bg-white focus:outline-none focus:border-teal-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Símbolo Monetario
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={inputSimMoneda}
                  onChange={(e) => setInputSimMoneda(e.target.value)}
                  placeholder="Ej: £, MX$, COL$"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Nombre de la Moneda
              </label>
              <input
                type="text"
                required
                value={inputNomMoneda}
                onChange={(e) => setInputNomMoneda(e.target.value)}
                placeholder="Ej: Libras Esterlinas, Pesos Mexicanos..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Orden de Aparición
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={inputOrdenMoneda}
                  onChange={(e) => setInputOrdenMoneda(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="chk-moneda-activa"
                  checked={inputActivoMoneda}
                  onChange={(e) => setInputActivoMoneda(e.target.checked)}
                  className="h-4 w-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                />
                <label htmlFor="chk-moneda-activa" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Moneda Activa
                </label>
              </div>
            </div>

            {errorModalMoneda && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {errorModalMoneda}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setModalMonedaOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoMoneda}
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
              >
                {guardandoMoneda ? 'Guardando…' : modalMonedaModo === 'create' ? 'Crear Moneda' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>
    </div>
  );
};
