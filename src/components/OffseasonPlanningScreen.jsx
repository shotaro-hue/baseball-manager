import RosterReinforcementPlan from './RosterReinforcementPlan';
import { RosterCapacitySummary } from './RosterCapacitySummary';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import OffseasonFaPhaseScreen from './OffseasonFaPhaseScreen';
import { GrowthSummaryScreen } from './OffseasonReviewScreens';
import { compactRenewalSession, planningSummary, reconcileRenewalSession } from '../engine/offseasonPlanning';
import { renewalEligible } from '../engine/renewalRules';
import { saveFeedback } from '../engine/saveFeedback';
import { fmtSal } from '../utils';
import { useResultDialog } from './useResultDialog';
import { Button, MetricBand, StateLabel } from './design-system/primitives';
import './offseason-planning.css';

const PlayerModal = lazy(() => import('./PlayerModal').then(m => ({ default: m.PlayerModal })));
const money = value => Number.isFinite(value) ? fmtSal(value) : '未記録';
function Confirm({ children, title, onClose, onConfirm, busy, fallbackFocus }) {
  const ref = useResultDialog(onClose, true);
  useEffect(() => () => {
    if (typeof document !== 'undefined' && document.activeElement === document.body) fallbackFocus.current?.focus({preventScroll:true});
  }, []);
  return <div className="planning-overlay"><section data-ds="planning-dialog" className="planning-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="planning-confirm-title">
    <h2 id="planning-confirm-title" tabIndex={0}>{title}</h2>{children}<div className="planning-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>戻って見直す</Button><Button disabled={busy} className="planning-danger" onClick={onConfirm}>確認して確定する</Button></div>
  </section></div>;
}
function PlanningSaveStatus({gs}) {
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [lastFailure, setLastFailure] = useState(null);
  const inFlight = useRef(false);
  const sharedResult = useRef(gs.saveResult);
  sharedResult.current = gs.saveResult;
  useEffect(() => {
    // A later reset to null must not revive a superseded local attempt.
    if (gs.saveResult != null) setAttempt(null);
    if (gs.saveResult?.ok === false) setLastFailure(gs.saveResult);
    else if (gs.saveResult?.ok === true) setLastFailure(null);
  }, [gs.saveResult]);
  // Early returns and unexpected rejections may not publish a shared save result.
  // A newer shared result always supersedes this local presentation state.
  const result = (attempt && attempt.source === gs.saveResult ? attempt.result : gs.saveResult) ?? lastFailure;
  const saving = Boolean(pending || gs.saveQueueState?.isSaving || gs.saveQueueState?.hasQueuedSave);
  const failed = result?.ok === false;
  const partial = result?.archive?.ok === false || result?.warnings?.length > 0;
  const feedback = failed ? saveFeedback(result) : null;
  const label = saving ? '保存中' : failed ? '保存失敗' : gs.saveDirty ? '保存待ち' : result?.ok === true ? result.archive?.ok === false ? '保存済み・一部履歴は要確認' : partial ? '保存済み・保存情報は要確認' : '保存済み' : '保存状態未確認';
  const tone = saving ? 'processing' : failed ? 'danger' : gs.saveDirty || partial ? 'warning' : result?.ok === true ? 'success' : 'neutral';
  const save = async () => {
    if (inFlight.current || saving) return;
    inFlight.current = true; setPending(true);
    const rememberAttempt = next => {
      if (sharedResult.current && sharedResult.current !== gs.saveResult) return;
      setAttempt({ source: sharedResult.current, result: next });
      setLastFailure(next.ok ? null : next);
    };
    try {
      const next = await gs.handleSave();
      rememberAttempt(typeof next?.ok === 'boolean' ? next : { ok: false });
    } catch {
      const failure = { ok: false };
      rememberAttempt(failure);
      gs.notify?.(saveFeedback(failure).message, 'warn');
    } finally { inFlight.current = false; setPending(false); }
  };
  return <div className="planning-save">
    <StateLabel tone={tone} role={failed && !saving ? 'none' : undefined}>{label}</StateLabel>
    <Button variant="secondary" onClick={save} disabled={saving} aria-describedby={failed ? 'planning-save-failure' : undefined}>編成内容を保存する</Button>
    {failed && <div id="planning-save-failure" className="planning-save-failure" role="alert">
      <p>{feedback.cause}{feedback.recovery}</p>
      <p className="planning-save-risk">{feedback.risk}</p>
      <details><summary>保存エラーの詳細</summary><p>理由コード：<code>{feedback.reason}</code></p></details>
    </div>}
  </div>;
}
export default function OffseasonPlanningScreen({ gs, os, myTeam, myId, year }) {
  const plan = gs.offseasonPlan;
  const [profile, setProfile] = useState(null);
  const rosterHeading = useRef(null);
  const growthDisclosure = useRef(null);
  const tabBar = useRef(null);
  const startingMarket = useRef(false);
  const [modal, setModal] = useState(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const close = useCallback(() => setModal(null), []);
  const saveSession = useCallback(session => gs.setOffseasonPlan(prev => ({ ...prev,
    session: reconcileRenewalSession(compactRenewalSession(session), myTeam, year, prev.session) })), [gs.setOffseasonPlan, myTeam, year]);
  const saveView = useCallback(renewalView => gs.setOffseasonPlan(prev => ({ ...prev, renewalView })), [gs.setOffseasonPlan]);
  useEffect(() => {
    if (startingMarket.current && plan?.stage === 'open') {
      tabBar.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }); startingMarket.current = false;
    }
  }, [plan?.stage]);
  const overview = planningSummary(myTeam, plan, year, gs.teams);
  const pending = overview.pending.filter(p => !overview.releaseCandidates.some(c => c.id === p.id));
  const releasePlayer = [...(myTeam?.players || []), ...(myTeam?.farm || [])].find(p => p.id === modal?.id);
  const finish = () => {
    if (processing.current) return;
    processing.current = true; setBusy(true); setFailure('');
    try {
      const ok = modal?.type === 'release' ? os.handlePlanningRelease(modal.id) : os.handlePlanningFinish();
      if (ok === false) setFailure('対象や交渉状態が変わっています。戻って確認してください。');
      else setModal(null);
    } catch (error) { console.error('オフシーズン編成の確定に失敗:', error); setFailure('確定に失敗しました。画面の状態を確認して再試行してください。'); }
    finally { processing.current = false; setBusy(false); }
  };
  if (!myTeam || plan?.year !== year || plan?.myId !== myId) return <main data-ds="planning-screen" className="offseason-planning planning-screen"><p role="alert">編成データが見つかりません。セーブを読み直してください。</p></main>;
  const owned = [...myTeam.players, ...(myTeam.farm || [])];
  const open = plan.stage === 'open';
  const tab = plan.tab || 'roster';
  const chooseTab = value => gs.setOffseasonPlan(prev => ({ ...prev, tab: value }));
  const setIntent = (id, value) => {
    if (!owned.some(p => p.id === id && renewalEligible(p, year))) return;
    gs.setOffseasonPlan(prev => ({ ...prev, intents: [...(prev.intents || []).filter(i => i.id !== id), { id, value }] }));
  };
  const openNegotiations = () => gs.setOffseasonPlan(prev => ({ ...prev, stage: 'open', tab: 'roster' }));
  return <main data-ds="planning-screen" className="offseason-planning planning-screen">
    <header className="planning-heading"><p>{myTeam.name} · {year}年</p><h1 ref={rosterHeading} tabIndex={-1} aria-label={`${year}年 オフシーズン編成`}>オフシーズン編成</h1></header>
    <ol className="planning-phase" aria-label="年間の現在地"><li>成長確認</li><li aria-current="step">編成計画</li><li>補強結果</li><li>ドラフト</li><li>キャンプ</li></ol>
    <section className="planning-overview" aria-label="来季の編成と予算の見込み">
      <MetricBand className="planning-metrics" items={[
        {label:'所属分人数',value:overview.projectedCount,unit:'人'},
        {label:'年俸見込み',value:overview.projectedPayroll == null ? null : money(overview.projectedPayroll)},
        {label:'補強の残予算',value:overview.budget == null ? null : money(overview.budget)},
        {label:'未解決',value:pending.length,unit:'人'},
      ]}/>
      <p className="planning-note">現在 一軍{overview.active}人・二軍／育成{overview.farm}人</p>
      <RosterCapacitySummary capacity={overview.capacity} className="planning-note"/>
      <p className="planning-note">予定反映後の支配下見込み {overview.projectedCapacity.ok ? `${overview.projectedCapacity.projectedControlledCount}人` : '未確認'}（確定指名を含む）{overview.projectedCapacity.projectedOverBy > 0 && ` · ${overview.projectedCapacity.projectedOverBy}枠不足`}</p>
      <RosterReinforcementPlan team={myTeam} plan={plan} year={year} teams={gs.teams} onSave={reinforcements=>gs.setOffseasonPlan(prev=>prev?.year===year&&prev.myId===myId?{...prev,reinforcements}:prev)}/>
      <PlanningSaveStatus gs={gs}/>
    </section>
    {!open && <div className="planning-start"><Button onClick={() => { startingMarket.current = true; gs.setOffseasonPlan(prev => ({ ...prev, stage: 'open', tab: 'market' })); }}>交渉・補強を始める</Button></div>}
    {open && <nav ref={tabBar} className="planning-tabs" aria-label="オフシーズン編成の切り替え"><div className="planning-tab-buttons">{[['roster', '自球団'], ['market', '補強市場'], ['review', '結果確認']].map(([id, label]) => <Button variant="secondary" key={id} aria-pressed={tab === id} onClick={() => chooseTab(id)}>{label}</Button>)}</div></nav>}
    <div className="planning-layout" data-view={open ? tab : 'planning'}>
    <section hidden={open && tab !== 'roster'} aria-label="自球団の編成方針">
      <ContractRenewalPhaseScreen teams={gs.teams} myId={myId} year={year} saveId={gs.saveId} embedded demands={plan.demands}
        savedSession={plan.session} onSessionChange={saveSession}
        savedView={plan.renewalView} onViewChange={saveView} onSign={os.handleContractRenewalSign}
        onRelease={os.handlePlanningRelease} onDeclare={id => os.handlePlanningRelease(id, 'fa')} onNext={() => chooseTab('review')}
        planning={{ intents: plan.intents || [], candidates: overview.releaseCandidates, negotiationOpen: open,
          onIntentChange: setIntent, onOpenNegotiations: openNegotiations, onProfile: setProfile,
          onInspectRelease: id => { setFailure(''); setModal({ type: 'release', id }); } }} />
    </section>
    {open && <section hidden={tab !== 'market'} aria-label="補強市場"><OffseasonFaPhaseScreen gs={gs} os={os} myTeam={myTeam} myId={myId} year={year} embedded /></section>}
    {open && <section hidden={tab !== 'review'} className="planning-review" aria-label="編成結果の確認"><h2>編成結果の確認</h2>
      <p>確定済み契約 {owned.filter(p => p.contractSignedYear === year).length}人 · 放出確定 {plan.releasedIds?.length || 0}人 · 放出候補 {overview.releaseCandidates.length}人</p>
      <ul>{owned.map(p => <li key={p.id}>{p.name}：{p.contractSignedYear === year ? `契約済み ${money(p.salary)}・${p.contractYears}年` : overview.releaseCandidates.some(x => x.id === p.id) ? '放出候補（未確定）' : renewalEligible(p, year) ? '交渉の対応待ち' : '継続契約・今回の更改対象外'}</li>)}</ul>
      {pending.length > 0 && <p role="status">{pending.length}人の未合意・対応待ちがあります。自球団で確認してください。</p>}
      <p>編成を終了すると放出候補を確定し、CPU球団が市場で獲得します。その後は市場に戻れません。候補を取り消す場合は自球団へ戻ってください。</p>
      <Button className="planning-primary" disabled={pending.length > 0 || busy} onClick={() => { setFailure(''); setModal({ type: 'finish' }); }}>編成終了の最終確認</Button>
    </section>}
    <aside className="planning-support">
      <details><summary>人数・年俸・予算の計上条件</summary><p className="planning-note">年俸見込みは当年契約済みの年俸、それ以外は成立済み条件の年俸を使用し、成立条件がなければ前年年俸で仮計上します。未合意の提示額は見込みへ反映しません。</p><p className="planning-note">所属分人数は一軍・二軍・育成から放出候補を除いた人数です。支配下見込みは支配下の放出候補と確定指名を反映します。実際の残枠は現在の支配下と未所属の確定指名から計算し、放出候補だけでは増えません。未設定の補強予定は計上しません。予定反映後の支配下見込みは、未実行のドラフト・FA・育成昇格予定を加えます。実行済みの獲得・昇格・確定指名は予定へ重ねません。年俸見込みは所属選手分で、未確定の新人・FA契約額は含みません。方針の選択では実際の所属人数・残予算は変わりません。FA契約は年俸×年数を先払いし、通常更改の年俸は残予算から即時控除しません。残予算から来季年俸をもう一度差し引いた値ではありません。</p></details>
      <details><summary>ポジション別人数・不足の目安</summary><div className="planning-counts">{overview.positions.map(r => <span key={r.pos}>{r.pos} {r.count}人</span>)}</div><p className="planning-note">登録と二軍の主なポジションによる人数です。複数ポジションの適性は選手詳細で確認できます。</p>{overview.needs.length ? <ul>{overview.needs.map(n => <li key={n}>{n}</li>)}</ul> : <p>先発・救援・捕手の人数目安を満たしています。能力や起用の適否を保証するものではありません。</p>}</details>
      <details className="planning-growth" ref={growthDisclosure}><summary>成長結果を確認する</summary><GrowthSummaryScreen farmState={{farmCompetition:gs.farmCompetition,year:gs.year,teams:gs.teams,seasonHistory:gs.getSeasonHistory?.()??gs.seasonHistory}} summary={plan.growth} year={year} teams={gs.teams} myId={myId} saveId={gs.saveId} faPool={gs.faPool} embedded onClose={() => { if (growthDisclosure.current) growthDisclosure.current.open = false; growthDisclosure.current?.querySelector('summary')?.focus({preventScroll:true}); }} /></details>
      <p className="planning-note">自球団からFA宣言中：{gs.faPool.filter(p => p.marketEntryReason === '国内FA宣言' && p.faOriginTeamId === myId).length}人。宣言残留は補強市場で契約できます。</p>
    </aside>
    </div>
    {modal && <Confirm title={modal.type === 'release' ? '放出の最終確認' : 'オフシーズン編成の最終確認'} {...{ onClose: close, onConfirm: finish, busy, fallbackFocus:rosterHeading }}>
      {modal.type === 'release' ? <><p>{releasePlayer?.name || '対象選手'}を放出します。確定後は取り消せません。</p><p>所属人数 {overview.owned} → {overview.owned - 1}人 · 年俸総額 {money(overview.payroll)} → {money(overview.payroll == null || !Number.isFinite(releasePlayer?.salary) ? null : overview.payroll - releasePlayer.salary)}</p></> : <><p>来季人数の見込み {overview.projectedCount}人 · 年俸見込み {money(overview.projectedPayroll)}</p>{overview.releaseCandidates.length ? <ul>{overview.releaseCandidates.map(p => <li key={p.id}>放出確定予定：{p.name} · {money(p.salary)}</li>)}</ul> : <p>追加の放出候補はありません。</p>}<p>編成を終了し、CPUの獲得結果とドラフトへ進みます。</p></>}
      {failure && <p role="alert">{failure}</p>}
      {overview.needs.length > 0 && <p>人数の不足目安：{overview.needs.join('、')}。補強やドラフト後の編成で確認してください。</p>}
    </Confirm>}
    {profile && <Suspense fallback={<p>選手詳細を読み込み中です。</p>}><PlayerModal farmState={{farmCompetition:gs.farmCompetition,year:gs.year,teams:gs.teams,seasonHistory:gs.getSeasonHistory?.()??gs.seasonHistory}} player={profile} teamName={myTeam.name} teams={gs.teams} saveId={gs.saveId} year={year} isMyTeam onClose={() => setProfile(null)} /></Suspense>}
  </main>;
}
