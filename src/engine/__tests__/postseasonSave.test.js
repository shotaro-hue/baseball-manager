import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { initPlayoff } from '../playoff';
import { generateSeasonSchedule } from '../scheduleGen';
import { saveGame, loadGame, getLastLoadResult } from '../saveload';

const primary = 'baseball_manager_v1';
let rows;
function world() {
  const s = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz', import.meta.url))));
  s.saveId = 'postseason-save'; s.gameDay = 144;
  s.teams = s.teams.map(t => ({ ...t, wins: 142, losses: 0, draws: 1 }));
  s.schedule = generateSeasonSchedule(s.year, s.teams);
  s.offseasonPlan = { version: 1, year: s.year, myId: s.myId, stage: 'postseason', resumeScreen: 'playoff',
    playoff: initPlayoff(s.teams, { year: s.year, schedule: s.schedule }) };
  return s;
}
beforeEach(() => {
  rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => Promise.resolve().then(operation) } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['date', 'source'])('refuses a dated %s write before changing the existing root', async corrupt => {
  const s = world();
  expect((await saveGame(s, { skipCompression: true })).ok).toBe(true);
  const roots = new Map(rows);
  if (corrupt === 'date') s.offseasonPlan.playoff.cs1_se.startDate = `${s.year}-01-01`;
  else delete s.schedule;
  expect(await saveGame(s)).toMatchObject({ ok: false, reason: 'postseason_payload_invalid' });
  expect(rows).toEqual(roots);
});

it.each(['date', 'source'])('rejects a corrupt dated %s read without modifying the only saved root', async corrupt => {
  const s = world();
  if (corrupt === 'date') s.offseasonPlan.playoff.cs1_se.startDate = `${s.year}-01-01`;
  else delete s.schedule;
  const raw = JSON.stringify(s); rows.set(primary, raw);
  expect(await loadGame()).toBeNull();
  expect(getLastLoadResult().status).toBe('unrecoverable');
  expect(rows.get(primary)).toBe(raw);
});

it('uses the existing backup recovery for corrupt dated evidence', async () => {
  const s = world(), bad = structuredClone(s);
  bad.offseasonPlan.playoff.cs1_se.startDate = `${bad.year}-01-01`;
  rows.set(primary, JSON.stringify(bad)); rows.set(`${primary}_bk1`, JSON.stringify(s));
  const loaded = await loadGame();
  expect(getLastLoadResult().status).toBe('recovered');
  expect(loaded.offseasonPlan).toEqual(s.offseasonPlan);
});
