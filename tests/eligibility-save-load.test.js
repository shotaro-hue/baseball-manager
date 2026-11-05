import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { loadGame, saveGame, loadPlayerCareerLogById } from '../src/engine/saveload';
import { getFaProgress } from '../src/engine/contract';
import frozen from '../src/engine/__tests__/fixtures/preFixV2FaEvidence.json';

const primary = 'baseball_manager_v1'; let rows;
const cold = () => vi.stubGlobal('localStorage', {
  getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k),
});
beforeEach(() => {
  rows = new Map(); cold(); vi.stubGlobal('indexedDB', new IDBFactory());
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('initializes legacy eligibility from full saved history before keeping only three recent seasons (recent=%s)', recent => {
  return (async () => {
    const p = { id: 'full-history', name: '履歴推定', age: 35, entryType: '高卒', daysOnActiveRoster: 0,
      serviceYears: 0, dataQuality: { serviceTime: 'game-baseline-unknown' },
      careerLog: Array.from({ length: 10 }, (_, i) => ({ year: 2016 + i, stats: { G: 125 } })),
    };
    if (recent) p.recentCareerLog = p.careerLog.slice(-3);
    const old = { saveId: 'legacy-full-history', myId: 0, year: 2026, gameDay: 1,
      teams: [{ id: 0, name: '履歴球団', players: [p], farm: [] }], faPool: [] };
    const raw = JSON.stringify(old); rows.set(primary, raw);
    const loaded = await loadGame(), player = loaded.teams[0].players[0];
    expect(getFaProgress(player)).toMatchObject({ estimated: true, days: 1450,
      domestic: { eligible: true }, overseas: { eligible: true } });
    expect(player.careerLog).toEqual([]);
    expect(player.recentCareerLog.map(h => h.year)).toEqual([2023, 2024, 2025]);
    expect(rows.get(primary)).toBe(raw);
    expect((await saveGame(loaded)).ok).toBe(true);
    cold(); const reloaded = await loadGame();
    expect(reloaded.teams[0].players[0].eligibility).toEqual(player.eligibility);
  })();
});

it('loads and resaves a frozen pre-evidenceVersion v2 FA certificate without changing receipts', async () => {
  rows.set(primary, JSON.stringify(frozen.world));
  const loaded = await loadGame();
  expect(loaded.contractEconomy).toEqual(frozen.world.contractEconomy);
  expect((await saveGame(loaded)).ok).toBe(true);
  cold(); expect((await loadGame()).contractEconomy).toEqual(frozen.world.contractEconomy);
});

it('uses the selected v6 career generation for first eligibility migration without inflating live player history', async () => {
  const p = { id: 0, name: '世代別履歴', age: 35, entryType: '高卒', serviceYears: 0,
    daysOnActiveRoster: 0, dataQuality: { serviceTime: 'game-baseline-unknown' },
    careerLog: Array.from({ length: 10 }, (_, i) => ({ year: 2016 + i, stats: { G: 125 } })),
  };
  const world = { saveId: 'v6-full-history', myId: 0, year: 2026, gameDay: 1,
    teams: [{ id: 0, name: '世代球団', players: [p], farm: [] }], faPool: [] };
  expect((await saveGame(world)).ok).toBe(true);
  cold();
  const loaded = await loadGame(), player = loaded.teams[0].players[0];
  const archive = await loadPlayerCareerLogById(String(p.id), world.saveId);
  expect(archive).toEqual(p.careerLog);
  expect(getFaProgress(player)).toMatchObject({ estimated: true, days: 1450,
    domestic: { eligible: true }, overseas: { eligible: true } });
  expect(player.careerLog).toEqual([]);
  expect(player.recentCareerLog.map(h => h.year)).toEqual([2023, 2024, 2025]);
  expect((await saveGame(loaded)).ok).toBe(true);
  cold(); const reloaded = await loadGame();
  expect(reloaded.teams[0].players[0].eligibility).toEqual(player.eligibility);
  expect(await loadPlayerCareerLogById(String(p.id), world.saveId)).toEqual(archive);
});
