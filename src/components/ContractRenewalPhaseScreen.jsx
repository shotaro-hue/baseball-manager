import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CPU_RENEWAL_ROUNDS, NEGOTIATION_MORALE_ACCEPT_BONUS, NEGOTIATION_MORALE_CUT_PENALTY, NEGOTIATION_MORALE_ROUND_HIT, NEGOTIATION_TRUST_HAPPY, NEGOTIATION_TRUST_HOLDOUT } from '../constants';
import { evaluateRenewalOffer, getFaThreshold } from '../engine/contract';
import { fmtSal, fmtIP, clamp } from '../utils';
import { useResultDialog } from './useResultDialog';
import '../calm-renewal.css';

const CareerTable = lazy(() => import('./tabs/CareerTable').then(module => ({ default: module.CareerTable })));

const finished = status => ['signed', 'released', 'fa'].includes(status);
const labels = { pending: '未合意', signed: '合意', cooldown: '再交渉待ち', fa: 'FA宣言', released: '戦力外' };
const money = value => Number.isFinite(value) ? fmtSal(value) : '未記録';
const stat = value => Number.isFinite(value) ? value : '未記録';
const total = values => values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
function performance(player) {
  const s = player.stats || {};
  if (player.isPitcher) return [['投球回', Number.isFinite(s.IP) ? fmtIP(s.IP) : '未記録'], ['防御率', Number.isFinite(s.IP) && s.IP > 0 && Number.isFinite(s.ER) ? (s.ER / s.IP * 9).toFixed(2) : '—'], ['勝利', stat(s.W)], ['セーブ', stat(s.SV)], ['ホールド', stat(s.HLD)], ['奪三振', stat(s.Kp)]];
  const measured = keys => keys.every(key => Number.isFinite(s[key]));
  const obpDenominator = s.AB + s.BB + s.HBP + s.SF;
  const ops = measured(['AB', 'H', 'BB', 'HBP', 'SF', 'D', 'T', 'HR']) && s.AB > 0 && obpDenominator > 0 ? ((s.H + s.BB + s.HBP) / obpDenominator + (s.H + s.D + 2 * s.T + 3 * s.HR) / s.AB).toFixed(3) : '—';
  return [['打席', stat(s.PA)], ['打率', measured(['AB', 'H']) && s.AB > 0 ? (s.H / s.AB).toFixed(3) : '—'], ['本塁打', stat(s.HR)], ['打点', stat(s.RBI)], ['OPS', ops]];
}
const abilityNames = { velocity: '球速', control: '制球', stamina: 'スタミナ', breaking: '変化球', variety: '球種', sharpness: 'キレ', tempo: 'テンポ', clutchP: 'ピンチ', recovery: '回復', durability: '耐久', contact: 'ミート', power: '長打', eye: '選球眼', speed: '走力', arm: '肩', defense: '守備', catching: '捕球', stealSkill: '盗塁', baseRunning: '走塁', clutch: 'クラッチ', vsLeft: '対左', breakingBall: '変化球対応' };

function createSession(team, demands) {
  if (!team) return null;
  return {
    baseline: total([...team.players, ...(team.farm || [])].map(p => p.salary)),
    others: [...team.players.filter(p => !((p.contractYearsLeft ?? 99) <= 1 && !p.isRetired && !p._retireNow)), ...(team.farm || [])].map(p => p.salary),
    entries: team.players.filter(p => (p.contractYearsLeft ?? 99) <= 1 && !p.isRetired && !p._retireNow).map(player => ({
      player: { ...player }, demand: demands?.[player.id] || {}, status: 'pending', salary: String(demands?.[player.id]?.demandSalary ?? player.salary ?? ''), years: 1, round: 0, retries: 0, logs: [],
    })),
  };
}

function Confirmation({ title, children, onClose, onConfirm, confirmLabel }) {
  const ref = useResultDialog(onClose, true);
  return <div className="renewal-overlay"><section className="renewal-dialog" role="dialog" aria-modal="true" aria-labelledby="renewal-dialog-title" ref={ref}>
    <h2 id="renewal-dialog-title" tabIndex={0}>{title}</h2>{children}
    <div className="renewal-actions"><button onClick={onClose}>戻る</button><button className="renewal-primary" onClick={onConfirm}>{confirmLabel}</button></div>
  </section></div>;
}

export function ContractRenewalPhaseScreen({ teams, myId, year, demands, onSign, onRelease, onNext }) {
  const myTeam = teams?.find(t => t.id === myId);
  const [session, setSession] = useState(() => createSession(myTeam, demands));
  const sessionRef = useRef(session);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [careerOpen, setCareerOpen] = useState(false);
  const busy = useRef(false);
  const advanced = useRef(false);
  const heading = useRef(null);
  const rows = useRef(new Map());
  const scroll = useRef({ window: 0, list: 0 });
  const list = useRef(null);
  const returning = useRef(null);
  const selectedStatus = session?.entries.find(e => e.player.id === selectedId)?.status;
  useEffect(() => {
    if (!sessionRef.current && myTeam) {
      const next = createSession(myTeam, demands); sessionRef.current = next; setSession(next);
    }
  }, [myTeam, demands]);
  useEffect(() => { busy.current = false; }, [session]);
  useEffect(() => {
    if (selectedId != null) heading.current?.focus({ preventScroll: true });
    else if (returning.current != null) {
      if (typeof window !== 'undefined') window.scrollTo?.(0, scroll.current.window);
      if (list.current) list.current.scrollTop = scroll.current.list;
      rows.current.get(returning.current)?.focus({ preventScroll: true }); returning.current = null;
    }
  }, [selectedId, selectedStatus]);
  const closeModal = useCallback(() => setModal(null), []);
  const update = (id, changes) => {
    const current = sessionRef.current;
    const next = { ...current, entries: current.entries.map(e => e.player.id === id ? { ...e, ...changes } : e) };
    sessionRef.current = next; setSession(next);
  };
  const select = id => {
    scroll.current = { window: typeof window === 'undefined' ? 0 : window.scrollY, list: list.current?.scrollTop ?? 0 };
    setSelectedId(id);
    setCareerOpen(false);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches) window.scrollTo?.(0, 0);
  };
  const back = () => {
    const entry = sessionRef.current.entries.find(e => e.player.id === selectedId);
    if ((filter === 'pending' && finished(entry?.status)) || (filter === 'done' && !finished(entry?.status))) setFilter('all');
    returning.current = selectedId; setSelectedId(null);
  };
  const offer = () => {
    const entry = sessionRef.current.entries.find(e => e.player.id === selectedId);
    if (!entry || entry.status !== 'pending' || busy.current || advanced.current) return;
    busy.current = true;
    const p = myTeam?.players.find(p => p.id === selectedId) || entry.player;
    const salary = entry.salary.trim() === '' ? NaN : Math.round(Number(entry.salary));
    const years = Number(entry.years);
    const demand = { demandSalary: p.salary, minAcceptSalary: Math.round(p.salary * .6), resistanceFactor: .5, ...entry.demand };
    const round = entry.round + 1;
    const result = evaluateRenewalOffer(p, { salary, years }, myTeam, teams, demand, round);
    if (!result.valid) { update(p.id, { logs: [...entry.logs, result.reason] }); return; }
    const logs = [...entry.logs, `球団：${money(salary)}・${years}年を提示（第${round}回）`];
    if (result.accepted) {
      const morale = salary >= demand.demandSalary ? NEGOTIATION_MORALE_ACCEPT_BONUS : salary < p.salary * .9 ? NEGOTIATION_MORALE_CUT_PENALTY : 0;
      update(p.id, { status: 'signed', round, terms: { salary, years }, logs: [...logs, '選手：その条件で合意します。'] });
      onSign(p.id, salary, years, clamp(morale + NEGOTIATION_MORALE_ROUND_HIT * (round - 1), -30, 10), round === 1 ? NEGOTIATION_TRUST_HAPPY : NEGOTIATION_TRUST_HOLDOUT);
    } else if (round >= CPU_RENEWAL_ROUNDS) {
      const isFA = (p.daysOnActiveRoster ?? (p.serviceYears ?? 0) * 120) >= getFaThreshold(p).domestic;
      update(p.id, { status: isFA ? 'fa' : 'cooldown', round, logs: [...logs, isFA ? '選手：FA権を行使します。' : '選手：今回は合意できません。一度持ち帰り、再交渉します。'] });
    } else {
      const counter = Math.max(demand.minAcceptSalary, salary + 100, Math.round(demand.demandSalary * (round === 1 ? .95 : 1) / 100) * 100);
      update(p.id, { round, salary: String(counter), logs: [...logs, `選手：${money(counter)}を希望します。`] });
    }
  };
  const release = () => {
    const e = sessionRef.current.entries.find(e => e.player.id === modal?.id);
    if (!e || finished(e.status) || busy.current || advanced.current) return;
    busy.current = true;
    update(e.player.id, { status: 'released', logs: [...e.logs, '球団：戦力外を通告しました。'] });
    setModal(null); onRelease(e.player.id);
  };
  const next = () => {
    if (advanced.current || sessionRef.current.entries.some(e => !finished(e.status))) return;
    advanced.current = true; setModal(null);
    onNext(sessionRef.current.entries.filter(e => e.status === 'fa').map(e => e.player.id));
  };
  if (!session) return <div className="renewal-screen">球団情報を読み込み中です。</div>;
  const entries = session.entries;
  const selected = entries.find(e => e.player.id === selectedId);
  const unresolved = entries.filter(e => !finished(e.status));
  const agreed = entries.filter(e => e.status === 'signed');
  const projected = total([...session.others, ...entries.filter(e => e.status !== 'released' && e.status !== 'fa').map(e => e.terms?.salary ?? e.player.salary)]);
  const difference = projected != null && session.baseline != null ? projected - session.baseline : null;
  const visible = entries.filter(e => filter === 'all' || (filter === 'pending' ? !finished(e.status) : finished(e.status)));
  const releaseEntry = modal?.type === 'release' ? entries.find(e => e.player.id === modal.id) : null;
  return <main className={`renewal-screen ${selected ? 'renewal-has-selection' : ''}`}>
    <header><h1>契約更改</h1><p>{year}年オフシーズン · {myTeam?.name}</p>
      <div className="renewal-overview"><span>未合意 <strong>{unresolved.length}</strong> / {entries.length}人</span><span>合意 <strong>{agreed.length}</strong>人</span><span>再交渉待ち <strong>{entries.filter(e => e.status === 'cooldown').length}</strong>人</span></div>
      <p>年俸総額の見込み <strong>{money(projected)}</strong> <span>（更改前比 {difference == null ? '未記録' : `${difference > 0 ? '+' : ''}${money(difference)}`}）</span></p>
      <p className="renewal-note">未合意は前年年俸で仮計上。FA宣言・戦力外の選手は除外します。</p>
    </header>
    <div className="renewal-layout">
      <section className="renewal-list" aria-label="更改対象選手" ref={list}>
        <div className="renewal-filters">{[['all', '全員'], ['pending', '未合意'], ['done', '完了']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {visible.map(e => <button className="renewal-row" key={e.player.id} ref={node => { if (node) rows.current.set(e.player.id, node); else rows.current.delete(e.player.id); }} aria-label={`${e.player.name}の契約更改`} aria-pressed={selectedId === e.player.id} onClick={() => select(e.player.id)}>
          <span><strong>{e.player.name}</strong><small>{e.player.pos} · {e.player.age}歳</small></span><span className={`renewal-status renewal-${e.status}`}>{labels[e.status]}</span>
          <span className="renewal-row-money">前年 {money(e.player.salary)} → {e.terms ? `合意 ${money(e.terms.salary)}・${e.terms.years}年` : `要求 ${money(e.demand.demandSalary)}`}</span>
        </button>)}
        {!visible.length && <p>{entries.length ? 'この条件に該当する選手はいません。' : '契約更改が必要な選手はいません。'}</p>}
      </section>
      <section className="renewal-detail" aria-label="選手との交渉">
        {!selected ? <p>選手を選んで、成績と要求年俸を確認してください。</p> : <>
          <button className="renewal-back" onClick={back}>← 選手一覧に戻る</button>
          <h2 ref={heading} tabIndex={-1}>{selected.player.name}</h2><p>{selected.player.pos} · {selected.player.age}歳 · <strong>{labels[selected.status]}</strong></p>
          <div className="renewal-card"><h3>今季の成績</h3><div className="renewal-stats">{performance(selected.player).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div><p className="renewal-note">率の「—」は分母がない、または必要な記録がない状態です。</p></div>
          <div className="renewal-card"><h3>契約条件</h3><div className="renewal-stats"><span>前年 <strong>{money(selected.player.salary)}</strong></span><span>要求 <strong>{money(selected.demand.demandSalary)}</strong></span><span>提示下限 <strong>{money(selected.demand.minOfferSalary)}</strong></span></div>
            <details><summary>要求年俸の理由</summary><ul>{(selected.demand.assessment?.reasons || []).map((r, i) => <li key={i}>{r.label}{r.bonus != null ? `（${r.bonus >= 0 ? '+' : ''}${Math.round(r.bonus * 100)}%）` : ''}</li>)}</ul>{!selected.demand.assessment?.reasons?.length && <p>査定の詳細は未記録です。</p>}{selected.demand.assessment?.roleSource && <p>投手の分類：{selected.demand.assessment.roleSource}</p>}<p>合意判定の下限：{money(selected.demand.minAcceptSalary)}。下限以上でも、条件によって不合意になる場合があります。</p><p>タイトル加点は最大25%、チーム加点は最大5%。実際の合意額は契約条件によって変わります。</p></details>
            {selected.terms && <p className="renewal-status renewal-signed">合意条件：{money(selected.terms.salary)}・{selected.terms.years}年</p>}
            {selected.status === 'pending' && <><div className="renewal-fields"><label>提示年俸（万円）<input type="number" inputMode="numeric" min={selected.demand.minOfferSalary ?? 0} step="1" value={selected.salary} onChange={event => update(selectedId, { salary: event.target.value })} /></label><label>契約年数<select value={selected.years} onChange={event => update(selectedId, { years: Number(event.target.value) })}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}年</option>)}</select></label></div>
              <p>前年との差額：{Number.isFinite(Number(selected.salary)) && selected.salary.trim() !== '' && Number.isFinite(selected.player.salary) ? money(Number(selected.salary) - selected.player.salary) : '未記録'} · 今回の交渉 {selected.round}/{CPU_RENEWAL_ROUNDS}回</p>
              <button className="renewal-primary" onClick={offer}>オファーを出す</button><p className="renewal-note">不合意が{CPU_RENEWAL_ROUNDS}回続くと、FA権のある選手は宣言し、その他の選手は再交渉待ちになります。</p></>}
            {selected.status === 'cooldown' && <button className="renewal-primary" onClick={() => update(selectedId, { status: 'pending', round: 0, retries: selected.retries + 1, salary: String(Math.max(selected.demand.minAcceptSalary ?? selected.player.salary * .6, Math.round((selected.demand.demandSalary ?? selected.player.salary) * .95))), logs: [...selected.logs, '再交渉を開始しました。'] })}>再交渉する</button>}
          </div>
          <div className="renewal-card"><h3>最新の返答</h3><p role="status">{selected.logs.at(-1) ?? 'まだ提示していません。'}</p><details><summary>交渉履歴（再交渉 {selected.retries}回）</summary><ol>{selected.logs.map((log, i) => <li key={i}>{log}</li>)}</ol>{!selected.logs.length && <p>交渉履歴はありません。</p>}</details></div>
          <details className="renewal-card calm-detail" key={selectedId} onToggle={event => setCareerOpen(event.currentTarget.open)}><summary>選手の詳細・年度別成績</summary><div className="renewal-stats">{Object.entries(selected.player.isPitcher ? selected.player.pitching || {} : selected.player.batting || {}).map(([key, value]) => <span key={key}>{abilityNames[key] || key} {stat(value)}</span>)}<span>士気 {stat(selected.player.morale)}</span><span>信頼 {stat(selected.player.trust)}</span></div>{careerOpen && <Suspense fallback={<p>年度別成績を読み込み中です。</p>}><CareerTable player={selected.player} year={year} teamId={myId} teamName={myTeam?.name} /></Suspense>}</details>
          {!finished(selected.status) && <button className="renewal-danger" onClick={() => setModal({ type: 'release', id: selectedId })}>戦力外を検討する</button>}
        </>}
      </section>
    </div>
    <footer className="renewal-footer">{unresolved.length > 0 && <p>未合意の{unresolved.length}人を合意・FA宣言・戦力外のいずれかにする必要があります。<button onClick={() => { setFilter('pending'); select(unresolved[0].player.id); }}>未合意の選手を確認</button></p>}<button className="renewal-primary" disabled={unresolved.length > 0} onClick={() => setModal({ type: 'review' })}>更改結果を確認する</button></footer>
    {releaseEntry && <Confirmation title={`${releaseEntry.player.name}を戦力外にしますか？`} onClose={closeModal} onConfirm={release} confirmLabel="戦力外を確定する"><p>契約を更新せず、球団から外します。この更改画面では取り消せません。</p><p>前年年俸：{money(releaseEntry.player.salary)} · 要求：{money(releaseEntry.demand.demandSalary)}</p></Confirmation>}
    {modal?.type === 'review' && <Confirmation title="契約更改の最終確認" onClose={closeModal} onConfirm={next} confirmLabel="確定して次へ進む"><p>年俸総額の見込み：{money(projected)}（更改前 {money(session.baseline)}）</p><ul>{entries.map(e => <li key={e.player.id}>{e.player.name}：{labels[e.status]}{e.terms ? ` · ${money(e.terms.salary)}・${e.terms.years}年` : ''}</li>)}</ul><p>確定後、CPU球団の更改と次のオフシーズン処理へ進みます。</p></Confirmation>}
  </main>;
}
