import { ArrowRight, Sparkles, X } from 'lucide-react';
import { AnimatedModal } from './AnimatedModal';

interface WalletCreatedPromptProps {
  open: boolean;
  walletName: string | null;
  onDismiss: () => void;
  onConfigureIncome: () => void;
}

export function WalletCreatedPrompt({ open, walletName, onDismiss, onConfigureIncome }: WalletCreatedPromptProps) {
  return (
    <AnimatedModal open={open} label="Configuración de ingresos de la billetera">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden text-center p-6 sm:p-7 relative">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-8 ring-teal-50/50 shadow-xs">
          <Sparkles className="h-7 w-7 text-teal-600" />
        </div>

        <h3 className="text-xl font-black text-slate-900 tracking-tight">
          ¡Billetera creada con éxito!
        </h3>

        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
          Has creado <strong className="text-slate-900 font-bold">{walletName}</strong>. ¿Deseas registrar los ingresos programados o sueldo fijo de esta billetera ahora?
        </p>

        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-600 text-left flex items-start gap-2.5">
          <span className="text-base leading-none select-none">💡</span>
          <span className="leading-relaxed">
            Configurar tus ingresos te permitirá proyectar con exactitud tu flujo de liquidez quincena a quincena o mes a mes en el panel de control.
          </span>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            Hacerlo más tarde
          </button>
          <button
            type="button"
            onClick={onConfigureIncome}
            className="min-h-11 flex-1 rounded-xl bg-teal-600 px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>Configurar ingresos</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
