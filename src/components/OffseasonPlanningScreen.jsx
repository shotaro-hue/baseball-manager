import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import OffseasonFaPhaseScreen from './OffseasonFaPhaseScreen';
import { GrowthSummaryScreen } from './OffseasonReviewScreens';
import { compactRenewalSession, planningSummary, reconcileRenewalSession } from '../engine/offseasonPlanning';
import { renewalEligible } from '../engine/renewalRules';
import { fmtSal } from '../utils';
import { useResultDialog } from './useResultDialog';
import '../calm-planning.css';

const PlayerModal = lazy(() => import('./PlayerModal').then(m => ({ default: m.PlayerModal })));
const money = value => Number.isFinite(value) ? fmtSal(value) : '未記録';
const intentLabels = { retain: '残留予定', negotiate: '交渉予定', release: '放出候補' };
function Confirm({ children, title, onClose, onConfirm, busy }) {
  const ref = useResultDialog(onClose, true);
  return <div className="planning-overlay"><section className="planning-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="planning-confirm-title">
    <h2 id="planning-confirm-title" tabIndex={0}>{title}</h2>{children}<div className="planning-actions"><button disabled={busy} onClick={onClose}>戻って見直す</button><button disabled={busy} className="planning-primary" onClick={onConfirm}>確認して確定する</button></div>
  </section></div>;
}
export default function OffseasonPlanningScreen({ gs, os, myTeam, myId, year }) {
  const plan = gs.offseasonPlan;
  const [profile, setProfile] = useState(null);
  const [modal, setModal] = useState(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const close = useCallback(() => setModal(null), []);
  const saveSession = useCallback(session => gs.setOffseasonPlan(prev => ({ ...prev,
    session: reconcileRenewalSession(compactRenewalSession(session), myTeam, year, prev.session) })), [gs.setOffseasonPlan, myTeam, year]);
  const saveView = useCallback(renewalView => gs.setOffseasonPlan(prev => ({ ...prev, renewalView })), [gs.setOffseasonPlan]);
  const overview = planningSummary(myTeam, plan, year);
  const pending = overview.pending.filter(p => !overview.releaseCandidates.some(c => c.id === p.id));
  const releasePlayer = myTeam?.players.find(p => p.id === modal?.id);
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
  if (!myTeam || plan?.year !== year || plan?.myId !== myId) return <main className="offseason-planning"><p>編成データが見つかりません。セーブを読み直してください。</p></main>;
  const owned = [...myTeam.players, ...(myTeam.farm || [])];
  const open = plan.stage === 'open';
  const tab = plan.tab || 'roster';
  const chooseTab = value => gs.setOffseasonPlan(prev => ({ ...prev, tab: value }));
  const setIntent = (id, value) => gs.setOffseasonPlan(prev => ({ ...prev, intents: [...(prev.intents || []).filter(i => i.id !== id), { id, value }] }));
  return <main className="offseason-planning">
    <header><h1>{year}年 オフシーズン編成</h1><p>{open ? '補強・更改・放出候補を行き来して、来季の編成を決めます。' : '成長結果と編成の見込みを確認し、補強前の方針を整理します。'}</p></header>
    <section className="planning-overview" aria-label="来季の編成と予算の見込み">
      <div className="planning-metrics"><span>来季人数の見込み<strong>{overview.projectedCount}人</strong><small>現在 {overview.active}人＋ファーム {overview.farm}人</small></span><span>来季年俸の見込み<strong>{money(overview.projectedPayroll)}</strong><small>放出候補を除く仮計上</small></span><span>補強に使える残予算<strong>{money(overview.budget)}</strong><small>確定済み取引を反映</small></span><span>交渉の対応待ち<strong>{pending.length}人</strong><small>放出候補 {overview.releaseCandidates.length}人</small></span></div>
      <p className="planning-note">未合意は提示額、未提示は前年年俸で仮計上。方針の選択では実際の所属人数・残予算は変わりません。FA契約は年俸×年数を先払いし、通常更改の年俸は残予算から即時控除しません。残予算から来季年俸をもう一度差し引いた値ではありません。</p>
      <p>自球団からFA宣言中：{gs.faPool.filter(p => p.marketEntryReason === '国内FA宣言' && p.faOriginTeamId === myId).length}人。宣言残留は補強市場で契約できます。</p>
      <details><summary>ポジション別人数・不足の目安</summary><div className="planning-counts">{overview.positions.map(r => <span key={r.pos}>{r.pos} {r.count}人</span>)}</div><p>登録とファームの主なポジションによる人数です。複数ポジションの適性は選手詳細で確認できます。</p>{overview.needs.length ? <ul>{overview.needs.map(n => <li key={n}>{n}</li>)}</ul> : <p>先発・救援・捕手の人数目安を満たしています。能力や起用の適否を保証するものではありません。</p>}</details>
      <div className="planning-actions"><span role="status">{gs.saveDirty ? '変更あり・自動保存待ち' : '保存済み'}</span><button onClick={() => gs.handleSave()} disabled={gs.saveQueueState?.isSaving}>編成内容を保存する</button></div>
    </section>
    <details className="planning-growth"><summary>成長結果を確認する</summary><GrowthSummaryScreen summary={plan.growth} year={year} teams={gs.teams} myId={myId} saveId={gs.saveId} faPool={gs.faPool} embedded /></details>
    {!open && <p>残留予定・放出候補は下書きです。補強市場を開いてから契約更改へ進み、必要に応じて方針を見直せます。</p>}
    <nav className="planning-tabs" aria-label="オフシーズン編成の切り替え"><div className="planning-compact"><span>人数見込み {overview.projectedCount}人</span><span>年俸見込み {money(overview.projectedPayroll)}</span><span>残予算 {money(overview.budget)}</span><span>対応待ち {pending.length}人</span></div>{open && <div className="planning-tab-buttons">{[['roster', '自球団'], ['market', '補強市場'], ['review', '結果確認']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => chooseTab(id)}>{label}</button>)}</div>}</nav>
    <section hidden={open && tab !== 'roster'} aria-label="自球団の編成方針">
      <details open={!open}><summary>編成方針・放出候補を見直す</summary><div className="planning-roster">{owned.map(p => {
        const active = myTeam.players.some(x => x.id === p.id);
        const eligible = active && renewalEligible(p, year);
        const intent = plan.intents?.find(i => i.id === p.id)?.value || 'negotiate';
        return <article className="planning-player" key={p.id}><h3>{p.name}</h3><p>{p.pos} · {p.age ?? '未記録'}歳 · 年俸 {money(p.salary)} · {active ? '登録選手' : 'ファーム'}</p><button onClick={() => setProfile(p)}>選手詳細・年度別成績</button>
          {eligible ? <><label>編成方針<select aria-label={`${p.name}の編成方針`} value={intent} onChange={event => setIntent(p.id, event.target.value)}>{Object.entries(intentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{open && intent === 'release' && <button className="planning-danger" onClick={() => { setFailure(''); setModal({ type: 'release', id: p.id }); }}>放出の影響を確認する</button>}</> : <p>{p.contractSignedYear === year ? '今オフ契約済み' : active ? '複数年契約など・今回の更改対象外' : 'ファーム・今回の更改対象外'}</p>}</article>;
      })}</div></details>
      {open && <ContractRenewalPhaseScreen teams={gs.teams} myId={myId} year={year} embedded demands={plan.demands}
        renewalPlayerIds={Object.keys(plan.demands || {})} savedSession={plan.session} onSessionChange={saveSession}
        savedView={plan.renewalView} onViewChange={saveView} onSign={os.handleContractRenewalSign}
        onRelease={os.handlePlanningRelease} onDeclare={id => os.handlePlanningRelease(id, 'fa')} onNext={() => chooseTab('review')} />}
    </section>
    {open && <section hidden={tab !== 'market'} aria-label="補強市場"><OffseasonFaPhaseScreen gs={gs} os={os} myTeam={myTeam} myId={myId} year={year} embedded /></section>}
    {open && <section hidden={tab !== 'review'} className="planning-review" aria-label="編成結果の確認"><h2>編成結果の確認</h2>
      <p>確定済み契約 {owned.filter(p => p.contractSignedYear === year).length}人 · 放出確定 {plan.releasedIds?.length || 0}人 · 放出候補 {overview.releaseCandidates.length}人</p>
      <ul>{owned.map(p => <li key={p.id}>{p.name}：{p.contractSignedYear === year ? `契約済み ${money(p.salary)}・${p.contractYears}年` : overview.releaseCandidates.some(x => x.id === p.id) ? '放出候補（未確定）' : renewalEligible(p, year) ? '交渉の対応待ち' : '継続契約・今回の更改対象外'}</li>)}</ul>
      {pending.length > 0 && <p role="status">{pending.length}人の未合意・対応待ちがあります。自球団で確認してください。</p>}
      <p>編成を終了すると放出候補を確定し、CPU球団が市場で獲得します。その後は市場に戻れません。候補を取り消す場合は自球団へ戻ってください。</p>
      <button className="planning-primary" disabled={pending.length > 0 || busy} onClick={() => { setFailure(''); setModal({ type: 'finish' }); }}>編成終了の最終確認</button>
    </section>}
    {!open && <footer><button className="planning-primary" onClick={() => gs.setOffseasonPlan(prev => ({ ...prev, stage: 'open', tab: 'market' }))}>方針を確認して補強市場を開く</button></footer>}
    {modal && <Confirm title={modal.type === 'release' ? '放出の最終確認' : 'オフシーズン編成の最終確認'} {...{ onClose: close, onConfirm: finish, busy }}>
      {modal.type === 'release' ? <><p>{releasePlayer?.name || '対象選手'}を放出します。確定後は取り消せません。</p><p>登録人数 {overview.active} → {overview.active - 1}人 · 年俸総額 {money(overview.payroll)} → {money(overview.payroll == null || !Number.isFinite(releasePlayer?.salary) ? null : overview.payroll - releasePlayer.salary)}</p></> : <><p>来季人数の見込み {overview.projectedCount}人 · 年俸見込み {money(overview.projectedPayroll)}</p>{overview.releaseCandidates.length ? <ul>{overview.releaseCandidates.map(p => <li key={p.id}>放出確定予定：{p.name} · {money(p.salary)}</li>)}</ul> : <p>追加の放出候補はありません。</p>}<p>編成を終了し、CPUの獲得結果とドラフトへ進みます。</p></>}
      {failure && <p role="alert">{failure}</p>}
      {overview.needs.length > 0 && <p>人数の不足目安：{overview.needs.join('、')}。補強やドラフト後の編成で確認してください。</p>}
    </Confirm>}
    {profile && <Suspense fallback={<p>選手詳細を読み込み中です。</p>}><PlayerModal player={profile} teamName={myTeam.name} teams={gs.teams} saveId={gs.saveId} year={year} isMyTeam onClose={() => setProfile(null)} /></Suspense>}
  </main>;
}
