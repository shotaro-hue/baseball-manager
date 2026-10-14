import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { calcRetireWill } from '../engine/playerCore';
import { waiverEligible } from '../engine/offseasonReview';
import { marketMetrics } from './hub/faMarket';
import { fmtSal } from '../utils';
import { useResultDialog } from './useResultDialog';
import '../calm-offseason.css';
import {Button,MetricBand,StateLabel,DataTableFrame} from './design-system/primitives';
import './growth-report.css';
import {CaretRight} from '@phosphor-icons/react';

const PlayerModal = lazy(() => import('./PlayerModal').then(m => ({ default: m.PlayerModal })));
const money = n => Number.isFinite(n) ? fmtSal(n) : '未記録';
const sum = values => values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : undefined;
const retirementLabels = { accepted: '引退を受け入れ', retained: '引き留め成功', retain_failed: '引き留め不成立・引退' };
function Frame({ farmState, title, year, teams = [], myId, saveId, children, embedded = false, screenClass, onClose }) {
  const [profile, setProfile] = useState(null);
  const myTeam = teams.find(t => t.id === myId);
  const Tag = embedded ? 'section' : 'main'; const Heading = embedded ? 'h2' : 'h1';
  return <Tag className={`offseason-review ${screenClass || ''}`} data-ds={screenClass ? 'growth-screen' : undefined}><div className="review-content"><header>{onClose && <Button variant="secondary" className="growth-close" onClick={onClose}>編成に戻る</Button>}<p>オフシーズン · {year}年</p><Heading>{title}</Heading></header>{children(setProfile)}
    {profile && <Suspense fallback={<p role="status">選手詳細を読み込み中です。</p>}><PlayerModal farmState={farmState} key={profile.id} player={profile} teamName={myTeam?.name || '選手記録'} isMyTeam={[...(myTeam?.players || []), ...(myTeam?.farm || [])].some(p => p.id === profile.id)} saveId={saveId} teams={teams} year={year} onClose={() => setProfile(null)} /></Suspense>}
  </div></Tag>;
}
function Confirm({ title, children, onClose, onConfirm, label, disabled, busy, error }) {
  const ref = useResultDialog(onClose, true);
  return <div className="review-overlay"><section className="review-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="review-confirm-title"><h2 id="review-confirm-title" tabIndex={0}>{title}</h2>{children}
    {error && <p role="alert">{error}</p>}<div className="review-actions"><button disabled={busy} onClick={onClose}>戻って見直す</button><button className="review-primary" disabled={disabled || busy} onClick={onConfirm}>{busy ? '処理中…' : label}</button></div></section></div>;
}
function useAdvance(onNext) {
  const lock = useRef(false); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState(null);
  const run = async value => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(null);
    try { if (await onNext(value) === false) { lock.current = false; setFailure('処理を完了できませんでした。内容を確認して再試行してください。'); } }
    catch { lock.current = false; setFailure('処理を完了できませんでした。再試行してください。'); }
    finally { setBusy(false); }
  };
  return { run, busy, failure };
}
function PlayerInfo({ player, onProfile }) {
  return <><h3>{player.name}</h3><p>{player.pos || '役割未記録'} · {Number.isFinite(player.age) ? `${player.age}歳` : '年齢未記録'} · 年俸 {money(player.salary)}</p>
    <details><summary>{player.name}の成績・詳細</summary><div className="review-metrics">{marketMetrics(player).map(([key, value]) => <span key={key}>{key} <strong>{value}</strong></span>)}</div><p className="review-note">0は実測値。未記録は欠測、—は算出できない率です。</p><button aria-label={`${player.name}の詳細を開く`} onClick={() => onProfile(player)}>選手詳細・年度別成績</button></details></>;
}
export function RetirePhaseScreen({ farmState, teams, myId, year, saveId, error, onNext }) {
  const team = teams?.find(t => t.id === myId);
  const candidates = (team?.players || []).filter(p => p.age >= 35 && !p.isRetired);
  const [decisions, setDecisions] = useState(() => Object.fromEntries(candidates.filter(p => p._retireNow).map(p => [p.id, 'accepted'])));
  const decisionRef = useRef(decisions); const [review, setReview] = useState(false);
  const close = useCallback(() => setReview(false), []); const advance = useAdvance(onNext);
  const write = (p, value) => { const next = { ...decisionRef.current, [p.id]: value }; decisionRef.current = next; setDecisions(next); };
  const retain = p => { if (decisionRef.current[p.id]) return; write(p, Math.random() * 100 > (p.retireStyle ?? 50) ? 'retained' : 'retain_failed'); };
  const pending = candidates.filter(p => calcRetireWill(p) >= 30 && !decisions[p.id]);
  const retiring = candidates.filter(p => ['accepted', 'retain_failed'].includes(decisions[p.id]));
  return <Frame {...{ farmState, teams, myId, year, saveId }} title="引退整理">{profile => <>
    <p>候補の記録を確認し、引き留めるか引退を受け入れるか判断します。結果を確認してから国内FA補強へ進みます。</p>
    <div className="review-metrics"><span>候補 {candidates.length}人</span><span>判断待ち {pending.length}人</span><span>引退予定 {retiring.length}人</span></div>
    {error && <p role="alert">{error}</p>}{!team && <p>球団情報を読み込み中です。</p>}{team && !candidates.length && <p>引退候補はいません。</p>}
    {candidates.map(p => { const will = calcRetireWill(p); const result = decisions[p.id]; return <article className="review-card" key={p.id}>
      <PlayerInfo player={p} onProfile={profile} /><p>引退意欲：{will >= 70 ? '高' : will >= 40 ? '中' : '低'}（ゲーム内判定）</p>
      <details><summary>引退タイプと判断の補足</summary><p>引退タイプ：{Number.isFinite(p.retireStyle) ? p.retireStyle >= 70 ? '潔い引退型' : p.retireStyle <= 30 ? '燃え尽き型' : '普通型' : '未記録'}</p><p>引き留めは成功しない場合があります。一度の引き留め結果を保持し、同じ選手の再抽選は行いません。</p></details>
      {result ? <p role="status">{retirementLabels[result]}</p> : will < 30 ? <p>現役続行意欲あり · 対応不要</p> : <div className="review-actions"><button onClick={() => retain(p)}>引き留める</button><button onClick={() => write(p, 'accepted')}>引退を受け入れる</button></div>}
      {result === 'accepted' && !p._retireNow && <button onClick={() => write(p, undefined)}>引退の判断を見直す</button>}
    </article>; })}
    <footer><p>判断待ちを解消すると次へ進めます。引退の確定は次の確認画面で行います。</p><button className="review-primary" disabled={!team || pending.length > 0 || advance.busy} onClick={() => setReview(true)}>引退結果を確認して次へ</button></footer>
    {review && <Confirm title="引退整理の最終確認" onClose={close} onConfirm={() => { if (!pending.length) advance.run(Object.fromEntries(candidates.filter(p => decisionRef.current[p.id]).map(p => [p.id, decisionRef.current[p.id]]))); }} label="確定して国内FA補強へ" disabled={pending.length > 0} busy={advance.busy} error={advance.failure}>
      <p>引退予定 {retiring.length}人 · 登録選手 {team.players.length} → {team.players.length - retiring.length}人</p>{candidates.length ? <ul>{candidates.map(p => <li key={p.id}>{p.name}：{retirementLabels[decisions[p.id]] || '現役続行・対応不要'}</li>)}</ul> : <p>引退対象なしで進みます。</p>}
      <p>確定すると引退選手は登録から外れ、球団履歴に残ります。</p></Confirm>}
  </>}</Frame>;
}
export function WaiverPhaseScreen({ farmState, teams, myId, year, saveId, onNext }) {
  const team = teams?.find(t => t.id === myId); const [marked, setMarked] = useState([]); const [review, setReview] = useState(false);
  const close = useCallback(() => { setReview(false); setMarked(ids => ids.filter(id => team?.players.some(p => p.id === id && waiverEligible(p)))); }, [team]);
  const advance = useAdvance(onNext); const all = team?.players || [];
  const candidates = all.filter(p => waiverEligible(p) && p.contractSignedYear !== year);
  const contracted = all.filter(p => !candidates.includes(p) && !p.isRetired);
  const selected = all.filter(p => marked.includes(p.id) && waiverEligible(p));
  const stale = marked.some(id => !selected.some(p => p.id === id));
  const row = (p, profile) => <article className="review-card" key={p.id}><PlayerInfo player={p} onProfile={profile} />
    <p>{p.contractSignedYear === year ? `今オフ契約済み · ${p.contractYears ?? p.contractYearsLeft}年契約` : Number.isFinite(p.contractYearsLeft) ? p.contractYearsLeft <= 0 ? '契約満了' : `契約残り${p.contractYearsLeft}年` : '契約期間未記録'}</p>
    {waiverEligible(p) ? <label className="review-select"><input type="checkbox" checked={marked.includes(p.id)} aria-label={`${p.name}を放出対象に選ぶ`} onChange={e => setMarked(ids => e.target.checked ? [...new Set([...ids, p.id])] : ids.filter(id => id !== p.id))} />放出対象に選ぶ</label> : <p className="review-note">従来の対象条件（契約残り1年以下）に含まれません。</p>}
  </article>;
  return <Frame {...{ farmState, teams, myId, year, saveId }} title="戦力外・自由契約の整理">{profile => <>
    <p>選択だけでは放出されません。成績・契約状態と放出後の人数を確認して確定します。</p>
    <div className="review-metrics"><span>放出対象 {selected.length}人</span><span>登録 {all.length} → {all.length - selected.length}人</span><span>ファーム {(team?.farm || []).length}人</span><span>放出対象の年俸 {money(sum(selected.map(p => p.salary)))}</span></div>
    <h2>契約満了・残り1年の選手</h2>{!candidates.length && <p>この一覧の対象選手はいません。</p>}{candidates.map(p => row(p, profile))}
    <details><summary>今オフ契約済み・その他の選手（{contracted.length}人）</summary><p>更改・FA補強で契約した選手を分けて表示しています。残り1年以下の選手は、ここからも明示的に放出対象に選べます。</p>{contracted.map(p => row(p, profile))}</details>
    <footer><p>放出時の予算返金は行いません。登録・打順・先発ローテーションから対象選手を外し、自由契約市場へ移します。</p><button className="review-primary" disabled={!team || advance.busy} onClick={() => setReview(true)}>放出内容を確認する</button></footer>
    {review && <Confirm title="自由契約の最終確認" onClose={close} onConfirm={() => { if (!stale) advance.run(marked); }} label={selected.length ? '放出を確定する' : '放出せずに次へ'} disabled={stale} busy={advance.busy} error={stale ? '対象選手が変更されています。一度戻って確認してください。' : advance.failure}>
      <p>登録選手 {all.length} → {all.length - selected.length}人</p>{selected.length ? <ul>{selected.map(p => <li key={p.id}>{p.name} · {p.pos} · 年俸 {money(p.salary)}{p.contractSignedYear === year ? '（今オフ契約済み）' : ''}</li>)}</ul> : <p>今回は放出せずに進みます。</p>}
      <p>確定後にCPU球団が交渉します。所属先と市場に残る選手は次の結果画面で確認できます。</p></Confirm>}
  </>}</Frame>;
}
export function WaiverResultScreen({ farmState, results, year, teams, myId, saveId, onNext }) {
  const claimed = results?.claimed || []; const unclaimed = results?.unclaimed || []; const advance = useAdvance(onNext);
  const recorded = Array.isArray(results?.claimed) && Array.isArray(results?.unclaimed);
  return <Frame {...{ farmState, teams, myId, year, saveId }} title="自由契約の結果">{profile => <>
    {!recorded ? <p>自由契約の結果は未記録です。</p> : <><p>今回放出した選手の動向です。</p><div className="review-metrics"><span>他球団へ入団 {claimed.length}人</span><span>市場に残る {unclaimed.length}人</span></div>
      {!claimed.length && !unclaimed.length && <p>今回は放出対象の選手はいませんでした。</p>}
      <h2>他球団へ入団</h2>{claimed.map(({ player, teamName, teamEmoji }) => <article className="review-card" key={player.id}><PlayerInfo player={player} onProfile={profile} /><p>{teamEmoji} {teamName || '入団先未記録'}へ入団</p></article>)}
      <h2>自由契約市場に残る選手</h2>{unclaimed.map(p => <article className="review-card" key={p.id}><PlayerInfo player={p} onProfile={profile} /><p>自由契約として市場に残っています。</p></article>)}</>}
    {Array.isArray(results?.allClaimed) && <details className="review-card"><summary>各球団の補強結果（{results.allClaimed.length}人）</summary>{results.allClaimed.map(c => <article key={c.player.id}><PlayerInfo player={c.player} onProfile={profile} /><p>{c.teamName}へ入団 · 年俸 {money(c.player.salary)}</p></article>)}</details>}
    <footer><button className="review-primary" disabled={advance.busy} onClick={() => advance.run()}>ドラフトへ進む</button>{advance.failure && <p role="alert">{advance.failure}</p>}</footer>
  </>}</Frame>;
}
const abilityNames = { velocity: '球速', control: '制球', stamina: 'スタミナ', breaking: '変化球', variety: '球種', sharpness: 'キレ', tempo: 'テンポ', clutchP: 'ピンチ', recovery: '回復', durability: '耐久', contact: 'ミート', power: '長打', eye: '選球眼', speed: '走力', arm: '肩', defense: '守備', catching: '捕球', stealSkill: '盗塁', baseRunning: '走塁', clutch: 'クラッチ', vsLeft: '対左', breakingBall: '変化球対応' };
const delta = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '未記録';
const growthGroups = [['breakout','急成長'],['growth','成長'],['decline','下降']];
const growthScope = (saveId,myId,year) => JSON.stringify([saveId,myId,year]);
function abilityComparison(player,current) {
  const before = (player?.isPitcher ? player?.pitching : player?.batting) || {};
  const after = (player?.isPitcher ? current?.pitching : current?.batting) || {};
  return Object.keys(abilityNames).filter(key => key in before || key in after).map(key => ({key,label:abilityNames[key],before:before[key],after:after[key],diff:Number.isFinite(before[key]) && Number.isFinite(after[key]) ? after[key]-before[key] : null}));
}
export function GrowthSummaryScreen({ farmState, summary, year, teams, myId, saveId, onNext, onClose, embedded = false, faPool = [] }) {
  const advance = useAdvance(onNext);
  const team = teams?.find(t => t.id === myId);
  const identity = growthScope(saveId,myId,year);
  const [filterState,setFilter] = useState({identity,value:'all'});
  const [selection,setSelection] = useState(null);
  const rows = useRef(new Map()),listRef = useRef(null),detailHeading = useRef(null),detailRef = useRef(null),returning = useRef(null),scroll = useRef({});
  const filter = filterState.identity === identity ? filterState.value : 'all';
  const records = growthGroups.flatMap(([group,label]) => (Array.isArray(summary?.[group]) ? summary[group] : []).map((item,index) => ({...item,group,label,key:`${group}:${typeof item?.p?.id}:${item?.p?.id}:${index}`})));
  const selected = selection?.identity === identity ? records.find(record => record.key === selection.key) : null;
  const currentPlayer = p => p?.id == null ? null : [...(team?.players||[]),...(team?.farm||[]),...faPool].find(entry => entry.id === p.id);
  const counts = Object.fromEntries(growthGroups.map(([key]) => [key,Array.isArray(summary?.[key]) ? summary[key].length : null]));
  const count = keys => keys.every(key => counts[key] != null) ? keys.reduce((sum,key) => sum+counts[key],0) : null;
  const complete = growthGroups.every(([key]) => Array.isArray(summary?.[key]));
  const filterGroups = filter === 'up' ? ['breakout','growth'] : filter === 'down' ? ['decline'] : growthGroups.map(([key])=>key);
  const filterComplete = filterGroups.every(key=>Array.isArray(summary?.[key]));
  const visible = records.filter(record => filter === 'all' || (filter === 'up' ? record.group !== 'decline' : record.group === 'decline'));
  const isWarning = record => record.group === 'decline' && record.p?.age >= 33 && Number.isFinite(record.diff) && Math.abs(record.diff) >= 5;
  const open = record => {
    scroll.current = {window:typeof window !== 'undefined' ? window.scrollY : 0,list:listRef.current?.scrollTop||0,table:listRef.current?.querySelector('[data-ds="table"]')?.scrollLeft||0,rowTop:rows.current.get(record.key)?.getBoundingClientRect().top};
    setSelection({identity,key:record.key});
  };
  const back = () => { returning.current = selected?.key; setSelection(null); };
  useEffect(() => { if (selection && !selected) setSelection(null); },[selected?.key,identity]);
  useEffect(() => {
    if (selected) { detailRef.current?.scrollIntoView?.({block:'start'}); detailHeading.current?.focus({preventScroll:true}); }
    else if (returning.current) {
      if (typeof window !== 'undefined') window.scrollTo?.(0,scroll.current.window||0);
      if (listRef.current) {listRef.current.scrollTop=scroll.current.list||0;const table=listRef.current.querySelector('[data-ds="table"]');if(table)table.scrollLeft=scroll.current.table||0;}
      const target=rows.current.get(returning.current);
      // Returning can replace a bounded list with a full-height list; keep the row at its old viewport position.
      if(target && typeof window !== 'undefined' && Number.isFinite(scroll.current.rowTop))window.scrollBy?.(0,target.getBoundingClientRect().top-scroll.current.rowTop);
      target?.focus({preventScroll:true});returning.current=null;
    }
  },[selected?.key,identity]);
  const comparison = selected ? abilityComparison(selected.p,currentPlayer(selected.p)) : [];
  const PlayerHeading = embedded ? 'h3' : 'h2';
  return <Frame {...{farmState,teams,myId,year,saveId,embedded,onClose}} screenClass={`growth-report ${embedded ? 'growth-embedded' : ''}`} title="選手成長レポート">{profile => <>
    <p className="growth-scope">一軍登録選手の記録</p>
    <MetricBand className="growth-metrics" items={growthGroups.map(([key,label]) => ({label,value:counts[key],unit:'人'}))}/>
    {!complete && <p role="status">{summary ? '一部の成長区分は未記録です。記録のある選手を表示します。' : '成長結果が未記録です。'}</p>}
    <div className={`growth-layout ${selected ? 'growth-selected' : ''}`}>
      <section className="growth-list" ref={listRef} aria-label="成長一覧">
        <div className="growth-filters" aria-label="成長記録の絞り込み">{[['all','記録','記録の全員',count(['breakout','growth','decline'])],['up','上昇','上昇の記録',count(['breakout','growth'])],['down','下降','下降の記録',counts.decline]].map(([value,label,aria,n]) => <Button key={value} variant="secondary" aria-label={aria} aria-pressed={filter === value} onClick={() => {setSelection(null);setFilter({identity,value});}}>{label} {n ?? '—'}</Button>)}</div>
        <DataTableFrame label="成長記録一覧" className="growth-records"><table><thead><tr><th scope="col">選手・主な変化</th><th scope="col" data-number>変化量</th></tr></thead><tbody>
          {visible.map(record => {
            const p=record.p, changes=abilityComparison(p,currentPlayer(p));
            const main=changes.filter(row=>row.diff != null && row.diff !== 0).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).slice(0,2);
            const content=<><span className="growth-name">{p?.name || '選手情報未記録'}</span>{p && <small>{p.pos || '役割未記録'} · {p.age ?? '未記録'}歳</small>}<StateLabel tone={record.group === 'decline' ? 'warning' : 'success'}>{record.label}</StateLabel><span className="growth-main-changes">{main.length ? main.map(row=>`${row.label} ${delta(row.diff)}`).join(' · ') : changes.some(row=>row.diff != null) ? '比較できる項目の差は0' : '比較用の記録なし'}</span>{isWarning(record) && <small className="growth-warning">起用見直し候補</small>}</>;
            return <tr key={record.key} className={selected?.key === record.key ? 'selected' : ''}><td>{p?.id != null ? <button className="growth-player" aria-label={`${p.name || '選手情報未記録'}の能力変化を確認`} aria-pressed={selected?.key === record.key} ref={node=>{if(node)rows.current.set(record.key,node);else rows.current.delete(record.key);}} onClick={()=>open(record)}>{content}<CaretRight className="growth-chevron" size={18} aria-hidden="true"/></button> : <div className="growth-player">{content}</div>}</td><td data-number><strong>{delta(record.diff)}{Number.isFinite(record.diff) && <small>pt</small>}</strong></td></tr>;
          })}
          {!visible.length && <tr><td colSpan={2}>{complete && !records.length ? '記録された大きな変化はありません。' : summary && !filterComplete ? 'この区分の記録は未記録です。' : summary ? 'この条件の成長記録はありません。記録の全員から確認できます。' : '成長結果が未記録です。'}</td></tr>}
        </tbody></table></DataTableFrame>
      </section>
      {selected && <section className="growth-detail" ref={detailRef} aria-label="選んだ選手の能力内訳">
        <Button variant="secondary" className="growth-back" onClick={back}>成長一覧に戻る</Button>
        <PlayerHeading ref={detailHeading} tabIndex={-1}>{selected.p.name}の能力変化</PlayerHeading>
        <p>{selected.p.pos || '役割未記録'} · {selected.p.age ?? '未記録'}歳 · 記録の変化量 {delta(selected.diff)}{Number.isFinite(selected.diff) && 'pt'}</p>
        {isWarning(selected) && <p className="growth-warning">起用の見直し候補。放出の推奨ではありません。</p>}
        <p className="growth-note">前は成長前の保存値、現在は球団・市場に保持する能力値です。</p>
        <DataTableFrame label={`${selected.p.name}の能力変化`} className="growth-abilities"><table><thead><tr><th scope="col">能力</th><th scope="col" data-number>前</th><th scope="col" data-number>現在</th><th scope="col" data-number>差</th></tr></thead><tbody>{comparison.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td data-number>{Number.isFinite(row.before) ? row.before : '未記録'}</td><td data-number>{Number.isFinite(row.after) ? row.after : '未記録'}</td><td data-number>{delta(row.diff)}</td></tr>)}{!comparison.length && <tr><td colSpan={4}>能力の内訳は未記録です。</td></tr>}</tbody></table></DataTableFrame>
        <Button variant="secondary" onClick={()=>profile(currentPlayer(selected.p)||selected.p)}>選手詳細・年度別成績</Button>
      </section>}
    </div>
    <p className="growth-note">変化量は記録された能力差の合計です。下降は放出の推奨ではありません。</p>
    <details className="growth-help"><summary>表示の見方</summary><p>上昇は急成長・成長の記録です。一覧の主な変化は比較できる項目から最大2つ表示し、合計の全内訳ではありません。</p><p>0は実測値、未記録は比較に必要な値がない状態です。記録されていない小さな変化やファームの成長内訳は補完しません。</p><p>変化量は保存された成長記録を使い、現在の値から再計算しません。更改で士気などが変わっても記録の合計へ加えません。</p><p>起用見直し候補は33歳以上で5pt以上下降した選手です。能力と役割を確認する目安です。</p></details>
    {!embedded && <footer><Button disabled={advance.busy} onClick={()=>advance.run()}>戦力外・自由契約の整理へ</Button>{advance.failure && <p role="alert">{advance.failure}</p>}</footer>}
  </>}</Frame>;
}
