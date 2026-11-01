import { useEffect, useRef, useState } from 'react';
import { validateEconomySave } from '../engine/economyPersistence';
import { toAnnualState } from '../engine/contractEconomy';
import { evaluateRosterCapacity, isIkuseiPlayer } from '../engine/rosterCapacity';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { rookieRequest, reduceRookieRequest } from '../engine/rookieContracts';
import { Button, MetricBand } from './design-system/primitives';
import { DecisionConfirmation, money, moneyMetric } from './management/DecisionParts';

function rookieView(gs) {
  try {
    validateEconomySave(gs);
    const state = toAnnualState(gs), team = gs.teams.find(t => t.id === gs.myId);
    const capacity = evaluateRosterCapacity(team, { ...state.draftContext, teams: gs.teams });
    if (!capacity.ok) throw Error('capacity');
    const declined = new Set(state.transactions.flatMap(t => {
      try { const c = JSON.parse(t.signature); return c.type === 'decline-rookie' && c.teamId === gs.myId ? [c.playerId] : []; }
      catch { return []; }
    }));
    const candidates = [...capacity.acceptedPicks, ...capacity.acceptedDevelopmentPicks];
    for (const p of state.draftContext.draftPool) if (declined.has(p.id) && !candidates.some(c => c.id === p.id)) candidates.push(p);
    const entries = candidates.map(player => {
      const hold = [...state.spending.reservations, ...state.spending.resolvedReservations]
        .find(h => h.kind === 'rookie' && h.proposal.teamId === gs.myId && h.proposal.contract.playerId === player.id);
      const contract = hold?.proposal.contract;
      return { player, salary: contract?.annualSalaryManYen ?? player.salary,
        development: contract ? contract.registrationType === 'development' : isIkuseiPlayer(player),
        status: declined.has(player.id) ? 'declined' : hold ? 'reserved' : 'unfunded' };
    });
    return { entries, row: quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === gs.myId && r.season === gs.year + 1) };
  } catch { return { error: '新人の指名結果・契約データを確認できません。保存データを読み直してください。' }; }
}

export default function AnnualRookieContracts({ gs, os }) {
  const [action, setAction] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(null), [feedback, setFeedback] = useState('');
  const inFlight = useRef(false), mounted = useRef(true), heading = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const model = rookieView(gs), selected = model.entries?.find(e => e.player.id === action?.playerId);
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const blocked = busy || gs.saveQueueState?.isSaving || recovery;
  const preview = action ? reduceRookieRequest(gs, rookieRequest(gs, action)) : null;
  const run = async (operation, message) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailure(null); setFeedback('');
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (!result?.ok) { setFailure(result ?? { reason: 'economy_commit_failed' }); return; }
      setAction(null); setFeedback(result.replayed ? '保存済みの新人契約を確認しました。' : message);
    } catch { if (mounted.current) setFailure({ reason: 'economy_commit_failed' }); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const choose = (type, playerId) => { if (!blocked) { setAction({ type, playerId }); setFeedback(''); setFailure(null); } };
  const confirm = () => {
    if (blocked || !preview?.ok) return;
    return action.type === 'reserve' ? run(() => os.handleReserveRookie(action.playerId), '契約留保を保存しました。翌春の加入待ちです。')
      : run(() => os.handleDeclineRookie(action.playerId), '新人の辞退を保存しました。');
  };
  if (model.error) return <p role="alert">{model.error}</p>;
  const error = blocked ? '保存・復旧の完了を待ってください。' : preview && !preview.ok ? preview.error : null;
  return <section className="draft-panel management-decisions" data-ds="contract-management" aria-label="翌年度の新人契約">
    <h2 tabIndex={-1} ref={heading}>翌年度の新人契約</h2>
    <p>指名時の年俸で単年契約を留保するか、指名を辞退します。留保した選手は翌春の加入待ちとなり、今季の名簿には加わりません。</p>
    <MetricBand items={[moneyMetric(`${gs.year + 1}年度の追加余力`, money(model.row?.remainingManYen)),
      { label: '新人契約の留保', value: model.entries.filter(e => e.status === 'reserved').length, unit: '人' }]} />
    {busy && <p role="status">保存・反映を確認しています…</p>}
    {feedback && <p role="status" className="decision-receipt">{feedback}</p>}
    {failure && <p role="alert" className="decision-error">{failure.error || (recovery ? '保存済みの新人契約を画面へ反映できませんでした。復旧してください。' : '新人契約を保存できませんでした。確認内容を保持しています。再試行してください。')}</p>}
    {recovery && <Button disabled={busy} onClick={() => run(() => gs.recoverEconomyCommand(), '保存済みの新人契約を復旧しました。')}>保存済みの新人契約を復旧する</Button>}
    {!model.entries.length && <p>契約する自球団の新人はいません。</p>}
    {model.entries.map(e => <div className="draft-result-row" key={e.player.id}>
      <strong>{e.player.name}</strong><p>{e.development ? '育成' : '支配下'} · {gs.year + 1}年度 年俸 {money(e.salary)} · 単年</p>
      <p>{e.status === 'declined' ? '辞退済み' : e.status === 'reserved' ? '留保済み・翌春加入待ち' : '契約未留保'}</p>
      <div className="decision-actions">
        {e.status === 'unfunded' && <Button disabled={blocked} onClick={() => choose('reserve', e.player.id)}>{e.player.name}の留保条件を確認</Button>}
        {e.status !== 'declined' && <Button variant="secondary" disabled={blocked} onClick={() => choose('decline', e.player.id)}>{e.player.name}の辞退を確認</Button>}
      </div>
    </div>)}
    {action && selected && <DecisionConfirmation key={`${action.type}:${typeof action.playerId}:${action.playerId}`}
      title="新人契約の最終確認" fallbackFocus={heading} onCancel={() => { if (!inFlight.current) setAction(null); }}
      confirmLabel={action.type === 'reserve' ? 'この条件を留保する' : '辞退を確定する'} onConfirm={confirm} error={error} danger={action.type === 'decline'}>
      <p>{selected.player.name} · {selected.development ? '育成' : '支配下'} · 年俸 {money(selected.salary)} · 単年</p>
      <p>{action.type === 'reserve' ? `${gs.year + 1}年度の年俸を確保します。正式な留保は保存成功後に反映されます。`
        : '指名の辞退を確定します。留保済みの年俸と新人の登録枠を解放します。この指名を再開することはできません。'}</p>
    </DecisionConfirmation>}
  </section>;
}
