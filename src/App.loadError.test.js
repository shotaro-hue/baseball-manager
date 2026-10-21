import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { TEAM_DEFS } from './constants';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const mock = vi.hoisted(() => ({ load: vi.fn(), status: 'unrecoverable', app: null }));
const saved = () => ({ ...JSON.parse(gunzipSync(readFileSync(new URL('../e2e/fixtures/new-game.json.gz', import.meta.url)))), saveId: 'load-retry' });
const teams = () => saved().teams;
vi.mock('./engine/saveload', () => ({
  hasSave: () => true, getSaveMeta: () => null, getSaveQueueSnapshot: () => ({ isSaving: false }),
  getAutoSaveIntervalMs: () => Infinity, enqueueSaveGame: async () => ({ ok: true }),
  initializeCareerLogsInIndexedDb: async () => ({ ok: true }),
  loadGame: () => mock.load(), getLastLoadResult: () => ({ status: mock.status }),
}));
vi.mock('./engine/bootstrapTeams', () => ({ createInitialTeamsAsync: async () => teams() }));
vi.mock('./engine/player', () => ({ generateForeignFaPool: () => [] }));
vi.mock('./engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }), flushBattedBallQueue: async () => ({ ok: true }) }));
vi.mock('./hooks/useSeasonFlow', () => ({ useSeasonFlow: () => ({ setPlayoff: () => {} }) }));
vi.mock('./hooks/useOffseason', () => ({ useOffseason: () => ({ resetTransientOffseason: () => {} }) }));
vi.mock('./components/AppScreenRouter', async original => {
  const { default: Router } = await original();
  return { default: ({ app }) => { mock.app = app; return React.createElement(Router, { app }); } };
});
vi.mock('./components/hub/HubShell', () => ({ default: ({ app }) => { mock.app = app; return null; } }));
let view;
beforeEach(() => { vi.useFakeTimers(); mock.status = 'unrecoverable'; mock.load.mockReset().mockResolvedValue(null); });
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.useRealTimers(); vi.restoreAllMocks(); });
const message = () => view.root.findByProps({ role: 'alert' }).children.join('');
const resume = () => view.root.findAllByType('button').find(b => b.children.join('') === '続きから');
async function mount() { await act(async () => { view = create(React.createElement(App)); }); }
async function load() { await act(async () => { await mock.app.handleLoad(); }); }

it.each(['unrecoverable', 'none', 'thrown'])('retains %s failure after toast expiry and unrelated notifications, leaving retry available', async status => {
  mock.status = status;
  if (status === 'thrown') { mock.load.mockRejectedValue(new Error('read failed')); vi.spyOn(console, 'error').mockImplementation(() => {}); }
  await mount(); await load();
  const error = message(); expect(error).toMatch(/復旧できませんでした|見つかりません|読み込めませんでした/);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(mock.app.gs.notif).toBeNull(); expect(message()).toBe(error);
  act(() => mock.app.gs.notify('通常の通知', 'ok'));
  expect(message()).toBe(error);
  await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
  expect(mock.app.gs.notif).toBeNull(); expect(message()).toBe(error);
  expect(resume().props.disabled).toBe(false); expect(mock.app.gs.teams).toEqual([]);
});

it('keeps the prior error during a pending retry and clears it after successful resume', async () => {
  await mount(); await load(); const error = message();
  let resolve; mock.load.mockImplementation(() => new Promise(r => { resolve = r; }));
  let pending; await act(async () => { pending = mock.app.handleLoad(); });
  expect(message()).toBe(error);
  await act(async () => { resolve(saved()); await pending; });
  expect(mock.app.gs.screen).toBe('hub'); expect(mock.app.loadError).toBeNull();
  expect(mock.app.gs.notif).toBeNull();
  expect(view.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
  act(() => mock.app.gs.setScreen('title'));
  expect(view.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});

it('does not keep a failed-load warning after selecting a new game', async () => {
  await mount(); await load(); expect(message()).toContain('復旧できませんでした');
  const title = view.root.findAll(n => n.props.onSaveDeleted && n.props.onSelectTeam)[0];
  let pending;
  act(() => { pending = title.props.onSelectTeam(TEAM_DEFS[1].id); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); await pending; });
  expect(mock.app.gs.myId).toBe(TEAM_DEFS[1].id); expect(mock.app.loadError).toBeNull();
});

it('clears a failed-load warning on successful explicit deletion through the title callback', async () => {
  await mount(); await load();
  const title = view.root.findAll(n => n.props.onSaveDeleted && n.props.onSelectTeam)[0];
  act(() => title.props.onSaveDeleted());
  expect(mock.app.gs.saveExists).toBe(false); expect(mock.app.loadError).toBeNull();
  expect(view.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});

it.each(['no-data', 'rejected', 'saved'])('ignores a pending load settling as %s after successful explicit deletion', async outcome => {
  await mount(); await load();
  let resolve, reject;
  mock.load.mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  let pending; await act(async () => { pending = mock.app.handleLoad(); });
  const title = view.root.findAll(n => n.props.onSaveDeleted && n.props.onSelectTeam)[0];
  act(() => title.props.onSaveDeleted());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => {
    if (outcome === 'rejected') reject(new Error('late read failure'));
    else resolve(outcome === 'saved' ? saved() : null);
    await pending;
  });
  expect(mock.app.gs.screen).toBe('title'); expect(mock.app.gs.myId).toBeNull();
  expect(mock.app.gs.teams).toEqual([]); expect(mock.app.gs.saveExists).toBe(false);
  expect(view.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});
