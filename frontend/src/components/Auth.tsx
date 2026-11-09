import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { getAuthRedirectUrl } from '../lib/mobileAuth';
import { Wallet, Mail, Lock, ArrowRight, ArrowLeft, UserPlus, LogIn, AlertCircle, CheckCircle2, ShieldCheck, KeyRound, Send, Eye, EyeOff } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot';

const mensajeErrorAuth = (error: unknown, action: AuthMode | 'google'): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('invalid login credentials') || message.includes('invalid_credentials')) {
    return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirma tu correo desde el enlace que te enviamos antes de iniciar sesión.';
  }
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return 'No se pudo completar el registro. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.';
  }
  if (message.includes('password should be at least') || message.includes('password is too short')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (message.includes('too many requests') || message.includes('rate limit') || message.includes('429')) {
    return 'Hubo varios intentos seguidos. Espera un momento y vuelve a intentarlo.';
  }
  if (message.includes('invalid email')) {
    return 'Revisa que el correo esté escrito correctamente.';
  }

  if (action === 'forgot') return 'No pudimos enviar el enlace. Revisa el correo e inténtalo nuevamente.';
  if (action === 'register') return 'No pudimos crear la cuenta. Revisa tus datos e inténtalo nuevamente.';
  if (action === 'google') return 'No fue posible conectar con Google. Inténtalo nuevamente.';
  return 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo nuevamente.';
};

export const Auth: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingGoogle(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
          skipBrowserRedirect: Capacitor.isNativePlatform(),
        },
      });
      if (error) throw error;
      // Google bloquea los inicios de sesión dentro de WebViews; Android usa el navegador del sistema.
      if (Capacitor.isNativePlatform()) {
        if (!data.url) throw new Error('No se recibió el enlace de inicio de sesión de Google.');
        await Browser.open({ url: data.url });
      }
    } catch (err: unknown) {
      setErrorMsg(mensajeErrorAuth(err, 'google'));
    } finally {
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
      } else if (mode === 'register') {
        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          ...(Capacitor.isNativePlatform() ? { options: { emailRedirectTo: getAuthRedirectUrl() } } : {}),
        });
        if (error) throw error;

        if (data.session) {
          setSuccessMsg('¡Cuenta creada y sesión iniciada!');
        } else {
          setSuccessMsg('¡Registro completado! Si se requiere confirmación, revisa tu bandeja de entrada.');
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getAuthRedirectUrl('recovery'),
        });
        if (error) throw error;
        setSuccessMsg('¡Enlace enviado! Revisa tu bandeja de entrada o spam para restablecer tu contraseña.');
      }
    } catch (err: unknown) {
      setErrorMsg(mensajeErrorAuth(err, mode));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col justify-center items-center safe-area-page">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Cabecera / Logotipo */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mb-4 shadow-lg shadow-teal-500/5 backdrop-blur-sm"
          >
            <Wallet className="w-8 h-8" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-baseline justify-center gap-1.5">
            <span>Mi Billete</span>
            <span className="text-teal-400">Pro</span>
          </h1>
          <p className="text-slate-300 text-sm mt-2">Tus ingresos, gastos y pagos en un solo lugar.</p>
        </div>

        {/* Tarjeta de Autenticación */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {mode === 'forgot' ? (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); setShowPassword(false); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer mb-3"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a Iniciar Sesión
              </button>
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Recuperar Contraseña</h2>
                  <p className="text-xs text-slate-400">Te enviaremos un enlace seguro a tu correo</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Selector de modo (Login / Registro) */}
              <div className="grid grid-cols-2 gap-1 bg-slate-900/60 p-1 rounded-xl mb-6 border border-slate-700/40">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); setShowPassword(false); }}
                  aria-pressed={mode === 'login'}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
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
                  onClick={() => { setMode('register'); setErrorMsg(null); setSuccessMsg(null); setShowPassword(false); }}
                  aria-pressed={mode === 'register'}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
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
                aria-busy={loadingGoogle}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold rounded-xl text-sm border border-slate-200/90 shadow-sm flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-5 hover:shadow-md"
              >
                {loadingGoogle ? (
                  <><div aria-hidden="true" className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" /><span>Conectando con Google…</span></>
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
                <span className="bg-slate-800/90 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none shrink-0">
                  o con correo
                </span>
                <div className="border-t border-slate-700/60 w-full" />
              </div>
            </>
          )}

          {/* Alertas */}
          <AnimatePresence mode="wait">
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                aria-live="assertive"
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
                role="status"
                aria-live="polite"
                className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Contraseña
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setErrorMsg(null); setSuccessMsg(null); setShowPassword(false); }}
                      className="text-xs text-teal-400 hover:text-teal-300 hover:underline transition-colors cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 6 : undefined}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Ingresa tu contraseña'}
                    aria-describedby={mode === 'register' ? 'auth-password-hint' : undefined}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 px-3.5 flex items-center text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400 rounded-r-xl transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {mode === 'register' && <p id="auth-password-hint" className="mt-1.5 text-xs text-slate-400">Usa al menos 6 caracteres.</p>}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || loadingGoogle}
              aria-busy={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold rounded-xl text-sm shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <><div aria-hidden="true" className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>{mode === 'forgot' ? 'Enviando enlace…' : mode === 'register' ? 'Creando cuenta…' : 'Ingresando…'}</span></>
              ) : mode === 'forgot' ? (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar enlace de recuperación</span>
                </>
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
            <span>Tu cuenta está protegida.</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

