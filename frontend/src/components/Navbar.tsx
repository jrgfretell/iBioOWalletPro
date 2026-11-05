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
  ShieldCheck,
} from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user, esAdmin, signOut } = useAuth();

  const navItems: { id: ActiveTab; label: string; mobileLabel?: string; icon: React.ReactNode; isAdmin?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'movimientos', label: 'Movimientos', mobileLabel: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'pagos', label: 'Pagos programados', mobileLabel: 'Pagos', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'categorias', label: 'Categorías', mobileLabel: 'Categorías', icon: <Tags className="w-4 h-4" /> },
  ];

  if (esAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin',
      mobileLabel: 'Admin',
      icon: <ShieldCheck className="w-4 h-4 text-amber-400" />,
      isAdmin: true,
    });
  }

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
              <span className="font-bold text-white tracking-tight text-lg">Mi Billete</span>
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
                      ? item.isAdmin
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                        : 'bg-teal-500 text-white shadow-sm'
                      : item.isAdmin
                      ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-500/10'
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
            <div className="flex items-center gap-2">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-1 py-1.5 flex items-center justify-between gap-0.5 shadow-2xl safe-area-bottom">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? item.isAdmin
                    ? 'text-amber-400 bg-amber-500/15'
                    : 'text-teal-400 bg-teal-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold tracking-tight text-center w-full block truncate">
                {item.mobileLabel || item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
