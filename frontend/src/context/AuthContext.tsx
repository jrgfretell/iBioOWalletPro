import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { alertaError } from '../lib/alerts';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  esAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  esAdmin: false,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const checkAdmin = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setEsAdmin(false);
      return;
    }
    const isKnownAdmin = currentUser.email === 'jrgfretell@gmail.com';
    if (isKnownAdmin) setEsAdmin(true);
    try {
      const { data } = await supabase.rpc('admin_verificar_acceso');
      if (typeof data === 'boolean') {
        setEsAdmin(data);
      }
    } catch {
      if (isKnownAdmin) setEsAdmin(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    setEsAdmin(false);
    setUser(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignorar si la sesión ya fue destruida en el servidor
    }
  }, []);

  // Verificar activamente si la cuenta sigue activa o si fue suspendida/eliminada
  const verificarEstadoCuenta = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) return;

    try {
      const { data, error } = await supabase.rpc('verificar_mi_estado');
      if (error) {
        if (
          error.message?.includes('suspendid') ||
          error.code === '42501' ||
          error.code === 'PGRST301'
        ) {
          await alertaError(
            'Acceso Revocado',
            'Tu cuenta ha sido suspendida por el administrador. Tu sesión ha finalizado.'
          );
          await signOut();
        }
        return;
      }

      if (data && typeof data === 'object' && 'activo' in data) {
        const info = data as { activo: boolean; motivo?: string };
        if (!info.activo) {
          const mensaje =
            info.motivo === 'suspendido'
              ? 'Tu cuenta ha sido suspendida por un administrador.'
              : 'Tu cuenta ya no está disponible en la plataforma.';
          await alertaError('Acceso Denegado', `${mensaje} Tu sesión ha sido cerrada.`);
          await signOut();
        }
      }
    } catch {
      // Errores de red esporádicos no cierran la sesión
    }
  }, [signOut]);

  // 1. Carga inicial y escucha de cambios de sesión
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      void checkAdmin(currentUser);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      void checkAdmin(currentUser);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAdmin]);

  // 2. Escucha de eventos de seguridad en tiempo real (Broadcast)
  useEffect(() => {
    if (!user) return;

    const canalSeguridad = supabase
      .channel('canal_seguridad_auth')
      .on('broadcast', { event: 'usuario_bloqueado' }, async (payload: { payload?: { userId?: string } }) => {
        if (payload?.payload?.userId === user.id) {
          await alertaError(
            'Acceso Suspendido',
            'Un administrador ha suspendido tu cuenta. Tu sesión ha sido cerrada inmediatamente.'
          );
          await signOut();
        }
      })
      .on('broadcast', { event: 'usuario_eliminado' }, async (payload: { payload?: { userId?: string } }) => {
        if (payload?.payload?.userId === user.id) {
          await alertaError(
            'Cuenta Eliminada',
            'Tu cuenta y todos tus datos han sido eliminados por el administrador.'
          );
          await signOut();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(canalSeguridad);
    };
  }, [user, signOut]);

  // 3. Heartbeat periódico y detección al volver a la pestaña (focus / visible)
  useEffect(() => {
    if (!user) return;

    void verificarEstadoCuenta();

    const handleFocus = () => {
      void verificarEstadoCuenta();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verificarEstadoCuenta();
      }
    };

    const timer = setInterval(() => {
      void verificarEstadoCuenta();
    }, 15000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, verificarEstadoCuenta]);

  return (
    <AuthContext.Provider value={{ user, session, loading, esAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
