import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Wallet,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  Banknote,
} from 'lucide-react';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';
import { AnimatedModal } from './AnimatedModal';
import { RegistrarPagoModal, type ObjetivoPago } from './RegistrarPagoModal';
import {
  NOMBRES_MESES,
  fechaHoyISO,
  recurrenteAplicaEnMes,
  obtenerMesInicioRecurrente,
  MONEDAS,
} from '../types/wallet';
import type { MovimientoRecurrente } from '../types/wallet';
import { confirmarAccion, toastExito } from '../lib/alerts';

export const IngresosView: React.FC = () => {
  const { user } = useAuth();
  const {
    billeteraActual,
    soporteEtapa5,
    soloLectura,
    sueldos,
    recurrentes,
    movimientos,
    categorias,
    clienteBilletera,
    formatearMoneda,
    simboloMoneda,
    guardarSueldoMes,
    guardarSueldoAnual,
    ejecutarOperacion,
    recargarTodo,
    reportarError,
    limpiarError,
    error: errorBilletera,
  } = useWallet();

  const hoy = useMemo(() => new Date(), []);
  const fechaHoyStr = useMemo(() => fechaHoyISO(), []);

  // Selector global de período
  const [ingresoMes, setIngresoMes] = useState<number>(() => hoy.getMonth());
  const [ingresoAnio, setIngresoAnio] = useState<number>(() => hoy.getFullYear());

  // Estado del Sueldo del Mes seleccionado
  const [ingresoModo, setIngresoModo] = useState<'quincenal' | 'mensual'>('quincenal');
  const [ingresoMomentoMensual, setIngresoMomentoMensual] = useState<'quincena' | 'fin_mes'>('fin_mes');
  const [ingresoS15, setIngresoS15] = useState<string>('0');
  const [ingresoS30, setIngresoS30] = useState<string>('0');
  const [ingresoAplicarAnio, setIngresoAplicarAnio] = useState<boolean>(false);
  const [guardandoSueldo, setGuardandoSueldo] = useState<boolean>(false);
  const [mensajeSueldo, setMensajeSueldo] = useState<string | null>(null);

  // Modal para confirmar cobro (Etapa 5)
  const [pagoObjetivo, setPagoObjetivo] = useState<ObjetivoPago | null>(null);

  // Modal de Crear Ingreso Programado
  const [modalNuevoIngreso, setModalNuevoIngreso] = useState<boolean>(false);
  const [nuevoDesc, setNuevoDesc] = useState<string>('');
  const [nuevoMonto, setNuevoMonto] = useState<string>('');
  const [nuevoDia, setNuevoDia] = useState<string>('15');
  const [nuevoCatId, setNuevoCatId] = useState<number | ''>('');
  const [nuevoMesInicio, setNuevoMesInicio] = useState<number>(() => hoy.getMonth());
  const [nuevoAnioInicio, setNuevoAnioInicio] = useState<number>(() => hoy.getFullYear());
  const [guardandoNuevo, setGuardandoNuevo] = useState<boolean>(false);

  // Modal de Editar Ingreso Programado
  const [modalEditarIngreso, setModalEditarIngreso] = useState<boolean>(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState<string>('');
  const [editMonto, setEditMonto] = useState<string>('');
  const [editDia, setEditDia] = useState<string>('15');
  const [editCatId, setEditCatId] = useState<number | ''>('');
  const [editMesInicio, setEditMesInicio] = useState<number>(() => hoy.getMonth());
  const [editAnioInicio, setEditAnioInicio] = useState<number>(() => hoy.getFullYear());
  const [guardandoEdicion, setGuardandoEdicion] = useState<boolean>(false);

  // Solicitudes idempotentes para Etapa 5
  const solicitudes = useRef(new Map<string, { datos: string; id: string }>());
  const solicitudPara = (accion: string, datos: unknown) => {
    const texto = JSON.stringify(datos);
    const previa = solicitudes.current.get(accion);
    if (previa && previa.datos === texto) return previa.id;
    const id = crypto.randomUUID();
    solicitudes.current.set(accion, { datos: texto, id });
    return id;
  };

  const abrirPago = (objetivo: Omit<ObjetivoPago, 'solicitud'>) => {
    setPagoObjetivo({ ...objetivo, solicitud: crypto.randomUUID() });
  };

  // Cargar sueldo del mes seleccionado
  useEffect(() => {
    const reg = sueldos.find((s) => s.anio === ingresoAnio && s.mes === ingresoMes);
    const s15 = reg ? reg.sueldo_15 : 0;
    const s30 = reg ? reg.sueldo_30 : 0;
    setIngresoS15(String(s15));
    setIngresoS30(String(s30));
    if (s15 > 0 && s30 === 0) {
      setIngresoModo('mensual');
      setIngresoMomentoMensual('quincena');
    } else if (s15 === 0 && s30 > 0) {
      setIngresoModo('mensual');
      setIngresoMomentoMensual('fin_mes');
    } else {
      setIngresoModo('quincenal');
    }
    setIngresoAplicarAnio(false);
  }, [sueldos, ingresoMes, ingresoAnio]);

  // Otros ingresos programados en el mes
  const otrosIngresosMes = useMemo(() => {
    const prefijo = `${ingresoAnio}-${String(ingresoMes + 1).padStart(2, '0')}`;
    return recurrentes
      .filter((r) => r.tipo === 'ingreso' && recurrenteAplicaEnMes(r, ingresoAnio, ingresoMes))
      .map((r) => {
        const mov = movimientos.find(
          (m) => m.recurrente_id === r.id && m.fecha.startsWith(prefijo)
        );
        const recibido = mov ? mov.pago_confirmado : false;
        return {
          id: r.id,
          rec: r,
          descripcion: r.descripcion,
          monto: r.monto,
          dia: r.dia_pago,
          recibido,
          movimientoId: mov?.id,
          fecha: mov ? mov.fecha : `${prefijo}-${String(r.dia_pago).padStart(2, '0')}`,
          categoriaId: r.categoria_id,
        };
      });
  }, [recurrentes, movimientos, ingresoAnio, ingresoMes]);

  const totalSueldoMesIngresos = useMemo(() => {
    const reg = sueldos.find((s) => s.anio === ingresoAnio && s.mes === ingresoMes);
    return reg ? reg.sueldo_15 + reg.sueldo_30 : 0;
  }, [sueldos, ingresoAnio, ingresoMes]);

  const totalSueldoAnioIngresos = useMemo(() => {
    return sueldos
      .filter((s) => s.anio === ingresoAnio)
      .reduce((acc, s) => acc + s.sueldo_15 + s.sueldo_30, 0);
  }, [sueldos, ingresoAnio]);

  const mesesConfiguradosAnio = useMemo(() => {
    return sueldos.filter((s) => s.anio === ingresoAnio && s.sueldo_15 + s.sueldo_30 > 0).length;
  }, [sueldos, ingresoAnio]);

  const sueldoGuardado = sueldos.find((s) => s.anio === ingresoAnio && s.mes === ingresoMes);

  // Form guard para advertir sobre sueldos no guardados
  useWalletFormGuard(
    Number(ingresoS15) !== (sueldoGuardado?.sueldo_15 || 0) ||
      Number(ingresoS30) !== (sueldoGuardado?.sueldo_30 || 0) ||
      ingresoAplicarAnio,
    'Sueldos sin guardar'
  );

  // Sueldo reactivo en tiempo real
  const sueldoMesCalculado = useMemo(() => {
    if (ingresoModo === 'quincenal') {
      const s15 = Math.max(0, parseFloat(ingresoS15) || 0);
      const s30 = Math.max(0, parseFloat(ingresoS30) || 0);
      return s15 + s30;
    } else {
      if (ingresoMomentoMensual === 'quincena') {
        return Math.max(0, parseFloat(ingresoS15 || ingresoS30) || 0);
      } else {
        return Math.max(0, parseFloat(ingresoS30 || ingresoS15) || 0);
      }
    }
  }, [ingresoModo, ingresoMomentoMensual, ingresoS15, ingresoS30]);

  const totalOtrosIngresosMes = useMemo(() => {
    return otrosIngresosMes.reduce((acc, i) => acc + i.monto, 0);
  }, [otrosIngresosMes]);

  const totalIngresosEsperadosMes = sueldoMesCalculado + totalOtrosIngresosMes;

  const totalCobradoOtros = useMemo(() => {
    return otrosIngresosMes.filter((i) => i.recibido).reduce((acc, i) => acc + i.monto, 0);
  }, [otrosIngresosMes]);

  const totalCobradoMes = useMemo(() => {
    const diaHoy = hoy.getDate();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    let sueldoCobrado = 0;
    if (ingresoAnio < anioActual || (ingresoAnio === anioActual && ingresoMes < mesActual)) {
      sueldoCobrado = totalSueldoMesIngresos;
    } else if (ingresoAnio === anioActual && ingresoMes === mesActual) {
      const reg = sueldos.find((s) => s.anio === ingresoAnio && s.mes === ingresoMes);
      const s15 = reg?.sueldo_15 || 0;
      const s30 = reg?.sueldo_30 || 0;
      if (diaHoy >= 15) sueldoCobrado += s15;
      const ultimoDia = new Date(anioActual, mesActual + 1, 0).getDate();
      if (diaHoy >= ultimoDia) sueldoCobrado += s30;
    }
    return sueldoCobrado + totalCobradoOtros;
  }, [ingresoAnio, ingresoMes, hoy, totalSueldoMesIngresos, sueldos, totalCobradoOtros]);

  const totalPendienteMes = Math.max(0, totalIngresosEsperadosMes - totalCobradoMes);
  const porcentajeCobrado =
    totalIngresosEsperadosMes > 0
      ? Math.min(100, Math.round((totalCobradoMes / totalIngresosEsperadosMes) * 100))
      : 0;

  const hayCambiosSueldo = useMemo(() => {
    const s15Guardado = sueldoGuardado?.sueldo_15 || 0;
    const s30Guardado = sueldoGuardado?.sueldo_30 || 0;
    const s15Actual = Math.max(0, parseFloat(ingresoS15) || 0);
    const s30Actual = Math.max(0, parseFloat(ingresoS30) || 0);
    return s15Actual !== s15Guardado || s30Actual !== s30Guardado || ingresoAplicarAnio;
  }, [sueldoGuardado, ingresoS15, ingresoS30, ingresoAplicarAnio]);

  const cambiarMesIngreso = (delta: number) => {
    let nuevoMes = ingresoMes + delta;
    let nuevoAnio = ingresoAnio;
    if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAnio += 1;
    } else if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio -= 1;
    }
    setIngresoMes(nuevoMes);
    setIngresoAnio(nuevoAnio);
  };

  const irMesActualIngreso = () => {
    setIngresoMes(hoy.getMonth());
    setIngresoAnio(hoy.getFullYear());
  };

  // Guardar sueldo
  const handleGuardarSueldo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardandoSueldo(true);
      let s15 = 0;
      let s30 = 0;
      if (ingresoModo === 'quincenal') {
        s15 = Math.max(0, parseFloat(ingresoS15) || 0);
        s30 = Math.max(0, parseFloat(ingresoS30) || 0);
      } else {
        if (ingresoMomentoMensual === 'quincena') {
          s15 = Math.max(0, parseFloat(ingresoS15 || ingresoS30) || 0);
          s30 = 0;
        } else {
          s15 = 0;
          s30 = Math.max(0, parseFloat(ingresoS30 || ingresoS15) || 0);
        }
      }

      let ok = false;
      if (ingresoAplicarAnio) {
        ok = await guardarSueldoAnual(ingresoAnio, ingresoMes, s15, s30);
      } else {
        ok = await guardarSueldoMes(ingresoAnio, ingresoMes, s15, s30);
      }

      if (ok) {
        setMensajeSueldo(
          ingresoAplicarAnio
            ? `Sueldo guardado de ${NOMBRES_MESES[ingresoMes]} a Diciembre ${ingresoAnio}`
            : `Sueldo de ${NOMBRES_MESES[ingresoMes]} actualizado`
        );
        setTimeout(() => setMensajeSueldo(null), 3000);
      }
    } catch (error) {
      reportarError(error);
    } finally {
      setGuardandoSueldo(false);
    }
  };

  // Crear nuevo ingreso fijo
  const handleGuardarNuevoIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nuevoDesc.trim()) return;
    const montoNum = parseFloat(nuevoMonto);
    if (isNaN(montoNum) || montoNum <= 0) return;
    const diaNum = Math.min(31, Math.max(1, parseInt(nuevoDia, 10) || 1));
    const periodoInicio = `${nuevoAnioInicio}-${String(nuevoMesInicio + 1).padStart(2, '0')}`;

    try {
      setGuardandoNuevo(true);
      limpiarError();
      if (soporteEtapa5) {
        const datos = {
          descripcion: nuevoDesc.trim(),
          monto: montoNum,
          dia_pago: diaNum,
          tipo: 'ingreso',
          categoria_id: nuevoCatId === '' ? null : Number(nuevoCatId),
          periodo_inicio: periodoInicio,
        };
        await ejecutarOperacion('crear_recurrente', datos, solicitudPara('crear_recurrente', datos));
      } else {
        await clienteBilletera.from('movimientos_recurrentes').insert({
          user_id: user.id,
          tipo: 'ingreso',
          descripcion: nuevoDesc.trim(),
          monto: montoNum,
          dia_pago: diaNum,
          categoria_id: nuevoCatId === '' ? null : Number(nuevoCatId),
          periodos: periodoInicio,
          tipo_recurrencia: 'mensual',
        });
        await recargarTodo();
      }

      setModalNuevoIngreso(false);
      setNuevoDesc('');
      setNuevoMonto('');
      setNuevoDia('15');
      setNuevoCatId('');
      toastExito('Ingreso programado creado');
    } catch (error) {
      reportarError(error);
    } finally {
      setGuardandoNuevo(false);
    }
  };

  // Abrir modal de edición de ingreso
  const handleAbrirEdicion = (rec: MovimientoRecurrente) => {
    const inicio = obtenerMesInicioRecurrente(rec, hoy.getFullYear(), hoy.getMonth());
    setEditId(rec.id);
    setEditDesc(rec.descripcion);
    setEditMonto(String(rec.monto));
    setEditDia(String(rec.dia_pago));
    setEditCatId(rec.categoria_id ?? '');
    setEditMesInicio(inicio.mes);
    setEditAnioInicio(inicio.anio);
    setModalEditarIngreso(true);
  };

  // Guardar edición
  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editId || !editDesc.trim()) return;
    const montoNum = parseFloat(editMonto);
    if (isNaN(montoNum) || montoNum <= 0) return;
    const diaNum = Math.min(31, Math.max(1, parseInt(editDia, 10) || 1));
    const periodoInicio = `${editAnioInicio}-${String(editMesInicio + 1).padStart(2, '0')}`;

    try {
      setGuardandoEdicion(true);
      limpiarError();
      if (soporteEtapa5) {
        const datos = {
          recurrente_id: editId,
          descripcion: editDesc.trim(),
          monto: montoNum,
          dia_pago: diaNum,
          periodo_inicio: periodoInicio,
          categoria_id: editCatId === '' ? null : Number(editCatId),
        };
        await ejecutarOperacion('editar_recurrente', datos, solicitudPara('editar_recurrente', datos));
      } else {
        await clienteBilletera
          .from('movimientos_recurrentes')
          .update({
            tipo: 'ingreso',
            descripcion: editDesc.trim(),
            monto: montoNum,
            dia_pago: diaNum,
            categoria_id: editCatId === '' ? null : Number(editCatId),
            periodos: periodoInicio,
          })
          .eq('id', editId)
          .eq('user_id', user.id);
        await recargarTodo();
      }

      setModalEditarIngreso(false);
      toastExito('Ingreso programado actualizado');
    } catch (error) {
      reportarError(error);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Eliminar ingreso programado
  const handleEliminarIngreso = async (item: { id: number; descripcion: string }) => {
    if (!user) return;
    const confirmado = await confirmarAccion({
      title: '¿Eliminar ingreso programado?',
      text: `Se borrará "${item.descripcion}" y todas sus ocurrencias programadas.`,
      confirmButtonText: 'Sí, eliminar',
    });
    if (!confirmado) return;

    try {
      if (soporteEtapa5) {
        const datos = { recurrente_id: item.id };
        await ejecutarOperacion('retirar_recurrente', datos, solicitudPara('retirar_recurrente', datos));
        toastExito('Ingreso retirado. Se conserva el historial.');
        return;
      }
      await clienteBilletera.from('movimientos_recurrentes').delete().eq('id', item.id).eq('user_id', user.id);
      await clienteBilletera.from('movimientos_agenda').delete().eq('recurrente_id', item.id).eq('user_id', user.id);
      await recargarTodo();
      toastExito('Ingreso eliminado');
    } catch (error) {
      reportarError(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Principal del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Sueldos e Ingresos
                </h1>
                {billeteraActual && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                    <Wallet className="w-3 h-3 text-teal-600" />
                    <span>{billeteraActual.nombre}</span>
                    <span className="text-teal-400">·</span>
                    <span>{MONEDAS[billeteraActual.moneda]?.simbolo || 'S/'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Gestiona tu sueldo quincenal o mensual y tus ingresos recurrentes adicionales.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={soloLectura}
          onClick={() => {
            setNuevoMesInicio(ingresoMes);
            setNuevoAnioInicio(ingresoAnio);
            setModalNuevoIngreso(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Ingreso Fijo</span>
        </button>
      </div>

      {/* 2. Barra de Contexto: Selector Global de Período */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Período en consulta
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => cambiarMesIngreso(-1)}
                title="Mes anterior"
                className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                {NOMBRES_MESES[ingresoMes]} {ingresoAnio}
              </span>
              <button
                type="button"
                onClick={() => cambiarMesIngreso(1)}
                title="Mes siguiente"
                className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Chips de apoyo y botón mes actual */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              ingresoMes === hoy.getMonth() && ingresoAnio === hoy.getFullYear()
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                ingresoMes === hoy.getMonth() && ingresoAnio === hoy.getFullYear()
                  ? 'bg-emerald-500'
                  : 'bg-slate-400'
              }`}
            />
            <span>
              {ingresoMes === hoy.getMonth() && ingresoAnio === hoy.getFullYear()
                ? 'Mes en curso'
                : 'Mes proyectado'}
            </span>
          </span>
          <button
            type="button"
            onClick={irMesActualIngreso}
            className="px-2.5 py-1 rounded-xl text-xs font-bold text-slate-600 hover:text-teal-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>Ir al mes actual</span>
          </button>
        </div>
      </div>

      {/* 3. Hero Metrics: Ecuación Financiera del Mes */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4">
        {/* Tarjeta Destacada: Total Ingresos del Mes */}
        <div className="sm:col-span-6 bg-gradient-to-br from-teal-900 via-slate-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-teal-500/10 blur-xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-teal-300">
                Total Ingresos Esperados
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black tracking-tight">
                  {formatearMoneda(totalIngresosEsperadosMes)}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Sueldo (
                <span className="font-semibold text-white">
                  {formatearMoneda(sueldoMesCalculado)}
                </span>
                ) + Otros (
                <span className="font-semibold text-white">
                  {formatearMoneda(totalOtrosIngresosMes)}
                </span>
                )
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          {/* Barra de progreso de cobro */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 relative z-10">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-slate-400">
                Cobrado:{' '}
                <strong className="text-emerald-400 font-bold">
                  {formatearMoneda(totalCobradoMes)}
                </strong>{' '}
                ({porcentajeCobrado}%)
              </span>
              <span className="text-slate-400">
                Falta:{' '}
                <strong className="text-amber-300 font-bold">
                  {formatearMoneda(totalPendienteMes)}
                </strong>
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${porcentajeCobrado}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Modalidad y Fechas Clave */}
        <div className="sm:col-span-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Esquema de Sueldo
            </span>
            <strong className="text-base sm:text-lg font-extrabold text-slate-900 block mt-1">
              {ingresoModo === 'quincenal' ? 'Quincenal (2 Pagos)' : 'Mensual (1 Pago)'}
            </strong>
            <p className="text-xs text-slate-500 mt-1">
              {ingresoModo === 'quincenal'
                ? `Día 15 (${formatearMoneda(parseFloat(ingresoS15) || 0)}) y Fin de mes (${formatearMoneda(parseFloat(ingresoS30) || 0)})`
                : ingresoMomentoMensual === 'fin_mes'
                ? `Fin de mes (${formatearMoneda(parseFloat(ingresoS30 || ingresoS15) || 0)})`
                : `Quincena (${formatearMoneda(parseFloat(ingresoS15 || ingresoS30) || 0)})`}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Próximo cobro:</span>
            <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
              {ingresoModo === 'quincenal'
                ? hoy.getDate() < 15
                  ? '15 de ' + NOMBRES_MESES[ingresoMes]
                  : 'Fin de mes'
                : ingresoMomentoMensual === 'fin_mes'
                ? 'Fin de mes'
                : '15 de ' + NOMBRES_MESES[ingresoMes]}
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Cobertura Anual */}
        <div className="sm:col-span-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Sueldos Año {ingresoAnio}
            </span>
            <strong className="text-base sm:text-lg font-extrabold text-slate-900 block mt-1">
              {formatearMoneda(totalSueldoAnioIngresos)}
            </strong>
            <p className="text-xs text-slate-500 mt-1">
              {mesesConfiguradosAnio} de 12 meses configurados
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Planificación:</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              {Math.round((mesesConfiguradosAnio / 12) * 100)}% Cubierto
            </span>
          </div>
        </div>
      </div>

      {/* 4. Sección Principal: 2 Columnas (Configurador de Sueldo vs Otros Ingresos) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Columna Izquierda: Configurador de Sueldo del Mes */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header de la tarjeta */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Configuración de Sueldo
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configura cómo cobras en{' '}
                    <strong className="text-slate-800">
                      {NOMBRES_MESES[ingresoMes]} {ingresoAnio}
                    </strong>
                  </p>
                </div>
              </div>
              {/* Estado de guardado en vivo */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  hayCambiosSueldo
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {hayCambiosSueldo ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>Sin guardar</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Guardado</span>
                  </>
                )}
              </span>
            </div>

            {/* Formulario */}
            <form id="form-sueldo-mes" onSubmit={handleGuardarSueldo} className="mt-4 space-y-4">
              {/* Selector de Modalidad */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Modalidad de cobro
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setIngresoModo('quincenal')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      ingresoModo === 'quincenal'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2 Pagos (Quincenal)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIngresoModo('mensual')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      ingresoModo === 'mensual'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1 Pago Mensual
                  </button>
                </div>
              </div>

              {/* Sub-opción para Pago Mensual */}
              {ingresoModo === 'mensual' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ¿En qué fecha se acredita tu sueldo?
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIngresoMomentoMensual('fin_mes')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        ingresoMomentoMensual === 'fin_mes'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Fin de mes (Día 30/31)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIngresoMomentoMensual('quincena')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        ingresoMomentoMensual === 'quincena'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Quincena (Día 15)
                    </button>
                  </div>
                </div>
              )}

              {/* Inputs numéricos con diseño tipo Tarjeta */}
              {ingresoModo === 'quincenal' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">1er Pago · Día 15</span>
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                        Quincena
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-400">{simboloMoneda}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ingresoS15}
                        onChange={(e) => setIngresoS15(e.target.value)}
                        className="w-full bg-transparent text-base font-extrabold text-slate-900 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">2do Pago · Fin de mes</span>
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                        Día 30/31
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-400">{simboloMoneda}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ingresoS30}
                        onChange={(e) => setIngresoS30(e.target.value)}
                        className="w-full bg-transparent text-base font-extrabold text-slate-900 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">
                        {ingresoMomentoMensual === 'fin_mes'
                          ? 'Sueldo de Fin de mes'
                          : 'Sueldo de Quincena (Día 15)'}
                      </span>
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                        Pago Único
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-400">{simboloMoneda}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ingresoMomentoMensual === 'fin_mes' ? ingresoS30 : ingresoS15}
                        onChange={(e) => {
                          if (ingresoMomentoMensual === 'fin_mes') {
                            setIngresoS30(e.target.value);
                          } else {
                            setIngresoS15(e.target.value);
                          }
                        }}
                        className="w-full bg-transparent text-base font-extrabold text-slate-900 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen visual del sueldo resultante */}
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-xs font-bold text-teal-900">Sueldo Total del Mes:</span>
                </div>
                <strong className="text-sm font-black text-teal-900">
                  {formatearMoneda(sueldoMesCalculado)}
                </strong>
              </div>

              {/* Checkbox de propagación anual */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={ingresoAplicarAnio}
                  onChange={(e) => setIngresoAplicarAnio(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
                />
                <div className="text-xs leading-relaxed text-slate-600">
                  <strong className="text-slate-800 block">
                    Aplicar a todos los meses restantes del año {ingresoAnio}
                  </strong>
                  Copia esta misma configuración de cobro para los siguientes meses en un solo clic.
                </div>
              </label>
            </form>
          </div>

          {/* Footer de acciones */}
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              {mensajeSueldo ? (
                <strong className="text-emerald-600">{mensajeSueldo}</strong>
              ) : hayCambiosSueldo ? (
                'Presiona Guardar para aplicar cambios'
              ) : (
                'Configuración sincronizada'
              )}
            </span>
            <button
              type="submit"
              form="form-sueldo-mes"
              disabled={soloLectura || guardandoSueldo}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-2 ml-auto"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{guardandoSueldo ? 'Guardando...' : 'Guardar Sueldo'}</span>
            </button>
          </div>
        </div>

        {/* Columna Derecha: Otros Ingresos Programados */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header con botón de acción destacado */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 gap-2">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  Otros Ingresos Programados
                </h2>
                <p className="text-xs text-slate-500 truncate">
                  Ingresos recurrentes adicionales en{' '}
                  <span className="font-semibold text-slate-700">
                    {NOMBRES_MESES[ingresoMes]}
                  </span>
                </p>
              </div>
              <button
                disabled={soloLectura}
                type="button"
                onClick={() => {
                  setNuevoMesInicio(ingresoMes);
                  setNuevoAnioInicio(ingresoAnio);
                  setModalNuevoIngreso(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Programar ingreso</span>
              </button>
            </div>

            {/* Contenido: Lista o Empty State */}
            {otrosIngresosMes.length === 0 ? (
              <div className="mt-4 text-center py-10 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Plus className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">
                  Sin ingresos adicionales este mes
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4 leading-relaxed">
                  Si tienes alquileres, freelance, rentas o dividendos fijos, regístralos para anticipar tu liquidez real.
                </p>
                <button
                  disabled={soloLectura}
                  type="button"
                  onClick={() => {
                    setNuevoMesInicio(ingresoMes);
                    setNuevoAnioInicio(ingresoAnio);
                    setModalNuevoIngreso(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-all"
                >
                  <span>+ Programar primer ingreso fijo</span>
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {otrosIngresosMes.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-2xs"
                  >
                    {/* Nivel 1: Datos principales y Monto */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-sm font-extrabold text-slate-900">
                            {item.descripcion}
                          </strong>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.recibido
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.recibido ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            <span>{item.recibido ? 'Cobrado' : 'Por cobrar'}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Día {item.dia} de cada mes
                          </span>
                          <span>•</span>
                          <span className="text-slate-400">Fecha: {item.fecha}</span>
                        </div>
                      </div>
                      <strong className="text-base font-black text-emerald-600 shrink-0">
                        +{formatearMoneda(item.monto)}
                      </strong>
                    </div>

                    {/* Nivel 2: Acciones táctiles */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      {!item.recibido ? (
                        <button
                          disabled={soloLectura}
                          type="button"
                          onClick={async () => {
                            try {
                              if (soporteEtapa5) {
                                abrirPago({
                                  nombre: item.descripcion,
                                  monto: item.monto,
                                  vencimiento: item.fecha,
                                  recurrenteId: item.id,
                                });
                                return;
                              }
                              await clienteBilletera.from('movimientos_agenda').insert({
                                user_id: user!.id,
                                tipo: 'ingreso',
                                descripcion: item.descripcion,
                                monto: item.monto,
                                fecha: item.fecha,
                                es_recurrente: true,
                                recurrente_id: item.id,
                                pago_confirmado: true,
                                fecha_pago: fechaHoyStr,
                              });
                              await recargarTodo();
                              toastExito('Ingreso confirmado');
                            } catch (error) {
                              reportarError(error);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          <span>Confirmar Cobro</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Impacto reflejado en tu saldo
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 ml-auto">
                        {item.recibido && item.movimientoId && (
                          <button
                            disabled={soloLectura}
                            type="button"
                            onClick={async () => {
                              try {
                                await clienteBilletera
                                  .from('movimientos_agenda')
                                  .delete()
                                  .eq('id', item.movimientoId!)
                                  .eq('user_id', user!.id);
                                await recargarTodo();
                                toastExito('Ingreso desmarcado');
                              } catch (error) {
                                reportarError(error);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Desmarcar
                          </button>
                        )}

                        <button
                          disabled={soloLectura}
                          type="button"
                          onClick={() => handleAbrirEdicion(item.rec)}
                          title="Editar ingreso programado"
                          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          disabled={soloLectura}
                          type="button"
                          onClick={() => handleEliminarIngreso(item)}
                          title="Eliminar ingreso programado"
                          className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer informativo */}
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Cobro automático recurrente mensual</span>
            <span className="font-semibold text-slate-600">
              {otrosIngresosMes.length} programado(s)
            </span>
          </div>
        </div>
      </div>

      {/* Modal: Confirmar Pago / Cobro (RegistrarPagoModal) */}
      {pagoObjetivo && (
        <RegistrarPagoModal
          key={pagoObjetivo.solicitud}
          objetivo={pagoObjetivo}
          onClose={() => setPagoObjetivo(null)}
        />
      )}

      {/* Modal: Crear Nuevo Ingreso Programado */}
      <AnimatedModal open={modalNuevoIngreso} label="Nuevo Ingreso Programado">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
          {errorBilletera && (
            <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
              {errorBilletera}
            </p>
          )}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold">Programar Ingreso Fijo</h3>
            </div>
            <button
              disabled={soloLectura}
              onClick={() => setModalNuevoIngreso(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleGuardarNuevoIngreso} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Descripción del Ingreso
              </label>
              <input
                type="text"
                required
                value={nuevoDesc}
                onChange={(e) => setNuevoDesc(e.target.value)}
                placeholder="Ej. Alquiler Cochera, Clases Particulares, Dividendos"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Monto Mensual ({simboloMoneda})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={nuevoMonto}
                  onChange={(e) => setNuevoMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Día de Cobro (1-31)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={nuevoDia}
                  onChange={(e) => setNuevoDia(e.target.value)}
                  placeholder="15"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Categoría (Opcional)
              </label>
              <select
                value={nuevoCatId}
                onChange={(e) => setNuevoCatId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 bg-white"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icono} {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <span>Se programará a partir de: </span>
              <strong className="text-slate-800">
                {NOMBRES_MESES[nuevoMesInicio]} {nuevoAnioInicio}
              </strong>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalNuevoIngreso(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoNuevo || soloLectura}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer transition-colors"
              >
                {guardandoNuevo ? 'Guardando...' : 'Crear Ingreso'}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>

      {/* Modal: Editar Ingreso Programado */}
      <AnimatedModal open={modalEditarIngreso} label="Editar Ingreso Programado">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
          {errorBilletera && (
            <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
              {errorBilletera}
            </p>
          )}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                <Edit2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold">Editar Ingreso Programado</h3>
            </div>
            <button
              disabled={soloLectura}
              onClick={() => setModalEditarIngreso(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleGuardarEdicion} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Descripción del Ingreso
              </label>
              <input
                type="text"
                required
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Monto Mensual ({simboloMoneda})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editMonto}
                  onChange={(e) => setEditMonto(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Día de Cobro (1-31)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={editDia}
                  onChange={(e) => setEditDia(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Categoría (Opcional)
              </label>
              <select
                value={editCatId}
                onChange={(e) => setEditCatId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 bg-white"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icono} {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalEditarIngreso(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoEdicion || soloLectura}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer transition-colors"
              >
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>
    </div>
  );
};

