import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { 
  Wallet, 
  LogOut, 
  Layers, 
  CheckCircle2, 
  Sparkles 
} from 'lucide-react';

interface Categoria {
  id: number;
  nombre: string;
  color: string;
  icono: string;
}

export const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [montoBase, setMontoBase] = useState<number>(0);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [nuevoMonto, setNuevoMonto] = useState<string>('');
  const [guardandoBase, setGuardandoBase] = useState(false);

  useEffect(() => {
    cargarDatosUsuario();
  }, [user]);

  const cargarDatosUsuario = async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      // 1. Cargar saldo base
      const { data: configData } = await supabase
        .from('config_billetera')
        .select('monto_base')
        .eq('user_id', user.id)
        .maybeSingle();

      if (configData) {
        setMontoBase(Number(configData.monto_base) || 0);
      }

      // 2. Cargar categorías del usuario (creadas automáticamente por el trigger de Supabase)
      const { data: catData } = await supabase
        .from('categorias')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: true });

      if (catData) {
        setCategorias(catData);
      }
    } catch (err) {
      console.error('Error al cargar datos de Supabase:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleActualizarBase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const monto = parseFloat(nuevoMonto);
    if (isNaN(monto) || monto < 0) return;

    setGuardandoBase(true);
    try {
      const { error } = await supabase
        .from('config_billetera')
        .upsert(
          { user_id: user.id, monto_base: monto, actualizado_el: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (!error) {
        setMontoBase(monto);
        setNuevoMonto('');
      }
    } catch (err) {
      console.error('Error al guardar saldo base:', err);
    } finally {
      setGuardandoBase(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Barra de Navegación Superior */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">iBioO Wallet</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                React + Supabase
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de conexión en vivo a Supabase */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>PostgreSQL Conectado</span>
            </div>

            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="text-xs text-slate-500 hidden sm:inline-block max-w-[160px] truncate">
                {user?.email}
              </span>
              <button
                onClick={signOut}
                title="Cerrar sesión"
                className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner de bienvenida y estado de migración */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white shadow-xl relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Fase 1 y 2 Completadas: Base de Datos + Autenticación
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              ¡Bienvenido a tu nueva Billetera Cloud-Native!
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Tu sesión está autenticada mediante <strong>Supabase Auth</strong> y tus datos están protegidos en <strong>PostgreSQL</strong> con políticas de aislamiento RLS.
            </p>
          </div>
        </motion.div>

        {/* Tarjetas de Saldo y Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Saldo Inicial Base */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Inicial Base</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                S/. {montoBase.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <form onSubmit={handleActualizarBase} className="mt-3 flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
                placeholder="Nuevo monto"
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={guardandoBase || !nuevoMonto}
                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                {guardandoBase ? '...' : 'Ajustar'}
              </button>
            </form>
          </div>

          {/* Card 2: Categorías Inicializadas */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Categorías Activas</span>
            <div className="text-2xl font-black text-teal-600 mt-1">
              {categorias.length}
            </div>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Creadas por trigger en Supabase
            </p>
          </div>

          {/* Card 3: Estado de Seguridad RLS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Seguridad RLS</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              Activa
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Aislamiento estricto por <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">auth.uid()</code>
            </p>
          </div>

          {/* Card 4: Base de Datos */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Motor de Datos</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              PostgreSQL
            </div>
            <p className="text-xs text-slate-500 mt-2 truncate">
              ID: qylhstryjbiqjpiofvhn
            </p>
          </div>
        </div>

        {/* Sección: Categorías del Usuario */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tus Categorías en Supabase</h2>
              <p className="text-xs text-slate-500">Categorías vinculadas exclusivamente a tu cuenta</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2.5 py-1 rounded-full">
              {categorias.length} categorías
            </span>
          </div>

          {loadingData ? (
            <div className="text-center py-8 text-slate-400 text-sm">Cargando categorías...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col items-center text-center gap-2"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm shadow-sm"
                    style={{ backgroundColor: cat.color }}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{cat.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
