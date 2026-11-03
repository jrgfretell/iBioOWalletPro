import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { formatearMoneda } from '../types/wallet';
import type { Categoria } from '../types/wallet';
import { confirmarAccion, alertaInfo, toastExito } from '../lib/alerts';
import { Plus, Edit2, Trash2, Tags, X, Check } from 'lucide-react';

const PALETA_COLORES = [
  '#1abc9c',
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#e67e22',
  '#e74c3c',
  '#f1c40f',
  '#0ea5e9',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#64748b',
];

export const CategoriasView: React.FC = () => {
  const { user } = useAuth();
  const { categorias, movimientos, recargarTodo } = useWallet();

  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nombre, setNombre] = useState<string>('');
  const [color, setColor] = useState<string>('#1abc9c');
  const [guardando, setGuardando] = useState<boolean>(false);

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

  const abrirNueva = () => {
    setEditId(null);
    setNombre('');
    setColor(PALETA_COLORES[categorias.length % PALETA_COLORES.length]);
    setModalAbierto(true);
  };

  const abrirEdicion = (c: Categoria) => {
    setEditId(c.id);
    setNombre(c.nombre);
    setColor(c.color);
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nombre.trim()) return;
    setGuardando(true);
    try {
      if (editId) {
        await supabase
          .from('categorias')
          .update({ nombre: nombre.trim(), color })
          .eq('id', editId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('categorias').insert({
          user_id: user.id,
          nombre: nombre.trim(),
          color,
          icono: 'fa-tag',
        });
      }
      await recargarTodo();
      setModalAbierto(false);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (c: Categoria) => {
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
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Gestión de Categorías</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Personaliza los colores y etiquetas para clasificar tus gastos e ingresos
          </p>
        </div>

        <button
          onClick={abrirNueva}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Categoría</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categorias.map((c) => {
          const stat = estadisticasPorCategoria.get(c.id) || { cantidad: 0, totalGasto: 0 };
          return (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between gap-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0"
                  style={{ backgroundColor: c.color }}
                >
                  <Tags className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-900 truncate">{c.nombre}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stat.cantidad} movimiento(s) · {formatearMoneda(stat.totalGasto)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => abrirEdicion(c)}
                  className="p-2 rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50 cursor-pointer"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {c.nombre.toLowerCase() !== 'otros' && (
                  <button
                    onClick={() => handleEliminar(c)}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editId ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button
                onClick={() => setModalAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Educación, Entretenimiento, Mascotas..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Color Identificador
                </label>
                <div className="grid grid-cols-6 gap-2.5 mb-3">
                  {PALETA_COLORES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setColor(hex)}
                      className="h-9 rounded-xl flex items-center justify-center text-white transition-transform hover:scale-105 cursor-pointer"
                      style={{ backgroundColor: hex }}
                    >
                      {color.toLowerCase() === hex.toLowerCase() && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-600 uppercase">{color}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Guardar Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

