import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ChevronDown, Check, Search, Plus, Settings } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import type { Billetera } from '../types/wallet';

interface WalletQuickSwitcherProps {
  onNavigateToBilleteras?: () => void;
  onOpenCreate?: () => void;
  compact?: boolean;
}

export const WalletQuickSwitcher: React.FC<WalletQuickSwitcherProps> = ({
  onNavigateToBilleteras,
  onOpenCreate,
  compact = false,
}) => {
  const {
    billeteras,
    billeteraActual,
    montoBase,
    formatearMoneda,
    seleccionarBilletera,
    loading,
    escribiendo,
  } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer clic fuera o con tecla Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      // Auto-focus en el buscador si hay más de 3 billeteras
      if (billeteras.length > 3) {
        setTimeout(() => searchInputRef.current?.focus(), 80);
      }
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, billeteras.length]);

  // Filtrar billeteras activas (no archivadas) por término de búsqueda
  const filteredWallets = useMemo(() => {
    const activeWallets = billeteras.filter((w) => !w.archivada);
    if (!searchTerm.trim()) return activeWallets;
    const term = searchTerm.toLowerCase();
    return activeWallets.filter(
      (w) =>
        w.nombre.toLowerCase().includes(term) ||
        w.moneda.toLowerCase().includes(term)
    );
  }, [billeteras, searchTerm]);

  const handleSelect = async (wallet: Billetera) => {
    if (wallet.id === billeteraActual?.id) {
      setIsOpen(false);
      return;
    }
    await seleccionarBilletera(wallet.id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const badgeColor = (moneda: string) => {
    switch (moneda) {
      case 'USD':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'EUR':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'PEN':
      default:
        return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
    }
  };

  return (
    <div className="relative w-full" ref={popoverRef}>
      {/* Botón Trigger del Selector */}
      <button
        type="button"
        disabled={loading || escribiendo}
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchTerm('');
        }}
        title="Cambiar billetera activa"
        aria-label={`Billetera actual: ${billeteraActual?.nombre || 'Seleccionar'}`}
        className={`w-full flex items-center justify-between gap-2.5 rounded-xl transition-all cursor-pointer select-none text-left ${
          compact
            ? 'py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-white'
            : 'p-2.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-white shadow-xs'
        } ${isOpen ? 'ring-1 ring-slate-500/50 border-slate-500' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
            <Wallet className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[150px]">
                {loading && !billeteraActual
                  ? 'Cargando…'
                  : billeteraActual?.nombre || 'Elige billetera'}
              </span>
              {billeteraActual && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${badgeColor(
                    billeteraActual.moneda
                  )}`}
                >
                  {billeteraActual.moneda}
                </span>
              )}
            </div>
            {!compact && billeteraActual && (
              <p className="text-[11px] text-slate-400 truncate">
                Base: <span className="font-semibold text-slate-300">{formatearMoneda(montoBase)}</span>
              </p>
            )}
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-teal-400' : ''
          }`}
        />
      </button>

      {/* Popover Desplegable */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-800 border border-slate-600/90 rounded-2xl shadow-2xl shadow-slate-950/50 overflow-hidden p-2 text-white min-w-[240px]"
          >
            {/* Buscador de Billeteras (Solo si hay más de 3 billeteras) */}
            {billeteras.filter((w) => !w.archivada).length > 3 && (
              <div className="relative mb-2 px-1 pt-1">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar billetera..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
            )}

            {/* Etiqueta de Sección */}
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Billeteras Activas</span>
              <span className="text-[11px] text-slate-500 font-normal">
                {filteredWallets.length} disponible(s)
              </span>
            </div>

            {/* Lista de Billeteras con Scroll Acotado */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 my-1">
              {filteredWallets.map((wallet) => {
                const isSelected = wallet.id === billeteraActual?.id;
                return (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => handleSelect(wallet)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-teal-500/10 text-white font-semibold border border-teal-400/50 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/80 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${badgeColor(
                          wallet.moneda
                        )}`}
                      >
                        {wallet.moneda}
                      </span>
                      <span className="truncate">{wallet.nombre}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredWallets.length === 0 && (
                <div className="p-3 text-center text-xs text-slate-400">
                  No se encontraron billeteras
                </div>
              )}
            </div>

            {/* Separador y Acciones de Gestión */}
            <div className="pt-2 border-t border-slate-700 space-y-1">
              {onOpenCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenCreate();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 transition-colors cursor-pointer text-left"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear nueva billetera</span>
                </button>
              )}

              {onNavigateToBilleteras && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onNavigateToBilleteras();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors cursor-pointer text-left"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Administrar billeteras...</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

