import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
vi.mock('../engine/saveload', () => ({ hasSave: () => false, getSaveQueueSnapshot: () => ({ isSaving: false }) }));
vi.mock('../engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }) }));
let view, gs, os;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.useRealTimers(); });
const player = extra => ({ id: 0, name: '選手0', age: 25, salary: 1000, contractYearsLeft: 1, personality: {}, batting: {}, stats: {}, ...extra });
async function setup(farm = false) {
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { gs.setMyId(0); gs.setYear(2026); gs.setGameDay(1);
    gs.setTeams([{ id: 0, name: '自球団', players: farm ? [] : [player()], farm: farm ? [player()] : [], coaches: [], wins: 0, losses: 0, budget: 10000, lineup: [0], rotation: [] }]); });
}
const pending = accepted => ({ id: 'old', type: 'contract_decision', resolved: false, deliverOnDay: 2,
  decision: { playerId: 0, playerName: '選手0', salary: 1200, years: 2, accepted } });

it('拒否メールでFA市場・所属・打順を変更せず、回答履歴を保持する', async () => {
  await setup(); act(() => gs.setMailbox([pending(false)]));
  expect(gs.getMailboxBySelector()[0].type).toBe('contract_decision');
  act(() => gs.setGameDay(2));
  expect(gs.myTeam.players[0].salary).toBe(1000); expect(gs.myTeam.lineup).toEqual([0]); expect(gs.faPool).toEqual([]);
  expect(gs.getMailboxBySelector()[0]).toMatchObject({ id: 'old', type: 'contract_reply', resolved: true, resolution: 'rejected' });
});
it('二軍のID 0の回答を適用し、読み直し・翌日でも二重処理しない', async () => {
  await setup(true); act(() => { gs.setMailbox([pending(true)]); gs.setGameDay(2); });
  expect(gs.myTeam.farm[0]).toMatchObject({ salary: 1200, contractYearsLeft: 2, contractSignedYear: 2026 });
  act(() => gs.setGameDay(3));
  expect(gs.getMailboxBySelector()).toHaveLength(1); expect(gs.myTeam.players).toEqual([]); expect(gs.faPool).toEqual([]);
  const saved = structuredClone(gs.getMailboxBySelector()); act(() => gs.setMailbox(saved));
  expect(gs.myTeam.farm[0].salary).toBe(1200);
});
it('回答前に移籍した選手への旧メールを取り消す', async () => {
  await setup(); act(() => gs.setMailbox([pending(true)]));
  act(() => { gs.upd(0, t => ({ ...t, players: [] })); gs.setGameDay(2); });
  expect(gs.getMailboxBySelector()[0].resolution).toBe('cancelled'); expect(gs.myTeam.players).toEqual([]); expect(gs.faPool).toEqual([]);
});
it('再提示は旧回答予定を取り消し、新提示へ所属・年度・契約状態を記録する', async () => {
  await setup(true);
  act(() => expect(os.handleContractOffer(0, 1200, 2, { responseAfterDays: 2 })).toBe(true));
  act(() => expect(os.handleContractOffer(0, 1300, 1, { responseAfterDays: 3 })).toBe(true));
  const mails = gs.getMailboxBySelector(); expect(mails).toHaveLength(2);
  expect(mails[0]).toMatchObject({ resolved: true, resolution: 'superseded' });
  expect(mails[1].decision).toMatchObject({ teamId: 0, offeredYear: 2026, contractSnapshot: { salary: 1000, contractYearsLeft: 1, contractSignedYear: null } });
  act(() => expect(os.handleContractOffer(0, 1, 1)).toBe(true));
  expect(gs.getMailboxBySelector().at(-1).decision.accepted).toBe(false);
  act(() => expect(os.handleContractOffer(0, 0, 1)).toBe(false)); expect(gs.getMailboxBySelector()).toHaveLength(3);
});
