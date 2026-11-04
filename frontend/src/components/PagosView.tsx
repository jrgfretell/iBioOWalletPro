import { RegistrarPagoModal } from './RegistrarPagoModal';
import type { ObjetivoPago } from './RegistrarPagoModal';
import { generarCuotas } from '../lib/schedule';
import { AnimatedModal } from './AnimatedModal';
import React, { useState, useMemo, useRef } from 'react';
import { AnimatedDisclosure } from './AnimatedDisclosure';
import { useAuth } from '../context/AuthContext';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import {
  NOMBRES_MESES,
  obtenerUltimoDiaMes,
  fechaHoyISO,
  obtenerMesInicioRecurrente,
  recurrenteAplicaEnMes,
} from '../types/wallet';
import type { DeudaCuota, MovimientoRecurrente } from '../types/wallet';
import { confirmarAccion, toastExito } from '../lib/alerts';
import {
  CalendarCheck,
  FileText,
  Wallet,
  Plus,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Sliders,
  Search,
} from 'lucide-react';

type SubTabPagos = 'agenda' | 'cronogramas' | 'ingresos';

interface FilaAgenda {
  id: string;
  nombre: string;
  detalle: string;
  tipo: 'Cuotas' | 'Continuo' | 'Ingreso';
  fecha: string;
  programado: number;
  pagado: number;
  pendiente: number;
  estado: 'pagado' | 'pendiente' | 'vencido';
  deudaId?: number;
  cuotaRef?: DeudaCuota;
  recurrenteId?: number;
  movimientoId?: number;
  tipoMovimiento: 'gasto' | 'ingreso';
  recurrenteRef?: MovimientoRecurrente;
}

export const PagosView: React.FC = () => {
  const { soporteEtapa5, fechaReferencia, ejecutarOperacion, escribiendo, error: errorBilletera, reportarError, soloLectura, formatearMoneda, simboloMoneda, clienteBilletera: supabase } = useWallet();
  const { user } = useAuth();
  const {
    categorias,
    recurrentes,
    movimientos,
    deudas,
    cuotas,
    pagosDeuda,
    sueldos,
    recargarTodo,
    guardarSueldoMes,
    guardarSueldoAnual,
  } = useWallet();

  const hoy = new Date();
  const fechaHoyStr = fechaHoyISO();

  // Navegación entre las 3 pestañas originales
  const [subTab, setSubTab] = useState<SubTabPagos>('agenda');

  // Filtros de la Agenda Mensual
  const [agendaMes, setAgendaMes] = useState<number>(hoy.getMonth());
  const [agendaAnio, setAgendaAnio] = useState<number>(hoy.getFullYear());
  const [agendaTipo, setAgendaTipo] = useState<'todos' | 'continuo' | 'cuotas'>('todos');
  const [agendaEstado, setAgendaEstado] = useState<'todos' | 'pendiente' | 'pagado' | 'vencido'>('todos');
  const [procesandoAccion, setProcesandoAccion] = useState<string | null>(null);

  // Modales de Creación
  const [modalNuevoProgramado, setModalNuevoProgramado] = useState<boolean>(false);
  const [modalTipoCrear, setModalTipoCrear] = useState<'cuotas' | 'continuo' | 'ingreso'>('continuo');

  // Modal de Edición de Compromiso
  const [modalEdicionAbierto, setModalEdicionAbierto] = useState<boolean>(false);
  const [editTipo, setEditTipo] = useState<'recurrente' | 'deuda'>('recurrente');
  const [editTipoMovimiento, setEditTipoMovimiento] = useState<'gasto' | 'ingreso'>('gasto');
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState<string>('');
  const [editMonto, setEditMonto] = useState<string>('');
  const [editDia, setEditDia] = useState<string>('15');
  const [editCatId, setEditCatId] = useState<number | ''>('');
  const [editMesInicio, setEditMesInicio] = useState<number>(hoy.getMonth());
  const [editAnioInicio, setEditAnioInicio] = useState<number>(hoy.getFullYear());
  const [guardandoEdicion, setGuardandoEdicion] = useState<boolean>(false);

  // Formulario Cuotas
  const [nombreDeuda, setNombreDeuda] = useState<string>('');
  const [numCuotas, setNumCuotas] = useState<string>('6');
  const [montoPorCuota, setMontoPorCuota] = useState<string>('');
  const [fecha1raCuota, setFecha1raCuota] = useState<string>(fechaHoyISO());
  const [deudaCatId, setDeudaCatId] = useState<number | ''>('');
  const [forzarFinDeMes, setForzarFinDeMes] = useState<boolean>(() => {
    const hoyIso = fechaHoyISO();
    const [y, m, d] = hoyIso.split('-').map(Number);
    return d === obtenerUltimoDiaMes(y, m - 1);
  });

  // Edición inline de fecha de cuota
  const [editandoCuotaId, setEditandoCuotaId] = useState<number | null>(null);
  const [nuevaFechaCuota, setNuevaFechaCuota] = useState<string>('');
  const [guardandoCuotaFecha, setGuardandoCuotaFecha] = useState<boolean>(false);

  // Formulario Recurrente Continuo / Ingreso
  const [recDesc, setRecDesc] = useState<string>('');
  const [recMonto, setRecMonto] = useState<string>('');
  const [recDia, setRecDia] = useState<string>('15');
  const [recCatId, setRecCatId] = useState<number | ''>('');
  const [recMesInicio, setRecMesInicio] = useState<number>(hoy.getMonth());
  const [recAnioInicio, setRecAnioInicio] = useState<number>(hoy.getFullYear());
  const [recInicioManual, setRecInicioManual] = useState<boolean>(false);

  const [busquedaCronogramas, setBusquedaCronogramas] = useState('');

  // Estado pestaña Cronogramas
  const [filtroCronogramas, setFiltroCronogramas] = useState<'todos' | 'activas' | 'pagadas'>('todos');
  const [cronogramasExpandidos, setCronogramasExpandidos] = useState<Record<string, boolean>>({});

  // Estado pestaña Ingresos Programados (Perfil de Sueldo)
  const [ingresoMes, setIngresoMes] = useState<number>(hoy.getMonth());
  const [ingresoAnio, setIngresoAnio] = useState<number>(hoy.getFullYear());
  const [ingresoModo, setIngresoModo] = useState<'quincenal' | 'mensual'>('quincenal');
  const [ingresoS15, setIngresoS15] = useState<string>('0');
  const [ingresoS30, setIngresoS30] = useState<string>('0');
  const [ingresoAplicarAnio, setIngresoAplicarAnio] = useState<boolean>(false);
  const [guardandoSueldo, setGuardandoSueldo] = useState<boolean>(false);
  const [mensajeSueldo, setMensajeSueldo] = useState<string | null>(null);

  const [pagoObjetivo,setPagoObjetivo]=useState<ObjetivoPago|null>(null);
  const [creando,setCreando]=useState(false);
  const [historicos,setHistoricos]=useState<Record<number,{pagada:boolean;fecha:string}>>({});
  const solicitudes=useRef(new Map<string,{datos:string;id:string}>());
  const solicitudPara=(accion:string,datos:unknown)=>{
    const texto=JSON.stringify(datos); const anterior=solicitudes.current.get(accion);
    if(anterior?.datos===texto)return anterior.id;
    const id=crypto.randomUUID();solicitudes.current.set(accion,{datos:texto,id});return id;
  };
  const abrirPago=(objetivo:Omit<ObjetivoPago,'solicitud'>)=>setPagoObjetivo({...objetivo,solicitud:crypto.randomUUID()});
  const cuotasPrevias=generarCuotas(fecha1raCuota,Number(numCuotas),Number(montoPorCuota),forzarFinDeMes);

  useWalletFormGuard(!!pagoObjetivo || modalNuevoProgramado || modalEdicionAbierto || editandoCuotaId !== null, 'Pagos programados');

  // Cargar sueldo del mes seleccionado en la pestaña de Ingresos
  React.useEffect(() => {
    const reg = sueldos.find((s) => s.anio === ingresoAnio && s.mes === ingresoMes);
    const s15 = reg ? reg.sueldo_15 : 0;
    const s30 = reg ? reg.sueldo_30 : 0;
    setIngresoS15(String(s15));
    setIngresoS30(String(s30));
    setIngresoModo(s15 === 0 && s30 > 0 ? 'mensual' : 'quincenal');
  }, [ingresoAnio, ingresoMes, sueldos]);

  // FILAS DE LA AGENDA MENSUAL
  const filasAgenda = useMemo(() => {
    const prefijo = `${agendaAnio}-${String(agendaMes + 1).padStart(2, '0')}`;
    const ultimoDia = obtenerUltimoDiaMes(agendaAnio, agendaMes);
    const resultado: FilaAgenda[] = [];

    // 1. Cuotas de deudas en este mes
    cuotas
      .filter((c) => c.fecha && c.fecha.startsWith(prefijo))
      .forEach((c) => {
        const deuda = deudas.find((d) => d.id === c.deuda_id);
        const totalCuotasDeuda = cuotas.filter((q) => q.deuda_id === c.deuda_id).length;
        const totalAbonado = pagosDeuda
          .filter((p) => p.cuota_id === c.id)
          .reduce((acc, p) => acc + p.monto, 0);

        const pendiente = Math.max(0, Math.round((c.monto - totalAbonado) * 100) / 100);
        const pagado = totalAbonado;
        const esPagado = pendiente <= 0.009;
        const esVencido = !esPagado && c.fecha < fechaHoyStr;
        const estado: 'pagado' | 'pendiente' | 'vencido' = esPagado
          ? 'pagado'
          : esVencido
          ? 'vencido'
          : 'pendiente';

        resultado.push({
          id: `cuota-${c.id}`,
          nombre: deuda ? deuda.nombre : `Deuda #${c.deuda_id}`,
          detalle: `Cuota ${c.numero}/${totalCuotasDeuda}`,
          tipo: 'Cuotas',
          fecha: c.fecha,
          programado: c.monto,
          pagado,
          pendiente,
          estado,
          deudaId: c.deuda_id,
          cuotaRef: c,
          tipoMovimiento: 'gasto',
        });
      });

    // 2. Compromisos recurrentes continuos (como Suno, alquiler, luz, internet, etc.)
    recurrentes
      .filter((r) => r.tipo === 'gasto' && recurrenteAplicaEnMes(r, agendaAnio, agendaMes))
      .forEach((rec) => {
        const diaReal = Math.min(rec.dia_pago, ultimoDia);
        const fechaEstimada = `${prefijo}-${String(diaReal).padStart(2, '0')}`;
        const mov = movimientos.find(
          (m) => m.recurrente_id === rec.id && m.fecha.startsWith(prefijo)
        );

        const estaConfirmado = mov ? mov.pago_confirmado : false;
        const fechaReal = mov ? mov.fecha : fechaEstimada;
        const esVencido = !estaConfirmado && fechaReal < fechaHoyStr;
        const estado: 'pagado' | 'pendiente' | 'vencido' = estaConfirmado
          ? 'pagado'
          : esVencido
          ? 'vencido'
          : 'pendiente';

        resultado.push({
          id: `rec-${rec.id}`,
          nombre: rec.descripcion,
          detalle: 'Pago continuo mensual',
          tipo: 'Continuo',
          fecha: fechaReal,
          programado: mov ? mov.monto : rec.monto,
          pagado: estaConfirmado ? (mov ? mov.monto : rec.monto) : 0,
          pendiente: estaConfirmado ? 0 : mov ? mov.monto : rec.monto,
          estado,
          recurrenteId: rec.id,
          recurrenteRef: rec,
          movimientoId: mov?.id,
          tipoMovimiento: 'gasto',
        });
      });

    return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [agendaAnio, agendaMes, cuotas, deudas, pagosDeuda, recurrentes, movimientos, fechaHoyStr]);

  // Aplicar filtros de la barra sobre las filas
  const filasFiltradas = useMemo(() => {
    return filasAgenda.filter((r) => {
      if (agendaTipo === 'continuo' && r.tipo !== 'Continuo') return false;
      if (agendaTipo === 'cuotas' && r.tipo !== 'Cuotas') return false;
      if (agendaEstado !== 'todos' && r.estado !== agendaEstado) return false;
      return true;
    });
  }, [filasAgenda, agendaTipo, agendaEstado]);

  // Resumen de las 4 tarjetas KPI de la Agenda
  const resumenAgenda = useMemo(() => {
    let programado = 0;
    let pagado = 0;
    let pendiente = 0;
    let vencido = 0;

    filasAgenda.forEach((r) => {
      programado += r.programado;
      pagado += r.pagado;
      pendiente += r.pendiente;
      if (r.estado === 'vencido') {
        vencido += r.pendiente;
      }
    });

    return { programado, pagado, pendiente, vencido };
  }, [filasAgenda]);

  // ELIMINAR COMPROMISO DIRECTAMENTE
  const handleEliminarCompromiso = async (fila: FilaAgenda) => {
    try {
    if (!user) return;
    const confirmado = await confirmarAccion({
      title: '¿Eliminar compromiso?',
      text: `Se borrará "${fila.nombre}" de la agenda y de tus cronogramas.`,
      confirmButtonText: 'Sí, eliminar',
    });
    if (!confirmado) return;

    setProcesandoAccion(fila.id);
    try {
      if(soporteEtapa5) {
        const accion=fila.recurrenteId?'retirar_recurrente':'retirar_cronograma';
        const datos=fila.recurrenteId?{recurrente_id:fila.recurrenteId}:{deuda_id:fila.deudaId};
        await ejecutarOperacion(accion,datos,solicitudPara(accion,datos));toastExito('Compromiso retirado. Se conserva el historial pagado.');return;
      }
      if (fila.recurrenteId) {
        // Eliminar plantilla recurrente
        await supabase
          .from('movimientos_recurrentes')
          .delete()
          .eq('id', fila.recurrenteId)
          .eq('user_id', user.id);
        // Limpiar movimientos asociados no confirmados
        await supabase
          .from('movimientos_agenda')
          .delete()
          .eq('recurrente_id', fila.recurrenteId)
          .eq('user_id', user.id);
      } else if (fila.deudaId) {
        // Eliminar deuda y todas sus cuotas
        await supabase.from('deudas').delete().eq('id', fila.deudaId).eq('user_id', user.id);
      }
      await recargarTodo();
      toastExito(`"${fila.nombre}" eliminado`);
    } finally {
      setProcesandoAccion(null);
    }

    } catch (error) { reportarError(error); }
  };

  // ELIMINAR INGRESO PROGRAMADO
  const handleEliminarIngresoProgramado = async (item: { id: number; descripcion: string }) => {
    try {
    if (!user) return;
    const confirmado = await confirmarAccion({
      title: '¿Eliminar ingreso programado?',
      text: `Se borrará "${item.descripcion}" y todas sus ocurrencias programadas.`,
      confirmButtonText: 'Sí, eliminar',
    });
    if (!confirmado) return;

    if(soporteEtapa5){const datos={recurrente_id:item.id};await ejecutarOperacion('retirar_recurrente',datos,solicitudPara('retirar_recurrente',datos));toastExito('Ingreso retirado. Se conserva el historial.');return;}
    try {
      await supabase
        .from('movimientos_recurrentes')
        .delete()
        .eq('id', item.id)
        .eq('user_id', user.id);
      await supabase
        .from('movimientos_agenda')
        .delete()
        .eq('recurrente_id', item.id)
        .eq('user_id', user.id);
      await recargarTodo();
      toastExito(`"${item.descripcion}" eliminado`);
    } catch (err: any) {
      reportarError(err);
    }

    } catch (error) { reportarError(error); }
  };

  // ABRIR MODAL DE EDICIÓN RECURRENTE
  const abrirModalEdicionRecurrente = (rec: MovimientoRecurrente) => {
    const inicio = obtenerMesInicioRecurrente(rec, hoy.getFullYear(), hoy.getMonth());
    setEditTipo('recurrente');
    setEditTipoMovimiento(rec.tipo);
    setEditId(rec.id);
    setEditNombre(rec.descripcion);
    setEditMonto(String(rec.monto));
    setEditDia(String(rec.dia_pago));
    setEditCatId(rec.categoria_id ?? '');
    setEditMesInicio(inicio.mes);
    setEditAnioInicio(inicio.anio);
    setModalEdicionAbierto(true);
  };

  // ABRIR MODAL DE EDICIÓN
  const handleAbrirEdicion = (fila: FilaAgenda) => {
    if (fila.recurrenteRef) {
      abrirModalEdicionRecurrente(fila.recurrenteRef);
    } else if (fila.deudaId) {
      const deuda = deudas.find((d) => d.id === fila.deudaId);
      if (deuda) {
        setEditTipo('deuda');
        setEditTipoMovimiento('gasto');
        setEditId(deuda.id);
        setEditNombre(deuda.nombre);
        setEditMonto(String(fila.programado));
        setEditDia('1');
        setEditCatId(deuda.categoria_id ?? '');
        setModalEdicionAbierto(true);
      }
    }
  };

  // GUARDAR EDICIÓN DEL COMPROMISO
  const handleGuardarEdicion = async (e: React.FormEvent) => {
    try {
    e.preventDefault();
    if (!user || !editId || !editNombre.trim()) return;
    const montoNum = parseFloat(editMonto);
    if (isNaN(montoNum) || montoNum <= 0) return;

    setGuardandoEdicion(true);
    try {
      if (editTipo === 'recurrente') {
        const diaNum = Math.min(31, Math.max(1, parseInt(editDia, 10) || 1));
        const periodoInicio = `${editAnioInicio}-${String(editMesInicio + 1).padStart(2, '0')}`;
        await supabase
          .from('movimientos_recurrentes')
          .update({
            descripcion: editNombre.trim(),
            monto: montoNum,
            dia_pago: diaNum,
            categoria_id: editCatId === '' ? null : Number(editCatId),
            tipo: editTipoMovimiento,
            periodos: periodoInicio,
          })
          .eq('id', editId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('deudas')
          .update({
            nombre: editNombre.trim(),
            categoria_id: editCatId === '' ? null : Number(editCatId),
          })
          .eq('id', editId)
          .eq('user_id', user.id);
      }
      await recargarTodo();
      setModalEdicionAbierto(false);
      toastExito('Guardado con éxito');
    } finally {
      setGuardandoEdicion(false);
    }

    } catch (error) { reportarError(error); }
  };

  // Acciones de pago en la Agenda
  const handleRegistrarPagoAgenda = async (fila: FilaAgenda) => {
    try {
    if (!user) return;
    if(soporteEtapa5) {
      abrirPago({nombre:fila.nombre,monto:fila.pendiente,vencimiento:fila.fecha,cuotaId:fila.cuotaRef?.id,recurrenteId:fila.recurrenteId}); return;
    }
    setProcesandoAccion(fila.id);
    try {
      if (fila.tipo === 'Cuotas' && fila.cuotaRef) {
        const { data: movData } = await supabase
          .from('movimientos_agenda')
          .insert({
            user_id: user.id,
            tipo: 'gasto',
            descripcion: `${fila.nombre} - ${fila.detalle}`,
            monto: fila.pendiente,
            fecha: fechaHoyStr,
            categoria_id: deudas.find((d) => d.id === fila.deudaId)?.categoria_id ?? null,
            es_recurrente: false,
            pago_confirmado: true,
            fecha_pago: fechaHoyStr,
          })
          .select('id')
          .single();

        await supabase.from('deuda_pagos').insert({
          user_id: user.id,
          cuota_id: fila.cuotaRef.id,
          monto: fila.pendiente,
          fecha: fechaHoyStr,
          movimiento_id: movData ? movData.id : null,
          solicitud: `pago-cuota-${fila.cuotaRef.id}-${Date.now()}`,
        });
      } else if (fila.tipo === 'Continuo' && fila.recurrenteId) {
        if (fila.movimientoId) {
          await supabase
            .from('movimientos_agenda')
            .update({ pago_confirmado: true, fecha_pago: fechaHoyStr })
            .eq('id', fila.movimientoId)
            .eq('user_id', user.id);
        } else {
          await supabase.from('movimientos_agenda').insert({
            user_id: user.id,
            tipo: 'gasto',
            descripcion: fila.nombre,
            monto: fila.programado,
            fecha: fila.fecha,
            categoria_id: recurrentes.find((r) => r.id === fila.recurrenteId)?.categoria_id ?? null,
            es_recurrente: true,
            recurrente_id: fila.recurrenteId,
            pago_confirmado: true,
            fecha_pago: fechaHoyStr,
          });
        }
      }
      await recargarTodo();
    } finally {
      setProcesandoAccion(null);
    }

    } catch (error) { reportarError(error); }
  };

  const handleAnularPagoAgenda = async (fila: FilaAgenda) => {
    try {
    if (!user || !fila.movimientoId) return;
    const confirmado = await confirmarAccion({
      title: '¿Anular este pago?',
      text: 'Volverá a quedar pendiente y se retirará del historial pagado.',
      confirmButtonText: 'Sí, anular',
      isDanger: false,
      icon: 'question',
    });
    if (!confirmado) return;

    setProcesandoAccion(fila.id);
    try {
      await supabase
        .from('movimientos_agenda')
        .update({ pago_confirmado: false, fecha_pago: null })
        .eq('id', fila.movimientoId)
        .eq('user_id', user.id);
      await recargarTodo();
      toastExito('Pago anulado');
    } finally {
      setProcesandoAccion(null);
    }

    } catch (error) { reportarError(error); }
  };

  // Guardar fecha individual de una cuota
  const handleGuardarFechaCuota = async (cuotaId: number) => {
    try {
    if (!user || !nuevaFechaCuota) return;
    setGuardandoCuotaFecha(true);
    try {
      const { error } = await supabase
        .from('deuda_cuotas')
        .update({ fecha: nuevaFechaCuota })
        .eq('id', cuotaId)
        .eq('user_id', user.id);
      if (error) throw error;
      await recargarTodo();
      setEditandoCuotaId(null);
      toastExito('Fecha de vencimiento actualizada');
    } catch (err) {
      reportarError(err);
    } finally {
      setGuardandoCuotaFecha(false);
    }

    } catch (error) { reportarError(error); }
  };

  // Ajustar en lote todas las cuotas de un cronograma al último día de cada mes
  const handleAjustarCuotasFinDeMes = async (deudaId: number, nombreDeuda: string) => {
    try {
    if (!user) return;
    const cuotasD = cuotas.filter((c) => c.deuda_id === deudaId);
    if (!cuotasD.length) return;

    const confirmado = await confirmarAccion({
      title: '¿Ajustar cuotas a fin de mes?',
      text: `Se actualizará el vencimiento de las cuotas de "${nombreDeuda}" al último día de su mes respectivo (30, 31, 28/29).`,
      confirmButtonText: 'Sí, ajustar a fin de mes',
      isDanger: false,
      icon: 'question',
    });
    if (!confirmado) return;

    if(soporteEtapa5) {const datos={deuda_id:deudaId};await ejecutarOperacion('ajustar_fin_mes',datos,solicitudPara('ajustar_fin_mes',datos));toastExito('Se ajustaron las cuotas sin abonos');return;}
    for (const c of cuotasD) {
      const [y, m] = c.fecha.split('-').map(Number);
      const ultimoDia = obtenerUltimoDiaMes(y, m - 1);
      const nuevaFecha = `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
      if (nuevaFecha !== c.fecha) {
        await supabase
          .from('deuda_cuotas')
          .update({ fecha: nuevaFecha })
          .eq('id', c.id)
          .eq('user_id', user.id);
      }
    }
    await recargarTodo();
    toastExito('Cuotas ajustadas al último día de cada mes');

    } catch (error) { reportarError(error); }
  };

  // Crear nuevo compromiso (Modal)
  const handleCrearNuevoProgramado = async (e: React.FormEvent) => {
    if(creando)return; setCreando(true);
    try {
    e.preventDefault();
    if (!user) return;

    if (modalTipoCrear === 'cuotas') {
      const nCuotas = Math.max(1, parseInt(numCuotas, 10) || 1);
      const mCuota = parseFloat(montoPorCuota);
      if (!nombreDeuda.trim() || isNaN(mCuota) || mCuota <= 0 || !fecha1raCuota) return;

      if(soporteEtapa5) {
        if(cuotasPrevias.length!==nCuotas)throw Error('El registro de cronograma no es válido.');
        const datos={nombre:nombreDeuda.trim(),categoria_id:deudaCatId===''?null:Number(deudaCatId),cuotas:cuotasPrevias.map((c,i)=>({...c,pagada:historicos[i]?.pagada||false,fecha_pago:historicos[i]?.fecha||c.fecha}))};
        await ejecutarOperacion('crear_cronograma',datos,solicitudPara('crear_cronograma',datos));
        solicitudes.current.delete('crear_cronograma');setModalNuevoProgramado(false);setHistoricos({});setNombreDeuda('');setMontoPorCuota('');
        setSubTab('cronogramas');setBusquedaCronogramas('');setFiltroCronogramas('todos');toastExito('Cronograma y pagos históricos guardados');return;
      }
      const { data: dData, error } = await supabase
        .from('deudas')
        .insert({
          user_id: user.id,
          nombre: nombreDeuda.trim(),
          monto_recibido: mCuota * nCuotas,
          categoria_id: deudaCatId === '' ? null : Number(deudaCatId),
        })
        .select('id')
        .single();

      if (error || !dData) return;

      const [yBase, mBase, dBase] = fecha1raCuota.split('-').map(Number);
      const maxDiaBase = obtenerUltimoDiaMes(yBase, mBase - 1);
      const esFinDeMes = forzarFinDeMes || dBase === maxDiaBase;

      const cuotasInsert = [];
      for (let i = 0; i < nCuotas; i++) {
        const fechaTarget = new Date(yBase, mBase - 1 + i, 1);
        const anioT = fechaTarget.getFullYear();
        const mesT = fechaTarget.getMonth();
        const maxDia = obtenerUltimoDiaMes(anioT, mesT);
        const diaReal = esFinDeMes ? maxDia : Math.min(dBase, maxDia);
        const fechaStr = `${anioT}-${String(mesT + 1).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;
        cuotasInsert.push({
          user_id: user.id,
          deuda_id: dData.id,
          numero: i + 1,
          monto: mCuota,
          fecha: fechaStr,
        });
      }
      await supabase.from('deuda_cuotas').insert(cuotasInsert);
    } else {
      const mNum = parseFloat(recMonto);
      const dNum = Math.min(31, Math.max(1, parseInt(recDia, 10) || 1));
      if (!recDesc.trim() || isNaN(mNum) || mNum <= 0) return;

      const periodoInicio = `${recAnioInicio}-${String(recMesInicio + 1).padStart(2, '0')}`;
      await supabase.from('movimientos_recurrentes').insert({
        user_id: user.id,
        tipo: modalTipoCrear === 'ingreso' ? 'ingreso' : 'gasto',
        descripcion: recDesc.trim(),
        monto: mNum,
        dia_pago: dNum,
        categoria_id: recCatId === '' ? null : Number(recCatId),
        periodos: periodoInicio,
        tipo_recurrencia: 'mensual',
      });
    }

    await recargarTodo();
    setModalNuevoProgramado(false);
    setNombreDeuda('');
    setMontoPorCuota('');
    setRecDesc('');
    setRecMonto('');
    setForzarFinDeMes(false);
    setRecMesInicio(hoy.getMonth());
    setRecAnioInicio(hoy.getFullYear());
    setRecInicioManual(false);

    } catch (error) { reportarError(error); } finally {setCreando(false);}
  };

  // Guardar sueldo desde la pestaña Ingresos
  const handleGuardarSueldoIngresos = async (e: React.FormEvent) => {
    try {
    e.preventDefault();
    const s15 = ingresoModo === 'mensual' ? 0 : Math.max(0, parseFloat(ingresoS15) || 0);
    const s30 = Math.max(0, parseFloat(ingresoS30) || 0);
    setGuardandoSueldo(true);
    let ok = false;
    if (ingresoAplicarAnio) {
      ok = await guardarSueldoAnual(ingresoAnio, ingresoMes, s15, s30);
    } else {
      ok = await guardarSueldoMes(ingresoAnio, ingresoMes, s15, s30);
    }
    setGuardandoSueldo(false);
    if (ok) {
      setMensajeSueldo(
        ingresoAplicarAnio
          ? `Sueldo guardado de ${NOMBRES_MESES[ingresoMes]} a Diciembre ${ingresoAnio}`
          : `Sueldo de ${NOMBRES_MESES[ingresoMes]} actualizado`
      );
      setTimeout(() => setMensajeSueldo(null), 3000);
    }

    } catch (error) { reportarError(error); }
  };

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

  const sueldoGuardado = sueldos.find(s => s.anio === ingresoAnio && s.mes === ingresoMes);
  useWalletFormGuard(subTab === 'ingresos' && (Number(ingresoS15) !== (sueldoGuardado?.sueldo_15 || 0) || Number(ingresoS30) !== (sueldoGuardado?.sueldo_30 || 0) || ingresoAplicarAnio), 'Sueldos sin guardar');

  const ultimoDiaSueldo = obtenerUltimoDiaMes(ingresoAnio, ingresoMes);

  // GENERAR LOS 13 VENCIMIENTOS DE CADA COMPROMISO CONTINUO (Idéntico a Image 2 de PHP)
  const cronogramasContinuos = useMemo(() => {
    return recurrentes
      .filter((r) => r.tipo === 'gasto')
      .map((rec) => {
        const cat = categorias.find((c) => c.id === rec.categoria_id);
        const vencimientos = [];
        let pagosRealizados = 0;
        let totalAbonado = 0;

        const { anio: anioInicio, mes: mesInicio } = obtenerMesInicioRecurrente(
          rec,
          hoy.getFullYear(),
          hoy.getMonth()
        );

        for (let i = 0; i < 13; i++) {
          const target = new Date(anioInicio, mesInicio + i, 1);
          const anioT = target.getFullYear();
          const mesT = target.getMonth();
          const ultimoDia = obtenerUltimoDiaMes(anioT, mesT);
          const diaReal = Math.min(rec.dia_pago, ultimoDia);
          const fechaStr = `${anioT}-${String(mesT + 1).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;

          const prefijo = `${anioT}-${String(mesT + 1).padStart(2, '0')}`;
          const mov = movimientos.find(
            (m) => m.recurrente_id === rec.id && m.fecha.startsWith(prefijo)
          );

          const pagado = mov && mov.pago_confirmado;
          const pendiente = pagado ? 0 : rec.monto;
          const abonado = pagado ? (mov ? mov.monto : rec.monto) : 0;

          if (pagado) {
            pagosRealizados++;
            totalAbonado += abonado;
          }

          const esVencido = !pagado && fechaStr < fechaHoyStr;
          const estado: 'pagado' | 'pendiente' | 'vencido' = pagado
            ? 'pagado'
            : esVencido
            ? 'vencido'
            : 'pendiente';

          vencimientos.push({
            numero: i + 1,
            fecha: fechaStr,
            importe: rec.monto,
            abonado,
            pendiente,
            estado,
            movimientoId: mov?.id,
          });
        }

        const importePeriodo = rec.monto * 13;
        const pendientePeriodo = importePeriodo - totalAbonado;
        const pct = Math.round((totalAbonado / importePeriodo) * 100);
        const proximo = vencimientos.find((v) => v.estado !== 'pagado');

        return {
          rec,
          idKey: `rec-card-${rec.id}`,
          nombre: rec.descripcion,
          categoriaNombre: cat ? cat.nombre : 'Otros',
          montoRecibido: 0,
          importePeriodo,
          pendientePeriodo,
          pagosRealizados,
          totalVencimientos: 13,
          pct,
          proximo,
          vencimientos,
        };
      });
  }, [recurrentes, categorias, movimientos, hoy, fechaHoyStr]);

  const normalizarBusqueda = (texto: string) =>
    texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  const consultaCronogramas = normalizarBusqueda(busquedaCronogramas);
  const coincideBusqueda = (nombre: string, categoria: string) =>
    consultaCronogramas.split(/\s+/).every((palabra) =>
      normalizarBusqueda(`${nombre} ${categoria}`).includes(palabra)
    );
  const continuosVisibles = cronogramasContinuos.filter((item) => {
    if (!coincideBusqueda(item.nombre, item.categoriaNombre)) return false;
    if (filtroCronogramas === 'pagadas') return item.pendientePeriodo === 0;
    if (filtroCronogramas === 'activas') return item.pendientePeriodo > 0;
    return true;
  });
  const deudasVisibles = deudas.filter((d) => {
    const categoria = categorias.find((c) => c.id === d.categoria_id)?.nombre || 'Otros';
    if (!coincideBusqueda(d.nombre, categoria)) return false;
    const cuotasD = cuotas.filter((c) => c.deuda_id === d.id);
    const estaPagada = cuotasD.length > 0 && cuotasD.every((c) => {
      const pagado = pagosDeuda.filter((p) => p.cuota_id === c.id)
        .reduce((total, p) => total + p.monto, 0);
      return c.monto - pagado <= 0.009;
    });
    if (filtroCronogramas === 'activas') return !estaPagada;
    if (filtroCronogramas === 'pagadas') return estaPagada;
    return true;
  });
  const clavesVisibles = [
    ...continuosVisibles.map((c) => c.idKey),
    ...deudasVisibles.map((d) => `deuda-${d.id}`),
  ];
  const totalCronogramas = deudas.length + cronogramasContinuos.length;
  const hayAbiertos = clavesVisibles.some((k) => cronogramasExpandidos[k]);

  return (
    <div className="space-y-6 pb-20 md:pb-8 w-full min-w-0">

      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-teal-600 mb-0.5">
            TU AGENDA FINANCIERA
          </p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pagos programados</h1>
          <p className="text-xs text-slate-500">
            Todos tus compromisos con su propio cronograma. Anticipa tu saldo y sigue cada pago.
          </p>
        </div>

        <button disabled={soloLectura}
          onClick={() => {
            setModalTipoCrear('continuo');
            setModalNuevoProgramado(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo pago programado</span>
        </button>
      </div>

      {/* Navegación de pagos: tres opciones completas también en móvil. */}
      <nav aria-label="Secciones de pagos programados"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1 sm:inline-flex sm:gap-1.5">
        {([
          { id: 'agenda', label: 'Agenda', desktopLabel: 'Agenda mensual', icon: CalendarCheck },
          { id: 'cronogramas', label: 'Cronogramas', desktopLabel: 'Cronogramas', icon: FileText },
          { id: 'ingresos', label: 'Ingresos', desktopLabel: 'Ingresos programados', icon: Wallet },
        ] as const).map(({ id, label, desktopLabel, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setSubTab(id)} aria-pressed={subTab === id}
            className={`flex min-w-0 min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-xs ${
              subTab === id
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}>
            <Icon aria-hidden="true" className="w-[18px] h-[18px] shrink-0 sm:w-4 sm:h-4" />
            <span className="sm:hidden">{label}</span>
            <span className="hidden sm:inline">{desktopLabel}</span>
          </button>
        ))}
      </nav>
      {soporteEtapa5&&pagosDeuda.length>0&&<details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="min-h-10 cursor-pointer text-sm font-semibold text-slate-700">Abonos registrados ({pagosDeuda.length})</summary>
        <p className="mb-3 text-xs text-slate-500">Para corregir un abono, anúlalo completo y vuelve a registrarlo con los datos correctos.</p>
        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">{[...pagosDeuda].sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id).map(p=>{
          const c=cuotas.find(c=>c.id===p.cuota_id); const d=deudas.find(d=>d.id===c?.deuda_id);
          return <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
            <div><strong>{d?`${d.nombre} · Cuota ${c?.numero}`:'Abono de cronograma retirado'}</strong><p className="mt-1 text-slate-500">{p.fecha.split('-').reverse().join('/')} · {formatearMoneda(p.monto)}{fechaReferencia&&p.fecha<=fechaReferencia?' · Incluido en saldo de referencia':''}</p></div>
            <button type="button" disabled={soloLectura||escribiendo} className="min-h-10 rounded-lg border border-slate-200 px-3 text-red-600 disabled:opacity-50" onClick={async()=>{try{
              if(!await confirmarAccion({title:'¿Anular este abono?',text:'Se retirará también su gasto vinculado. Una cuota activa volverá a quedar pendiente.',confirmButtonText:'Anular abono'}))return;
              const datos={pago_id:p.id};await ejecutarOperacion('anular_abono',datos,solicitudPara('anular_abono',datos));
            }catch(error){reportarError(error);}}}>Anular abono</button>
          </div>;
        })}</div>
      </details>}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* PESTAÑA 1: AGENDA MENSUAL                                                */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {subTab === 'agenda' && (
        <div className="space-y-4">
          {/* Barra de Filtros: Mes, Tipo, Estado, Mes actual */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Mes
                </label>
                <div className="flex gap-2">
                  <select
                    value={agendaMes}
                    onChange={(e) => setAgendaMes(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    {NOMBRES_MESES.map((m, idx) => (
                      <option key={idx} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={agendaAnio}
                    onChange={(e) => setAgendaAnio(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Tipo
                </label>
                <select
                  value={agendaTipo}
                  onChange={(e) =>
                    setAgendaTipo(e.target.value as 'todos' | 'continuo' | 'cuotas')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos los pagos</option>
                  <option value="continuo">Continuos o fijos</option>
                  <option value="cuotas">Cantidad definida (Cuotas)</option>
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Estado
                </label>
                <select
                  value={agendaEstado}
                  onChange={(e) =>
                    setAgendaEstado(
                      e.target.value as 'todos' | 'pendiente' | 'pagado' | 'vencido'
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="pagado">Pagados</option>
                  <option value="vencido">Vencidos</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setAgendaMes(hoy.getMonth());
                    setAgendaAnio(hoy.getFullYear());
                  }}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <span>Mes actual</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 Tarjetas KPI: Programado del mes, Pagado de este mes, Pendiente, Vencido */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 block truncate">
                Programado del mes
              </span>
              <strong className="text-lg sm:text-xl font-black text-slate-900 block mt-0.5 truncate">
                {formatearMoneda(resumenAgenda.programado)}
              </strong>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 block truncate">
                Pagado de este mes
              </span>
              <strong className="text-lg sm:text-xl font-black text-emerald-600 block mt-0.5 truncate">
                {formatearMoneda(resumenAgenda.pagado)}
              </strong>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 block truncate">
                Pendiente
              </span>
              <strong className="text-lg sm:text-xl font-black text-amber-600 block mt-0.5 truncate">
                {formatearMoneda(resumenAgenda.pendiente)}
              </strong>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 block truncate">
                Vencido
              </span>
              <strong
                className={`text-lg sm:text-xl font-black block mt-0.5 truncate ${
                  resumenAgenda.vencido > 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {formatearMoneda(resumenAgenda.vencido)}
              </strong>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Totales según el mes de vencimiento. Los pagos se registran en Movimientos con su fecha real. Un vencimiento no confirma un pago automáticamente.
          </p>

          {/* Tabla de la Agenda con Botones Directos de Registrar Pago, Editar y Eliminar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full min-w-0">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50/80 text-slate-500 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Vencimiento</th>
                    <th className="py-3 px-4">Compromiso</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Programado</th>
                    <th className="py-3 px-4">Pagado</th>
                    <th className="py-3 px-4">Pendiente</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <CalendarCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <strong className="block text-slate-700 text-sm">
                          No hay pagos para esta selección
                        </strong>
                        <span className="text-xs">Prueba otro mes o cambia los filtros.</span>
                      </td>
                    </tr>
                  ) : (
                    filasFiltradas.map((r) => {
                      const [y, m, d] = r.fecha.split('-');
                      const isOverdue = r.estado === 'vencido';
                      const isPaid = r.estado === 'pagado';

                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isOverdue ? 'bg-red-50/30' : ''
                          }`}
                        >
                          {/* Vencimiento */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-800">
                            {d}/{m}/{y}
                          </td>

                          {/* Compromiso */}
                          <td className="py-3.5 px-4 min-w-[160px]">
                            <strong className="block text-slate-900 font-extrabold">{r.nombre}</strong>
                            <span className="text-[11px] text-slate-500">{r.detalle}</span>
                          </td>

                          {/* Tipo */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {r.tipo}
                            </span>
                          </td>

                          {/* Programado */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-900">
                            {formatearMoneda(r.programado)}
                          </td>

                          {/* Pagado */}
                          <td
                            className={`py-3.5 px-4 whitespace-nowrap font-bold ${
                              r.pagado > 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {formatearMoneda(r.pagado)}
                          </td>

                          {/* Pendiente */}
                          <td
                            className={`py-3.5 px-4 whitespace-nowrap font-extrabold ${
                              r.pendiente > 0 ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {formatearMoneda(r.pendiente)}
                          </td>

                          {/* Estado */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Pagado
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                Vencido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Pendiente
                              </span>
                            )}
                          </td>

                          {/* Acciones: Registrar pago + Editar + Eliminar + Ver Detalle */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isPaid ? (
                                <button
                                  type="button"
                                  disabled={soloLectura || (procesandoAccion === r.id)}
                                  onClick={() => handleRegistrarPagoAgenda(r)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs cursor-pointer mr-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>
                                    {procesandoAccion === r.id ? '...' : 'Registrar pago'}
                                  </span>
                                </button>
                              ) : (
                                r.tipo === 'Continuo' && (
                                  <button disabled={soloLectura}
                                    type="button"
                                    onClick={() => handleAnularPagoAgenda(r)}
                                    className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 font-bold text-[11px] cursor-pointer mr-1"
                                  >
                                    Anular
                                  </button>
                                )
                              )}

                              {/* Botón Editar Compromiso */}
                              <button
                                type="button"
                                onClick={() => handleAbrirEdicion(r)}
                                title="Editar compromiso"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Botón Eliminar Compromiso */}
                              <button
                                type="button"
                                disabled={soloLectura || (procesandoAccion === r.id)}
                                onClick={() => handleEliminarCompromiso(r)}
                                title="Eliminar compromiso"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Ver cronograma completo */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSubTab('cronogramas');
                                  const cardKey = r.deudaId
                                    ? `deuda-${r.deudaId}`
                                    : `rec-card-${r.recurrenteId}`;
                                  setCronogramasExpandidos((prev) => ({
                                    ...prev,
                                    [cardKey]: true,
                                  }));
                                }}
                                className="text-teal-600 hover:text-teal-700 font-bold text-[11px] inline-flex items-center gap-0.5 cursor-pointer ml-1"
                              >
                                <span>Ver cronograma</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* PESTAÑA 2: CRONOGRAMAS (Tarjetas Idénticas a la Captura 2 de PHP)          */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {subTab === 'cronogramas' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_minmax(180px,1fr)_auto] md:items-center">
            {/* Filtros de cronogramas */}
            <div className="inline-flex justify-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFiltroCronogramas('todos')}
                aria-pressed={filtroCronogramas === 'todos'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroCronogramas === 'todos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Todos ({deudas.length + cronogramasContinuos.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroCronogramas('activas')}
                aria-pressed={filtroCronogramas === 'activas'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroCronogramas === 'activas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                En curso
              </button>
              <button
                type="button"
                onClick={() => setFiltroCronogramas('pagadas')}
                aria-pressed={filtroCronogramas === 'pagadas'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroCronogramas === 'pagadas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Pagados
              </button>
            </div>

            <div className="relative min-w-0">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input type="search" aria-label="Buscar cronograma por nombre o categoría" placeholder="Buscar cronograma…"
                value={busquedaCronogramas} onChange={(e) => setBusquedaCronogramas(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setBusquedaCronogramas(''); }}
                className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-200 bg-slate-50 text-base md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-500 [&::-webkit-search-cancel-button]:appearance-none" />
              {busquedaCronogramas && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusquedaCronogramas('')}
                className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl cursor-pointer"><X aria-hidden="true" className="w-4 h-4" /></button>}
            </div>
            {totalCronogramas > 0 && <button type="button" disabled={clavesVisibles.length === 0}
              onClick={() => setCronogramasExpandidos((prev) => {
                const nuevo = { ...prev };
                clavesVisibles.forEach((k) => { nuevo[k] = !hayAbiertos; });
                return nuevo;
              })}
              className="min-h-11 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default">
              {hayAbiertos ? 'Contraer todos' : 'Expandir todos'}
            </button>}
            </div>
            <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-slate-500">
              {clavesVisibles.length} de {totalCronogramas} cronogramas{consultaCronogramas && ' · Por nombre o categoría'}
            </p>
          </div>

          {deudas.length === 0 && cronogramasContinuos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">
                No tienes cronogramas registrados.
              </p>
              <button disabled={soloLectura}
                onClick={() => {
                  setModalTipoCrear('continuo');
                  setModalNuevoProgramado(true);
                }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:underline cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear tu primer cronograma de pagos</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {clavesVisibles.length === 0 && <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <Search aria-hidden="true" className="w-6 h-6 text-slate-400 mx-auto mb-3" />
                <h2 className="text-sm font-bold text-slate-800">No encontramos cronogramas</h2>
                <p className="text-xs text-slate-500 mt-2">Prueba otro nombre, categoría o estado.</p>
                <button type="button" onClick={() => { setBusquedaCronogramas(''); setFiltroCronogramas('todos'); }}
                  className="min-h-11 mt-3 px-4 text-sm font-semibold text-teal-700 hover:bg-teal-50 rounded-xl cursor-pointer">Restablecer filtros</button>
              </div>}
              {/* 1. SECCIÓN: COMPROMISOS CONTINUOS (HASTA CANCELAR - COMO "SUNO" EN LA FOTO 2) */}
              {continuosVisibles
                .map((card) => {
                  const expandida = Boolean(cronogramasExpandidos[card.idKey]); // Colapsado por defecto

                  return (
                    <article
                      key={card.idKey}
                      id={card.idKey}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
                    >
                      {/* Cabecera de la Tarjeta estilo PHP Schedule-Card */}
                      <div className="p-4 sm:p-6 pb-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-teal-700">
                            HASTA CANCELAR
                          </span>
                          <h2 className="text-xl font-bold text-slate-900 mt-0.5 mb-1.5 break-words">
                            {card.nombre}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500">
                            <span>{card.categoriaNombre}</span>
                            <span>·</span>
                            <span>Recibido: {formatearMoneda(0)}</span>
                            <span>·</span>
                            <span>
                              Importe del período: <strong>{formatearMoneda(card.importePeriodo)}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Lateral con Pendiente y Herramientas (Sliders, Editar, Eliminar) */}
                        <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 w-full md:w-auto">
                          <div className="text-left md:text-right">
                            <span className="block text-[11px] text-slate-400 font-semibold mb-0.5">
                              Pendiente del período
                            </span>
                            <strong className="block text-xl sm:text-2xl font-black text-slate-900">
                              {formatearMoneda(card.pendientePeriodo)}
                            </strong>
                          </div>

                          <div className="flex items-center gap-1.5 pl-3 sm:pl-4 border-l border-slate-200">
                            <button disabled={soloLectura}
                              type="button"
                              onClick={() => abrirModalEdicionRecurrente(card.rec)}
                              title="Duración e importe"
                              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Sliders className="w-4 h-4" />
                            </button>

                            <button disabled={soloLectura}
                              type="button"
                              onClick={() => abrirModalEdicionRecurrente(card.rec)}
                              title="Editar cronograma"
                              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button disabled={soloLectura}
                              type="button"
                              onClick={async () => {
    try {
                                const confirmado = await confirmarAccion({
                                  title: '¿Eliminar cronograma?',
                                  text: `Se retirará "${card.nombre}". Los pagos realizados permanecerán en el historial.`,
                                  confirmButtonText: 'Sí, eliminar',
                                });
                                if (!confirmado) return;

                                if(soporteEtapa5){const datos={recurrente_id:card.rec.id};await ejecutarOperacion('retirar_recurrente',datos,solicitudPara('retirar_recurrente',datos));toastExito('Cronograma retirado. Sus pagos se conservan.');return;}
                                await supabase
                                  .from('movimientos_recurrentes')
                                  .delete()
                                  .eq('id', card.rec.id)
                                  .eq('user_id', user!.id);
                                await supabase
                                  .from('movimientos_agenda')
                                  .delete()
                                  .eq('recurrente_id', card.rec.id)
                                  .eq('user_id', user!.id);
                                await recargarTodo();
                                toastExito(`"${card.nombre}" eliminado`);

    } catch (error) { reportarError(error); }
  }}
                              title="Eliminar cronograma"
                              className="w-8 h-8 rounded-lg bg-transparent hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Resumen de Progreso y Despliegue */}
                      <div className="px-4 sm:px-6 pb-4">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                          <span>
                            <strong>{card.pagosRealizados} pagos realizados</strong> ·{' '}
                            {card.totalVencimientos - card.pagosRealizados} por completar en el período generado
                          </span>
                          <span className="font-bold">{card.pct}% abonado del período</span>
                        </div>

                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all duration-300"
                            style={{ width: `${card.pct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                          <div>
                            {card.proximo ? (
                              <span>
                                Próximo pago: vencimiento {card.proximo.numero} - {card.proximo.fecha} -{' '}
                                <strong className="text-slate-900">
                                  {formatearMoneda(card.proximo.pendiente)}
                                </strong>
                              </span>
                            ) : (
                              <span>Sin pagos pendientes en el período generado.</span>
                            )}
                          </div>

                          <button
                            type="button"
                            aria-expanded={expandida}
                            aria-controls={`vencimientos-${card.idKey}`}
                            onClick={() =>
                              setCronogramasExpandidos((prev) => ({
                                ...prev,
                                [card.idKey]: !expandida,
                              }))
                            }
                            className="inline-flex items-center gap-1.5 font-bold text-teal-700 hover:underline cursor-pointer"
                          >
                            <span>{expandida ? 'Ocultar vencimientos' : 'Ver vencimientos'}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                                expandida ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Tabla de los 13 Vencimientos (Idéntica a la Foto 2) */}
                      <AnimatedDisclosure open={expandida} id={`vencimientos-${card.idKey}`}>
                        <div className="border-t border-slate-200 overflow-x-auto w-full">
                          <table className="w-full text-left text-xs min-w-[550px]">
                            <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-4">N.°</th>
                                <th className="py-2.5 px-4">Vencimiento</th>
                                <th className="py-2.5 px-4">Importe</th>
                                <th className="py-2.5 px-4">Abonado</th>
                                <th className="py-2.5 px-4">Pendiente</th>
                                <th className="py-2.5 px-4">Estado</th>
                                <th className="py-2.5 px-4 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {card.vencimientos.map((v) => {
                                const isPaid = v.estado === 'pagado';
                                const [y, m, d] = v.fecha.split('-');

                                return (
                                  <tr key={v.numero} className="hover:bg-slate-50/70">
                                    <td className="py-3 px-4 font-mono text-slate-400">{v.numero}</td>
                                    <td className="py-3 px-4 font-medium text-slate-800">
                                      {d}/{m}/{y}
                                    </td>
                                    <td className="py-3 px-4 font-bold text-slate-900">
                                      {formatearMoneda(v.importe)}
                                    </td>
                                    <td
                                      className={`py-3 px-4 ${
                                        v.abonado > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                                      }`}
                                    >
                                      {formatearMoneda(v.abonado)}
                                    </td>
                                    <td
                                      className={`py-3 px-4 font-black ${
                                        v.pendiente > 0 ? 'text-slate-900' : 'text-slate-400'
                                      }`}
                                    >
                                      {formatearMoneda(v.pendiente)}
                                    </td>
                                    <td className="py-3 px-4">
                                      {isPaid ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          Pagado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                          Pendiente
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {!isPaid ? (
                                          <button disabled={soloLectura}
                                            type="button"
                                            onClick={async () => {
    try {
                                              if(soporteEtapa5){abrirPago({nombre:card.nombre,monto:v.importe,vencimiento:v.fecha,recurrenteId:card.rec.id});return;}
                                              await supabase.from('movimientos_agenda').insert({
                                                user_id: user!.id,
                                                tipo: 'gasto',
                                                descripcion: card.nombre,
                                                monto: v.importe,
                                                fecha: v.fecha,
                                                categoria_id: card.rec.categoria_id,
                                                es_recurrente: true,
                                                recurrente_id: card.rec.id,
                                                pago_confirmado: true,
                                                fecha_pago: fechaHoyStr,
                                              });
                                              await recargarTodo();

    } catch (error) { reportarError(error); }
  }}
                                            className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs"
                                          >
                                            + Registrar pago
                                          </button>
                                        ) : (
                                          v.movimientoId && (
                                            <button disabled={soloLectura}
                                              type="button"
                                              onClick={async () => {
    try {
                                                await supabase
                                                  .from('movimientos_agenda')
                                                  .delete()
                                                  .eq('id', v.movimientoId!)
                                                  .eq('user_id', user!.id);
                                                await recargarTodo();

    } catch (error) { reportarError(error); }
  }}
                                              className="px-2 py-1 text-slate-400 hover:text-red-600 text-[11px] font-semibold cursor-pointer"
                                            >
                                              Anular
                                            </button>
                                          )
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </AnimatedDisclosure>
                    </article>
                  );
                })}

              {/* 2. SECCIÓN: CRONOGRAMAS EN CUOTAS */}
              {deudasVisibles
                .map((d) => {
                  const cuotasD = cuotas.filter((c) => c.deuda_id === d.id);
                  const totalPactado = cuotasD.reduce((acc, c) => acc + c.monto, 0);
                  let totalAbonado = 0;
                  let pagadas = 0;

                  cuotasD.forEach((c) => {
                    const abono = pagosDeuda
                      .filter((p) => p.cuota_id === c.id)
                      .reduce((acc, p) => acc + p.monto, 0);
                    totalAbonado += abono;
                    if (c.monto - abono <= 0.009) pagadas++;
                  });

                  const pct =
                    totalPactado > 0 ? Math.min(100, Math.round((totalAbonado / totalPactado) * 100)) : 0;
                  const expandida = Boolean(cronogramasExpandidos[`deuda-${d.id}`]); // Colapsado por defecto

                  return (
                    <article
                      key={d.id}
                      id={`deuda-${d.id}`}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
                    >
                      <div className="p-4 sm:p-6 pb-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-teal-700">
                            CANTIDAD DEFINIDA ({cuotasD.length} CUOTAS)
                          </span>
                          <h2 className="text-xl font-bold text-slate-900 mt-0.5 mb-1.5 break-words">{d.nombre}</h2>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500">
                            <span>{categorias.find((c) => c.id === d.categoria_id)?.nombre || 'General'}</span>
                            <span>·</span>
                            <span>Recibido: {formatearMoneda(d.monto_recibido)}</span>
                            <span>·</span>
                            <span>
                              Total pactado: <strong>{formatearMoneda(totalPactado)}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 w-full md:w-auto">
                          <div className="text-left md:text-right">
                            <span className="block text-[11px] text-slate-400 font-semibold mb-0.5">
                              Pendiente total
                            </span>
                            <strong className="block text-xl sm:text-2xl font-black text-slate-900">
                              {formatearMoneda(totalPactado - totalAbonado)}
                            </strong>
                          </div>

                          <div className="flex items-center gap-1.5 pl-3 sm:pl-4 border-l border-slate-200">
                            <button disabled={soloLectura}
                              type="button"
                              onClick={() => handleAjustarCuotasFinDeMes(d.id, d.nombre)}
                              title="Ajustar todas las cuotas al último día de su mes (Fin de mes)"
                              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-700 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <CalendarCheck className="w-4 h-4" />
                            </button>

                            <button disabled={soloLectura}
                              type="button"
                              onClick={() => {
                                setEditTipo('deuda');
                                setEditTipoMovimiento('gasto');
                                setEditId(d.id);
                                setEditNombre(d.nombre);
                                setEditMonto(String(cuotasD[0]?.monto || 0));
                                setEditDia('1');
                                setEditCatId(d.categoria_id ?? '');
                                setModalEdicionAbierto(true);
                              }}
                              title="Editar cronograma"
                              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button disabled={soloLectura}
                              type="button"
                              onClick={async () => {
    try {
                                const confirmado = await confirmarAccion({
                                  title: '¿Eliminar cronograma?',
                                  text: `Se retirará "${d.nombre}" de los pagos pendientes. Se conservarán sus abonos y gastos históricos.`,
                                  confirmButtonText: 'Sí, eliminar',
                                });
                                if (!confirmado) return;

                                if(soporteEtapa5){const datos={deuda_id:d.id};await ejecutarOperacion('retirar_cronograma',datos,solicitudPara('retirar_cronograma',datos));toastExito('Cronograma retirado. Sus pagos se conservan.');return;}
                                await supabase.from('deudas').delete().eq('id', d.id).eq('user_id', user!.id);
                                await recargarTodo();
                                toastExito(`"${d.nombre}" eliminado`);

    } catch (error) { reportarError(error); }
  }}
                              title="Eliminar cronograma"
                              className="w-8 h-8 rounded-lg bg-transparent hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 sm:px-6 pb-4">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                          <span>
                            <strong>
                              {pagadas} de {cuotasD.length} cuotas pagadas
                            </strong>
                          </span>
                          <span className="font-bold">{pct}% abonado</span>
                        </div>

                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                          <button
                            type="button"
                            aria-expanded={expandida}
                            aria-controls={`vencimientos-deuda-${d.id}`}
                            onClick={() =>
                              setCronogramasExpandidos((prev) => ({
                                ...prev,
                                [`deuda-${d.id}`]: !expandida,
                              }))
                            }
                            className="inline-flex items-center gap-1.5 font-bold text-teal-700 hover:underline cursor-pointer ml-auto"
                          >
                            <span>{expandida ? 'Ocultar cuotas' : 'Ver cuotas'}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                                expandida ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <AnimatedDisclosure open={expandida} id={`vencimientos-deuda-${d.id}`}>
                        <div className="border-t border-slate-200 overflow-x-auto w-full">
                          <table className="w-full text-left text-xs min-w-[550px]">
                            <thead className="bg-slate-50 text-slate-500 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-4">Cuota</th>
                                <th className="py-2.5 px-4">Vencimiento</th>
                                <th className="py-2.5 px-4">Importe</th>
                                <th className="py-2.5 px-4">Abonado</th>
                                <th className="py-2.5 px-4">Pendiente</th>
                                <th className="py-2.5 px-4">Estado</th>
                                <th className="py-2.5 px-4 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {cuotasD.map((c) => {
                                const abonado = pagosDeuda
                                  .filter((p) => p.cuota_id === c.id)
                                  .reduce((acc, p) => acc + p.monto, 0);
                                const pendiente = Math.max(0, Math.round((c.monto - abonado) * 100) / 100);
                                const pagada = pendiente <= 0.009;
                                const [anioC, mesC, diaC] = c.fecha.split('-');

                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/70">
                                    <td className="py-3 px-4 font-mono text-slate-500">
                                      {c.numero}/{cuotasD.length}
                                    </td>
                                    <td className="py-3 px-4 font-medium text-slate-800">
                                      {editandoCuotaId === c.id ? (
                                        <div className="inline-flex items-center gap-1.5 bg-white p-1 rounded-lg border border-teal-500 shadow-xs">
                                          <input
                                            type="date"
                                            value={nuevaFechaCuota}
                                            onChange={(e) => setNuevaFechaCuota(e.target.value)}
                                            className="px-2 py-0.5 rounded text-xs font-semibold focus:outline-none"
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            disabled={soloLectura || (guardandoCuotaFecha)}
                                            onClick={() => handleGuardarFechaCuota(c.id)}
                                            className="p-1 rounded bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors"
                                            title="Guardar fecha"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                          </button>
                                          <button disabled={soloLectura}
                                            type="button"
                                            onClick={() => setEditandoCuotaId(null)}
                                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
                                            title="Cancelar"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1.5 group/fecha">
                                          <span>
                                            {diaC}/{mesC}/{anioC}
                                          </span>
                                          <button disabled={soloLectura}
                                            type="button"
                                            onClick={() => {
                                              setEditandoCuotaId(c.id);
                                              setNuevaFechaCuota(c.fecha);
                                            }}
                                            className="opacity-0 group-hover/fecha:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-teal-700 cursor-pointer"
                                            title="Cambiar fecha de vencimiento"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 font-bold text-slate-900">
                                      {formatearMoneda(c.monto)}
                                    </td>
                                    <td
                                      className={`py-3 px-4 ${
                                        abonado > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                                      }`}
                                    >
                                      {formatearMoneda(abonado)}
                                    </td>
                                    <td
                                      className={`py-3 px-4 font-black ${
                                        pendiente > 0 ? 'text-slate-900' : 'text-slate-400'
                                      }`}
                                    >
                                      {formatearMoneda(pendiente)}
                                    </td>
                                    <td className="py-3 px-4">
                                      {pagada ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Pagada
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                                          Pendiente
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      {!pagada && (
                                        <button disabled={soloLectura}
                                          type="button"
                                          onClick={async () => {
    try {
                                            if(soporteEtapa5){abrirPago({nombre:d.nombre,monto:pendiente,vencimiento:c.fecha,cuotaId:c.id});return;}
                                            const { data: movData } = await supabase
                                              .from('movimientos_agenda')
                                              .insert({
                                                user_id: user!.id,
                                                tipo: 'gasto',
                                                descripcion: `${d.nombre} - Cuota #${c.numero}`,
                                                monto: pendiente,
                                                fecha: fechaHoyStr,
                                                categoria_id: d.categoria_id,
                                                es_recurrente: false,
                                                pago_confirmado: true,
                                                fecha_pago: fechaHoyStr,
                                              })
                                              .select('id')
                                              .single();

                                            await supabase.from('deuda_pagos').insert({
                                              user_id: user!.id,
                                              cuota_id: c.id,
                                              monto: pendiente,
                                              fecha: fechaHoyStr,
                                              movimiento_id: movData ? movData.id : null,
                                              solicitud: `pago-cuota-${c.id}-${Date.now()}`,
                                            });
                                            await recargarTodo();

    } catch (error) { reportarError(error); }
  }}
                                          className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                                        >
                                          + Registrar pago
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </AnimatedDisclosure>
                    </article>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* PESTAÑA 3: INGRESOS PROGRAMADOS (Sueldo del Mes y Otros Ingresos)         */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {subTab === 'ingresos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between min-w-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  Sueldo de {NOMBRES_MESES[ingresoMes]}
                </span>
                <strong className="text-lg sm:text-xl font-black text-emerald-600 block mt-0.5 truncate">
                  {formatearMoneda(totalSueldoMesIngresos)}
                </strong>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-slate-500 truncate block">
                  {totalSueldoMesIngresos > 0 ? ingresoModo : 'Sin sueldo'}
                </span>
              </div>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between min-w-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  Otros Ingresos ({NOMBRES_MESES[ingresoMes]})
                </span>
                <strong className="text-lg sm:text-xl font-black text-slate-900 block mt-0.5 truncate">
                  {formatearMoneda(otrosIngresosMes.reduce((acc, i) => acc + i.monto, 0))}
                </strong>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-slate-500 truncate block">
                  {otrosIngresosMes.length} programado(s)
                </span>
              </div>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between min-w-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  Sueldos en el Año {ingresoAnio}
                </span>
                <strong className="text-lg sm:text-xl font-black text-slate-900 block mt-0.5 truncate">
                  {formatearMoneda(totalSueldoAnioIngresos)}
                </strong>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-slate-500 truncate block">
                  {mesesConfiguradosAnio} de 12 meses configurados
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-base font-bold text-slate-900">Mi Perfil de Sueldo</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIngresoMes(hoy.getMonth());
                    setIngresoAnio(hoy.getFullYear());
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-teal-600 flex items-center gap-1 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Mes actual</span>
                </button>
              </div>

              <form onSubmit={handleGuardarSueldoIngresos} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Mes a configurar
                    </label>
                    <select
                      value={ingresoMes}
                      onChange={(e) => setIngresoMes(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                    >
                      {NOMBRES_MESES.map((m, idx) => (
                        <option key={idx} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Año</label>
                    <select
                      value={ingresoAnio}
                      onChange={(e) => setIngresoAnio(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                    >
                      {[hoy.getFullYear(), hoy.getFullYear() + 1].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Modalidad de cobro
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIngresoModo('quincenal')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        ingresoModo === 'quincenal'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      2 Pagos (15 y Fin de Mes)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIngresoModo('mensual')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        ingresoModo === 'mensual'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      1 Pago Mensual
                    </button>
                  </div>
                </div>

                {ingresoModo === 'quincenal' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Sueldo de Quincena (Día 15) · {simboloMoneda}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ingresoS15}
                      onChange={(e) => setIngresoS15(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sueldo Fin de Mes (Día {ultimoDiaSueldo}) · {simboloMoneda}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ingresoS30}
                    onChange={(e) => setIngresoS30(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={ingresoAplicarAnio}
                    onChange={(e) => setIngresoAplicarAnio(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600"
                  />
                  <span>
                    Aplicar estos montos a todos los meses restantes del año {ingresoAnio}
                  </span>
                </label>

                <div className="flex items-center justify-between pt-2">
                  {mensajeSueldo && (
                    <span className="text-xs font-bold text-emerald-600">{mensajeSueldo}</span>
                  )}
                  <button
                    type="submit"
                    disabled={soloLectura || (guardandoSueldo)}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer ml-auto"
                  >
                    {guardandoSueldo ? 'Guardando...' : 'Guardar Sueldo'}
                  </button>
                </div>
              </form>
            </div>

            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Otros Ingresos Programados</h2>
                  <p className="text-xs text-slate-500">
                    Ingresos fijos adicionales en {NOMBRES_MESES[ingresoMes]}
                  </p>
                </div>
                <button disabled={soloLectura}
                  type="button"
                  onClick={() => {
                    setModalTipoCrear('ingreso');
                    setModalNuevoProgramado(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Programar ingreso</span>
                </button>
              </div>

              {otrosIngresosMes.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                  <p className="text-xs text-slate-500 mb-2">
                    No tienes otros ingresos programados para <strong>{NOMBRES_MESES[ingresoMes]} {ingresoAnio}</strong>.
                  </p>
                  <button disabled={soloLectura}
                    type="button"
                    onClick={() => {
                      setModalTipoCrear('ingreso');
                      setModalNuevoProgramado(true);
                    }}
                    className="text-xs font-bold text-teal-600 hover:underline cursor-pointer"
                  >
                    + Programar un ingreso fijo
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {otrosIngresosMes.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-bold text-slate-900">
                            {item.descripcion}
                          </strong>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.recibido
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {item.recibido ? 'Recibido' : 'Por recibir'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 block mt-0.5">
                          Día {item.dia} de cada mes · Fecha: {item.fecha}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-extrabold text-emerald-600 mr-1">
                          +{formatearMoneda(item.monto)}
                        </strong>
                        {!item.recibido ? (
                          <button disabled={soloLectura}
                            type="button"
                            onClick={async () => {
    try {
                              if(soporteEtapa5){abrirPago({nombre:item.descripcion,monto:item.monto,vencimiento:item.fecha,recurrenteId:item.id});return;}
                              await supabase.from('movimientos_agenda').insert({
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

    } catch (error) { reportarError(error); }
  }}
                            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                          >
                            Confirmar
                          </button>
                        ) : (
                          item.movimientoId && (
                            <button disabled={soloLectura}
                              type="button"
                              onClick={async () => {
    try {
                                await supabase
                                  .from('movimientos_agenda')
                                  .delete()
                                  .eq('id', item.movimientoId!)
                                  .eq('user_id', user!.id);
                                await recargarTodo();
                                toastExito('Ingreso desmarcado');

    } catch (error) { reportarError(error); }
  }}
                              className="px-2.5 py-1 text-slate-400 hover:text-amber-600 text-xs font-semibold cursor-pointer"
                            >
                              Anular
                            </button>
                          )
                        )}

                        <button disabled={soloLectura}
                          type="button"
                          onClick={() => abrirModalEdicionRecurrente(item.rec)}
                          title="Editar ingreso programado"
                          className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button disabled={soloLectura}
                          type="button"
                          onClick={() => handleEliminarIngresoProgramado(item)}
                          title="Eliminar ingreso programado"
                          className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: EDITAR COMPROMISO (NOMBRE, MONTO, DÍA, CATEGORÍA)                   */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <AnimatedModal open={Boolean(modalEdicionAbierto)} label="Editar pago programado">
      {modalEdicionAbierto && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            {errorBilletera && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{errorBilletera}</p>}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editTipo === 'recurrente'
                  ? editTipoMovimiento === 'ingreso'
                    ? 'Editar Ingreso Programado'
                    : 'Editar Compromiso Continuo'
                  : 'Editar Cronograma'}
              </h3>
              <button disabled={soloLectura}
                onClick={() => setModalEdicionAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="p-5 space-y-4">
              {editTipo === 'recurrente' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tipo de programación
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditTipoMovimiento('ingreso')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors border ${
                        editTipoMovimiento === 'ingreso'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      + Ingreso programado
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTipoMovimiento('gasto')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors border ${
                        editTipoMovimiento === 'gasto'
                          ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      - Gasto continuo
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                />
              </div>

              {editTipo === 'recurrente' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Monto mensual ({simboloMoneda})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={editMonto}
                        onChange={(e) => setEditMonto(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Día de vencimiento (1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        value={editDia}
                        onChange={(e) => setEditDia(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Iniciar desde (Mes y Año)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={editMesInicio}
                        onChange={(e) => setEditMesInicio(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                      >
                        {NOMBRES_MESES.map((m, idx) => (
                          <option key={m} value={idx}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editAnioInicio}
                        onChange={(e) => setEditAnioInicio(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                      >
                        {[
                          hoy.getFullYear() - 1,
                          hoy.getFullYear(),
                          hoy.getFullYear() + 1,
                          hoy.getFullYear() + 2,
                        ].map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Categoría</label>
                <select
                  value={editCatId}
                  onChange={(e) =>
                    setEditCatId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="">General / Otros</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button disabled={soloLectura}
                  type="button"
                  onClick={() => setModalEdicionAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={soloLectura || (guardandoEdicion)}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
      )}
      </AnimatedModal>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: NUEVO PAGO PROGRAMADO                                              */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {pagoObjetivo&&<RegistrarPagoModal key={pagoObjetivo.solicitud} objetivo={pagoObjetivo} onClose={()=>setPagoObjetivo(null)} />}
      <AnimatedModal open={Boolean(modalNuevoProgramado)} label="Nuevo pago programado">
      {modalNuevoProgramado && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            {errorBilletera && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{errorBilletera}</p>}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">Nuevo Pago Programado</h3>
              <button disabled={soloLectura||creando}
                onClick={() => setModalNuevoProgramado(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearNuevoProgramado} className="p-5 space-y-4">
              <fieldset disabled={creando||soloLectura} className="space-y-4">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setModalTipoCrear('continuo')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    modalTipoCrear === 'continuo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Hasta Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setModalTipoCrear('cuotas')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    modalTipoCrear === 'cuotas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  En Cuotas
                </button>
                <button
                  type="button"
                  onClick={() => setModalTipoCrear('ingreso')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    modalTipoCrear === 'ingreso' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Ingreso Fijo
                </button>
              </div>

              {modalTipoCrear === 'cuotas' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre del compromiso / compra
                    </label>
                    <input
                      type="text"
                      required
                      value={nombreDeuda}
                      onChange={(e) => setNombreDeuda(e.target.value)}
                      placeholder="Ej. Cibertec Deee, Laptop en cuotas, BCP..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        N° de cuotas
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        required
                        value={numCuotas}
                        onChange={(e) => {setNumCuotas(e.target.value);setHistoricos({});}}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Monto por cuota ({simboloMoneda})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={montoPorCuota}
                        onChange={(e) => setMontoPorCuota(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Fecha 1ra cuota
                      </label>
                      <input
                        type="date"
                        required
                        value={fecha1raCuota}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFecha1raCuota(val);
                          if (val) {
                            const [y, m, d] = val.split('-').map(Number);
                            const maxDia = obtenerUltimoDiaMes(y, m - 1);
                            if (d === maxDia) {
                              setForzarFinDeMes(true);
                            }
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Categoría
                      </label>
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

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={forzarFinDeMes}
                        onChange={(e) => setForzarFinDeMes(e.target.checked)}
                        className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Ajustar automáticamente al último día de cada mes (Fin de mes)
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Si está marcado, cada cuota vencerá en el último día de su mes respectivo (ej. 30 Nov, 31 Dic, 31 Ene, 28/29 Feb...).
                        </span>
                      </div>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Descripción
                    </label>
                    <input
                      type="text"
                      required
                      value={recDesc}
                      onChange={(e) => setRecDesc(e.target.value)}
                      placeholder={
                        modalTipoCrear === 'ingreso'
                          ? 'Ej. Renta departamento, Pensión...'
                          : 'Ej. Suno, Internet Fibra, Luz, Alquiler...'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Monto mensual ({simboloMoneda})
                      </label>
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
                        Día de vencimiento (1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        value={recDia}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRecDia(val);
                          if (!recInicioManual) {
                            const diaNum = parseInt(val, 10);
                            if (!isNaN(diaNum) && diaNum >= 1 && diaNum < hoy.getDate()) {
                              const sigMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
                              setRecMesInicio(sigMes.getMonth());
                              setRecAnioInicio(sigMes.getFullYear());
                            } else if (!isNaN(diaNum) && diaNum >= hoy.getDate()) {
                              setRecMesInicio(hoy.getMonth());
                              setRecAnioInicio(hoy.getFullYear());
                            }
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Iniciar desde (Mes y Año)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={recMesInicio}
                        onChange={(e) => {
                          setRecMesInicio(Number(e.target.value));
                          setRecInicioManual(true);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                      >
                        {NOMBRES_MESES.map((m, idx) => (
                          <option key={m} value={idx}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={recAnioInicio}
                        onChange={(e) => {
                          setRecAnioInicio(Number(e.target.value));
                          setRecInicioManual(true);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
                      >
                        {[
                          hoy.getFullYear() - 1,
                          hoy.getFullYear(),
                          hoy.getFullYear() + 1,
                          hoy.getFullYear() + 2,
                        ].map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-teal-700 font-semibold mt-1.5">
                      Primer vencimiento:{' '}
                      {String(
                        Math.min(
                          Math.max(1, parseInt(recDia, 10) || 1),
                          obtenerUltimoDiaMes(recAnioInicio, recMesInicio)
                        )
                      ).padStart(2, '0')}
                      /{String(recMesInicio + 1).padStart(2, '0')}/{recAnioInicio}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Categoría
                    </label>
                    <select
                      value={recCatId}
                      onChange={(e) =>
                        setRecCatId(e.target.value === '' ? '' : Number(e.target.value))
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
                </>
              )}

              {soporteEtapa5&&modalTipoCrear==='cuotas'&&cuotasPrevias.length>0&&<section className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <h4 className="text-xs font-bold text-slate-800">Vencimientos y pagos históricos</h4>
                  <p className="text-xs leading-relaxed text-slate-500">Marca solo las cuotas abonadas por completo e indica la fecha real. Para abonos parciales, crea el cronograma y usa Registrar pago.</p>
                  <div className="max-h-64 space-y-3 overflow-y-auto">
                    {cuotasPrevias.map((c,i)=><div key={c.fecha} className="rounded-lg bg-slate-50 p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1"><span>Cuota {i+1} · {c.fecha.split('-').reverse().join('/')}</span><strong>{formatearMoneda(c.monto)}</strong></div>
                      <label className="mt-1 flex min-h-10 items-center gap-2"><input type="checkbox" checked={historicos[i]?.pagada||false} onChange={e=>setHistoricos(prev=>({...prev,[i]:{pagada:e.target.checked,fecha:prev[i]?.fecha||c.fecha}}))}/>Ya pagada</label>
                      {historicos[i]?.pagada&&<label className="block">Fecha real del pago<input required type="date" max={fechaHoyStr} value={historicos[i].fecha} onChange={e=>setHistoricos(prev=>({...prev,[i]:{pagada:true,fecha:e.target.value}}))} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-base"/></label>}
                    </div>)}
                  </div>
                </section>}
                <div className="flex justify-end gap-2 pt-2">
                <button disabled={soloLectura || creando}
                  type="button"
                  onClick={() => setModalNuevoProgramado(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button disabled={soloLectura || creando}
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  Guardar Compromiso
                </button>
              </div>

              </fieldset>
</form>
          </div>
      )}
      </AnimatedModal>
    </div>
  );
};
