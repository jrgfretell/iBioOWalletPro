import React from 'react';
import { useAuth } from '../context/AuthContext';
import type { ActiveTab } from '../types/wallet';
import {
  Wallet,
  LayoutDashboard,
  History,
  CalendarClock,
  Tags,
  LogOut,
  RefreshCw,
} from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onRefresh: () => void;
  loading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onRefresh,
  loading,
}) => {
  const { user, signOut } = useAuth();

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'movimientos', label: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'pagos', label: 'Pagos programados', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'categorias', label: 'Categorías', icon: <Tags className="w-4 h-4" /> },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-400 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-white tracking-tight text-lg">Mi Billetera</span>
              <span className="font-extrabold text-teal-400 text-lg">Pro</span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/70 p-1 rounded-xl border border-slate-700/60">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right User Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Sincronizar datos con Supabase"
              className="p-2 rounded-xl text-slate-400 hover:text-teal-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Cloud Sync</span>
            </div>

            <div className="flex items-center gap-2 border-l border-slate-700 pl-2 sm:pl-3">
              {user?.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || 'Avatar'}
                  className="w-6 h-6 rounded-full border border-teal-500/50 object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-xs text-slate-300 hidden sm:inline-block max-w-[150px] truncate">
                {user?.user_metadata?.full_name || user?.email}
              </span>
              <button
                onClick={signOut}
                title="Cerrar sesión"
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                isActive ? 'text-teal-400 bg-teal-500/10' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="mt-0.5 truncate max-w-[80px]">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

