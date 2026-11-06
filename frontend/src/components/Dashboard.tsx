import { WalletSwitcher } from './WalletSwitcher';
import React, { useState } from 'react';
import { WalletProvider, useWallet } from '../context/WalletContext';
import { Navbar } from './Navbar';
import { DashboardView } from './DashboardView';
import { MovimientosView } from './MovimientosView';
import { PagosView } from './PagosView';
import { CategoriasView } from './CategoriasView';
import { AdminView } from './AdminView';
import type { ActiveTab } from '../types/wallet';

const WalletShell: React.FC = () => {
  const { billeteraActual, ready, loading, error, limpiarError, recargarTodo } = useWallet();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [pagosSubTab, setPagosSubTab] = useState<'agenda' | 'cronogramas' | 'ingresos'>('agenda');

  const handleNavigate = (tab: ActiveTab, subTab?: 'agenda' | 'cronogramas' | 'ingresos') => {
    setActiveTab(tab);
    if (subTab) {
      setPagosSubTab(subTab);
    } else if (tab === 'pagos') {
      setPagosSubTab('agenda');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 flex overflow-x-hidden w-full">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => handleNavigate(tab)}
      >
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0 pb-24 md:pb-8 flex-1">
          {activeTab !== 'admin' && <WalletSwitcher onNavigateToTab={handleNavigate} />}
          {error && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>{error}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => recargarTodo()} className="min-h-11 px-2 font-semibold underline cursor-pointer">
                  Reintentar
                </button>
                <button type="button" aria-label="Cerrar aviso" onClick={limpiarError} className="min-h-11 px-2 cursor-pointer">
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {activeTab === 'admin' ? (
            <AdminView />
          ) : !ready && loading ? (
            <div role="status" className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
              Cargando tu billetera…
            </div>
          ) : !billeteraActual ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h1 className="font-bold text-slate-900">Tu próximo comienzo</h1>
              <p className="mt-2 text-sm text-slate-500">Crea una billetera o reactiva una archivada desde el selector.</p>
            </div>
          ) : ready ? (
            <div key={`${billeteraActual.user_id}:${billeteraActual.id}:${billeteraActual.archivada}`}>
              {activeTab === 'dashboard' && <DashboardView onNavigate={(tab) => handleNavigate(tab)} />}
              {activeTab === 'movimientos' && <MovimientosView />}
              {activeTab === 'pagos' && <PagosView initialSubTab={pagosSubTab} />}
              {activeTab === 'categorias' && <CategoriasView />}
            </div>
          ) : null}
        </main>
      </Navbar>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  return (
    <WalletProvider>
      <WalletShell />
    </WalletProvider>
  );
};
