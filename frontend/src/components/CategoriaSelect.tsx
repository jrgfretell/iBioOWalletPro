import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Categoria } from '../types/wallet';
import { ordenarCategoriasJerarquicas } from '../types/wallet';

interface CategoriaSelectProps {
  categorias: Categoria[];
  value: string | number;
  onChange: (value: string) => void;
  emptyLabel?: string;
  emptyValue?: string;
  disabled?: boolean;
  className?: string;
}

export const CategoriaSelect: React.FC<CategoriaSelectProps> = ({
  categorias,
  value,
  onChange,
  emptyLabel = 'Sin categoría',
  emptyValue = '',
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    openUp: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const valorStr = value === null || value === undefined ? emptyValue : String(value);

  const ordenadas = useMemo(() => ordenarCategoriasJerarquicas(categorias), [categorias]);

  const seleccionada = useMemo(
    () => ordenadas.find((item) => String(item.categoria.id) === valorStr),
    [ordenadas, valorStr]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ordenadas;
    return ordenadas.filter(
      (item) =>
        item.categoria.nombre.toLowerCase().includes(q) ||
        (item.padre && item.padre.nombre.toLowerCase().includes(q))
    );
  }, [ordenadas, busqueda]);

  const actualizarPosicion = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba = rect.top;
    const openUp = espacioAbajo < 260 && espacioArriba > espacioAbajo;
    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    actualizarPosicion();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => actualizarPosicion();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setBusqueda('');
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setBusqueda('');
        }}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-white flex items-center justify-between gap-2 transition-colors text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {seleccionada ? (
          <span className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] shrink-0 shadow-2xs"
              style={{ backgroundColor: seleccionada.categoria.color || '#64748b' }}
            >
              <i className={`fas ${seleccionada.categoria.icono || 'fa-folder'}`}></i>
            </span>
            <span className="truncate font-medium text-slate-800">
              {seleccionada.padre && (
                <span className="text-slate-400 font-normal">{seleccionada.padre.nombre} / </span>
              )}
              {seleccionada.categoria.nombre}
            </span>
          </span>
        ) : (
          <span className="text-slate-500 truncate">{emptyLabel}</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-teal-600' : ''
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: coords.left,
              width: coords.width,
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              zIndex: 9999,
            }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            {categorias.length > 5 && (
              <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar categoría..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      onClick={() => setBusqueda('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
              {(!busqueda.trim() || emptyLabel.toLowerCase().includes(busqueda.trim().toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => handleSelect(emptyValue)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    valorStr === emptyValue
                      ? 'bg-teal-50 text-teal-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{emptyLabel}</span>
                  {valorStr === emptyValue && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                </button>
              )}

              {filtradas.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Sin coincidencias</p>
              ) : (
                filtradas.map(({ categoria: c, esSubcategoria }) => {
                  const isSelected = valorStr === String(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(String(c.id))}
                      className={`w-full flex items-center justify-between gap-2 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        esSubcategoria ? 'pl-5 pr-2.5' : 'px-2.5'
                      } ${
                        isSelected
                          ? 'bg-teal-50 text-teal-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0 flex-1">
                        {esSubcategoria && (
                          <span className="w-2 h-3.5 border-l-2 border-b-2 border-slate-300 rounded-bl-sm shrink-0 -mt-1" />
                        )}
                        <span
                          className={`${
                            esSubcategoria ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-[11px]'
                          } rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs`}
                          style={{ backgroundColor: c.color || '#64748b' }}
                        >
                          <i className={`fas ${c.icono || 'fa-folder'}`}></i>
                        </span>
                        <span className={`truncate ${esSubcategoria ? 'font-medium' : 'font-semibold'}`}>
                          {c.nombre}
                        </span>
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
