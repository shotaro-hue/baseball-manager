import React from 'react';
import { act, create } from 'react-test-renderer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TitleScreen from './TitleScreen';
import AppScreenRouter from './AppScreenRouter';
import { getLastLoadResult, getSaveMeta, hasSave, loadGame, saveGame } from '../engine/saveload';

const primary = 'baseball_manager_v1';
const metaKey = `${primary}_meta`;
const roots = [primary, `${primary}_bk1`, `${primary}_bk2`];
const state = (day = 1) => ({ saveId: 'title-resume', teams: [{ id: 0, name: '保存球団', emoji: '⚾', players: [], farm: [], wins: 0, losses: 0 }], myId: 0, year: 2026, gameDay: day, news: [], mailbox: [], seasonHistory: {} });
let rows, view;
beforeEach(() => {
  rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', {
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: key => rows.delete(key),
  });
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function title() {
  const onLoad = vi.fn(() => loadGame());
  await act(async () => { view = create(React.createElement(TitleScreen, { saveExists: hasSave(), onLoad })); });
  return { onLoad, resume: () => view.root.findAllByType('button').find(b => b.children.join('') === '続きから') };
}
const text = () => JSON.stringify(view.toJSON());

it('shows valid metadata and resumes through the existing loader', async () => {
  expect((await saveGame(state())).ok).toBe(true);
  const { resume, onLoad } = await title();
  expect(text()).toContain('保存球団'); expect(text()).toContain('2026');
  await act(async () => { await resume().props.onClick(); });
  expect(onLoad).toHaveBeenCalledOnce();
  expect((await loadGame()).saveId).toBe('title-resume');
});

it.each([null, '{broken', '{}', '[]', 'true', '"broken"', '{"teamName":{},"year":2026}'])(
  'keeps resume available for metadata %s without loading histories on the title', async raw => {
    await saveGame(state());
    if (raw === null) rows.delete(metaKey); else rows.set(metaKey, raw);
    const before = roots.map(key => rows.get(key));
    const open = vi.spyOn(indexedDB, 'open');
    const { resume } = await title();
    expect(resume()).toBeDefined();
    expect(text()).toContain('保存データあり・詳細未取得');
    expect(text()).not.toContain('保存球団'); expect(text()).not.toContain('2026年');
    expect(open).not.toHaveBeenCalled();
    expect(roots.map(key => rows.get(key))).toEqual(before);
    expect((await loadGame()).saveId).toBe('title-resume');
  },
);

it('keeps a successfully written payload accessible when metadata writing fails', async () => {
  const original = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === metaKey) throw new Error('metadata write failed'); original(key, value); };
  expect(await saveGame(state())).toMatchObject({ ok: true, warnings: ['metadata_failed'] });
  expect(getSaveMeta()).toBeNull();
  expect((await title()).resume()).toBeDefined();
  expect((await loadGame()).gameDay).toBe(1);
});

it.each(['broken', null])('offers backup recovery with primary %s and no metadata', async raw => {
  await saveGame(state(1)); await saveGame(state(2));
  if (raw === null) rows.delete(primary); else rows.set(primary, raw);
  rows.delete(metaKey);
  const before = roots.map(key => rows.get(key));
  expect((await title()).resume()).toBeDefined();
  expect((await loadGame()).gameDay).toBe(1);
  expect(getLastLoadResult().status).toBe('recovered');
  expect(roots.map(key => rows.get(key))).toEqual(before);
});

it('does not offer resume for stale metadata without any save candidate', async () => {
  rows.set(metaKey, JSON.stringify({ teamName: '保存球団', year: 2026, gameDay: 1 }));
  expect((await title()).resume()).toBeUndefined();
  expect(await loadGame()).toBeNull(); expect(getLastLoadResult().status).toBe('none');
});

it('keeps corrupt candidates intact and delegates failure to the existing loader', async () => {
  roots.forEach(key => rows.set(key, 'broken')); const before = [...rows];
  expect((await title()).resume()).toBeDefined();
  expect(text()).toContain('保存データあり・詳細未取得');
  expect(await loadGame()).toBeNull(); expect(getLastLoadResult().status).toBe('unrecoverable');
  expect([...rows]).toEqual(before);
});

it('shows the dedicated loader warning independently of ordinary notifications without changing roots', async () => {
  roots.forEach(key => rows.set(key, 'broken')); const before = [...rows];
  const message = 'セーブとバックアップを復旧できませんでした。必要な履歴が欠損・破損しています。';
  await act(async () => { view = create(React.createElement(AppScreenRouter, { app: {
    gs: { screen: 'title', saveExists: true, notif: { type: 'ok', msg: '通常の通知' } }, sf: {}, os: {}, loadError: message,
  } })); });
  expect(view.root.findByProps({ role: 'alert' }).children).toEqual([message]);
  expect(view.root.findAllByType('button').some(b => b.children.join('') === '続きから')).toBe(true);
  expect([...rows]).toEqual(before);
});
