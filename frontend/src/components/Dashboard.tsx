import React, { useState } from 'react';
import { WalletProvider } from '../context/WalletContext';
import { Navbar } from './Navbar';
import { DashboardView } from './DashboardView';
import { MovimientosView } from './MovimientosView';
import { PagosView } from './PagosView';
import { CategoriasView } from './CategoriasView';
import type { ActiveTab } from '../types/wallet';

const WalletShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 overflow-x-hidden w-full">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0">
        {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
        {activeTab === 'movimientos' && <MovimientosView />}
        {activeTab === 'pagos' && <PagosView />}
        {activeTab === 'categorias' && <CategoriasView />}
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
