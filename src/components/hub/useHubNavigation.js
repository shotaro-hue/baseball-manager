import { useCallback, useEffect, useRef, useState } from 'react';
import { PRIMARY_SECTIONS, TAB_TO_SECTION, navigationSlot } from './hubNavigation';

let nextSession = 0;
const documentSession = Date.now();
const HISTORY_KEY = 'baseballHubNavigation';

// Transient navigation only. Never serialized into the game save.
export function useHubNavigation(tab, setTab, scope) {
  const [routes, setRoutes] = useState([tab]);
  const [lastTabs, setLastTabs] = useState(() => Object.fromEntries(PRIMARY_SECTIONS.map(s => [s.id, s.defaultTab])));
  const session = useRef(null), routeRef = useRef(routes), setter = useRef(setTab);
  const positions = useRef(new Map()), restore = useRef(null), revisit = useRef(null);
  setter.current = setTab;
  routeRef.current = routes;
  const writeHistory = useCallback((next, push = false) => {
    if (typeof window === 'undefined') return;
    const state = { ...window.history.state, [HISTORY_KEY]: { session: session.current, routes: next } };
    const hash = `#hub/${encodeURIComponent(next.at(-1))}`;
    // Native fragment entries survive back → reload in WebKit. pushState
    // entries crash that sequence even in a standalone HTTP page. See UI-04A QA.
    if (push) window.location.hash = hash;
    window.history.replaceState(state, '', hash);
  }, []);
  const reset = useCallback(target => {
    session.current = `hub-${documentSession}-${++nextSession}`;
    positions.current.clear(); restore.current = null; revisit.current = null;
    routeRef.current = [target]; setRoutes([target]); writeHistory([target]);
  }, [writeHistory]);

  useEffect(() => {
    reset(tab);
    setLastTabs(Object.fromEntries(PRIMARY_SECTIONS.map(s => [s.id, s.defaultTab])));
    if (typeof window === 'undefined') return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const pop = event => {
      const entry = event.state?.[HISTORY_KEY];
      // Native hash assignment also emits a null-state event. Ignore it.
      if (!entry || !Array.isArray(entry.routes) || !entry.routes.length) return;
      if (entry.session !== session.current) {
        // Old saves/years/primary visits cannot restore a discarded UI chain.
        const root = routeRef.current[0];
        reset(root); setter.current(root);
        return;
      }
      let next = entry.routes;
      const pending = revisit.current;
      revisit.current = null;
      if (pending && pending.index === next.length - 1
        && navigationSlot(next.at(-1)) === navigationSlot(pending.target)) {
        next = [...next.slice(0, -1), pending.target];
        writeHistory(next);
      }
      // A case link supplies a new focus/scroll target in the destination.
      // Ordinary back/forward still restores the saved control and position.
      restore.current = pending?.restorePosition === false ? null : positions.current.get(next.at(-1));
      routeRef.current = next; setRoutes(next); setter.current(next.at(-1));
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      window.history.scrollRestoration = previousRestoration;
    };
    // A new save/year starts a fresh UI navigation session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, reset, writeHistory]);

  useEffect(() => {
    const section = TAB_TO_SECTION[tab];
    if (section) setLastTabs(prev => prev[section] === tab ? prev : { ...prev, [section]: tab });
    if (routeRef.current.at(-1) !== tab) reset(tab);
    if (restore.current && typeof window !== 'undefined') {
      const saved = restore.current; restore.current = null;
      const frame = window.requestAnimationFrame(() => {
        if (saved.focus?.isConnected && !saved.focus.closest('[hidden]')) saved.focus.focus({ preventScroll: true });
        window.scrollTo(0, saved.scrollY);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [tab, reset]);

  const navigate = useCallback(target => {
    reset(target); setter.current(target);
  }, [reset]);
  const visit = useCallback((target, replaceCurrent = false, { restorePosition = true } = {}) => {
    const current = routeRef.current;
    // history.go is asynchronous: repeated header clicks must share its visit.
    if (revisit.current || current.at(-1) === target) return;
    if (typeof window !== 'undefined') positions.current.set(current.at(-1), { focus: document.activeElement, scrollY: window.scrollY });
    const existing = current.findIndex(route => navigationSlot(route) === navigationSlot(target));
    if (existing >= 0 && existing < current.length - 1 && typeof window !== 'undefined' && window.history.state?.[HISTORY_KEY]?.session === session.current) {
      revisit.current = { index: existing, target, restorePosition };
      window.history.go(existing - current.length + 1);
      return;
    }
    const next = existing >= 0 ? [...current.slice(0, existing), target]
      : replaceCurrent ? [...current.slice(0, -1), target] : [...current, target];
    routeRef.current = next; setRoutes(next); writeHistory(next, existing < 0 && !replaceCurrent); setter.current(target);
    if (typeof window !== 'undefined' && !replaceCurrent) window.scrollTo(0, 0);
  }, [writeHistory]);
  const open = useCallback((target, options) => visit(target, false, options), [visit]);
  const replace = useCallback(target => visit(target, true), [visit]);
  const back = useCallback(() => {
    const current = routeRef.current;
    if (current.length < 2) return;
    if (typeof window !== 'undefined' && window.history.state?.[HISTORY_KEY]?.session === session.current) window.history.back();
    else { const next = current.slice(0, -1); setRoutes(next); setter.current(next.at(-1)); }
  }, []);
  const activeRoutes = routes.at(-1) === tab ? routes : [tab];
  return { routes: activeRoutes, lastTabs, navigate, open, replace, back,
    currentPrimarySection: TAB_TO_SECTION[tab] || TAB_TO_SECTION[activeRoutes[0]] || 'home' };
}
