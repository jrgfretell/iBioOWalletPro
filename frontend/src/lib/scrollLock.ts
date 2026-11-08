interface ScrollSnapshot {
  scrollY: number;
  rootOverflow: string;
  rootOverscroll: string;
  body: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'overscrollBehavior'>;
}

let activeLocks = 0;
let snapshot: ScrollSnapshot | null = null;

/** Locks the document scroll while any modal or mobile drawer is open. */
export function lockDocumentScroll(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  if (activeLocks === 0) {
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    snapshot = {
      scrollY,
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      body: {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        overscrollBehavior: body.style.overscrollBehavior,
      },
    };

    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
  }

  activeLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks !== 0 || !snapshot) return;

    const saved = snapshot;
    snapshot = null;
    const root = document.documentElement;
    const body = document.body;
    root.style.overflow = saved.rootOverflow;
    root.style.overscrollBehavior = saved.rootOverscroll;
    body.style.position = saved.body.position;
    body.style.top = saved.body.top;
    body.style.left = saved.body.left;
    body.style.right = saved.body.right;
    body.style.width = saved.body.width;
    body.style.overflow = saved.body.overflow;
    body.style.overscrollBehavior = saved.body.overscrollBehavior;
    window.scrollTo(0, saved.scrollY);
  };
}
