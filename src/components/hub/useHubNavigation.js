import { useCallback, useEffect, useRef, useState } from 'react';
import { PRIMARY_SECTIONS, TAB_TO_SECTION } from './hubNavigation';

let nextSession = 0;
const HISTORY_KEY = 'baseballHubNavigation';

// Transient navigation only. Never serialized into the game save.
export function useHubNavigation(tab, setTab, scope) {
  const [routes, setRoutes] = useState([tab]);
  const [lastTabs, setLastTabs] = useState(() => Object.fromEntries(PRIMARY_SECTIONS.map(s => [s.id, s.defaultTab])));
  const session = useRef(null), routeRef = useRef(routes), setter = useRef(setTab);
  const positions = useRef(new Map()), restore = useRef(null);
  setter.current = setTab;
  routeRef.current = routes;
  const writeHistory = useCallback((next, push = false) => {
    if (typeof window === 'undefined') return;
    window.history[push ? 'pushState' : 'replaceState']({ ...window.history.state,
      [HISTORY_KEY]: { session: session.current, routes: next } }, '');
  }, []);

  useEffect(() => {
    session.current = `hub-${++nextSession}`;
    positions.current.clear(); restore.current = null;
    setRoutes([tab]);
    setLastTabs(Object.fromEntries(PRIMARY_SECTIONS.map(s => [s.id, s.defaultTab])));
    writeHistory([tab]);
    if (typeof window === 'undefined') return;
    const pop = event => {
      const next = event.state?.[HISTORY_KEY];
      if (next?.session !== session.current || !Array.isArray(next.routes) || !next.routes.length) return;
      restore.current = positions.current.get(next.routes.at(-1));
      setRoutes(next.routes); setter.current(next.routes.at(-1));
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
    // A new save/year starts a fresh UI navigation session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, writeHistory]);

  useEffect(() => {
    const section = TAB_TO_SECTION[tab];
    if (section) setLastTabs(prev => prev[section] === tab ? prev : { ...prev, [section]: tab });
    if (routeRef.current.at(-1) !== tab) { setRoutes([tab]); writeHistory([tab]); }
    if (restore.current && typeof window !== 'undefined') {
      const saved = restore.current; restore.current = null;
      const frame = window.requestAnimationFrame(() => {
        if (saved.focus?.isConnected && !saved.focus.closest('[hidden]')) saved.focus.focus({ preventScroll: true });
        window.scrollTo(0, saved.scrollY);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [tab, writeHistory]);

  const navigate = useCallback(target => {
    setRoutes([target]); writeHistory([target]); setter.current(target);
  }, [writeHistory]);
  const open = useCallback(target => {
    const current = routeRef.current;
    if (current.at(-1) === target) return;
    if (typeof window !== 'undefined') positions.current.set(current.at(-1), { focus: document.activeElement, scrollY: window.scrollY });
    const existing = current.indexOf(target);
    if (existing >= 0 && typeof window !== 'undefined' && window.history.state?.[HISTORY_KEY]?.session === session.current) {
      window.history.go(existing - current.length + 1);
      return;
    }
    const next = existing >= 0 ? current.slice(0, existing + 1) : [...current, target];
    setRoutes(next); writeHistory(next, existing < 0); setter.current(target);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [writeHistory]);
  const replace = useCallback(target => {
    const next = [...routeRef.current.slice(0, -1), target];
    setRoutes(next); writeHistory(next); setter.current(target);
  }, [writeHistory]);
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
