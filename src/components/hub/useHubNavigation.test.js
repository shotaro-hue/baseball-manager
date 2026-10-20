import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useHubNavigation } from './useHubNavigation';

let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });

function mount(initialTab = 'fa', scope = 'save:2026', deferredHistory = false) {
  const entries = [null], listeners = new Set(); let index = 0, hash = '';
  const location = { get hash() { return hash; }, set hash(value) { hash = value; history.pushState(null); } };
  const pending = [];
  const traverse = delta => { if (index + delta < 0 || index + delta >= entries.length) return; index += delta; listeners.forEach(fn => fn({ state: entries[index] })); };
  const history = {
    get state() { return entries[index]; },
    get length() { return entries.length; },
    replaceState: (state, title, url) => { entries[index] = state; if (url) hash = url; },
    pushState: state => { entries.splice(index + 1); entries.push(state); index++; },
    go: delta => { if (deferredHistory) pending.push(delta); else traverse(delta); },
    back: () => history.go(-1),
  };
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('window', { history, location, scrollY: 0, scrollTo: vi.fn(),
    requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame: vi.fn(),
    addEventListener: (type, fn) => { if (type === 'popstate') listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn) });
  let nav;
  function Harness({ scope }) {
    const [tab, setTab] = useState(initialTab);
    nav = useHubNavigation(tab, setTab, scope);
    return React.createElement('div', null, tab);
  }
  act(() => { view = create(React.createElement(Harness, { scope })); });
  return { get nav() { return nav; }, history, location,
    flushHistory: () => act(() => { while (pending.length) traverse(pending.shift()); }),
    setScope: scope => act(() => view.update(React.createElement(Harness, { scope }))) };
}

it('reopening an ancestor traverses history so one return reaches the original screen', () => {
  const h = mount(), { location } = h;
  act(() => h.nav.open('mailbox'));
  expect(location.hash).toBe('#hub/mailbox');
  act(() => h.nav.open('trade'));
  act(() => h.nav.open('mailbox'));
  expect(h.nav.routes).toEqual(['fa', 'mailbox']);
  act(() => h.nav.back());
  expect(h.nav.routes).toEqual(['fa']);
  expect(view.root.findByType('div').children).toEqual(['fa']);
});


it('repeated notification tabs use one browser entry and return to finance', () => {
  const h = mount('finance');
  for (let i = 0; i < 3; i++) {
    act(() => h.nav.open('mailbox'));
    expect(h.nav.routes).toEqual(['finance', 'mailbox']);
    act(() => h.nav.replace('news'));
    expect(h.nav.routes).toEqual(['finance', 'news']);
  }
  expect(h.history.length).toBe(2);
  act(() => h.nav.back());
  expect(h.nav.routes).toEqual(['finance']);
  act(() => h.history.go(1));
  expect(h.nav.routes).toEqual(['finance', 'news']);
});

it('revisits an ancestor notification slot on its requested subtab', () => {
  const h = mount();
  act(() => h.nav.open('mailbox'));
  act(() => h.nav.replace('news'));
  act(() => h.nav.open('trade'));
  act(() => h.nav.open('mailbox'));
  expect(h.nav.routes).toEqual(['fa', 'mailbox']);
  expect(h.history.length).toBe(3);
  act(() => h.nav.replace('news'));
  act(() => h.nav.back());
  expect(h.nav.routes).toEqual(['fa']);
  act(() => h.history.go(1));
  expect(h.nav.routes).toEqual(['fa', 'news']);
});

it('a primary navigation reset does not revive the previous temporary return chain', () => {
  const h = mount('finance');
  act(() => h.nav.open('settings'));
  act(() => h.nav.open('balance'));
  act(() => h.nav.navigate('roster'));
  expect(h.nav.routes).toEqual(['roster']);
  act(() => h.history.back());
  expect(h.nav.routes).toEqual(['roster']);
  expect(h.history.state.baseballHubNavigation.routes).toEqual(['roster']);
});

it('crossing an invalidated visit collapses to the current root before opening another overlay', () => {
  const h = mount('finance');
  act(() => h.nav.open('settings'));
  act(() => h.nav.open('balance'));
  act(() => h.nav.navigate('roster'));
  act(() => h.nav.open('mailbox'));
  act(() => h.history.go(-2));
  expect(h.nav.routes).toEqual(['roster']);
  act(() => h.nav.open('settings'));
  act(() => h.nav.back());
  expect(h.nav.routes).toEqual(['roster']);
});

it('replacing with an ancestor traverses to that entry instead of duplicating a route', () => {
  const h = mount('finance');
  act(() => h.nav.open('settings'));
  act(() => h.nav.open('balance'));
  act(() => h.nav.replace('settings'));
  expect(h.nav.routes).toEqual(['finance', 'settings']);
  act(() => h.nav.back());
  expect(h.nav.routes).toEqual(['finance']);
});

it.each(['another-save:2026', 'save:2027'])('invalidates old browser entries after scope changes to %s', scope => {
  const h = mount('finance');
  act(() => h.nav.open('settings'));
  act(() => h.nav.open('balance'));
  const oldSession = h.history.state.baseballHubNavigation.session;
  h.setScope(scope);
  expect(h.nav.routes).toEqual(['balance']);
  act(() => h.history.back());
  expect(h.nav.routes).toEqual(['balance']);
  expect(h.history.state.baseballHubNavigation.routes).toEqual(['balance']);
  expect(h.history.state.baseballHubNavigation.session).not.toBe(oldSession);
});

it('coalesces repeated ancestor opens until asynchronous history traversal finishes', () => {
  const h = mount('fa', 'save:2026', true);
  act(() => h.nav.open('mailbox'));
  act(() => h.nav.replace('news'));
  act(() => h.nav.open('trade'));
  act(() => { h.nav.open('mailbox'); h.nav.open('mailbox'); });
  h.flushHistory();
  expect(h.nav.routes).toEqual(['fa', 'mailbox']);
  act(() => h.nav.back());
  h.flushHistory();
  expect(h.nav.routes).toEqual(['fa']);
});

it('an explicit case link does not restore the previous control over its requested target', () => {
  const h = mount('trade', 'save:2026', true);
  const focus = vi.fn();
  document.activeElement = { isConnected: true, closest: () => null, focus };
  act(() => h.nav.open('mailbox'));
  act(() => h.nav.open('trade', { restorePosition: false }));
  h.flushHistory();
  expect(h.nav.routes).toEqual(['trade']);
  expect(focus).not.toHaveBeenCalled();
});

it('ordinary back still restores the saved control and scroll position', () => {
  const h = mount('trade', 'save:2026', true);
  const focus = vi.fn();
  document.activeElement = { isConnected: true, closest: () => null, focus };
  window.scrollY = 640;
  act(() => h.nav.open('mailbox'));
  act(() => h.nav.back());
  h.flushHistory();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 640);
});
