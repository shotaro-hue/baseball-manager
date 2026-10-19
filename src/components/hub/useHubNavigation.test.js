import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useHubNavigation } from './useHubNavigation';

let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });

it('reopening an ancestor traverses history so one return reaches the original screen', () => {
  const entries = [null], listeners = new Set(); let index = 0;
  const history = {
    get state() { return entries[index]; },
    replaceState: state => { entries[index] = state; },
    pushState: state => { entries.splice(index + 1); entries.push(state); index++; },
    go: delta => { index += delta; listeners.forEach(fn => fn({ state: entries[index] })); },
    back: () => history.go(-1),
  };
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('window', { history, scrollY: 0, scrollTo: vi.fn(),
    requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame: vi.fn(),
    addEventListener: (type, fn) => { if (type === 'popstate') listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn) });
  let nav;
  function Harness() {
    const [tab, setTab] = useState('fa');
    nav = useHubNavigation(tab, setTab, 'save:2026');
    return React.createElement('div', null, tab);
  }
  act(() => { view = create(React.createElement(Harness)); });
  act(() => nav.open('mailbox'));
  act(() => nav.open('trade'));
  act(() => nav.open('mailbox'));
  expect(nav.routes).toEqual(['fa', 'mailbox']);
  act(() => nav.back());
  expect(nav.routes).toEqual(['fa']);
  expect(view.root.findByType('div').children).toEqual(['fa']);
});
