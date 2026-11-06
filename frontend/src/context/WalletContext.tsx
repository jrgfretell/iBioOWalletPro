import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { createWalletClient, WALLET_TABLES } from '../lib/walletClient';
import { prepararOperacion } from '../lib/pendingOperation';
import type { WalletTable } from '../lib/walletClient';
import { confirmarAccion } from '../lib/alerts';
import { useAuth } from './AuthContext';
import { MONEDAS, formatearMoneda as formatoMonetario, fechaHoyISO } from '../types/wallet';
import type { Billetera, Moneda, Categoria, SueldoMes, MovimientoRecurrente, MovimientoAgenda, Deuda, DeudaCuota, DeudaPago, MonedaConfig } from '../types/wallet';

interface WalletData {
  montoBase: number;
  fechaReferencia: string | null;
  soporteEtapa5: boolean;
  categorias: Categoria[];
  sueldos: SueldoMes[];
  recurrentes: MovimientoRecurrente[];
  movimientos: MovimientoAgenda[];
  deudas: Deuda[];
  cuotas: DeudaCuota[];
  pagosDeuda: DeudaPago[];
}
const emptyData = (): WalletData => ({ montoBase: 0, fechaReferencia: null, soporteEtapa5: false, categorias: [], sueldos: [], recurrentes: [], movimientos: [], deudas: [], cuotas: [], pagosDeuda: [] });
interface WalletContextType extends WalletData {
  billeteras: Billetera[];
  billeteraActual: Billetera | null;
  modoLegacy: boolean;
  soloLectura: boolean;
  loading: boolean;
  ready: boolean;
  escribiendo: boolean;
  error: string | null;
  limpiarError: () => void;
  reportarError: (error: unknown) => void;
  clienteBilletera: Pick<typeof supabase, 'from'>;
  seleccionarBilletera: (id: number) => Promise<boolean>;
  crearBilletera: (nombre: string, moneda: Moneda, montoBase?: number, fechaReferencia?: string) => Promise<boolean>;
  editarBilletera: (id: number, nombre: string, montoBase?: number, fechaReferencia?: string) => Promise<boolean>;
  archivarBilletera: (id: number, archivada: boolean) => Promise<boolean>;
  eliminarBilletera: (id: number) => Promise<boolean>;
  registrarFormulario: (id: string, label: string) => () => void;
  recargarTodo: () => Promise<void>;
  actualizarMontoBase: (monto: number, fecha?: string, solicitud?: string) => Promise<boolean>;
  ejecutarOperacion: (accion: string, datos: Record<string, unknown>, solicitud: string) => Promise<unknown>;
  guardarSueldoMes: (anio: number, mes: number, s15: number, s30: number) => Promise<boolean>;
  guardarSueldoAnual: (anio: number, desdeMes: number, s15: number, s30: number) => Promise<boolean>;
  formatearMoneda: (monto: number) => string;
  simboloMoneda: string;
  monedasDisponibles: MonedaConfig[];
  recargarMonedas: () => Promise<void>;
}
const WalletContext = createContext<WalletContextType | undefined>(undefined);
const storedWallet = (userId: string) => { try { return Number(localStorage.getItem('wallet_actual_'+userId)); } catch { return 0; } };
const rememberWallet = (userId: string, id: number) => { try { localStorage.setItem('wallet_actual_'+userId, String(id)); } catch { /* Private/restricted storage remains optional. */ } };

function enrichWalletsWithConfig(rawWallets: Record<string, unknown>[], rawConfigs: Record<string, unknown>[]): Billetera[] {
  const configMap = new Map<number, { monto_base: number; fecha_referencia: string | null }>();
  for (const c of rawConfigs) {
    if (c.billetera_id != null) {
      configMap.set(Number(c.billetera_id), {
        monto_base: Number(c.monto_base || 0),
        fecha_referencia: typeof c.fecha_referencia === 'string' ? c.fecha_referencia.slice(0, 10) : null,
      });
    }
  }
  return rawWallets.map(w => {
    const id = Number(w.id);
    const cfg = configMap.get(id);
    return {
      ...w,
      id,
      monto_base: cfg?.monto_base ?? 0,
      fecha_referencia: cfg?.fecha_referencia ?? null,
    } as Billetera;
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [billeteraActual, setBilleteraActual] = useState<Billetera | null>(null);
  const [modoLegacy, setModoLegacy] = useState(false);
  const [data, setData] = useState<WalletData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [error, setError] = useState(null as string | null);
  const [retryBootstrap, setRetryBootstrap] = useState(0);
  const [monedasDisponibles, setMonedasDisponibles] = useState<MonedaConfig[]>(() =>
    Object.entries(MONEDAS).map(([codigo, m], i) => ({
      codigo,
      nombre: m.nombre,
      simbolo: m.simbolo,
      activo: true,
      orden: i + 1,
    }))
  );

  const recargarMonedas = useCallback(async () => {
    try {
      const { data: dbMonedas, error: err } = await supabase
        .from('monedas')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });
      if (!err && dbMonedas && dbMonedas.length > 0) {
        setMonedasDisponibles(dbMonedas as MonedaConfig[]);
        for (const m of dbMonedas) {
          MONEDAS[m.codigo] = { nombre: m.nombre, simbolo: m.simbolo };
        }
      }
    } catch {
      // Graceful fallback to default MONEDAS
    }
  }, []);

  useEffect(() => {
    void recargarMonedas();
  }, [recargarMonedas]);
  const current = useRef<Billetera | null>(null);
  const list = useRef<Billetera[]>([]);
  const legacy = useRef(false);
  const userRef = useRef(user?.id);
  const epoch = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const pendingWrites = useRef(0);
  const forms = useRef(new Map<string, string>());

  const reportarError = useCallback((reason: unknown) => {
    const message = reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : '';
    const readable = /^(La moneda|Reactiva|No se puede|El registro|Billetera no disponible|Hay una operación|La billetera cambió)/.test(message);
    setError(readable ? message : 'No pudimos confirmar el resultado. Revisa la conexión y vuelve a intentar con los mismos datos.');
  }, []);
  const registrarFormulario = useCallback((id: string, label: string) => {
    forms.current.set(id, label);
    return () => { forms.current.delete(id); };
  }, []);
  const beginWrite = useCallback(() => { pendingWrites.current++; setEscribiendo(true); }, []);
  const endWrite = useCallback(() => { pendingWrites.current=Math.max(0,pendingWrites.current-1); setEscribiendo(pendingWrites.current>0); }, []);

  const loadData = useCallback(async (wallet: Billetera, oldSchema: boolean, clear: boolean) => {
    const version = ++epoch.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current=controller;
    if (clear) { setData(emptyData()); setReady(false); }
    setLoading(true); setError(null);
    try {
      async function rows(table: WalletTable) {
        const all: Record<string, unknown>[] = [];
        for (let offset=0;;) {
          let request = supabase.from(table).select('*').eq('user_id',wallet.user_id);
          if (!oldSchema) request=request.eq('billetera_id',wallet.id);
          const response=await request.order('id',{ascending:true}).range(offset,offset+499).abortSignal(controller.signal);
          if (response.error) throw response.error;
          const page=(response.data || []) as Record<string, unknown>[];
          all.push(...page); offset+=page.length;
          if(page.length===0) return all;
        }
      }
      const results=await Promise.all(WALLET_TABLES.map(rows));
      if(controller.signal.aborted || version!==epoch.current || userRef.current!==wallet.user_id) return;
      const mapped=Object.fromEntries(WALLET_TABLES.map((table,i)=>[table,results[i].map(row=>{
        const result={...row};
        for (const key of ['fecha','fecha_pago','fecha_referencia']) if (typeof result[key] === 'string') result[key] = result[key].slice(0,10);
        for(const key of ['id','billetera_id','categoria_id','recurrente_id','deuda_id','cuota_id','movimiento_id','monto','monto_base','monto_recibido','sueldo_15','sueldo_30','anio','mes','numero','dia_pago']) {
          if(result[key]!==null && result[key]!==undefined) result[key]=Number(result[key]);
        }
        return result;
      })]));
      const nextMontoBase = Number(mapped.config_billetera[0]?.monto_base || 0);
      const nextFechaRef = (mapped.config_billetera[0]?.fecha_referencia as string) || null;
      setData({
        montoBase: nextMontoBase,
        fechaReferencia: nextFechaRef,
        soporteEtapa5: !!mapped.config_billetera[0] && 'fecha_referencia' in mapped.config_billetera[0],
        categorias: mapped.categorias as unknown as Categoria[],
        sueldos: mapped.sueldos_mes as unknown as SueldoMes[],
        recurrentes: mapped.movimientos_recurrentes as unknown as MovimientoRecurrente[],
        movimientos: (mapped.movimientos_agenda as unknown as MovimientoAgenda[]).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id),
        deudas: (mapped.deudas as unknown as Deuda[]).filter(d=>!d.archivada).sort((a,b)=>b.id-a.id),
        cuotas: (mapped.deuda_cuotas as unknown as DeudaCuota[]).filter(c=>(mapped.deudas as unknown as Deuda[]).some(d=>d.id===c.deuda_id&&!d.archivada)).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.numero-b.numero),
        pagosDeuda: mapped.deuda_pagos as unknown as DeudaPago[],
      });
      // Sincronizar monto_base y fecha_referencia en la billetera activa y en la lista
      const updatedList = list.current.map(w => w.id === wallet.id ? { ...w, monto_base: nextMontoBase, fecha_referencia: nextFechaRef } : w);
      list.current = updatedList;
      setBilleteras(updatedList);
      if (current.current?.id === wallet.id) {
        const updatedCurrent = { ...current.current, monto_base: nextMontoBase, fecha_referencia: nextFechaRef };
        current.current = updatedCurrent;
        setBilleteraActual(updatedCurrent);
      }
      setReady(true);
    } catch {
      if(version===epoch.current && !controller.signal.aborted) setError('No se pudieron cargar los datos. Reintenta actualizar la vista para comprobar su estado.');
    } finally { if(version===epoch.current) setLoading(false); }
  },[]);

  const activate = useCallback(async (wallet: Billetera | null, oldSchema: boolean) => {
    current.current=wallet;
    setBilleteraActual(wallet);
    if(wallet) { rememberWallet(wallet.user_id,wallet.id); await loadData(wallet,oldSchema,true); }
    else { ++epoch.current; abort.current?.abort(); setData(emptyData()); setReady(false); setLoading(false); }
  },[loadData]);

  useEffect(()=>{
    const uid=user?.id;
    userRef.current=uid;
    const version=++epoch.current;
    abort.current?.abort();
    const controller=new AbortController(); abort.current=controller;
    current.current=null; list.current=[]; forms.current.clear();
    setBilleteras([]); setBilleteraActual(null); setData(emptyData()); setReady(false); setLoading(true); setError(null);
    if(!uid) { setLoading(false); return; }
    void (async()=>{
      try {
        const [response, configsRes] = await Promise.all([
          supabase.from('billeteras').select('*').eq('user_id',uid).order('id').abortSignal(controller.signal),
          supabase.from('config_billetera').select('*').eq('user_id',uid).abortSignal(controller.signal),
        ]);
        if(controller.signal.aborted || version!==epoch.current) return;
        let wallets: Billetera[];
        const oldSchema=response.error?.code==='PGRST205' || response.error?.code==='42P01';
        if(response.error && !oldSchema) throw response.error;
        if(oldSchema) wallets=[{id:-1,user_id:uid,nombre:'Personal',moneda:'PEN',archivada:false,es_principal:true,monto_base:0,fecha_referencia:null}];
        else wallets=enrichWalletsWithConfig((response.data||[]) as Record<string, unknown>[], (configsRes.data||[]) as Record<string, unknown>[]);
        legacy.current=oldSchema; setModoLegacy(oldSchema);
        list.current=wallets; setBilleteras(wallets);
        const remembered=storedWallet(uid);
        const selected=wallets.find(w=>w.id===remembered&&!w.archivada)||wallets.find(w=>w.es_principal&&!w.archivada)||wallets.find(w=>!w.archivada)||null;
        await activate(selected,oldSchema);
      } catch(reason) { if(!controller.signal.aborted && version===epoch.current) { reportarError(reason); setLoading(false); } }
    })();
    return ()=>{controller.abort();abort.current?.abort();++epoch.current;};
  },[user?.id,activate,reportarError,retryBootstrap]);

  const canLeave = useCallback(async()=>{
    if(pendingWrites.current) { reportarError(Error('Hay una operación en curso. Espera a que termine antes de cambiar de billetera.')); return false; }
    if(!forms.current.size) return true;
    return confirmarAccion({title:'¿Cambiar de billetera?',text:'Se cerrarán los formularios abiertos y se descartarán sus cambios sin guardar.',confirmButtonText:'Cambiar de billetera',cancelButtonText:'Seguir aquí',isDanger:false,icon:'question'});
  },[reportarError]);
  const seleccionarBilletera = useCallback(async(id:number)=>{
    if(current.current?.id===id) return true;
    if(!await canLeave() || pendingWrites.current) return false;
    const wallet=list.current.find(w=>w.id===id&&w.user_id===userRef.current);
    if(!wallet) return false;
    await activate(wallet,legacy.current); return true;
  },[activate,canLeave]);
  const recargarTodo = useCallback(async()=>{
    void recargarMonedas();
    if(current.current) await loadData(current.current,legacy.current,false);
    else setRetryBootstrap(value=>value+1);
  },[loadData,recargarMonedas]);

  const clienteBilletera = useMemo(()=>createWalletClient(supabase,{
    userId:user?.id||'',walletId:billeteraActual?.id||0,legacy:modoLegacy,
  },()=>{
    if(!billeteraActual || user?.id!==billeteraActual.user_id || userRef.current!==billeteraActual.user_id || current.current?.id!==billeteraActual.id) throw Error('La billetera cambió. Reabre el formulario para continuar.');
    if(current.current.archivada) throw Error('Reactiva la billetera para modificar sus registros.');
    beginWrite();
  },endWrite),[user?.id,billeteraActual,modoLegacy,beginWrite,endWrite]);

  async function refreshList() {
    const uid=userRef.current;
    if(!uid) throw Error('Sesión no disponible');
    const [{data:wallets,error:failure},{data:configs}]=await Promise.all([
      supabase.from('billeteras').select('*').eq('user_id',uid).order('id'),
      supabase.from('config_billetera').select('*').eq('user_id',uid),
    ]);
    if(failure) throw failure;
    if(userRef.current!==uid) return [];
    const result=enrichWalletsWithConfig((wallets||[]) as Record<string, unknown>[], (configs||[]) as Record<string, unknown>[]);
    list.current=result; setBilleteras(result);
    const selected=result.find(w=>w.id===current.current?.id);
    if(selected) {current.current=selected;setBilleteraActual(selected);}
    return result;
  }

  const crearBilletera = async(nombre:string,moneda:Moneda,montoBase=0,fechaReferencia?:string)=>{
    if(modoLegacy||!user||!await canLeave()||pendingWrites.current) return false;
    beginWrite();
    try {
      const uid=user.id;
      const fecha=fechaReferencia||fechaHoyISO();
      const monto=Number.isFinite(montoBase)?Math.round(montoBase*100)/100:0;
      let response=await supabase.rpc('crear_billetera',{
        p_nombre:nombre.trim(),
        p_moneda:moneda,
        p_monto_base:monto,
        p_fecha_referencia:fecha,
      });
      if(response.error && (response.error.code==='PGRST202' || response.error.message?.includes('crear_billetera'))) {
        response=await supabase.rpc('crear_billetera',{p_nombre:nombre.trim(),p_moneda:moneda});
        if(!response.error && response.data) {
          const createdFallback=(Array.isArray(response.data)?response.data[0]:response.data) as Billetera;
          if(createdFallback?.id && (monto!==0 || fecha)) {
            await supabase.rpc('operacion_billetera',{
              p_billetera_id:Number(createdFallback.id),
              p_solicitud:crypto.randomUUID(),
              p_accion:'saldo_referencia',
              p_datos:{monto,fecha},
            });
          }
        }
      }
      if(response.error) throw response.error;
      if(uid!==userRef.current) return false;
      const created=(Array.isArray(response.data)?response.data[0]:response.data) as Billetera;
      if(!created?.id) throw Error('No se confirmó la billetera creada');
      const wallets=await refreshList();
      await activate(wallets.find(w=>w.id===Number(created.id))||null,false);
      return true;
    } catch(reason) {reportarError(reason);return false;} finally {endWrite();}
  };

  const editarBilletera = async(id:number,nombre:string,montoBase?:number,fechaReferencia?:string)=>{
    if(modoLegacy||!user||pendingWrites.current) return false;
    beginWrite();
    try {
      const uid=user.id;
      const monto=montoBase!==undefined&&Number.isFinite(montoBase)?Math.round(montoBase*100)/100:null;
      const fecha=fechaReferencia||fechaHoyISO();
      const rpcRes=await supabase.rpc('actualizar_billetera',{
        p_billetera_id:id,
        p_nombre:nombre.trim(),
        p_monto_base:monto,
        p_fecha_referencia:monto!==null?fecha:null,
      });
      if(rpcRes.error) {
        if(rpcRes.error.code==='PGRST202' || rpcRes.error.message?.includes('actualizar_billetera')) {
          const response=await supabase.from('billeteras').update({nombre:nombre.trim()}).eq('user_id',uid).eq('id',id).select('id').single();
          if(response.error) throw response.error;
          if(monto!==null) {
            const opRes=await supabase.rpc('operacion_billetera',{
              p_billetera_id:id,
              p_solicitud:crypto.randomUUID(),
              p_accion:'saldo_referencia',
              p_datos:{monto,fecha},
            });
            if(opRes.error) throw opRes.error;
          }
        } else {
          throw rpcRes.error;
        }
      }
      const wallets=await refreshList();
      if(current.current?.id===id) {
        const updated=wallets.find(w=>w.id===id)||current.current;
        await loadData(updated,legacy.current,false);
      }
      return true;
    } catch(reason) {reportarError(reason);return false;} finally {endWrite();}
  };

  const archivarBilletera = async(id:number,archivada:boolean)=>{
    if(modoLegacy||!user||pendingWrites.current) return false;
    if(archivada&&id===current.current?.id&&!await canLeave()) return false;
    if(pendingWrites.current) return false;
    beginWrite();
    try {
      const uid=user.id;
      const response=await supabase.from('billeteras').update({archivada}).eq('user_id',uid).eq('id',id).select('id').single();
      if(response.error) throw response.error;
      if(uid!==userRef.current) return false;
      const wasCurrent=id===current.current?.id;
      const wallets=await refreshList();
      if(wasCurrent) await activate(archivada?(wallets.find(w=>!w.archivada&&w.es_principal)||wallets.find(w=>!w.archivada)||null):(wallets.find(w=>w.id===id)||null),false);
      else if(!current.current&&!archivada) await activate(wallets.find(w=>w.id===id)||null,false);
      return true;
    } catch(reason) {reportarError(reason);return false;} finally {endWrite();}
  };

  const eliminarBilletera = async(id:number)=>{
    if(modoLegacy||!user||pendingWrites.current) return false;
    const target=list.current.find(w=>w.id===id);
    if(!target||target.es_principal) {
      reportarError(new Error('No se puede eliminar la billetera principal.'));
      return false;
    }
    if(id===current.current?.id&&!await canLeave()) return false;
    beginWrite();
    try {
      const uid=user.id;
      const response=await supabase.rpc('eliminar_billetera',{p_billetera_id:id});
      if(response.error) throw response.error;
      if(uid!==userRef.current) return false;
      const wasCurrent=id===current.current?.id;
      const wallets=await refreshList();
      if(wasCurrent) {
        const fallback=wallets.find(w=>!w.archivada&&w.es_principal)||wallets.find(w=>!w.archivada)||null;
        await activate(fallback,false);
      }
      return true;
    } catch(reason) {reportarError(reason);throw reason;} finally {endWrite();}
  };

  const ejecutarOperacion = async(accion:string,datos:Record<string,unknown>,solicitud:string)=>{
    const wallet=billeteraActual;
    if(!data.soporteEtapa5||!wallet||wallet.archivada||wallet.user_id!==userRef.current||wallet.id!==current.current?.id) throw Error('Billetera no disponible para esta operación.');
    beginWrite();
    try {
      let storage:Storage|null=null;try{storage=localStorage;}catch{/* Optional in restricted browsers. */}
      const pendiente=await prepararOperacion(storage,wallet.user_id,wallet.id,accion,datos,solicitud);
      if(wallet.id!==current.current?.id||wallet.user_id!==userRef.current)throw Error('La billetera cambió. Reabre el formulario para continuar.');
      const result=await supabase.rpc('operacion_billetera',{p_billetera_id:wallet.id,p_solicitud:pendiente.solicitud,p_accion:accion,p_datos:datos});
      if(result.error) throw result.error;
      pendiente.confirmar();
      if(current.current?.id===wallet.id&&userRef.current===wallet.user_id) await recargarTodo();
      return result.data;
    } finally {endWrite();}
  };
  const actualizarMontoBase = async(monto:number,fecha?:string,solicitud?:string)=>{
    try {
      if(data.soporteEtapa5) {
        if(!fecha||!solicitud) throw Error('El registro de saldo necesita una fecha de referencia.');
        await ejecutarOperacion('saldo_referencia',{monto,fecha},solicitud); return true;
      }
      const response=await clienteBilletera.from('config_billetera').upsert({monto_base:monto,actualizado_el:new Date().toISOString()}, {onConflict:modoLegacy?'user_id':'user_id,billetera_id'});
      if(response.error) throw response.error;
      await recargarTodo();return true;
    }catch(reason){reportarError(reason);return false;}
  };
  const saveSalaries=async(anio:number,months:number[],s15:number,s30:number)=>{
    try {
      const response=await clienteBilletera.from('sueldos_mes').upsert(months.map(mes=>({anio,mes,sueldo_15:s15,sueldo_30:s30})), {onConflict:modoLegacy?'user_id,anio,mes':'user_id,billetera_id,anio,mes'});
      if(response.error) throw response.error;
      await recargarTodo();return true;
    }catch(reason){reportarError(reason);return false;}
  };
  const currency=billeteraActual?.moneda||'PEN';
  const belongsToSession=!!user&&billeteraActual?.user_id===user.id;
  const formatearMoneda=useCallback((amount:number)=>formatoMonetario(amount,currency),[currency]);
  return <WalletContext.Provider value={{...(belongsToSession?data:emptyData()),billeteras:billeteras.filter(w=>w.user_id===user?.id),billeteraActual:belongsToSession?billeteraActual:null,modoLegacy,soloLectura:!belongsToSession||!billeteraActual||billeteraActual.archivada,loading,ready:belongsToSession&&ready,escribiendo,error,limpiarError:()=>setError(null),reportarError,clienteBilletera,seleccionarBilletera,crearBilletera,editarBilletera,archivarBilletera,eliminarBilletera,registrarFormulario,recargarTodo,ejecutarOperacion,actualizarMontoBase,guardarSueldoMes:(a,m,s15,s30)=>saveSalaries(a,[m],s15,s30),guardarSueldoAnual:(a,m,s15,s30)=>saveSalaries(a,Array.from({length:12-m},(_,i)=>m+i),s15,s30),formatearMoneda,simboloMoneda:MONEDAS[currency]?.simbolo||currency,monedasDisponibles,recargarMonedas}}>{children}</WalletContext.Provider>;
}
export function useWallet(): WalletContextType {
  const value=useContext(WalletContext);
  if(!value) throw Error('useWallet requiere WalletProvider');
  return value;
}
export function useWalletFormGuard(open:boolean,label:string) {
  const {registrarFormulario}=useWallet();
  const id=useId();
  useEffect(()=>open?registrarFormulario(id,label):undefined,[open,label,id,registrarFormulario]);
}
