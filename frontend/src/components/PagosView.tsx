import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import {
  NOMBRES_MESES,
  formatearMoneda,
  obtenerUltimoDiaMes,
  fechaHoyISO,
} from '../types/wallet';
import type { MovimientoRecurrente, DeudaCuota } from '../types/wallet';
import {
  CalendarCheck,
  Repeat,
  CreditCard,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  X,
  ChevronDown,
} from 'lucide-react';

type SubTabPagos = 'agenda' | 'recurrentes' | 'deudas';

export const PagosView: React.FC = () => {
  const { user } = useAuth();
  const {
    categorias,
    recurrentes,
    movimientos,
    deudas,
    cuotas,
    pagosDeuda,
    recargarTodo,
  } = useWallet();

  const hoy = new Date();
  const [subTab, setSubTab] = useState<SubTabPagos>('agenda');

  // Filtros de Agenda Mensual
  const [agendaMes, setAgendaMes] = useState<number>(hoy.getMonth());
  const [agendaAnio, setAgendaAnio] = useState<number>(hoy.getFullYear());
  const [agendaEstado, setAgendaEstado] = useState<'todos' | 'pendientes' | 'confirmados'>('todos');
  const [procesandoPagoId, setProcesandoPagoId] = useState<string | null>(null);

  // Estado Modal Plantilla Recurrente
  const [modalRecAbierto, setModalRecAbierto] = useState<boolean>(false);
  const [recEditId, setRecEditId] = useState<number | null>(null);
  const [recTipo, setRecTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [recDesc, setRecDesc] = useState<string>('');
  const [recMonto, setRecMonto] = useState<string>('');
  const [recDia, setRecDia] = useState<string>('15');
  const [recCatId, setRecCatId] = useState<number | ''>('');
  const [guardandoRec, setGuardandoRec] = useState<boolean>(false);

  // Estado Modal Nueva Deuda / Cronograma en Cuotas
  const [modalDeudaAbierto, setModalDeudaAbierto] = useState<boolean>(false);
  const [deudaNombre, setDeudaNombre] = useState<string>('');
  const [deudaMontoRecibido, setDeudaMontoRecibido] = useState<string>('');
  const [deudaCatId, setDeudaCatId] = useState<number | ''>('');
  const [numCuotas, setNumCuotas] = useState<string>('6');
  const [montoCuota, setMontoCuota] = useState<string>('');
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState<string>(fechaHoyISO());
  const [guardandoDeuda, setGuardandoDeuda] = useState<boolean>(false);
  const [deudasExpandidas, setDeudasExpandidas] = useState<Record<number, boolean>>({});

  const mapaCategorias = useMemo(() => {
    const map = new Map<number, { nombre: string; color: string }>();
    categorias.forEach((c) => map.set(c.id, { nombre: c.nombre, color: c.color }));
    return map;
  }, [categorias]);

  // Construir los ítems de la Agenda del Mes seleccionado
  const itemsAgendaMes = useMemo(() => {
    const ultimoDia = obtenerUltimoDiaMes(agendaAnio, agendaMes);
    const prefijo = `${agendaAnio}-${String(agendaMes + 1).padStart(2, '0')}`;

    const lista: {
      uid: string;
      origen: 'recurrente' | 'cuota';
      titulo: string;
      subtitulo: string;
      fecha: string;
      dia: number;
      monto: number;
      tipo: 'gasto' | 'ingreso';
      confirmado: boolean;
      categoriaNombre: string;
      categoriaColor: string;
      recurrenteRef?: MovimientoRecurrente;
      movimientoExistenteId?: number;
      cuotaRef?: DeudaCuota;
    }[] = [];

    // 1. Evaluar cada plantilla recurrente para este mes
    recurrentes.forEach((rec) => {
      const diaReal = Math.min(rec.dia_pago, ultimoDia);
      const fechaEsperada = `${prefijo}-${String(diaReal).padStart(2, '0')}`;
      const movAsociado = movimientos.find(
        (m) => m.recurrente_id === rec.id && m.fecha.startsWith(prefijo)
      );
      const confirmado = movAsociado ? movAsociado.pago_confirmado : false;
      const cat = rec.categoria_id ? mapaCategorias.get(rec.categoria_id) : undefined;

      lista.push({
        uid: `rec-${rec.id}`,
        origen: 'recurrente',
        titulo: rec.descripcion,
        subtitulo: `Fijo mensual · Día ${diaReal}`,
        fecha: movAsociado ? movAsociado.fecha : fechaEsperada,
        dia: diaReal,
        monto: movAsociado ? movAsociado.monto : rec.monto,
        tipo: rec.tipo,
        confirmado,
        categoriaNombre: cat ? cat.nombre : 'Servicios',
        categoriaColor: cat ? cat.color : '#3498db',
        recurrenteRef: rec,
        movimientoExistenteId: movAsociado?.id,
      });
    });

    // 2. Evaluar cuotas de deuda que caen en este mes
    cuotas
      .filter((c) => c.fecha && c.fecha.startsWith(prefijo))
      .forEach((c) => {
        const deuda = deudas.find((d) => d.id === c.deuda_id);
        const totalCuotas = cuotas.filter((q) => q.deuda_id === c.deuda_id).length;
        const pagado = pagosDeuda
          .filter((p) => p.cuota_id === c.id)
          .reduce((acc, p) => acc + p.monto, 0);
        const pendiente = Math.round((c.monto - pagado) * 100) / 100;
        const confirmado = pendiente <= 0.009;
        const cat = deuda?.categoria_id ? mapaCategorias.get(deuda.categoria_id) : undefined;
        const dia = Number(c.fecha.split('-')[2]) || 1;

        lista.push({
          uid: `cuota-${c.id}`,
          origen: 'cuota',
          titulo: deuda ? deuda.nombre : `Deuda #${c.deuda_id}`,
          subtitulo: `Cuota ${c.numero}/${totalCuotas}`,
          fecha: c.fecha,
          dia,
          monto: confirmado ? c.monto : pendiente,
          tipo: 'gasto',
          confirmado,
          categoriaNombre: cat ? cat.nombre : 'Deudas',
          categoriaColor: cat ? cat.color : '#e74c3c',
          cuotaRef: c,
        });
      });

    return lista
      .filter((item) => {
        if (agendaEstado === 'pendientes') return !item.confirmado;
        if (agendaEstado === 'confirmados') return item.confirmado;
        return true;
      })
      .sort((a, b) => a.dia - b.dia);
  }, [
    agendaAnio,
    agendaMes,
    agendaEstado,
    recurrentes,
    movimientos,
    cuotas,
    deudas,
    pagosDeuda,
    mapaCategorias,
  ]);

  // Confirmar o desconfirmar ítem desde la Agenda
  const handleAccionAgenda = async (item: (typeof itemsAgendaMes)[number]) => {
    if (!user) return;
    setProcesandoPagoId(item.uid);
    try {
      if (item.origen === 'recurrente' && item.recurrenteRef) {
        if (item.movimientoExistenteId) {
          const nuevoEstado = !item.confirmado;
          await supabase
            .from('movimientos_agenda')
            .update({
              pago_confirmado: nuevoEstado,
              fecha_pago: nuevoEstado ? fechaHoyISO() : null,
            })
            .eq('id', item.movimientoExistenteId)
            .eq('user_id', user.id);
        } else {
          await supabase.from('movimientos_agenda').insert({
            user_id: user.id,
            tipo: item.recurrenteRef.tipo,
            descripcion: item.recurrenteRef.descripcion,
            monto: item.recurrenteRef.monto,
            fecha: item.fecha,
            categoria_id: item.recurrenteRef.categoria_id,
            es_recurrente: true,
            recurrente_id: item.recurrenteRef.id,
            pago_confirmado: true,
            fecha_pago: fechaHoyISO(),
          });
        }
      } else if (item.origen === 'cuota' && item.cuotaRef) {
        if (!item.confirmado) {
          const deuda = deudas.find((d) => d.id === item.cuotaRef!.deuda_id);
          // 1. Insertar movimiento en agenda
          const { data: movData } = await supabase
            .from('movimientos_agenda')
            .insert({
              user_id: user.id,
              tipo: 'gasto',
              descripcion: `${deuda ? deuda.nombre : 'Deuda'} - Cuota #${item.cuotaRef.numero}`,
              monto: item.monto,
              fecha: fechaHoyISO(),
              categoria_id: deuda?.categoria_id ?? null,
              es_recurrente: false,
              pago_confirmado: true,
              fecha_pago: fechaHoyISO(),
            })
            .select('id')
            .single();

          // 2. Registrar abono en deuda_pagos
          await supabase.from('deuda_pagos').insert({
            user_id: user.id,
            cuota_id: item.cuotaRef.id,
            monto: item.monto,
            fecha: fechaHoyISO(),
            movimiento_id: movData ? movData.id : null,
            solicitud: `pago-cuota-${item.cuotaRef.id}-${Date.now()}`,
          });
        }
      }
      await recargarTodo();
    } finally {
      setProcesandoPagoId(null);
    }
  };

  // CRUD Plantillas Recurrentes
  const abrirNuevaPlantilla = () => {
    setRecEditId(null);
    setRecTipo('gasto');
    setRecDesc('');
    setRecMonto('');
    setRecDia('15');
    setRecCatId(categorias[0]?.id ?? '');
    setModalRecAbierto(true);
  };

  const abrirEdicionPlantilla = (r: MovimientoRecurrente) => {
    setRecEditId(r.id);
    setRecTipo(r.tipo);
    setRecDesc(r.descripcion);
    setRecMonto(String(r.monto));
    setRecDia(String(r.dia_pago));
    setRecCatId(r.categoria_id ?? '');
    setModalRecAbierto(true);
  };

  const handleGuardarPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const montoNum = parseFloat(recMonto);
    const diaNum = Math.min(31, Math.max(1, parseInt(recDia, 10) || 1));
    if (!recDesc.trim() || isNaN(montoNum) || montoNum <= 0) return;

    setGuardandoRec(true);
    try {
      const payload = {
        user_id: user.id,
        tipo: recTipo,
        descripcion: recDesc.trim(),
        monto: montoNum,
        dia_pago: diaNum,
        categoria_id: recCatId === '' ? null : Number(recCatId),
        tipo_recurrencia: 'mensual' as const,
      };

      if (recEditId) {
        await supabase
          .from('movimientos_recurrentes')
          .update(payload)
          .eq('id', recEditId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('movimientos_recurrentes').insert(payload);
      }
      await recargarTodo();
      setModalRecAbierto(false);
    } finally {
      setGuardandoRec(false);
    }
  };

  const handleEliminarPlantilla = async (id: number) => {
    if (!user) return;
    if (!window.confirm('¿Deseas eliminar esta plantilla recurrente?')) return;
    await supabase.from('movimientos_recurrentes').delete().eq('id', id).eq('user_id', user.id);
    await recargarTodo();
  };

  // CRUD Deudas y Cuotas
  const handleCrearDeudaConCuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const nCuotas = Math.max(1, Math.min(120, parseInt(numCuotas, 10) || 1));
    const mCuota = parseFloat(montoCuota);
    const mRecibido = parseFloat(deudaMontoRecibido) || mCuota * nCuotas;

    if (!deudaNombre.trim() || isNaN(mCuota) || mCuota <= 0 || !fechaPrimeraCuota) return;

    setGuardandoDeuda(true);
    try {
      const { data: nuevaDeuda, error: errDeuda } = await supabase
        .from('deudas')
        .insert({
          user_id: user.id,
          nombre: deudaNombre.trim(),
          monto_recibido: mRecibido,
          categoria_id: deudaCatId === '' ? null : Number(deudaCatId),
        })
        .select('id')
        .single();

      if (errDeuda || !nuevaDeuda) return;

      // Generar las N cuotas mensuales a partir de fechaPrimeraCuota
      const [yBase, mBase, dBase] = fechaPrimeraCuota.split('-').map(Number);
      const cuotasInsert = [];

      for (let i = 0; i < nCuotas; i++) {
        const fechaTarget = new Date(yBase, mBase - 1 + i, 1);
        const anioT = fechaTarget.getFullYear();
        const mesT = fechaTarget.getMonth();
        const maxDia = obtenerUltimoDiaMes(anioT, mesT);
        const diaReal = Math.min(dBase, maxDia);
        const fechaStr = `${anioT}-${String(mesT + 1).padStart(2, '0')}-${String(diaReal).padStart(
          2,
          '0'
        )}`;

        cuotasInsert.push({
          user_id: user.id,
          deuda_id: nuevaDeuda.id,
          numero: i + 1,
          monto: mCuota,
          fecha: fechaStr,
        });
      }

      await supabase.from('deuda_cuotas').insert(cuotasInsert);
      await recargarTodo();
      setModalDeudaAbierto(false);
      setDeudaNombre('');
      setDeudaMontoRecibido('');
      setMontoCuota('');
    } finally {
      setGuardandoDeuda(false);
    }
  };

  const handlePagarCuotaDirecto = async (cuota: DeudaCuota, pendiente: number) => {
    if (!user || pendiente <= 0) return;
    setProcesandoPagoId(`cuota-direct-${cuota.id}`);
    try {
      const deuda = deudas.find((d) => d.id === cuota.deuda_id);
      const { data: movData } = await supabase
        .from('movimientos_agenda')
        .insert({
          user_id: user.id,
          tipo: 'gasto',
          descripcion: `${deuda ? deuda.nombre : 'Deuda'} - Cuota #${cuota.numero}`,
          monto: pendiente,
          fecha: fechaHoyISO(),
          categoria_id: deuda?.categoria_id ?? null,
          es_recurrente: false,
          pago_confirmado: true,
          fecha_pago: fechaHoyISO(),
        })
        .select('id')
        .single();

      await supabase.from('deuda_pagos').insert({
        user_id: user.id,
        cuota_id: cuota.id,
        monto: pendiente,
        fecha: fechaHoyISO(),
        movimiento_id: movData ? movData.id : null,
        solicitud: `pago-cuota-${cuota.id}-${Date.now()}`,
      });

      await recargarTodo();
    } finally {
      setProcesandoPagoId(null);
    }
  };

  const handleEliminarDeuda = async (id: number) => {
    if (!user) return;
    if (!window.confirm('¿Eliminar esta deuda y todas sus cuotas asociadas?')) return;
    await supabase.from('deudas').delete().eq('id', id).eq('user_id', user.id);
    await recargarTodo();
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Cabecera y Navegación de Píldoras (.payments-nav-pills en React) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            Pagos Programados y Compromisos
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Controla tu agenda mensual, pagos fijos recurrentes y cronogramas en cuotas
          </p>
        </div>

        {/* Píldoras de sub-navegación */}
        <div className="inline-flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 gap-1 self-start">
          <button
            onClick={() => setSubTab('agenda')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'agenda'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Agenda del Mes</span>
          </button>

          <button
            onClick={() => setSubTab('recurrentes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'recurrentes'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Repeat className="w-4 h-4" />
            <span>Plantillas Fijas ({recurrentes.length})</span>
          </button>

          <button
            onClick={() => setSubTab('deudas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'deudas'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Deudas y Cuotas ({deudas.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-VISTA 1: AGENDA MENSUAL */}
      {subTab === 'agenda' && (
        <div className="space-y-4">
          {/* Tarjeta de filtros de la agenda */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Mes
                </label>
                <select
                  value={agendaMes}
                  onChange={(e) => setAgendaMes(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  {NOMBRES_MESES.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Año
                </label>
                <select
                  value={agendaAnio}
                  onChange={(e) => setAgendaAnio(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1, hoy.getFullYear() + 2].map(
                    (a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Estado
                </label>
                <select
                  value={agendaEstado}
                  onChange={(e) =>
                    setAgendaEstado(e.target.value as 'todos' | 'pendientes' | 'confirmados')
                  }
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos los compromisos</option>
                  <option value="pendientes">Solo Pendientes</option>
                  <option value="confirmados">Solo Confirmados</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={abrirNuevaPlantilla}
                className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
              >
                + Nuevo Fijo
              </button>
              <button
                onClick={() => setModalDeudaAbierto(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
              >
                + Nueva Deuda en Cuotas
              </button>
            </div>
          </div>

          {/* Lista de compromisos del mes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {itemsAgendaMes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm font-semibold text-slate-500">
                  No hay pagos programados ni cuotas para {NOMBRES_MESES[agendaMes]} {agendaAnio}.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Agrega una plantilla fija (como luz, internet o alquiler) o un cronograma de cuotas.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {itemsAgendaMes.map((item) => (
                  <div
                    key={item.uid}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 ${
                          item.confirmado
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        <span className="text-sm font-black leading-none">{item.dia}</span>
                        <span className="text-[10px] uppercase">
                          {NOMBRES_MESES[agendaMes].slice(0, 3)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{item.titulo}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              backgroundColor: `${item.categoriaColor}18`,
                              color: item.categoriaColor,
                            }}
                          >
                            {item.categoriaNombre}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{item.subtitulo}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <span
                        className={`text-sm font-black ${
                          item.tipo === 'ingreso' ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                      >
                        {formatearMoneda(item.monto)}
                      </span>

                      {item.confirmado ? (
                        <button
                          disabled={item.origen === 'cuota' || procesandoPagoId === item.uid}
                          onClick={() => handleAccionAgenda(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold cursor-pointer disabled:cursor-default"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Pagado</span>
                        </button>
                      ) : (
                        <button
                          disabled={procesandoPagoId === item.uid}
                          onClick={() => handleAccionAgenda(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {procesandoPagoId === item.uid ? 'Confirmando...' : 'Confirmar Pago'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VISTA 2: PLANTILLAS RECURRENTES FIJAS */}
      {subTab === 'recurrentes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Tus Plantillas Mensuales Fijas
            </h2>
            <button
              onClick={abrirNuevaPlantilla}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Plantilla Fija</span>
            </button>
          </div>

          {recurrentes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">
                No tienes pagos ni ingresos fijos registrados.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Úsalos para recibos de luz, internet, alquiler, suscripciones o ingresos fijos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recurrentes.map((r) => {
                const cat = r.categoria_id ? mapaCategorias.get(r.categoria_id) : undefined;
                return (
                  <div
                    key={r.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-2"
                            style={{
                              backgroundColor: `${cat?.color || '#3498db'}18`,
                              color: cat?.color || '#3498db',
                            }}
                          >
                            {cat?.nombre || 'General'}
                          </span>
                          <h3 className="text-base font-bold text-slate-900">{r.descripcion}</h3>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                          Día {r.dia_pago}
                        </span>
                      </div>

                      <div
                        className={`text-xl font-black mt-3 ${
                          r.tipo === 'ingreso' ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                      >
                        {r.tipo === 'ingreso' ? '+' : '-'}
                        {formatearMoneda(r.monto)}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => abrirEdicionPlantilla(r)}
                        className="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEliminarPlantilla(r.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-VISTA 3: DEUDAS Y CRONOGRAMAS EN CUOTAS */}
      {subTab === 'deudas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Préstamos y Compras en Cuotas
            </h2>
            <button
              onClick={() => setModalDeudaAbierto(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Cronograma de Cuotas</span>
            </button>
          </div>

          {deudas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">
                No tienes cronogramas de deudas o cuotas registrados.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Crea uno para llevar el control exacto de cuántas cuotas llevas pagadas y cuántas faltan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {deudas.map((d) => {
                const cuotasDeEstaDeuda = cuotas.filter((c) => c.deuda_id === d.id);
                const totalPactado = cuotasDeEstaDeuda.reduce((acc, c) => acc + c.monto, 0);
                let totalPagado = 0;
                let cuotasCompletadas = 0;

                cuotasDeEstaDeuda.forEach((c) => {
                  const abonos = pagosDeuda
                    .filter((p) => p.cuota_id === c.id)
                    .reduce((acc, p) => acc + p.monto, 0);
                  totalPagado += abonos;
                  if (c.monto - abonos <= 0.009) cuotasCompletadas++;
                });

                const pct =
                  totalPactado > 0 ? Math.min(100, Math.round((totalPagado / totalPactado) * 100)) : 0;
                const expandida = Boolean(deudasExpandidas[d.id]);

                return (
                  <div
                    key={d.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-slate-900">{d.nombre}</h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                            {cuotasCompletadas}/{cuotasDeEstaDeuda.length} cuotas pagadas
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Pagado: <strong>{formatearMoneda(totalPagado)}</strong> de{' '}
                          <strong>{formatearMoneda(totalPactado)}</strong> ({pct}%)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setDeudasExpandidas((prev) => ({ ...prev, [d.id]: !prev[d.id] }))
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          <span>{expandida ? 'Ocultar cuotas' : 'Ver cuotas'}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expandida ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => handleEliminarDeuda(d.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Eliminar deuda"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                      <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Desglose de cuotas */}
                    {expandida && (
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {cuotasDeEstaDeuda.map((c) => {
                          const abonado = pagosDeuda
                            .filter((p) => p.cuota_id === c.id)
                            .reduce((acc, p) => acc + p.monto, 0);
                          const pendiente = Math.max(0, Math.round((c.monto - abonado) * 100) / 100);
                          const pagada = pendiente <= 0.009;

                          return (
                            <div
                              key={c.id}
                              className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                                pagada
                                  ? 'bg-emerald-50/40 border-emerald-200'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div>
                                <strong className="text-slate-900 block">
                                  Cuota #{c.numero} · {formatearMoneda(c.monto)}
                                </strong>
                                <span className="text-slate-500 text-[11px]">Vence: {c.fecha}</span>
                              </div>

                              {pagada ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Pagada
                                </span>
                              ) : (
                                <button
                                  disabled={procesandoPagoId === `cuota-direct-${c.id}`}
                                  onClick={() => handlePagarCuotaDirecto(c, pendiente)}
                                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                                >
                                  {procesandoPagoId === `cuota-direct-${c.id}` ? '...' : 'Pagar'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL PLANTILLA RECURRENTE */}
      {modalRecAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {recEditId ? 'Editar Plantilla Fija' : 'Nueva Plantilla Fija Mensual'}
              </h3>
              <button
                onClick={() => setModalRecAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarPlantilla} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRecTipo('gasto')}
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    recTipo === 'gasto' ? 'bg-red-600 text-white' : 'text-slate-600'
                  }`}
                >
                  Gasto Fijo
                </button>
                <button
                  type="button"
                  onClick={() => setRecTipo('ingreso')}
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    recTipo === 'ingreso' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                  }`}
                >
                  Ingreso Fijo
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descripción</label>
                <input
                  type="text"
                  required
                  value={recDesc}
                  onChange={(e) => setRecDesc(e.target.value)}
                  placeholder="Ej. Internet Fibra, Alquiler, Luz..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Monto (S/.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={recMonto}
                    onChange={(e) => setRecMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Día de pago (1-31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={recDia}
                    onChange={(e) => setRecDia(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Categoría</label>
                <select
                  value={recCatId}
                  onChange={(e) =>
                    setRecCatId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalRecAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoRec}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  {guardandoRec ? 'Guardando...' : 'Guardar Plantilla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA DEUDA EN CUOTAS */}
      {modalDeudaAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">Nuevo Cronograma de Cuotas</h3>
              <button
                onClick={() => setModalDeudaAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearDeudaConCuotas} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de la Deuda / Compra
                </label>
                <input
                  type="text"
                  required
                  value={deudaNombre}
                  onChange={(e) => setDeudaNombre(e.target.value)}
                  placeholder="Ej. Préstamo BCP, Laptop en cuotas, Tarjeta..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    N° de Cuotas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={numCuotas}
                    onChange={(e) => setNumCuotas(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Monto por Cuota (S/.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={montoCuota}
                    onChange={(e) => setMontoCuota(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha 1ra Cuota
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaPrimeraCuota}
                    onChange={(e) => setFechaPrimeraCuota(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={deudaCatId}
                    onChange={(e) =>
                      setDeudaCatId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  >
                    <option value="">General</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalDeudaAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoDeuda}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  {guardandoDeuda ? 'Generando...' : 'Crear Cronograma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
