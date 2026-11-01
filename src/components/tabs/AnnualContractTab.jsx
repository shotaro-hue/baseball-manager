import { useEffect, useMemo, useRef, useState } from 'react';
import { toAnnualState } from '../../engine/contractEconomy';
import { contractEmploymentAt } from '../../engine/contractLedger';
import { quoteAnnualSpendingPlan } from '../../engine/annualSpending';
import { dueRenewalDecisions, validateRenewalDecisions } from '../../engine/renewalDecisions';
import { isIkuseiPlayer, validContractTerms, ikuseiContractYears } from '../../engine/renewalRules';
import { Button, DataTableFrame, MetricBand } from '../design-system/primitives';
import { DecisionConfirmation, money, moneyMetric, PlayerFacts, useDecisionReturn } from '../management/DecisionParts';
import { PlayerList, useMobileDetail } from '../management/PlayerList';

const statusText = { pending: '回答待ち', accepted: '来季契約済み', rejected: '辞退', cancelled: '取消済み', replaced: '再提示済み', invalidated: '失効' };
function contractView(gs) {
  try {
    validateRenewalDecisions(gs);
    const state = toAnnualState(gs), clock = gs.contractEconomy.clock;
    const employments = contractEmploymentAt(state.spending.ledger, clock.phase === 'offseason' ? `${gs.year}-11-30` : clock.date);
    const futureEmployments = contractEmploymentAt(state.spending.ledger, `${gs.year + 1}-02-01`);
    const decisions = gs.contractEconomy.decisions.filter(d => d.kind === 'human-renewal' && d.teamId === gs.myId);
    const entries = ['players', 'farm'].flatMap(roster => (gs.myTeam?.[roster] ?? []).map(player => {
      const current = employments.find(e => e.teamId === gs.myId && e.contract.playerId === player.id);
      const latest = decisions.filter(d => d.playerId === player.id).at(-1);
      const future = futureEmployments.some(r => r.contract.playerId === player.id);
      const eligible = current?.contract.endSeason === gs.year && !future && !player.isRetired && !player._retireNow;
      return { player, current, latest, eligible, state: latest?.status === 'pending' ? 'waiting' : future ? 'signed' : eligible ? 'actionable' : 'continuing',
        group: isIkuseiPlayer(player) ? 'ikusei' : roster === 'farm' ? 'farm' : 'active',
        status: latest ? statusText[latest.status] : future ? '来季契約済み' : eligible ? '要対応' : '継続契約' };
    }));
    return { entries, due: dueRenewalDecisions(gs), rows: quoteAnnualSpendingPlan(state.spending).filter(r => r.teamId === gs.myId) };
  } catch { return { error: '契約データを確認できないため、更改操作を停止しています。保存データを読み直してください。' }; }
}

export function AnnualContractTab({ gs, os, focusRequest }) {
  const [selectedId, setSelectedId] = useState(null), [salary, setSalary] = useState(''), [years, setYears] = useState(1);
  const [confirmation, setConfirmation] = useState(null), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState(null);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const model = useMemo(() => contractView(gs), [gs.contractEconomy, gs.teams, gs.myId, gs.faPool, gs.offseasonPlan, gs.schedule, gs.gameDay, gs.year]);
  const selected = model.entries?.find(e => e.player.id === selectedId);
  const focus = useDecisionReturn(selectedId);
  const mobileDetail = useMobileDetail(selectedId);
  const select = (entry, event) => {
    if (inFlight.current) return;
    const p = entry.player ?? entry;
    focus.remember(event); setSelectedId(p.id); setSalary(String(p.salary)); setYears(1); setConfirmation(null); setFeedback('');
  };
  useEffect(() => {
    const e = model.entries?.find(e => e.player.id === focusRequest?.id);
    if (e) select(e);
    // Explicit navigation selects once; ordinary committed state keeps the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token]);
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const blocked = busy || gs.saveQueueState?.isSaving || recovery;
  const pending = selected?.latest?.status === 'pending' ? selected.latest : null;
  const valid = selected?.eligible && salary.trim() !== '' && Number.isSafeInteger(Number(salary))
    && validContractTerms(selected.player, Number(salary), years);

  const run = async (operation, message) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFeedback(''); setFailure(null);
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (!result?.ok) { setFailure(result ?? { reason: 'economy_commit_failed' }); return; }
      setConfirmation(null); setFeedback(result.replayed ? '保存済みの更改を確認しました。' : message);
    } catch { if (mounted.current) setFailure({ reason: 'economy_commit_failed' }); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const confirm = () => {
    if (inFlight.current || gs.saveQueueState?.isSaving || recovery || !selected) return;
    if (confirmation === 'offer' && valid) return run(() => os.handleContractOffer(selected.player.id, Number(salary), years,
      pending ? { replaceProposalId: pending.proposalId } : {}), '提示を保存しました。回答待ちです。');
    if (confirmation === 'cancel' && pending) return run(() => os.handleCancelRenewal(pending.proposalId), '提示を取り消しました。');
  };
  if (model.error) return <p role="alert">{model.error}</p>;
  const nextBudget = model.rows.find(r => r.season === gs.year + 1);
  const clock = gs.contractEconomy.clock;
  return <main className={`management-decisions ${selectedId !== null ? 'decision-selected' : ''}`} data-ds="contract-management">
    <h1>契約更改</h1><p>来季の条件を提示し、回答を確認します。今季の年俸・所属は変わりません。</p>
    <MetricBand items={[moneyMetric(`${gs.year + 1}年度の追加余力`, money(nextBudget?.remainingManYen)),
      { label: '回答待ち', value: model.entries.filter(e => e.state === 'waiting').length, unit: '人' }]} />
    {busy && <p role="status">保存・反映を確認しています…</p>}
    {feedback && <p role="status" className="decision-receipt">{feedback}</p>}
    {failure && <p role="alert" className="decision-error">{failure.error || (recovery
      ? '保存済みの更改を画面へ反映できませんでした。復旧してから操作してください。'
      : '更改を保存できませんでした。条件は入力欄に残っています。再試行してください。')}</p>}
    {recovery && <Button disabled={busy} onClick={() => run(() => gs.recoverEconomyCommand(), '保存済みの更改を復旧しました。')}>保存済みの更改を復旧する</Button>}
    {model.due.length > 0 && <Button disabled={blocked} onClick={() => run(() => os.handleResolveRenewals(), '届いた回答を保存しました。')}>届いた回答を確認する</Button>}
    <div className="decision-layout"><section className="decision-list" ref={focus.list} aria-label="所属選手の契約一覧">
      <PlayerList entries={model.entries} selectedId={selectedId} onSelect={select} actionLabel="の契約を確認" suspended={mobileDetail} />
    </section><section className="decision-detail" aria-label="選んだ選手の契約条件">
      {!selected ? <p>所属選手を選ぶと、今季と来季の契約を確認できます。</p> : <>
        <Button variant="secondary" disabled={blocked} onClick={() => { setSelectedId(null); setConfirmation(null); }}>← 選手一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{selected.player.name}</h3><PlayerFacts player={selected.player} />
        {selected.latest && <div className="decision-warning" role="status"><strong>{statusText[selected.latest.status]}</strong>
          <p>{selected.latest.season + 1}年度から {money(selected.latest.request.action.salary)} / {selected.latest.request.action.years}年</p>
          {pending && <p>{pending.dueDate ? `回答予定：${pending.dueDate}` : `回答予定：オフ第${pending.dueTurn}ターン（現在${clock.offseasonTurn}）`}</p>}
          {selected.latest.failureReason && <p>{selected.latest.failureReason}</p>}</div>}
        {selected.eligible ? <fieldset disabled={blocked} style={{ border: 0, padding: 0, minWidth: 0 }}><legend>来季の提示条件</legend>
          <div className="decision-fields"><label>提示年俸（万円）<input aria-label="提示年俸（万円）" type="number" min="1" step="1" value={salary} onChange={e => { setSalary(e.target.value); setConfirmation(null); }} /></label>
            <label>契約年数<select aria-label="契約年数" value={years} onChange={e => { setYears(Number(e.target.value)); setConfirmation(null); }}>
              {[1, 2, 3, 4, 5, 6, 7].filter(y => !isIkuseiPlayer(selected.player) || y <= ikuseiContractYears(selected.player)).map(y => <option key={y} value={y}>{y}年</option>)}
            </select></label></div>
          <p className="decision-note">提示時に契約期間の各年度の予算を確保します。回答で合意した条件は翌年2月1日から有効です。</p>
          <Button disabled={!valid || blocked || (clock.phase === 'offseason' && clock.offseasonTurn > 30)} onClick={() => setConfirmation('offer')}>提示条件を確認する</Button>
          {pending && <Button variant="secondary" onClick={() => setConfirmation('cancel')}>提示を取り消す</Button>}
        </fieldset> : <p>現在は新たな更改の対象ではありません。</p>}
        {confirmation && <DecisionConfirmation title={confirmation === 'offer' ? '提示条件の最終確認' : '提示取消の確認'}
          fallbackFocus={focus.heading} onCancel={() => { if (!blocked) setConfirmation(null); }} onConfirm={confirm}
          confirmLabel={confirmation === 'offer' ? 'この条件で提示する' : '取消を確定する'} error={blocked ? '保存・復旧の完了を待ってください。' : confirmation === 'offer' && !valid ? '提示条件を確認してください。' : null}>
          <p>{confirmation === 'offer' ? `${gs.year + 1}年度から年俸${money(Number(salary))}・${years}年。${pending ? '現在の提示を置き換えます。' : ''}` : '回答待ちの提示と予算の確保を取り消します。今季の契約は維持します。'}</p>
        </DecisionConfirmation>}
      </>}
    </section></div>
    <details><summary>年度別の予算と契約負担</summary><DataTableFrame label="年度別の予算と契約負担"><table><thead><tr><th>年度</th><th>契約年俸</th><th>提示中の確保額</th><th>追加余力</th></tr></thead><tbody>
      {model.rows.map(r => <tr key={r.season}><th>{r.season}</th><td>{money(r.salaryManYen)}</td><td>{money(r.reservedManYen)}</td><td>{money(r.remainingManYen)}</td></tr>)}
    </tbody></table></DataTableFrame></details>
  </main>;
}
