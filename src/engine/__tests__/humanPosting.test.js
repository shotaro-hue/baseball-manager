import { expect, it } from 'vitest';
import { postingDecisionRequest, reducePostingDecisionRequest, postingMailbox, postingMarketRequest, reducePostingMarketRequest } from '../humanPosting';
import { generatedPostingWorld } from './fixtures/postingMarketResults';
import { reduceEconomyCommand } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { postingWinter } from './fixtures/postingDepartures';
import { postingRequest } from './fixtures/postingApplications';
import { qualifiedPostingWorld, marketResult } from './fixtures/postingMarketResults';
import { nextSeasonForDepartureTest, playableClub } from './fixtures/inSeasonDepartures';
import { freezeEconomy } from './fixtures/economyWorld';
import { notificationSummary } from '../../components/hub/hubNavigation';

const pending = () => reduceEconomyCommand(postingWinter(), postingRequest(postingWinter())).world;
it.each([{ teamId: 1 }, { saveId: 'other' }, { epoch: 'other' }, { baseRevision: 0 }, { baseRevision: 99 },
  { season: 2025 }, { date: '2026-12-02' }, { requestId: 'absent' }, { outcome: 'signed' }])('rejects foreign, stale or caller-directed human market input %j', extra => {
  const w = generatedPostingWorld(), before = structuredClone(w), request = { ...postingMarketRequest(w, 'request'), ...extra };
  expect(reducePostingMarketRequest(freezeEconomy(w), request)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});
it('requires approval for a human market and derives a readable offer and decision from saved evidence', () => {
  const p = pending(); expect(reducePostingMarketRequest(p, postingMarketRequest(p, 'request')).ok).toBe(false);
  for (const outcome of ['signed', 'no-offer', 'declined']) {
    const w = generatedPostingWorld(outcome), r = reducePostingMarketRequest(w, postingMarketRequest(w, 'request'));
    expect(r.ok, r.error).toBe(true);
    const notice = postingMailbox(r.world).find(m => m.annualPosting);
    expect(notice.body).toContain('市場評価'); expect(notice.annualPosting.status).toBe(outcome);
    if (outcome !== 'no-offer') expect(notice.body).toContain('提示条件：');
  }
});
it.each(['approve', 'reject'])('saves the human %s once without moving the player or money', decision => {
  const w = pending(), before = structuredClone(w), request = postingDecisionRequest(w, 'request', decision);
  const result = reducePostingDecisionRequest(freezeEconomy(w), request);
  expect(result.ok, result.error).toBe(true); expect(result.world.teams).toEqual(before.teams);
  expect(result.world.contractEconomy.engine.spending).toEqual(before.contractEconomy.engine.spending);
  expect(result.world.contractEconomy.incomeReceipts).toEqual(before.contractEconomy.incomeReceipts);
  expect(result.world.contractEconomy.engine.postingApplications.at(-1)).toMatchObject({ requestId: 'request', decision });
  expect(validateEconomySave(result.world)).toBe('annual');
  expect(reducePostingDecisionRequest(result.world, request)).toMatchObject({ ok: true, replayed: true, world: result.world });
  expect(reducePostingDecisionRequest(result.world, postingDecisionRequest(result.world, 'request', decision)).ok).toBe(false);
  expect(w).toEqual(before);
});
it.each([
  r => ({ ...r, saveId: 'other' }), r => ({ ...r, epoch: 'other' }), r => ({ ...r, teamId: 1 }),
  r => ({ ...r, baseRevision: r.baseRevision - 1 }), r => ({ ...r, baseRevision: r.baseRevision + 1 }),
  r => ({ ...r, date: '2026-12-02' }), r => ({ ...r, season: 2025 }), r => ({ ...r, requestId: 'missing' }),
  r => ({ ...r, decision: 'accept' }), r => ({ ...r, id: 'injected' }),
])('rejects stale or forged human input %# without mutation', change => {
  const w = pending(), before = structuredClone(w);
  expect(reducePostingDecisionRequest(freezeEconomy(w), change(postingDecisionRequest(w, 'request', 'approve'))))
    .toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});
it('does not let a human decide another club application through a forged mail', () => {
  const w = pending(); w.myId = 1;
  w.mailbox = [{ id: 'forged', type: 'posting_request', playerId: 0, requestId: 'request' }];
  expect(reducePostingDecisionRequest(w, postingDecisionRequest(w, 'request', 'approve')).ok).toBe(false);
  expect(postingMailbox(w, w.mailbox).filter(m => m.annualPosting)).toHaveLength(0);
});
it('derives pending and approved states from transactions, disabling stale legacy notices', () => {
  const w = pending(), old = { id: 'old', type: 'posting_request', playerId: 0, read: false };
  const mails = postingMailbox(w, [old]);
  expect(mails.find(m => m.id === 'old')).toEqual({ ...old, postingUnavailable: true });
  const notice = mails.find(m => m.annualPosting);
  expect(notice).toMatchObject({ annualPosting: { id: 'request', status: 'pending' }, read: true, resolved: false });
  expect(notificationSummary({ mailbox: mails, gameDay: w.gameDay })).toMatchObject({ posting: 1, actionable: 1 });
  const next = reducePostingDecisionRequest(w, postingDecisionRequest(w, 'request', 'approve')).world;
  const approved = postingMailbox(next, [old]).find(m => m.annualPosting);
  expect(approved.id).toBe(notice.id); expect(approved.resolved).toBe(false);
  expect(approved.body).toContain('市場結果待ち'); expect(approved.body).toContain('入金');
  expect(notificationSummary({ mailbox: postingMailbox(next, [old]), gameDay: w.gameDay })).toMatchObject({ posting: 1, actionable: 1 });
});
it.each(['signed', 'no-offer', 'declined'])('shows a saved %s result, including after a historical year transition', outcome => {
  const teams = [playableClub(), playableClub(1)];
  teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
  const w = qualifiedPostingWorld(postingWinter({ teams, years: 4 })), result = reduceEconomyCommand(w, marketResult(w, outcome));
  expect(result.ok, result.error).toBe(true);
  const notice = postingMailbox(result.world, []).find(m => m.annualPosting);
  expect(notice.annualPosting.status).toBe(outcome); expect(notice.resolved).toBe(true);
  expect(notificationSummary({ mailbox: postingMailbox(result.world), gameDay: w.gameDay })).toMatchObject({ posting: 0, actionable: 0 });
  expect(notice.body).toContain(outcome === 'signed' ? '2027年度限定' : outcome === 'no-offer' ? '提示なし' : '本人辞退');
  const later = nextSeasonForDepartureTest(result.world);
  expect(postingMailbox(later, []).find(m => m.id === notice.id).body).toBe(notice.body);
});
it('displays a recorded zero minor fee, without substituting missing data or a new price', () => {
  const w = qualifiedPostingWorld(), next = reduceEconomyCommand(w, marketResult(w, 'signed', {
    overseasContract: { kind: 'minor', signingBonusUsdCents: 0 },
  })).world;
  const notice = postingMailbox(next, []).find(m => m.annualPosting);
  expect(notice.body).toContain('0万円'); expect(notice.body).toContain('マイナー');
  expect(notice.body).not.toContain('未記録');
});
it.each([1, 3])('shows the saved notice and contract end dates separately for a %s-year contract', years => {
  const w = qualifiedPostingWorld(postingWinter({ years })), next = reduceEconomyCommand(w, marketResult(w)).world;
  const notice = postingMailbox(next, []).find(m => m.annualPosting);
  expect(notice.body).toContain('退団通知日 2026-12-01');
  expect(notice.body).toContain(`元契約終了日 ${years === 1 ? '2026-12-01' : '2027-02-01'}`);
  expect(notice.body).not.toContain('雇用を終了しました');
});
it('leaves legacy mail and its array identity unchanged', () => {
  const mail = [{ id: 0, type: 'posting_request' }];
  expect(postingMailbox({ myId: 0 }, mail)).toBe(mail);
});
