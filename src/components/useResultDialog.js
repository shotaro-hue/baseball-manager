import { useEffect, useRef } from 'react';

// Both archived box scores and score-only results return focus to their opener.
export function useResultDialog(onClose, enabled) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [onClose, enabled]);
  return ref;
}
