import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface AnimatedModalProps {
  open: boolean;
  label: string;
  children: ReactNode;
}

function ModalSurface({ label, children }: Omit<AnimatedModalProps, 'open'>) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the dialog without opening the mobile keyboard automatically.
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <motion.div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full min-w-0 flex justify-center outline-none [&>div]:max-h-[calc(100dvh-2rem)] [&>div]:overflow-y-auto"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          ) || []).filter((el) => el.getClientRects().length > 0);
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function AnimatedModal({ open, label, children }: AnimatedModalProps) {
  return (
    <AnimatePresence>
      {open && <ModalSurface key="modal" label={label}>{children}</ModalSurface>}
    </AnimatePresence>
  );
}
