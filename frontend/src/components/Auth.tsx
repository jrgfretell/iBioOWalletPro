import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Wallet, Mail, Lock, ArrowRight, UserPlus, LogIn, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

export const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingGoogle(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('No se pudo conectar con el servicio de autenticación de Google.');
      }
      setLoadingGoogle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        if (data.session) {
          setSuccessMsg('¡Cuenta creada y sesión iniciada!');
        } else {
          setSuccessMsg('¡Registro completado! Si se requiere confirmación, revisa tu bandeja de entrada.');
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message === 'Invalid login credentials' 
          ? 'Correo o contraseña incorrectos.' 
          : err.message);
      } else {
        setErrorMsg('Ocurrió un error inesperado al procesar tu solicitud.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Cabecera / Logotipo */}
        <div className="text-center mb-8">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mb-4 shadow-lg shadow-teal-500/5 backdrop-blur-sm"
          >
            <Wallet className="w-8 h-8" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">iBioO Wallet</h1>
          <p className="text-slate-400 text-sm mt-1">Control inteligente de tu liquidez y pagos programados</p>
        </div>

        {/* Tarjeta de Autenticación */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Selector de modo (Login / Registro) */}
          <div className="grid grid-cols-2 gap-1 bg-slate-900/60 p-1 rounded-xl mb-6 border border-slate-700/40">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Crear cuenta
            </button>
          </div>

          {/* Botón de Autenticación con Google */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading || loadingGoogle}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-200/90 shadow-sm flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-5 hover:shadow-md"
          >
            {loadingGoogle ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>
                  {mode === 'login' ? 'Iniciar sesión con Google' : 'Registrarse con Google'}
                </span>
              </>
            )}
          </button>

          {/* Divisor Visual */}
          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-slate-700/60 w-full" />
            <span className="bg-slate-800/90 px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none shrink-0">
              o con correo
            </span>
            <div className="border-t border-slate-700/60 w-full" />
          </div>

          {/* Alertas */}
          <AnimatePresence mode="wait">
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold rounded-xl text-sm shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Iniciar Sesión' : 'Registrarme'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Información de seguridad */}
          <div className="mt-6 pt-5 border-t border-slate-700/50 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Protegido con Supabase Auth y RLS en PostgreSQL</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

