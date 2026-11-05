import { AnimatedModal } from './AnimatedModal';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import type { Categoria } from '../types/wallet';
import { confirmarAccion, alertaInfo, alertaError, toastExito } from '../lib/alerts';
import { Plus, Edit2, Trash2, X, Check, Search, AlertCircle } from 'lucide-react';

const PRESET_COLORS = [
  '#e74c3c', '#c0392b', '#ff7675', '#fd79a8', '#e84393', '#d63031',
  '#e67e22', '#f1c40f', '#f39c12', '#d35400', '#fdcb6e', '#e17055',
  '#2ecc71', '#27ae60', '#1abc9c', '#16a085', '#00b894', '#55efc4',
  '#3498db', '#2980b9', '#0984e3', '#74b9ff', '#1e3799', '#54a0ff',
  '#9b59b6', '#8e44ad', '#a29bfe', '#6c5ce7', '#34495e', '#2c3e50',
  '#7f8c8d', '#b2bec3', '#ffeaa7', '#636e72', '#10ac84'
];

const PRESET_ICONS = [
  // Generales e Identificación
  'fa-tag', 'fa-folder', 'fa-star', 'fa-heart', 'fa-gift', 'fa-wallet',
  // Vivienda y Servicios del Hogar
  'fa-home', 'fa-bolt', 'fa-water', 'fa-plug', 'fa-wifi', 'fa-tv', 'fa-couch',
  // Educación e Hijos
  'fa-graduation-cap', 'fa-school', 'fa-child', 'fa-book', 'fa-chalkboard-user',
  // Transporte y Viajes
  'fa-car', 'fa-bus', 'fa-van-shuttle', 'fa-motorcycle', 'fa-gas-pump', 'fa-plane', 'fa-route',
  // Alimentación y Salidas
  'fa-utensils', 'fa-coffee', 'fa-pizza-slice', 'fa-ice-cream', 'fa-beer-mug-empty', 'fa-wine-glass',
  // Telecomunicaciones
  'fa-mobile-screen', 'fa-phone',
  // Finanzas, Bancos y Préstamos
  'fa-landmark', 'fa-hand-holding-dollar', 'fa-money-bill-wave', 'fa-credit-card', 'fa-percent', 'fa-receipt',
  // Compras
  'fa-shopping-cart', 'fa-basket-shopping', 'fa-bag-shopping',
  // Salud y Seguros
  'fa-heartbeat', 'fa-stethoscope', 'fa-pills', 'fa-shield-halved',
  // Ocio y Deporte
  'fa-gamepad', 'fa-film', 'fa-music', 'fa-ticket', 'fa-dumbbell',
  // Trabajo, Mascotas y Servicios Varios
  'fa-briefcase', 'fa-tools', 'fa-scissors', 'fa-paw', 'fa-key',
  // Ahorro, inversiones y administración
  'fa-piggy-bank', 'fa-coins', 'fa-money-bill-transfer', 'fa-chart-line', 'fa-calculator', 'fa-vault',
  // Tecnología y equipos
  'fa-laptop', 'fa-desktop', 'fa-keyboard', 'fa-print', 'fa-camera', 'fa-headphones',
  // Salud y cuidado personal
  'fa-hospital', 'fa-tooth', 'fa-syringe', 'fa-glasses', 'fa-wheelchair', 'fa-kit-medical',
  // Movilidad y turismo
  'fa-bicycle', 'fa-train', 'fa-taxi', 'fa-ship', 'fa-suitcase-rolling', 'fa-map-location-dot',
  // Ropa, familia, animales y jardín
  'fa-shirt', 'fa-shoe-prints', 'fa-baby', 'fa-dog', 'fa-cat', 'fa-seedling'
];

export const CategoriasView: React.FC = () => {
  const { error: errorBilletera, reportarError, soloLectura, formatearMoneda, clienteBilletera: supabase } = useWallet();
  const { user } = useAuth();
  const { categorias, movimientos, recargarTodo } = useWallet();

  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nombre, setNombre] = useState<string>('');
  const [color, setColor] = useState<string>('#3498db');
  const [icono, setIcono] = useState<string>('fa-folder');
  const [busquedaIcono, setBusquedaIcono] = useState<string>('');
  const [busquedaCategoria, setBusquedaCategoria] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  useWalletFormGuard(modalAbierto, 'Categoría');

  const estadisticasPorCategoria = useMemo(() => {
    const stats = new Map<number, { cantidad: number; totalGasto: number }>();
    categorias.forEach((c) => stats.set(c.id, { cantidad: 0, totalGasto: 0 }));

    movimientos.forEach((m) => {
      if (m.categoria_id && stats.has(m.categoria_id)) {
        const actual = stats.get(m.categoria_id)!;
        actual.cantidad += 1;
        if (m.tipo === 'gasto') actual.totalGasto += m.monto;
      }
    });

    return stats;
  }, [categorias, movimientos]);

  const categoriasFiltradas = useMemo(() => {
    if (!busquedaCategoria.trim()) return categorias;
    const q = busquedaCategoria.toLowerCase().trim();
    return categorias.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [categorias, busquedaCategoria]);

  const iconosFiltrados = useMemo(() => {
    if (!busquedaIcono.trim()) return PRESET_ICONS;
    const q = busquedaIcono.toLowerCase().trim();
    return PRESET_ICONS.filter(
      (ic) => ic.toLowerCase().includes(q) || ic.replace('fa-', '').toLowerCase().includes(q)
    );
  }, [busquedaIcono]);

  const nombreDuplicado = useMemo(() => {
    if (!nombre.trim()) return false;
    const normalizado = nombre.trim().toLowerCase();
    return categorias.some((c) => c.nombre.trim().toLowerCase() === normalizado && c.id !== editId);
  }, [nombre, categorias, editId]);

  const abrirNueva = () => {
    setEditId(null);
    setNombre('');
    setColor(PRESET_COLORS[categorias.length % PRESET_COLORS.length]);
    setIcono('fa-folder');
    setBusquedaIcono('');
    setModalAbierto(true);
  };

  const abrirEdicion = (c: Categoria) => {
    setEditId(c.id);
    setNombre(c.nombre);
    setColor(c.color || '#3498db');
    setIcono(c.icono || 'fa-folder');
    setBusquedaIcono('');
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!user || !nombre.trim()) return;

      if (nombreDuplicado) {
        alertaError(
          'Categoría duplicada',
          `Ya existe una categoría llamada "${nombre.trim()}" en esta billetera. Por favor utiliza un nombre diferente.`
        );
        return;
      }

      setGuardando(true);
      try {
        if (editId) {
          await supabase
            .from('categorias')
            .update({ nombre: nombre.trim(), color, icono })
            .eq('id', editId)
            .eq('user_id', user.id);
          toastExito('Categoría actualizada');
        } else {
          await supabase.from('categorias').insert({
            user_id: user.id,
            nombre: nombre.trim(),
            color,
            icono,
          });
          toastExito('Categoría creada');
        }
        await recargarTodo();
        setModalAbierto(false);
      } finally {
        setGuardando(false);
      }
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('code' in error && (error as { code: string }).code === '23505') ||
          ('message' in error &&
            typeof (error as { message: string }).message === 'string' &&
            (error as { message: string }).message.includes('uq_categorias_billetera_nombre_ci')))
      ) {
        alertaError(
          'Categoría duplicada',
          `Ya existe una categoría llamada "${nombre.trim()}" en esta billetera.`
        );
      } else {
        reportarError(error);
      }
    }
  };

  const handleEliminar = async (c: Categoria) => {
    try {
    if (!user) return;
    if (c.nombre.toLowerCase() === 'otros') {
      alertaInfo('Categoría reservada', 'La categoría predeterminada "Otros" no se puede eliminar.');
      return;
    }
    const confirmado = await confirmarAccion({
      title: '¿Eliminar categoría?',
      text: `¿Deseas eliminar la categoría "${c.nombre}"?`,
      confirmButtonText: 'Sí, eliminar',
    });
    if (!confirmado) return;

    await supabase.from('categorias').delete().eq('id', c.id).eq('user_id', user.id);
    await recargarTodo();
    toastExito(`Categoría "${c.nombre}" eliminada`);

    } catch (error) { reportarError(error); }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Directorio de Categorías</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Personaliza colores, iconos y etiquetas para organizar tus movimientos
          </p>
        </div>

        <button disabled={soloLectura}
          onClick={abrirNueva}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer self-start sm:self-auto transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Categoría</span>
        </button>
      </div>

      {/* Buscador rápido de categorías */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={busquedaCategoria}
            onChange={(e) => setBusquedaCategoria(e.target.value)}
            placeholder="Buscar categoría..."
            className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 font-medium"
          />
          {busquedaCategoria && (
            <button
              type="button"
              onClick={() => setBusquedaCategoria('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-[11px] font-bold text-slate-400 shrink-0 hidden sm:inline">
          {categoriasFiltradas.length} de {categorias.length}
        </span>
      </div>

      {/* Lista directorio de categorías */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
        {categoriasFiltradas.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
            <Search className="w-6 h-6 mx-auto mb-2 text-slate-300" />
            <strong className="block text-slate-700 text-sm">No se encontraron categorías</strong>
            <span className="text-xs">Prueba con otro término de búsqueda.</span>
          </div>
        ) : (
          categoriasFiltradas.map((c) => {
            const stat = estadisticasPorCategoria.get(c.id) || { cantidad: 0, totalGasto: 0 };
            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0 text-base"
                    style={{ backgroundColor: c.color }}
                  >
                    <i className={`fas ${c.icono || 'fa-folder'}`}></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">{c.nombre}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {stat.cantidad} mov. · {formatearMoneda(stat.totalGasto)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={soloLectura}
                    onClick={() => abrirEdicion(c)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 cursor-pointer transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {c.nombre.toLowerCase() !== 'otros' && (
                    <button disabled={soloLectura}
                      onClick={() => handleEliminar(c)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatedModal open={Boolean(modalAbierto)} label="Registrar o editar categoría">
      {modalAbierto && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            {errorBilletera && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{errorBilletera}</p>}
            <div className="p-4 px-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold flex items-center gap-2">
                <i className={`fas ${editId ? 'fa-pen-to-square' : 'fa-plus-circle'} text-teal-400`}></i>
                <span>{editId ? 'Editar Categoría' : 'Nueva Categoría'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-5 space-y-4">
              {/* Vista Previa de Etiqueta Dinámica */}
              <div className="text-center py-2.5 px-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Vista previa de etiqueta
                </span>
                <span
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-white text-xs font-semibold shadow-xs transition-all"
                  style={{ backgroundColor: color }}
                >
                  <i className={`fas ${icono || 'fa-folder'}`}></i>
                  <span>{nombre.trim() || 'Nueva Categoría'}</span>
                </span>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Comida, Servicios, Ocio"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-colors ${
                    nombreDuplicado
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40 text-rose-900'
                      : 'border-slate-200 focus:border-teal-500'
                  }`}
                />
                {nombreDuplicado && (
                  <p className="mt-1.5 text-xs text-rose-600 font-medium flex items-center gap-1.5 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Ya existe una categoría llamada &quot;{nombre.trim()}&quot; en esta billetera.</span>
                  </p>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Color</label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200/70 rounded-xl max-h-24 overflow-y-auto mb-2">
                  {PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setColor(hex)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 cursor-pointer shadow-2xs shrink-0"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    >
                      {color.toLowerCase() === hex.toLowerCase() && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <span>O elige un color personalizado</span>
                  <span className="font-mono text-[11px] text-slate-400 uppercase ml-auto">{color}</span>
                </div>
              </div>

              {/* Icono con Buscador */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Icono</label>
                  <div className="relative w-36">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={busquedaIcono}
                      onChange={(e) => setBusquedaIcono(e.target.value)}
                      placeholder="Buscar icono..."
                      className="w-full pl-6 pr-2 py-1 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl max-h-36 overflow-y-auto">
                  {iconosFiltrados.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcono(ic)}
                      title={ic.replace('fa-', '')}
                      className={`h-8 rounded-lg flex items-center justify-center text-sm transition-all cursor-pointer ${
                        icono === ic
                          ? 'bg-slate-900 text-white shadow-xs scale-105'
                          : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200/60'
                      }`}
                    >
                      <i className={`fas ${ic}`}></i>
                    </button>
                  ))}
                  {iconosFiltrados.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                      No se encontraron iconos para "{busquedaIcono}"
                    </div>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={soloLectura || guardando || !nombre.trim() || nombreDuplicado}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {guardando ? 'Guardando...' : 'Guardar Categoría'}
                </button>
              </div>
            </form>
          </div>
      )}
      </AnimatedModal>
    </div>
  );
};
