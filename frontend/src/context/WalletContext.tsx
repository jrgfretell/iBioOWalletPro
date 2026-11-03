import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type {
  Categoria,
  SueldoMes,
  MovimientoRecurrente,
  MovimientoAgenda,
  Deuda,
  DeudaCuota,
  DeudaPago,
} from '../types/wallet';

interface WalletContextType {
  montoBase: number;
  categorias: Categoria[];
  sueldos: SueldoMes[];
  recurrentes: MovimientoRecurrente[];
  movimientos: MovimientoAgenda[];
  deudas: Deuda[];
  cuotas: DeudaCuota[];
  pagosDeuda: DeudaPago[];
  loading: boolean;
  recargarTodo: () => Promise<void>;
  actualizarMontoBase: (nuevoMonto: number) => Promise<boolean>;
  guardarSueldoMes: (anio: number, mes: number, sueldo15: number, sueldo30: number) => Promise<boolean>;
  guardarSueldoAnual: (anio: number, desdeMes: number, sueldo15: number, sueldo30: number) => Promise<boolean>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [montoBase, setMontoBase] = useState<number>(0);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sueldos, setSueldos] = useState<SueldoMes[]>([]);
  const [recurrentes, setRecurrentes] = useState<MovimientoRecurrente[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoAgenda[]>([]);
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [cuotas, setCuotas] = useState<DeudaCuota[]>([]);
  const [pagosDeuda, setPagosDeuda] = useState<DeudaPago[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const recargarTodo = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [
        resConfig,
        resCat,
        resSueldos,
        resRecurrentes,
        resMovimientos,
        resDeudas,
        resCuotas,
        resPagos,
      ] = await Promise.all([
        supabase.from('config_billetera').select('monto_base').eq('user_id', user.id).maybeSingle(),
        supabase.from('categorias').select('*').eq('user_id', user.id).order('id', { ascending: true }),
        supabase.from('sueldos_mes').select('*').eq('user_id', user.id),
        supabase.from('movimientos_recurrentes').select('*').eq('user_id', user.id).order('dia_pago', { ascending: true }),
        supabase.from('movimientos_agenda').select('*').eq('user_id', user.id).order('fecha', { ascending: false }).order('id', { ascending: false }),
        supabase.from('deudas').select('*').eq('user_id', user.id).order('id', { ascending: false }),
        supabase.from('deuda_cuotas').select('*').eq('user_id', user.id).order('fecha', { ascending: true }).order('numero', { ascending: true }),
        supabase.from('deuda_pagos').select('*').eq('user_id', user.id).order('fecha', { ascending: false }),
      ]);

      if (resConfig.data) {
        setMontoBase(Number(resConfig.data.monto_base) || 0);
      } else {
        setMontoBase(0);
      }

      if (resCat.data) {
        if (resCat.data.length === 0) {
          const defaultCats = [
            { user_id: user.id, nombre: 'Otros', color: '#7f8c8d', icono: 'fa-folder' },
            { user_id: user.id, nombre: 'Servicios', color: '#3498db', icono: 'fa-bolt' },
            { user_id: user.id, nombre: 'Alimentación', color: '#e67e22', icono: 'fa-utensils' },
            { user_id: user.id, nombre: 'Transporte', color: '#2ecc71', icono: 'fa-car' },
          ];
          await supabase.from('categorias').insert(defaultCats);
          const { data: recat } = await supabase
            .from('categorias')
            .select('*')
            .eq('user_id', user.id)
            .order('id', { ascending: true });
          setCategorias((recat || []).map(c => ({ ...c, id: Number(c.id) })));
        } else {
          setCategorias(resCat.data.map(c => ({ ...c, id: Number(c.id) })));
        }
      }

      if (resSueldos.data) {
        setSueldos(
          resSueldos.data.map(s => ({
            ...s,
            anio: Number(s.anio),
            mes: Number(s.mes),
            sueldo_15: Number(s.sueldo_15) || 0,
            sueldo_30: Number(s.sueldo_30) || 0,
          }))
        );
      }

      if (resRecurrentes.data) {
        setRecurrentes(
          resRecurrentes.data.map(r => ({
            ...r,
            id: Number(r.id),
            monto: Number(r.monto) || 0,
            dia_pago: Number(r.dia_pago) || 1,
            categoria_id: r.categoria_id ? Number(r.categoria_id) : null,
          }))
        );
      }

      if (resMovimientos.data) {
        setMovimientos(
          resMovimientos.data.map(m => ({
            ...m,
            id: Number(m.id),
            monto: Number(m.monto) || 0,
            categoria_id: m.categoria_id ? Number(m.categoria_id) : null,
            recurrente_id: m.recurrente_id ? Number(m.recurrente_id) : null,
            es_recurrente: Boolean(m.es_recurrente),
            pago_confirmado: Boolean(m.pago_confirmado),
          }))
        );
      }

      if (resDeudas.data) {
        setDeudas(
          resDeudas.data.map(d => ({
            ...d,
            id: Number(d.id),
            monto_recibido: Number(d.monto_recibido) || 0,
            categoria_id: d.categoria_id ? Number(d.categoria_id) : null,
          }))
        );
      }

      if (resCuotas.data) {
        setCuotas(
          resCuotas.data.map(c => ({
            ...c,
            id: Number(c.id),
            deuda_id: Number(c.deuda_id),
            numero: Number(c.numero),
            monto: Number(c.monto) || 0,
          }))
        );
      }

      if (resPagos.data) {
        setPagosDeuda(
          resPagos.data.map(p => ({
            ...p,
            id: Number(p.id),
            cuota_id: Number(p.cuota_id),
            monto: Number(p.monto) || 0,
            movimiento_id: p.movimiento_id ? Number(p.movimiento_id) : null,
          }))
        );
      }
    } catch (error) {
      console.error('Error al cargar datos de la billetera:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    recargarTodo();
  }, [recargarTodo]);

  const actualizarMontoBase = async (nuevoMonto: number): Promise<boolean> => {
    if (!user) return false;
    const { error } = await supabase
      .from('config_billetera')
      .upsert(
        {
          user_id: user.id,
          monto_base: nuevoMonto,
          actualizado_el: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (!error) {
      setMontoBase(nuevoMonto);
      return true;
    }
    return false;
  };

  const guardarSueldoMes = async (
    anio: number,
    mes: number,
    sueldo15: number,
    sueldo30: number
  ): Promise<boolean> => {
    if (!user) return false;
    const { error } = await supabase
      .from('sueldos_mes')
      .upsert(
        {
          user_id: user.id,
          anio,
          mes,
          sueldo_15: sueldo15,
          sueldo_30: sueldo30,
        },
        { onConflict: 'user_id,anio,mes' }
      );
    if (!error) {
      await recargarTodo();
      return true;
    }
    return false;
  };

  const guardarSueldoAnual = async (
    anio: number,
    desdeMes: number,
    sueldo15: number,
    sueldo30: number
  ): Promise<boolean> => {
    if (!user) return false;
    const registros = [];
    for (let m = desdeMes; m <= 11; m++) {
      registros.push({
        user_id: user.id,
        anio,
        mes: m,
        sueldo_15: sueldo15,
        sueldo_30: sueldo30,
      });
    }
    const { error } = await supabase
      .from('sueldos_mes')
      .upsert(registros, { onConflict: 'user_id,anio,mes' });
    if (!error) {
      await recargarTodo();
      return true;
    }
    return false;
  };

  return (
    <WalletContext.Provider
      value={{
        montoBase,
        categorias,
        sueldos,
        recurrentes,
        movimientos,
        deudas,
        cuotas,
        pagosDeuda,
        loading,
        recargarTodo,
        actualizarMontoBase,
        guardarSueldoMes,
        guardarSueldoAnual,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet debe usarse dentro de un WalletProvider');
  }
  return ctx;
};

