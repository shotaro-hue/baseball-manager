import React from 'react';
import { act, create } from 'react-test-renderer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { loadGame } from '../engine/saveload';

const positive = { text: '前向きに進みます', popMod: 5, moraleMod: 7 };
const other = { text: '課題を改善します', popMod: -3, moraleMod: 2 };
const article = (id, extra = {}) => ({ id, type: 'interview', headline: `会見${id}`, options: [positive, other], ...extra });
const team = () => ({ id: 0, name: '自球団', popularity: 50, players: [{ id: 'p', name: '選手', morale: 60, stats: {} }], farm: [{ id: 'f', morale: 40 }], coaches: [], wins: 0, losses: 0, lineup: [], rotation: [] });
let gs, view;
beforeEach(() => {
  const rows = new Map();
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) });
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });
async function setup(articles = [article('one'), article('two')]) {
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { gs.setIsAutoSaveSuspended(true); gs.setMyId(0); gs.setTeams([team()]); gs.setNews(articles); });
}
const effects = () => [gs.myTeam.popularity, gs.myTeam.players[0].morale];

it('applies the registered choice once, preserving farm morale and other news', async () => {
  await setup();
  act(() => gs.handleInterview('one', structuredClone(positive)));
  expect(effects()).toEqual([55, 67]); expect(gs.myTeam.farm[0].morale).toBe(40);
  expect(gs.news).toEqual([article('one', { answered: true }), article('two')]);
});
it('rejects two calls to the same ID before React renders, including different choices', async () => {
  await setup(); const answer = gs.handleInterview;
  act(() => { answer('one', positive); answer('one', other); });
  expect(effects()).toEqual([55, 67]); expect(gs.news[0].answered).toBe(true);
  act(() => answer('one', positive)); expect(effects()).toEqual([55, 67]);
});
it('applies different news independently within one React batch', async () => {
  await setup(); const answer = gs.handleInterview;
  act(() => { answer('one', positive); answer('two', other); answer('one', positive); });
  expect(effects()).toEqual([52, 69]); expect(gs.news.every(n => n.answered)).toBe(true);
});
it.each([
  ['missing', positive], ['ordinary', positive], ['done', positive],
  ['one', null], ['one', { ...positive, popMod: 100 }], ['one', { ...positive, moraleMod: NaN }],
])('leaves gameplay unchanged for invalid interview %s / %j', async (id, option) => {
  await setup([article('one'), article('ordinary', { type: 'game' }), article('done', { answered: true })]);
  const before = structuredClone({ teams: gs.teams, news: gs.news });
  act(() => gs.handleInterview(id, option));
  expect({ teams: gs.teams, news: gs.news }).toEqual(before);
});
it('rechecks current news even when the handler was captured before hydration', async () => {
  await setup(); const old = gs.handleInterview;
  act(() => gs.hydrateLargeSaveData({ news: [article('one', { answered: true })] }));
  act(() => old('one', positive)); expect(effects()).toEqual([50, 60]);
  act(() => gs.setNews([])); act(() => old('two', positive)); expect(effects()).toEqual([50, 60]);
});
it('preserves answered through actual save/load and a fresh hook instance', async () => {
  await setup(); act(() => gs.handleInterview('one', positive));
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  const saved = await loadGame(); expect(saved.news[0].answered).toBe(true);
  act(() => view.unmount()); view = null;
  await setup(saved.news); act(() => gs.setTeams(saved.teams));
  act(() => gs.handleInterview('one', other)); expect(effects()).toEqual([55, 67]);
});
it('keeps the existing upper bounds without applying the same answer twice', async () => {
  await setup(); act(() => gs.setTeams([{ ...team(), popularity: 98, players: [{ id: 'p', morale: 97 }] }]));
  act(() => { gs.handleInterview('one', positive); gs.handleInterview('one', positive); });
  expect(effects()).toEqual([100, 100]);
});

it('notifies and dirties only the accepted choice when two answers arrive before render', async () => {
  await setup(); const answer = gs.handleInterview;
  const token = gs.getProgressToken(), revision = gs.saveRevision;
  act(() => { answer('one', positive); answer('one', other); });
  expect(gs.notif).toEqual({ type: 'ok', msg: '回答しました！ 人気+5 モラル+7' });
  expect(gs.getProgressToken()).toBe(token + 1); expect(gs.saveRevision).toBe(revision + 1);
});
it('invalidates an old interview handler when the same save is loaded into a new session', async () => {
  await setup(); const old = gs.handleInterview, saveId = gs.saveId;
  act(() => { gs.setSaveId(saveId); gs.hydrateLargeSaveData({ news: [article('one')] }); gs.resetSaveTracking(); });
  const token = gs.getProgressToken(), revision = gs.saveRevision;
  act(() => old('one', positive));
  expect(effects()).toEqual([50, 60]); expect(gs.news[0].answered).not.toBe(true);
  expect(gs.saveDirty).toBe(false); expect(gs.notif).toBeNull();
  expect(gs.getProgressToken()).toBe(token); expect(gs.saveRevision).toBe(revision);
  act(() => gs.handleInterview('one', positive)); expect(effects()).toEqual([55, 67]);
});
it('does not report success for news or team changes queued before an old command', async () => {
  await setup(); const old = gs.handleInterview;
  act(() => { gs.setNews(items => items.map(n => ({ ...n, answered: true }))); old('one', positive); });
  expect(effects()).toEqual([50, 60]); expect(gs.notif).toBeNull();
  act(() => gs.setNews([article('one')]));
  act(() => { gs.setTeams([]); old('one', positive); });
  expect(gs.teams).toEqual([]); expect(gs.news[0].answered).not.toBe(true); expect(gs.notif).toBeNull();
});
