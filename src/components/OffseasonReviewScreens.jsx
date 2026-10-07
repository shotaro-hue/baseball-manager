import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { calcRetireWill } from '../engine/playerCore';
import { waiverEligible } from '../engine/offseasonReview';
import { marketMetrics } from './hub/faMarket';
import { fmtSal } from '../utils';
import { useResultDialog } from './useResultDialog';
import '../calm-offseason.css';

const PlayerModal = lazy(() => import('./PlayerModal').then(m => ({ default: m.PlayerModal })));
const money = n => Number.isFinite(n) ? fmtSal(n) : '未記録';
const sum = values => values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : undefined;
const retirementLabels = { accepted: '引退を受け入れ', retained: '引き留め成功', retain_failed: '引き留め不成立・引退' };
function Frame({ title, year, teams = [], myId, saveId, children }) {
  const [profile, setProfile] = useState(null);
  const myTeam = teams.find(t => t.id === myId);
  return <main className="offseason-review"><div className="review-content"><header><p>オフシーズン · {year}年</p><h1>{title}</h1></header>{children(setProfile)}
    {profile && <Suspense fallback={<p role="status">選手詳細を読み込み中です。</p>}><PlayerModal key={profile.id} player={profile} teamName={myTeam?.name || '選手記録'} isMyTeam={[...(myTeam?.players || []), ...(myTeam?.farm || [])].some(p => p.id === profile.id)} saveId={saveId} teams={teams} year={year} onClose={() => setProfile(null)} /></Suspense>}
  </div></main>;
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
export function RetirePhaseScreen({ teams, myId, year, saveId, error, onNext }) {
  const team = teams?.find(t => t.id === myId);
  const candidates = (team?.players || []).filter(p => p.age >= 35 && !p.isRetired);
  const [decisions, setDecisions] = useState(() => Object.fromEntries(candidates.filter(p => p._retireNow).map(p => [p.id, 'accepted'])));
  const decisionRef = useRef(decisions); const [review, setReview] = useState(false);
  const close = useCallback(() => setReview(false), []); const advance = useAdvance(onNext);
  const write = (p, value) => { const next = { ...decisionRef.current, [p.id]: value }; decisionRef.current = next; setDecisions(next); };
  const retain = p => { if (decisionRef.current[p.id]) return; write(p, Math.random() * 100 > (p.retireStyle ?? 50) ? 'retained' : 'retain_failed'); };
  const pending = candidates.filter(p => calcRetireWill(p) >= 30 && !decisions[p.id]);
  const retiring = candidates.filter(p => ['accepted', 'retain_failed'].includes(decisions[p.id]));
  return <Frame {...{ teams, myId, year, saveId }} title="引退整理">{profile => <>
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
export function WaiverPhaseScreen({ teams, myId, year, saveId, onNext }) {
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
  return <Frame {...{ teams, myId, year, saveId }} title="戦力外・自由契約の整理">{profile => <>
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
export function WaiverResultScreen({ results, year, teams, myId, saveId, onNext }) {
  const claimed = results?.claimed || []; const unclaimed = results?.unclaimed || []; const advance = useAdvance(onNext);
  const recorded = Array.isArray(results?.claimed) && Array.isArray(results?.unclaimed);
  return <Frame {...{ teams, myId, year, saveId }} title="自由契約の結果">{profile => <>
    {!recorded ? <p>自由契約の結果は未記録です。</p> : <><p>今回放出した選手の動向です。</p><div className="review-metrics"><span>他球団へ入団 {claimed.length}人</span><span>市場に残る {unclaimed.length}人</span></div>
      {!claimed.length && !unclaimed.length && <p>今回は放出対象の選手はいませんでした。</p>}
      <h2>他球団へ入団</h2>{claimed.map(({ player, teamName, teamEmoji }) => <article className="review-card" key={player.id}><PlayerInfo player={player} onProfile={profile} /><p>{teamEmoji} {teamName || '入団先未記録'}へ入団</p></article>)}
      <h2>自由契約市場に残る選手</h2>{unclaimed.map(p => <article className="review-card" key={p.id}><PlayerInfo player={p} onProfile={profile} /><p>自由契約として市場に残っています。</p></article>)}</>}
    <footer><button className="review-primary" disabled={advance.busy} onClick={() => advance.run()}>ドラフトへ進む</button>{advance.failure && <p role="alert">{advance.failure}</p>}</footer>
  </>}</Frame>;
}
const abilityNames = { velocity: '球速', control: '制球', stamina: 'スタミナ', breaking: '変化球', variety: '球種', sharpness: 'キレ', tempo: 'テンポ', clutchP: 'ピンチ', recovery: '回復', durability: '耐久', contact: 'ミート', power: '長打', eye: '選球眼', speed: '走力', arm: '肩', defense: '守備', catching: '捕球', stealSkill: '盗塁', baseRunning: '走塁', clutch: 'クラッチ', vsLeft: '対左', breakingBall: '変化球対応' };
const delta = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '未記録';
export function GrowthSummaryScreen({ summary, year, teams, myId, saveId, onNext }) {
  const advance = useAdvance(onNext); const team = teams?.find(t => t.id === myId);
  const groups = [['breakout', '急成長'], ['growth', '成長'], ['decline', '下降']];
  const warnings = (summary?.decline || []).filter(item => item.p?.age >= 33 && Number.isFinite(item.diff) && Math.abs(item.diff) >= 5);
  return <Frame {...{ teams, myId, year, saveId }} title="選手成長レポート">{profile => <>
    <p>今季終了後の登録選手の成長記録です。変化量は記録対象の能力値の合計差です。</p><div className="review-metrics">{groups.map(([key, label]) => <span key={key}>{label} {Array.isArray(summary?.[key]) ? `${summary[key].length}人` : '未記録'}</span>)}</div>
    {!summary ? <p>成長結果が未記録です。</p> : groups.every(([key]) => Array.isArray(summary[key]) && summary[key].length === 0) && <p>記録された大きな変化はありません。</p>}
    {warnings.length > 0 && <aside className="review-warning"><h2>起用の見直し候補</h2><p>33歳以上で5pt以上下降した選手です。放出の推奨ではありません。</p><ul>{warnings.map((item, i) => <li key={i}>{item.p.name} · {delta(item.diff)}pt</li>)}</ul></aside>}
    {groups.map(([key, label]) => <details className="review-card" key={key}><summary>{label}の選手と能力の内訳（{Array.isArray(summary?.[key]) ? `${summary[key].length}人` : '未記録'}）</summary>{(summary?.[key] || []).map((item, i) => {
      const p = item.p; if (!p) return <p key={i}>選手情報未記録 · {delta(item.diff)}pt</p>;
      const current = [...(team?.players || []), ...(team?.farm || [])].find(entry => entry.id === p.id);
      const before = (p.isPitcher ? p.pitching : p.batting) || {}; const after = (p.isPitcher ? current?.pitching : current?.batting) || {};
      const keys = Object.keys(abilityNames).filter(k => k in before || k in after);
      return <article className="review-card" key={i}><h3>{p.name} · {delta(item.diff)}pt</h3><p>{Number.isFinite(p.age) ? `${p.age}歳` : '年齢未記録'} · {p.pos}</p>
        <button onClick={() => profile(current || p)}>選手詳細・年度別成績</button><p className="review-note">前は成長前の保存値、現在は球団に保持する能力値です。更改でモラル等が変わっても、この成長合計には加えません。</p>
        {keys.length ? <div className="review-table" role="region" aria-label={`${p.name}の能力変化`} tabIndex={0}><table><thead><tr><th>能力</th><th>前</th><th>現在</th><th>差</th></tr></thead><tbody>{keys.map(k => <tr key={k}><th>{abilityNames[k]}</th><td>{Number.isFinite(before[k]) ? before[k] : '未記録'}</td><td>{Number.isFinite(after[k]) ? after[k] : '未記録'}</td><td>{Number.isFinite(before[k]) && Number.isFinite(after[k]) ? delta(after[k] - before[k]) : '未記録'}</td></tr>)}</tbody></table></div> : <p>能力の内訳は未記録です。</p>}
      </article>;
    })}</details>)}
    <p className="review-note">このレポートに記録されていない小さな変化やファームの成長内訳は補完していません。</p>
    <footer><button className="review-primary" disabled={advance.busy} onClick={() => advance.run()}>戦力外・自由契約の整理へ</button>{advance.failure && <p role="alert">{advance.failure}</p>}</footer>
  </>}</Frame>;
}
