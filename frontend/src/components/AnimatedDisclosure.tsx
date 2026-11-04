import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface AnimatedDisclosureProps {
  open: boolean;
  id: string;
  children: ReactNode;
}

/** Keep closing content out of keyboard navigation while its exit finishes. */
export function AnimatedDisclosure({ open, id, children }: AnimatedDisclosureProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div id={id} aria-hidden={!open} inert={!open} className="min-w-0">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
