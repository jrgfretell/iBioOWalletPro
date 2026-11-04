import { WalletSwitcher } from './WalletSwitcher';
import React, { useState } from 'react';
import { WalletProvider, useWallet } from '../context/WalletContext';
import { Navbar } from './Navbar';
import { DashboardView } from './DashboardView';
import { MovimientosView } from './MovimientosView';
import { PagosView } from './PagosView';
import { CategoriasView } from './CategoriasView';
import type { ActiveTab } from '../types/wallet';

const WalletShell: React.FC = () => {
  const {billeteraActual,ready,loading,error,limpiarError,recargarTodo}=useWallet();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 overflow-x-hidden w-full">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0">
        <WalletSwitcher />
        {error&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><div className="flex gap-2"><button type="button" onClick={()=>recargarTodo()} className="min-h-11 px-2 font-semibold underline">Reintentar</button><button type="button" aria-label="Cerrar aviso" onClick={limpiarError} className="min-h-11 px-2">Cerrar</button></div></div>}
        {!ready&&loading?<div role="status" className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Cargando tu billetera…</div>:!billeteraActual?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h1 className="font-bold text-slate-900">Tu próximo comienzo</h1><p className="mt-2 text-sm text-slate-500">Crea una billetera o reactiva una archivada desde el selector.</p></div>:ready?<div key={`${billeteraActual.user_id}:${billeteraActual.id}:${billeteraActual.archivada}`}>
        {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
        {activeTab === 'movimientos' && <MovimientosView />}
        {activeTab === 'pagos' && <PagosView />}
        {activeTab === 'categorias' && <CategoriasView />}
        </div>:null}
      </main>
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
