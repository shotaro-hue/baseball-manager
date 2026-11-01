import { useEffect, useMemo, useRef, useState } from 'react';
import { toAnnualState } from '../../engine/contractEconomy';
import { quoteAnnualSpendingPlan } from '../../engine/annualSpending';
import { validateEconomySave } from '../../engine/economyPersistence';
import { acquisitionRequest, reduceAcquisitionRequest, dueAcquisitionDecisions } from '../../engine/acquisitionDecisions';
import { dueRenewalDecisions } from '../../engine/renewalDecisions';
import { isIkuseiPlayer } from '../../engine/rosterCapacity';
import { Button, DataTableFrame, MetricBand } from '../design-system/primitives';
import { DecisionConfirmation, money, moneyMetric, PlayerFacts, PlayerActions, useDecisionReturn } from '../management/DecisionParts';
import { PlayerList, useMobileDetail } from '../management/PlayerList';

const labels = { pending: '回答待ち', accepted: '契約済み', rejected: '辞退', cancelled: '取消済み', replaced: '差替済み', expired: '期限切れ', invalidated: '失効' };
function marketView(gs) {
  try {
    validateEconomySave(gs);
    const state = toAnnualState(gs), decisions = gs.contractEconomy.decisions.filter(d => d.kind === 'human-acquisition' && d.teamId === gs.myId);
    const candidates = [...gs.faPool];
    for (const d of decisions) if (!candidates.some(p => p.id === d.playerId)) candidates.push(
      state.acquisitions.find(h => h.proposalId === d.proposalId)?.player
      ?? gs.teams.flatMap(t => [...t.players, ...t.farm]).find(p => p.id === d.playerId)
      ?? { id: d.playerId, name: d.playerName });
    const entries = candidates.map(player => {
      const history = decisions.filter(d => d.playerId === player.id), latest = history.at(-1);
      return { player, latest, history, onMarket: gs.faPool.some(p => p.id === player.id),
        status: latest ? labels[latest.status] : player.marketEntry ? '交渉可能' : '市場区分未確認' };
    });
    return { entries, due: dueAcquisitionDecisions(gs), renewalDue: dueRenewalDecisions(gs),
      rows: quoteAnnualSpendingPlan(state.spending).filter(r => r.teamId === gs.myId) };
  } catch { return { error: '市場の契約データを確認できないため、交渉を停止しています。保存データを読み直してください。' }; }
}

export function AnnualMarketTab({ gs, os, comparison }) {
  const [selectedId, setSelectedId] = useState(null), [salary, setSalary] = useState(''), [years, setYears] = useState(1);
  const [confirmation, setConfirmation] = useState(null), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState(null);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const model = useMemo(() => marketView(gs), [gs.contractEconomy, gs.teams, gs.myId, gs.faPool, gs.offseasonPlan, gs.schedule, gs.gameDay, gs.year]);
  const selected = model.entries?.find(e => e.player.id === selectedId), pending = selected?.latest?.status === 'pending' ? selected.latest : null;
  const focus = useDecisionReturn(selectedId), mobileDetail = useMobileDetail(selectedId);
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const blocked = busy || gs.saveQueueState?.isSaving || recovery;
  const replyDue = Boolean(pending && model.due.some(d => d.proposalId === pending.proposalId));
  const select = (player, event) => {
    if (inFlight.current) return;
    const latest = model.entries.find(e => e.player.id === player.id)?.latest;
    const saved = latest?.status === 'pending' ? latest.request.action : null;
    focus.remember(event); setSelectedId(player.id); setSalary(String(saved?.salary ?? player.salary ?? ''));
    setYears(saved?.years ?? 1); setConfirmation(null); setFeedback('');
  };
  const action = { type: 'offer', playerId: selectedId, salary: Number(salary), years,
    ...(pending ? { replaceProposalId: pending.proposalId } : {}) };
  // Pure preview reserves nothing and consumes no RNG/UID. The submitted
  // decision is evaluated and fixed against the acknowledged latest world.
  const preview = useMemo(() => !selected?.onMarket || !selected.player.marketEntry ? null
    : reduceAcquisitionRequest(gs, acquisitionRequest(gs, action)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [gs, selectedId, salary, years, pending?.proposalId]);
  const run = async (operation, message) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFeedback(''); setFailure(null);
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (!result?.ok) { setFailure(result ?? { reason: 'economy_commit_failed' }); return; }
      setConfirmation(null); setFeedback(result.replayed ? '保存済みの交渉を確認しました。' : message);
    } catch { if (mounted.current) setFailure({ reason: 'economy_commit_failed' }); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const confirm = () => {
    if (blocked || inFlight.current || replyDue || !selected) return;
    if (confirmation === 'offer' && preview?.ok) return run(() => os.handleAcquisitionOffer(selectedId, Number(salary), years,
      pending ? { replaceProposalId: pending.proposalId } : {}), '提示を保存しました。回答待ちです。');
    if (confirmation === 'cancel' && pending) return run(() => os.handleCancelAcquisition(pending.proposalId), '提示を取り消しました。');
  };
  if (model.error) return <p role="alert">{model.error}</p>;
  const clock = gs.contractEconomy.clock, budgetYear = gs.year + Number(clock.phase === 'offseason');
  const budget = model.rows.find(r => r.season === budgetYear);
  const previewRows = preview?.ok ? quoteAnnualSpendingPlan(toAnnualState(preview.world).spending).filter(r => r.teamId === gs.myId) : [];
  const confirmationError = blocked ? '保存・復旧の完了を待ってください。' : replyDue ? '先に届いた回答を確認してください。'
    : confirmation === 'offer' && !preview?.ok ? preview?.error ?? '提示条件を確認してください。' : null;
  return <main className={`management-decisions ${selectedId !== null ? 'decision-selected' : ''}`} data-ds="contract-management">
    <h1>FA・自由契約市場</h1><p>条件を提示し、保存された回答予定を確認します。正式提示は各年度の予算を確保します。</p>
    <MetricBand items={[moneyMetric(`${budgetYear}年度の追加余力`, money(budget?.remainingManYen)),
      { label: '回答待ち', value: model.entries.filter(e => e.latest?.status === 'pending').length, unit: '人' }]} />
    <p className="decision-note">{clock.phase === 'offseason' ? `オフ第${clock.offseasonTurn}ターン。新規提示は30ターンまで。合意した選手は翌春の加入待ちになります。`
      : `${clock.date}。新規獲得の受諾・登録は7月31日まで。期限後の未回答提示は失効します。`}</p>
    {busy && <p role="status">保存・反映を確認しています…</p>}
    {feedback && <p role="status" className="decision-receipt">{feedback}</p>}
    {failure && <p role="alert" className="decision-error">{failure.error || (recovery ? '保存済みの交渉を画面へ反映できませんでした。復旧してください。' : '交渉を保存できませんでした。入力条件を保持しています。再試行してください。')}</p>}
    {recovery && <Button disabled={busy} onClick={() => run(() => gs.recoverEconomyCommand(), '保存済みの交渉を復旧しました。')}>保存済みの交渉を復旧する</Button>}
    {(model.due.length + model.renewalDue.length > 0) && <Button disabled={blocked} onClick={() => run(() => os.handleResolveEconomyDecisions(), '届いた回答を保存しました。')}>届いた回答を確認する</Button>}
    <div className="decision-layout"><section className="decision-list" ref={focus.list} aria-label="市場の候補と交渉履歴">
      <PlayerList entries={model.entries} selectedId={selectedId} onSelect={select} actionLabel="の交渉を確認" suspended={mobileDetail} />
    </section><section className="decision-detail" aria-label="選んだ候補の提示条件">
      {!selected ? <p>候補を選ぶと、契約条件と保存済みの交渉履歴を確認できます。</p> : <>
        <Button variant="secondary" disabled={blocked} onClick={() => { setSelectedId(null); setConfirmation(null); }}>← 候補一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{selected.player.name}</h3><PlayerFacts player={selected.player} />
        <PlayerActions player={selected.player} teamName="FA市場" onPlayerClick={gs.handlePlayerClick} onToggleCompare={comparison?.onToggle} comparePlayerIds={comparison?.players?.map(p => p.id)} />
        {selected.latest && <div className="decision-warning" role="status"><strong>{labels[selected.latest.status]}</strong>
          <p>保存済みの提示：年俸{money(selected.latest.request.action.salary)}・{selected.latest.request.action.years}年</p>
          {pending && <p>{pending.dueDate ? `回答予定：${pending.dueDate}` : `回答予定：オフ第${pending.dueTurn}ターン`}</p>}
          {selected.latest.status === 'accepted' && selected.latest.offeredClock.phase === 'offseason' && <p>翌春の加入待ち。補償対象の場合は、旧球団による補償の選択・精算が必要です。</p>}
          {selected.latest.failureReason && <p>{selected.latest.failureReason}</p>}</div>}
        {selected.onMarket && selected.player.marketEntry ? <fieldset disabled={blocked || replyDue} style={{ border: 0, padding: 0, minWidth: 0 }}><legend>提示条件（未保存の入力）</legend>
          <div className="decision-fields"><label>提示年俸（万円）<input aria-label="提示年俸（万円）" type="number" min="1" step="1" value={salary} onChange={e => { setSalary(e.target.value); setConfirmation(null); }} /></label>
            <label>契約年数<select aria-label="契約年数" value={years} onChange={e => { setYears(Number(e.target.value)); setConfirmation(null); }}>{(isIkuseiPlayer(selected.player) ? [1] : [1, 2, 3]).map(y => <option key={y} value={y}>{y}年</option>)}</select></label></div>
          {!preview?.ok && <p className="decision-note" role="status">{preview?.error}</p>}
          <Button disabled={blocked || !preview?.ok} onClick={() => setConfirmation('offer')}>提示条件を確認する</Button>
          {pending && <Button variant="secondary" onClick={() => setConfirmation('cancel')}>提示を取り消す</Button>}
        </fieldset> : <p>{selected.onMarket ? '市場区分が未確認のため、この候補には提示できません。' : 'この選手は現在の市場にいません。保存済みの交渉履歴を表示しています。'}</p>}
        {confirmation && <DecisionConfirmation title={confirmation === 'offer' ? '提示条件の最終確認' : '提示取消の確認'} fallbackFocus={focus.heading}
          onCancel={() => { if (!blocked) setConfirmation(null); }} onConfirm={confirm} error={confirmationError}
          confirmLabel={confirmation === 'offer' ? 'この条件で提示する' : '取消を確定する'}>
          {confirmation === 'offer' && pending && <p>保存済みの提示：年俸{money(pending.request.action.salary)}・{pending.request.action.years}年</p>}
          <p>{confirmation === 'offer' ? `${pending ? '差替後の提示：' : ''}年俸${money(Number(salary))}・${years}年。${clock.phase === 'offseason' ? '翌年2月1日からの契約です。' : '受諾日から給与を月割りで計上します。'}` : '回答待ちの提示と予算の確保を取り消します。'}</p>
          {confirmation === 'offer' && preview?.ok && <p>{budgetYear}年度の提示後追加余力：{money(previewRows.find(r => r.season === budgetYear)?.remainingManYen)}。補償対象の留保も含みます。</p>}
        </DecisionConfirmation>}
        {selected.history.length > 1 && <details><summary>交渉履歴</summary><ul>{selected.history.map(d => <li key={d.proposalId}>{labels[d.status]}：{money(d.request.action.salary)}・{d.request.action.years}年</li>)}</ul></details>}
      </>}
    </section></div>
    <details><summary>年度別の予算と契約負担</summary><DataTableFrame label="年度別の予算と契約負担"><table><thead><tr><th>年度</th><th>契約年俸</th><th>提示中の確保額</th><th>追加余力</th></tr></thead><tbody>
      {model.rows.map(r => <tr key={r.season}><th>{r.season}</th><td>{money(r.salaryManYen)}</td><td>{money(r.reservedManYen)}</td><td>{money(r.remainingManYen)}</td></tr>)}
    </tbody></table></DataTableFrame></details>
  </main>;
}
