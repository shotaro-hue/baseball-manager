import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { advancePlayoff, createSeries, initPlayoff, nextPlayoffFixture, postseasonClosingDate, recordSeriesGame } from '../playoff';
import { playoffGameDate } from '../postseasonCalendar';
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
function play(p, score = { my: 1, opp: 0 }, key = p.phase) {
  return advancePlayoff({ ...p, [key]: recordSeriesGame(p[key], { score }) });
}
function through(p, phase = 'champion') {
  while (p.phase !== phase) p = play(p);
  return p;
}
function partial() {
  const s = world();
  s.offseasonPlan.playoff = play(s.offseasonPlan.playoff, { my: 0, opp: 0 });
  return s;
}
const corruptions = [
  ['score/winner', s => { s.offseasonPlan.playoff.cs1_se.games[0].winner = 0; }],
  ['score text', s => { s.offseasonPlan.playoff.cs1_se.games[0].score = '1-0'; }],
  ['draw flag', s => { s.offseasonPlan.playoff.cs1_se.games[0].drew = false; }],
  ['win flag', s => { s.offseasonPlan.playoff.cs1_se.games[0].won0 = true; }],
  ['negative score', s => { s.offseasonPlan.playoff.cs1_se.games[0].scores = [-1, -1]; }],
  ['wins', s => { s.offseasonPlan.playoff.cs1_se.wins[0]++; }],
  ['done', s => { s.offseasonPlan.playoff.cs1_se.done = true; }],
  ['advantage', s => { s.offseasonPlan.playoff.cs1_se.adv[0] = 1; }],
  ['later league result', s => {
    const p = s.offseasonPlan.playoff;
    p.cs1_pa = recordSeriesGame(p.cs1_pa, { score: { my: 1, opp: 0 } });
    p.cs1_pa.games[0].winner = 1;
  }],
  ['advancing club', s => {
    const p = s.offseasonPlan.playoff = through(s.offseasonPlan.playoff, 'cs2_se');
    p.cs2_se.teams[1] = p.cs1_se.teams[1];
  }],
  ['premature final', s => {
    const p = s.offseasonPlan.playoff;
    // Use the legitimate final date so only the bracket is inconsistent.
    const ready = through(world().offseasonPlan.playoff, 'cs2_se');
    p.cs2_se = { ...createSeries(p.se1, p.cs1_se.teams[0], 'final', p.year), startDate: ready.cs2_se.startDate };
  }],
  ['duplicate participant', s => { const p = s.offseasonPlan.playoff; p.cs1_se.teams[1] = p.cs1_se.teams[0]; }],
  ['unknown participant', s => { s.offseasonPlan.playoff.cs1_se.teams[0].id = -1; }],
  ['wrong league', s => { s.offseasonPlan.playoff.cs1_se.teams[0].league = 'パ'; }],
  ['missing first stage', s => { s.offseasonPlan.playoff.cs1_pa = null; }],
  ['missing completed bracket', s => { const p = s.offseasonPlan.playoff = through(s.offseasonPlan.playoff); p.cs2_pa = null; }],
  ['champion', s => { const p = s.offseasonPlan.playoff = through(s.offseasonPlan.playoff); p.champion = p.jpSeries.teams[1]; }],
  ['phase', s => { s.offseasonPlan.playoff.phase = 'jpSeries'; }],
  ['home club', s => { s.offseasonPlan.playoff.cs1_se.games[0].homeId = -1; }],
  ['date', s => { s.offseasonPlan.playoff.cs1_se.games[0].date = '2026-02-30'; }],
  ['game order', s => {
    const p = s.offseasonPlan.playoff;
    p.cs1_se = recordSeriesGame(p.cs1_se, { score: { my: 1, opp: 0 } });
    p.cs1_se.games.reverse();
  }],
  ['game after clinch', s => {
    const p = s.offseasonPlan.playoff = through(s.offseasonPlan.playoff, 'cs1_pa');
    const series = p.cs1_se;
    // The initial draw + win clinches on game 2; game 3 still has a valid calendar date.
    series.games.push({ ...series.games.at(-1), date: playoffGameDate(series, 3) });
    series.wins[0]++;
  }],
  ['eighth Japan Series draw', s => {
    let p = through(s.offseasonPlan.playoff, 'jpSeries');
    for (let n = 0; n < 7; n++) p = play(p, { my: 0, opp: 0 });
    p.jpSeries.games.push({ ...p.jpSeries.games.at(-1), date: nextPlayoffFixture(p.jpSeries).date });
    s.offseasonPlan.playoff = p;
  }],
];
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

it.each(['partial', 'complete', 'extended'])('round-trips a valid dated %s postseason without changing its results', async mode => {
  const s = partial();
  if (mode === 'complete') s.offseasonPlan.playoff = through(s.offseasonPlan.playoff);
  if (mode === 'extended') {
    let p = through(s.offseasonPlan.playoff, 'jpSeries');
    for (let n = 1; n <= 14; n++) p = play(p, n <= 7 ? { my: 0, opp: 0 }
      : n % 2 === 0 ? { my: 1, opp: 0 } : { my: 0, opp: 1 });
    s.offseasonPlan.playoff = p;
  }
  const frozen = structuredClone(s.offseasonPlan);
  expect((await saveGame(s)).ok).toBe(true);
  const loaded = await loadGame();
  expect(loaded.offseasonPlan).toEqual(frozen);
  expect(s.offseasonPlan).toEqual(frozen);
  expect(postseasonClosingDate(loaded.offseasonPlan.playoff, { year: s.year, schedule: s.schedule })).toBe(
    mode === 'partial' ? null : frozen.playoff.jpSeries.games.at(-1).date);
});

it.each(corruptions)('rejects inconsistent %s on save and retains primary and backups', async (_label, corrupt) => {
  const s = partial();
  expect((await saveGame(s)).ok).toBe(true);
  rows.set(`${primary}_bk1`, rows.get(primary)); rows.set(`${primary}_bk2`, rows.get(primary));
  const roots = new Map(rows);
  corrupt(s);
  expect(await saveGame(s)).toMatchObject({ ok: false, reason: 'postseason_payload_invalid' });
  expect(rows).toEqual(roots);
  expect(() => postseasonClosingDate(s.offseasonPlan.playoff, { year: s.year, schedule: s.schedule })).toThrow();
});

it.each(corruptions)('rejects inconsistent %s on load without replacing the only root', async (_label, corrupt) => {
  const s = partial(); corrupt(s);
  const raw = JSON.stringify(s); rows.set(primary, raw);
  // Report a boolean on failure rather than serializing an entire roster world.
  expect((await loadGame()) === null).toBe(true);
  expect(getLastLoadResult().status).toBe('unrecoverable');
  expect(rows.get(primary)).toBe(raw);
});

it('recovers the complete dated results from backup when the primary has contradictory wins', async () => {
  const s = partial(); s.offseasonPlan.playoff = through(s.offseasonPlan.playoff);
  expect((await saveGame(s)).ok).toBe(true);
  rows.set(`${primary}_bk1`, rows.get(primary));
  const bad = structuredClone(s); bad.offseasonPlan.playoff.jpSeries.wins[0]++;
  rows.set(primary, JSON.stringify(bad));
  const loaded = await loadGame();
  expect(getLastLoadResult().status).toBe('recovered');
  expect(loaded.offseasonPlan).toEqual(s.offseasonPlan);
});

it('loads undated legacy results without adding dates or requiring a source schedule', async () => {
  const s = world();
  s.offseasonPlan.playoff = play(initPlayoff(s.teams, { year: s.year }), { my: 0, opp: 0 });
  delete s.schedule;
  const original = structuredClone(s.offseasonPlan);
  rows.set(primary, JSON.stringify(s));
  const loaded = await loadGame();
  expect(loaded.offseasonPlan).toEqual(original);
  expect(loaded.offseasonPlan.playoff).not.toHaveProperty('calendar');
  expect(loaded.offseasonPlan.playoff.cs1_se.games[0]).not.toHaveProperty('date');
});
