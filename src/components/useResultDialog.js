import { useEffect, useRef } from 'react';

// Both archived box scores and score-only results return focus to their opener.
export function useResultDialog(onClose, enabled) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const opener = document.activeElement;
    const openerContainer = opener?.parentElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector = 'button,input,select,textarea,a[href],summary,[tabindex]';
    const available = node => node.tabIndex >= 0 && !node.disabled
      && !node.closest('[hidden],[inert],[aria-hidden="true"]') && node.getClientRects().length > 0;
    const focusable = () => Array.from(ref.current?.querySelectorAll(selector) || []).filter(available);
    focusable()[0]?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected && available(opener)) opener.focus?.({ preventScroll: true });
      else Array.from(openerContainer?.querySelectorAll(selector) || []).find(available)?.focus({ preventScroll: true });
    };
  }, [onClose, enabled]);
  return ref;
}
