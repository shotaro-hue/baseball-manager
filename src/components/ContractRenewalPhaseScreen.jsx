import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { CPU_RENEWAL_ROUNDS, NEGOTIATION_MORALE_ACCEPT_BONUS, NEGOTIATION_MORALE_CUT_PENALTY, NEGOTIATION_MORALE_ROUND_HIT, NEGOTIATION_TRUST_HAPPY, NEGOTIATION_TRUST_HOLDOUT } from '../constants';
import { evaluateRenewalOffer, getFaThreshold, getFaProgress, calcPlayerDemand } from '../engine/contract';
import { salaryCutRule, renewalEligible, ikuseiContractYears, validContractOffer } from '../engine/renewalRules';
import { compactRenewalSession, reconcileRenewalSession } from '../engine/offseasonPlanning';
import { fmtSal, fmtIP, clamp } from '../utils';
import { useResultDialog } from './useResultDialog';
import { Button, StateLabel } from './design-system/primitives';
import '../calm-renewal.css';

const CareerTable = lazy(() => import('./tabs/CareerTable').then(module => ({ default: module.CareerTable })));

const finished = status => ['signed', 'released', 'free', 'fa'].includes(status);
const labels = { pending: '未合意', signed: '合意', cooldown: '再交渉待ち', free_requested: '減額制限の対応待ち', free: '自由契約', fa: 'FA宣言', released: '戦力外' };
const money = value => Number.isFinite(value) ? fmtSal(value) : '未記録';
const stat = value => Number.isFinite(value) ? value : '未記録';
const total = values => values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
const draftAmount = e => String(e.salary ?? '').trim() === '' ? NaN : Math.round(Number(e.salary));
const matchesFilter = (entry, filter) => filter === 'all' || (filter === 'pending' ? !finished(entry.status) : finished(entry.status));
const stateTone = status => status === 'signed' ? 'success' : ['cooldown', 'free_requested'].includes(status) ? 'warning' : 'neutral';
function faLabel(player, overseas = false) {
  if (player.育成) return '育成契約中・FA対象外';
  const progress = getFaProgress(player);
  if (!progress.recorded) return '登録日数未記録';
  const p = overseas ? progress.overseas : progress.domestic;
  return `${p.eligible ? '取得済み' : `最短あと${p.years}年（${p.remainingDays}日）`}${progress.estimated ? '・推定' : ''}`;
}
function performance(player) {
  const s = player.stats || {};
  if (player.isPitcher) return [['投球回', Number.isFinite(s.IP) ? fmtIP(s.IP) : '未記録'], ['防御率', Number.isFinite(s.IP) && s.IP > 0 && Number.isFinite(s.ER) ? (s.ER / s.IP * 9).toFixed(2) : '—'], ['勝利', stat(s.W)], ['セーブ', stat(s.SV)], ['ホールド', stat(s.HLD)], ['奪三振', stat(s.Kp)]];
  const measured = keys => keys.every(key => Number.isFinite(s[key]));
  const obpDenominator = s.AB + s.BB + s.HBP + s.SF;
  const ops = measured(['AB', 'H', 'BB', 'HBP', 'SF', 'D', 'T', 'HR']) && s.AB > 0 && obpDenominator > 0 ? ((s.H + s.BB + s.HBP) / obpDenominator + (s.H + s.D + 2 * s.T + 3 * s.HR) / s.AB).toFixed(3) : '—';
  return [['打席', stat(s.PA)], ['打率', measured(['AB', 'H']) && s.AB > 0 ? (s.H / s.AB).toFixed(3) : '—'], ['本塁打', stat(s.HR)], ['打点', stat(s.RBI)], ['OPS', ops]];
}
const abilityNames = { velocity: '球速', control: '制球', stamina: 'スタミナ', breaking: '変化球', variety: '球種', sharpness: 'キレ', tempo: 'テンポ', clutchP: 'ピンチ', recovery: '回復', durability: '耐久', contact: 'ミート', power: '長打', eye: '選球眼', speed: '走力', arm: '肩', defense: '守備', catching: '捕球', stealSkill: '盗塁', baseRunning: '走塁', clutch: 'クラッチ', vsLeft: '対左', breakingBall: '変化球対応' };

function createSession(team, demands, renewalPlayerIds, year) {
  if (!team) return null;
  const farmIds = new Set((team.farm || []).map(p => p.id));
  const eligible = p => renewalEligible(p, year) && (farmIds.has(p.id) || renewalPlayerIds == null || renewalPlayerIds.some(id => String(id) === String(p.id)));
  return {
    baseline: total([...team.players, ...(team.farm || [])].map(p => p.salary)),
    others: [...team.players, ...(team.farm || [])].filter(p => !eligible(p)).map(p => p.salary),
    entries: [...team.players, ...(team.farm || [])].filter(eligible).map(player => {
      const demand = demands?.[player.id] || calcPlayerDemand(player, { team, year });
      return { player: { ...player }, demand, status: 'pending', salary: String(demand.demandSalary ?? player.salary ?? ''), years: 1, round: 0, retries: 0, logs: [] };
    }),
  };
}

function includeMissingFarmEntries(session, team, demands, ids, year) {
  if (!session || !team) return session;
  const fresh = createSession(team, demands, ids, year);
  const entries = [...session.entries, ...fresh.entries.filter(e => !session.entries.some(old => old.player.id === e.player.id))];
  return { ...session, entries, others: [...team.players, ...(team.farm || [])].filter(p => !entries.some(e => e.player.id === p.id)).map(p => p.salary) };
}

function Confirmation({ title, children, onClose, onConfirm, confirmLabel, fallbackFocus }) {
  const ref = useResultDialog(onClose, true);
  useEffect(() => () => {
    if (typeof document !== 'undefined' && document.activeElement === document.body) fallbackFocus?.current?.focus({ preventScroll: true });
  }, []);
  return <div className="renewal-overlay"><section data-ds="renewal-dialog" className="renewal-dialog" role="dialog" aria-modal="true" aria-labelledby="renewal-dialog-title" ref={ref}>
    <h2 id="renewal-dialog-title" tabIndex={0}>{title}</h2>{children}
    <div className="renewal-actions"><Button variant="secondary" onClick={onClose}>戻る</Button><Button onClick={onConfirm}>{confirmLabel}</Button></div>
  </section></div>;
}

export function ContractRenewalPhaseScreen({ teams, myId, year, saveId, demands, renewalPlayerIds, onSign, onRelease, onNext,
  embedded = false, savedSession, onSessionChange, savedView, onViewChange, onDeclare }) {
  const myTeam = teams?.find(t => t.id === myId);
  const [session, setSession] = useState(() => includeMissingFarmEntries(savedSession || createSession(myTeam, demands, renewalPlayerIds, year), myTeam, demands, renewalPlayerIds, year));
  const sessionRef = useRef(session);
  const [selectedId, setSelectedId] = useState(savedView?.selectedId ?? null);
  const [filter, setFilter] = useState(savedView?.filter ?? 'all');
  const [modal, setModal] = useState(null);
  const [careerOpen, setCareerOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchIds, setBatchIds] = useState([]);
  const [batchBase, setBatchBase] = useState('demand');
  const [batchPercent, setBatchPercent] = useState('100');
  const [batchYears, setBatchYears] = useState(1);
  const [inputError, setInputError] = useState('');
  const cutId = useId();
  const busy = useRef(false);
  const consumed = useRef(new WeakSet());
  const advanced = useRef(false);
  const heading = useRef(null);
  const rows = useRef(new Map());
  const scroll = useRef({ window: 0, list: 0 });
  const list = useRef(null);
  const detail = useRef(null);
  const filters = useRef(null);
  const returning = useRef(null);
  const selectedStatus = session?.entries.find(e => e.player.id === selectedId)?.status;
  useEffect(() => { if (session) onSessionChange?.(compactRenewalSession(session)); }, [session, onSessionChange]);
  useEffect(() => { onViewChange?.({ selectedId, filter }); }, [selectedId, filter, onViewChange]);
  useEffect(() => {
    if (!myTeam || !sessionRef.current) return;
    const current = sessionRef.current;
    const next = includeMissingFarmEntries(reconcileRenewalSession(current, myTeam, year, savedSession), myTeam, demands, renewalPlayerIds, year);
    if (JSON.stringify(next) !== JSON.stringify(current)) { sessionRef.current = next; setSession(next); }
  }, [embedded, myTeam, year, savedSession]);
  useEffect(() => {
    if (!sessionRef.current && myTeam) {
      const next = createSession(myTeam, demands, renewalPlayerIds, year); sessionRef.current = next; setSession(next);
    }
  }, [myTeam, demands, renewalPlayerIds, year]);
  useEffect(() => { busy.current = false; }, [session]);
  useEffect(() => {
    if (modal) return;
    if (selectedId != null) { detail.current?.scrollIntoView?.({ block: 'start' }); heading.current?.focus({ preventScroll: true }); }
    else if (returning.current != null) {
      if (typeof window !== 'undefined') window.scrollTo?.(0, scroll.current.window);
      if (list.current) list.current.scrollTop = scroll.current.list;
      const target = rows.current.get(returning.current.id) || [...rows.current.values()][returning.current.index] || [...rows.current.values()].at(-1) || filters.current?.querySelector('[aria-pressed="true"]');
      if (target && typeof window !== 'undefined' && Number.isFinite(scroll.current.rowTop)) window.scrollBy?.(0, target.getBoundingClientRect().top - scroll.current.rowTop);
      target?.focus({ preventScroll: true }); returning.current = null;
    }
  }, [selectedId, selectedStatus]);
  useEffect(() => {
    if (session && selectedId != null && !session.entries.some(e => e.player.id === selectedId)) setSelectedId(null);
  }, [session, selectedId]);
  const closeModal = useCallback(() => setModal(null), []);
  const update = (id, changes) => {
    const current = sessionRef.current;
    const next = { ...current, entries: current.entries.map(e => e.player.id === id ? { ...e, ...changes } : e) };
    sessionRef.current = next; setSession(next);
  };
  const select = id => {
    scroll.current = { window: typeof window === 'undefined' ? 0 : window.scrollY, list: list.current?.scrollTop ?? 0, rowTop: rows.current.get(id)?.getBoundingClientRect().top, index: [...rows.current.keys()].indexOf(id) };
    setSelectedId(id);
    setCareerOpen(false);
    setInputError('');
  };
  const back = () => {
    returning.current = { id: selectedId, index: Math.max(0, scroll.current.index ?? 0) }; setSelectedId(null);
  };
  // Both individual and batch offers execute exactly this one-round path.
  const offerOne = entry => {
    if (!entry || entry.status !== 'pending' || advanced.current) return;
    const owned = [...(myTeam?.players || []), ...(myTeam?.farm || [])];
    const p = owned.find(p => p.id === entry.player.id) || entry.player;
    if (embedded && (!owned.some(p => p.id === entry.player.id) || p.contractSignedYear === year)) return;
    const salary = draftAmount(entry);
    const years = Number(entry.years);
    const demand = { demandSalary: p.salary, minAcceptSalary: Math.round(p.salary * .6), resistanceFactor: .5, ...entry.demand };
    const round = entry.round + 1;
    const result = evaluateRenewalOffer(p, { salary, years }, myTeam, teams, demand, round);
    if (!result.valid) { update(p.id, { logs: [...entry.logs, result.reason] }); return; }
    const logs = [...entry.logs, `球団：${money(salary)}・${years}年を提示（第${round}回）`];
    if (result.accepted) {
      const morale = salary >= demand.demandSalary ? NEGOTIATION_MORALE_ACCEPT_BONUS : salary < p.salary * .9 ? NEGOTIATION_MORALE_CUT_PENALTY : 0;
      update(p.id, { status: 'signed', round, terms: { salary, years }, logs: [...logs, `選手：${result.reason}します。`] });
      onSign(p.id, salary, years, clamp(morale + NEGOTIATION_MORALE_ROUND_HIT * (round - 1), -30, 10), round === 1 ? NEGOTIATION_TRUST_HAPPY : NEGOTIATION_TRUST_HOLDOUT);
    } else if (result.freeAgencyRequested) {
      update(p.id, { status: 'free_requested', round, logs: [...logs, `選手：${result.reason}`] });
    } else if (round >= CPU_RENEWAL_ROUNDS) {
      const isFA = !p.育成 && (p.daysOnActiveRoster ?? (p.serviceYears ?? 0) * 120) >= getFaThreshold(p).domestic;
      update(p.id, { status: isFA ? 'fa' : 'cooldown', round, logs: [...logs, isFA ? '選手：FA権を行使します。' : '選手：今回は合意できません。一度持ち帰り、再交渉します。'] });
      if (isFA) onDeclare?.(p.id);
    } else {
      const counter = Math.max(demand.minAcceptSalary, salary + 100, Math.round(demand.demandSalary * (round === 1 ? .95 : 1) / 100) * 100);
      update(p.id, { round, salary: String(counter), logs: [...logs, `選手：${money(counter)}を希望します。`] });
    }
  };
  const offerable = entry => entry?.status === 'pending' && [...(myTeam?.players || []), ...(myTeam?.farm || [])].some(p => p.id === entry.player.id && p.contractSignedYear !== year);
  const confirmOffer = () => {
    if (busy.current || advanced.current || !['offer', 'cut'].includes(modal?.type) || consumed.current.has(modal)) return;
    consumed.current.add(modal);
    const entry = sessionRef.current.entries.find(e => e.player.id === modal.id);
    if (offerable(entry)) { busy.current = true; offerOne({ ...entry, salary: modal.salary, years: modal.years }); }
    setModal(null);
  };
  const prepareOffer = entry => {
    if (entry?.status !== 'pending' || busy.current || advanced.current) return;
    if (!validContractOffer(entry.player, draftAmount(entry), Number(entry.years))) { setInputError('提示年俸は正の数、契約年数は選択可能な年数を指定してください。'); return; }
    setInputError('');
    setModal({ type: salaryCutRule(entry.player, draftAmount(entry)).exceeds ? 'cut' : 'offer', id: entry.player.id, salary: entry.salary, years: entry.years });
  };
  const batchOffer = () => {
    if (busy.current || advanced.current || modal?.type !== 'batch' || consumed.current.has(modal)) return;
    consumed.current.add(modal);
    const drafts = modal.drafts.filter(draft => offerable(sessionRef.current.entries.find(e => e.player.id === draft.player.id)));
    if (drafts.length) busy.current = true;
    for (const draft of drafts) {
      const current = sessionRef.current.entries.find(e => e.player.id === draft.player.id);
      if (current?.status === 'pending') offerOne({ ...current, salary: draft.salary, years: draft.years });
    }
    setModal({ type: 'batch_results', ids: modal.drafts.map(e => e.player.id) });
    setBatchIds([]);
  };
  const release = () => {
    const e = sessionRef.current.entries.find(e => e.player.id === modal?.id);
    if (!e || finished(e.status) || busy.current || advanced.current) return;
    busy.current = true;
    const free = modal.type === 'free';
    if (free && e.status !== 'free_requested') { busy.current = false; return; }
    update(e.player.id, { status: free ? 'free' : 'released', logs: [...e.logs, free ? '球団：減額制限超過への不同意により自由契約としました。' : '球団：戦力外を通告しました。'] });
    setModal(null);
    if (free) onRelease(e.player.id, 'salary_cut'); else onRelease(e.player.id);
  };
  const next = () => {
    if (advanced.current || sessionRef.current.entries.some(e => !finished(e.status))) return;
    advanced.current = true; setModal(null);
    onNext(sessionRef.current.entries.filter(e => e.status === 'fa').map(e => e.player.id));
  };
  if (!session) return <div data-ds="renewal-screen" className="renewal-screen">球団情報を読み込み中です。</div>;
  const entries = session.entries;
  const selected = entries.find(e => e.player.id === selectedId);
  const selectedPlayer = selected && [...(myTeam?.players || []), ...(myTeam?.farm || [])].find(p => p.id === selectedId) || selected?.player;
  const unresolved = entries.filter(e => !finished(e.status));
  const agreed = entries.filter(e => e.status === 'signed');
  const projected = total([...session.others, ...entries.filter(e => !['released', 'free', 'fa'].includes(e.status)).map(e => e.terms?.salary ?? e.player.salary)]);
  const difference = projected != null && session.baseline != null ? projected - session.baseline : null;
  const visible = entries.filter(e => matchesFilter(e, filter));
  const releaseEntry = ['release', 'free'].includes(modal?.type) ? entries.find(e => e.player.id === modal.id) : null;
  const batchEntries = entries.filter(e => batchIds.includes(e.player.id) && e.status === 'pending');
  const cut = selected ? salaryCutRule(selected.player, Number(selected.salary)) : null;
  const offerEntry = ['offer', 'cut'].includes(modal?.type) ? entries.find(e => e.player.id === modal.id) : null;
  const Frame = embedded ? 'section' : 'main';
  const roster = player => player.育成 ? '育成' : myTeam?.farm?.some(p => p.id === player.id) ? '二軍' : '一軍';
  return <Frame data-ds="renewal-screen" className={`renewal-screen ${embedded ? 'renewal-embedded' : ''} ${selected ? 'renewal-has-selection' : ''}`}>
    <header className="renewal-heading">
      {embedded ? <h2>契約更改</h2> : <><h1>契約更改</h1><p>{year}年オフシーズン · {myTeam?.name}</p></>}
      <div className="renewal-overview"><span>未解決 <strong>{unresolved.length}</strong> / {entries.length}人</span><span>合意 <strong>{agreed.length}</strong>人</span></div>
      {!embedded && <p className="renewal-payroll">年俸総額の見込み <strong>{money(projected)}</strong> <span>（更改前比 {difference == null ? '未記録' : `${difference > 0 ? '+' : ''}${money(difference)}`}）</span></p>}
    </header>
    <div className="renewal-layout">
      <section className="renewal-list" aria-label="更改対象選手" ref={list}>
        <div className="renewal-list-heading"><h3>更改対象選手</h3><button aria-expanded={batchMode} onClick={() => { setBatchMode(!batchMode); setBatchIds([]); }}>{batchMode ? 'まとめて提示を閉じる' : 'まとめて提示を開く'}</button></div>
        {batchMode && <div className="renewal-batch"><h3>まとめて提示</h3>
          <p className="renewal-note">①対象を選択 → ②下書きに適用 → ③確認して提示</p>
          <div className="renewal-actions"><button onClick={() => setBatchIds(entries.filter(e => e.status === 'pending').map(e => e.player.id))}>提示可能な全員を選択</button><button onClick={() => setBatchIds([])}>選択を解除</button></div>
          <div className="renewal-fields"><label>金額の基準<select value={batchBase} onChange={e => setBatchBase(e.target.value)}><option value="demand">要求年俸</option><option value="previous">前年年俸</option></select></label><label>基準額に対する割合（%）<input type="number" value={batchPercent} onChange={e => setBatchPercent(e.target.value)} /></label><label>一括下書きの契約年数<select value={batchYears} onChange={e => setBatchYears(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}年</option>)}</select></label></div>
          <button disabled={!batchEntries.length || !Number.isFinite(Number(batchPercent)) || Number(batchPercent) <= 0} onClick={() => {
            for (const e of batchEntries) {
              const base = batchBase === 'demand' ? e.demand?.demandSalary : e.player.salary;
              update(e.player.id, { salary: Number.isFinite(base) ? String(Math.round(base * Number(batchPercent) / 100)) : '', years: e.player.育成 ? Math.min(batchYears, ikuseiContractYears(e.player)) : batchYears });
            }
          }}>選択した選手の下書きに適用</button>
          <p className="renewal-note">{batchEntries.length}人を選択中。下書きへの適用では送信されません。</p>
          {batchEntries.length > 0 && <ul className="renewal-drafts" aria-label="一括提示の下書き">{batchEntries.map(e => <li key={e.player.id}>{e.player.name}：{money(draftAmount(e))}・{e.years}年{salaryCutRule(e.player, draftAmount(e)).exceeds && '（減額制限超過）'}</li>)}</ul>}
          <button className="renewal-primary" disabled={!batchEntries.length} onClick={() => setModal({ type: 'batch', drafts: batchEntries.map(e => ({ ...e })) })}>選択した選手の提示内容を確認</button>
        </div>}
        <div className="renewal-filters" ref={filters} aria-label="契約状況の絞り込み">{[['all', '全員'], ['pending', '未合意'], ['done', '完了']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => {
          setFilter(value);
          if (selected && !matchesFilter(selected, value)) { setSelectedId(null); setInputError(''); }
        }}>{label}</button>)}</div>
        <div className="renewal-row-labels" aria-hidden="true"><span>選手・状態</span><span>前年 / 要求・合意</span></div>
        {visible.map(e => <div className="renewal-list-item" key={e.player.id}>
          {batchMode && <label className="renewal-pick"><input type="checkbox" aria-label={`${e.player.name}をまとめて提示の対象にする`} disabled={e.status !== 'pending'} checked={batchIds.includes(e.player.id) && e.status === 'pending'} onChange={event => setBatchIds(ids => event.target.checked ? [...new Set([...ids, e.player.id])] : ids.filter(id => id !== e.player.id))} /></label>}
          <button className="renewal-row" ref={node => { if (node) rows.current.set(e.player.id, node); else rows.current.delete(e.player.id); }} aria-label={`${e.player.name}の契約更改`} aria-pressed={selectedId === e.player.id} onClick={() => select(e.player.id)}>
            <span className="renewal-row-player"><strong>{e.player.name}</strong><small>{e.player.pos || '未記録'} · {e.player.age ?? '未記録'}歳 · {roster(e.player)}</small><StateLabel tone={stateTone(e.status)} role="none">{labels[e.status]}</StateLabel>{getFaProgress(e.player).domestic?.eligible && !e.player.育成 && <small>国内FA資格あり</small>}</span>
            <span className="renewal-row-money"><small>前年 {money(e.player.salary)}</small><span>{e.terms ? <>合意 <strong>{money(e.terms.salary)}</strong><small>{e.terms.years}年</small></> : <>要求 <strong>{money(e.demand?.demandSalary)}</strong></>}</span></span>
          </button>
        </div>)}
        {!visible.length && <p className="renewal-empty" role="status">{entries.length ? 'この条件に該当する選手はいません。' : '契約更改が必要な選手はいません。'}</p>}
      </section>
      {selected && <section className="renewal-detail" ref={detail} aria-label="選手との交渉">
        <button className="renewal-back" onClick={back}>← 選手一覧に戻る</button>
        <section className="renewal-player-summary" aria-label="選手概要と今季の成績">
          <div className="renewal-player-heading"><div><h2 ref={heading} tabIndex={-1}>{selectedPlayer.name}</h2><p>{selectedPlayer.pos || '未記録'} · {selectedPlayer.age ?? '未記録'}歳 · {roster(selectedPlayer)}</p></div><StateLabel tone={stateTone(selected.status)} role="none">{labels[selected.status]}</StateLabel></div>
          <h3 className="renewal-stat-title">今季の成績 <small>一軍記録</small></h3>
          <div className="renewal-stats">{performance(selectedPlayer).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div>
        </section>
        <section className="renewal-conditions" aria-label="契約条件"><h3>契約条件</h3>
          <dl className="renewal-salaries"><div><dt>前年年俸</dt><dd>{money(selected.player.salary)}</dd></div><div><dt>要求年俸</dt><dd>{money(selected.demand?.demandSalary)}</dd></div></dl>
          {selected.status === 'pending' && <>
            <div className="renewal-fields"><label>提示年俸（万円）<input type="number" inputMode="numeric" step="1" value={selected.salary ?? ''} aria-describedby={cutId} aria-invalid={Boolean(inputError)} onChange={event => { setInputError(''); update(selectedId, { salary: event.target.value }); }} /></label><label>契約年数<select aria-label="契約年数" value={selected.years ?? 1} onChange={event => { setInputError(''); update(selectedId, { years: Number(event.target.value) }); }}>{[1, 2, 3].filter(n => !selected.player.育成 || n <= ikuseiContractYears(selected.player)).map(n => <option key={n} value={n}>{n}年</option>)}</select></label></div>
            <p className="renewal-cut-note" id={cutId}>{cut.recorded ? <>減額制限内：{money(cut.boundary)}以上（{Math.round(cut.rate * 100)}%減まで）<br/>下回る提示は選手の同意が必要</> : '前年年俸未記録・減額制限を算出できません'}</p>
            <p className="renewal-note">前年との差額：{Number.isFinite(draftAmount(selected)) && Number.isFinite(selected.player.salary) ? `${draftAmount(selected) > selected.player.salary ? '+' : ''}${money(draftAmount(selected) - selected.player.salary)}` : '未記録'} · 今回の交渉 {selected.round ?? 0}/{CPU_RENEWAL_ROUNDS}回</p>
            {inputError && <p className="renewal-error" role="alert">{inputError}</p>}
            <button className="renewal-primary renewal-offer" onClick={() => prepareOffer(selected)}>オファーを出す</button>
            <p className="renewal-note">次に条件を確認します。合意すると契約が成立します。</p>
          </>}
          {selected.terms && <p className="renewal-agreement">合意条件：{money(selected.terms.salary)}・{selected.terms.years}年</p>}
        </section>
        <section className="renewal-response" aria-label="交渉結果"><h3>最新の返答</h3><p role="status">{selected.logs?.at(-1) ?? 'まだ提示していません。'}</p>
          {selected.status === 'free_requested' && <><p>減額制限超過への不同意です。制限内の再提示か自由契約の手続きを選んでください。</p><div className="renewal-actions"><button onClick={() => update(selectedId, { status: 'pending', round: 0, salary: String(Math.ceil(cut.boundary)), retries: (selected.retries ?? 0) + 1, logs: [...(selected.logs || []), '減額制限内で交渉を再開しました。'] })}>減額制限内で再提示する</button><button className="renewal-danger" onClick={() => setModal({ type: 'free', id: selectedId })}>自由契約の手続きへ</button></div></>}
          {selected.status === 'cooldown' && <button className="renewal-primary" onClick={() => update(selectedId, { status: 'pending', round: 0, retries: (selected.retries ?? 0) + 1, salary: String(Math.max(selected.demand?.minAcceptSalary ?? selected.player.salary * .6, Math.round((selected.demand?.demandSalary ?? selected.player.salary) * .95))), logs: [...(selected.logs || []), '再交渉を開始しました。'] })}>再交渉する</button>}
        </section>
        <div className="renewal-context" key={selectedId}>
          <details><summary>減額制限・要求年俸の理由</summary><h4>要求年俸の理由</h4><ul>{(selected.demand?.assessment?.reasons || []).map((r, i) => <li key={i}>{r.label}{r.bonus != null ? `（${r.bonus >= 0 ? '+' : ''}${Math.round(r.bonus * 100)}%）` : ''}</li>)}</ul>{!selected.demand?.assessment?.reasons?.length && <p>査定の詳細は未記録です。</p>}{selected.demand?.assessment?.roleSource && <p>投手の分類：{selected.demand.assessment.roleSource}</p>}<p>合意判定の下限：{money(selected.demand?.minAcceptSalary)}。下限以上でも、条件によって不合意になる場合があります。</p><p>タイトル加点は最大25%、チーム加点は最大5%。実際の合意額は契約条件によって変わります。</p><p>減額制限：{cut.recorded ? `${Math.round(cut.rate * 100)}%（制限内の年俸 ${money(cut.boundary)}以上）` : '前年年俸未記録'}。超過は選手の同意が必要です。最低年俸保障は契約成立時に適用します。</p></details>
          <details className="renewal-career" onToggle={event => setCareerOpen(event.currentTarget.open)}><summary>選手の詳細・年度別成績</summary><div className="renewal-stats">{Object.entries(selectedPlayer.isPitcher ? selectedPlayer.pitching || {} : selectedPlayer.batting || {}).map(([key, value]) => <span key={key}>{abilityNames[key] || key} {stat(value)}</span>)}<span>士気 {stat(selectedPlayer.morale)}</span><span>信頼 {stat(selectedPlayer.trust)}</span></div>{careerOpen && <Suspense fallback={<p>年度別成績を読み込み中です。</p>}><CareerTable player={selectedPlayer} year={year} teamId={myId} teamName={myTeam?.name} saveId={saveId} /></Suspense>}</details>
          <details><summary>交渉履歴（再交渉 {selected.retries ?? 0}回）</summary><ol>{(selected.logs || []).map((log, i) => <li key={i}>{log}</li>)}</ol>{!selected.logs?.length && <p>交渉履歴はありません。</p>}</details>
          <details><summary>FAまでの目安</summary><p>国内FA：{faLabel(selectedPlayer)}</p><p>海外FA：{faLabel(selectedPlayer, true)}</p><p className="renewal-note">ゲーム内では一軍登録120日で1年分。毎年120日を積む場合の最短目安です。旧データは在籍年数から推定します。</p></details>
          {!finished(selected.status) && selected.status !== 'free_requested' && <details className="renewal-release"><summary>契約を更新しない場合</summary><p>戦力外を確定すると球団から外れ、この画面では取り消せません。</p><button className="renewal-danger" onClick={() => setModal({ type: 'release', id: selectedId })}>戦力外を検討する</button></details>}
        </div>
      </section>}
    </div>
    <details className="renewal-help"><summary>交渉・数値表示の見方</summary><p>不合意が{CPU_RENEWAL_ROUNDS}回続くと、FA権のある選手は宣言し、その他は再交渉待ちになります。減額制限超過への不同意は、回数・FA資格に関係なく別途対応が必要です。</p><p>成績の「—」は分母0または必要な記録なし。「未記録」は数値なし。二軍・育成選手も今季の成績は一軍記録です。</p>{!embedded && <p>年俸見込みは合意条件、未合意は前年年俸で仮計上。下書きは反映せず、FA宣言・自由契約・戦力外は除外します。通常更改の年俸は年額で、FAの残予算から即時控除しません。</p>}</details>
    {!embedded && <footer className="renewal-footer">{unresolved.length > 0 && <p>未解決の{unresolved.length}人への対応が必要です。<button onClick={() => { setFilter('pending'); select(unresolved[0].player.id); }}>未合意の選手を確認</button></p>}<button className="renewal-primary" disabled={unresolved.length > 0} onClick={() => setModal({ type: 'review' })}>更改結果を確認する</button></footer>}
    {releaseEntry && <Confirmation fallbackFocus={heading} title={`${releaseEntry.player.name}を${modal.type === 'free' ? '自由契約' : '戦力外'}にしますか？`} onClose={closeModal} onConfirm={release} confirmLabel={modal.type === 'free' ? '自由契約を確定する' : '戦力外を確定する'}><p>契約を更新せず、球団から外します。この更改画面では取り消せません。</p>{modal.type === 'free' && <p>減額制限超過への不同意による自由契約です。FA権の行使ではなく、FA資格がなくても市場へ移ります。</p>}<p>前年年俸：{money(releaseEntry.player.salary)} · 要求：{money(releaseEntry.demand?.demandSalary)}</p></Confirmation>}
    {offerEntry && <Confirmation fallbackFocus={heading} title={modal.type === 'cut' ? '減額制限を超える提示' : '提示する契約条件の確認'} onClose={closeModal} confirmLabel={modal.type === 'cut' ? 'この条件で提示する' : 'この条件を提示する'} onConfirm={confirmOffer}><p>{offerEntry.player.name}へ{money(draftAmount(modal))}・{modal.years}年を提示します。</p><p>合意すると契約が成立し、原則取り消せません。</p>{modal.type === 'cut' && <p>選手が同意すれば合意できます。同意しない場合は、制限内の再提示または自由契約の手続きが必要になります。</p>}</Confirmation>}
    {modal?.type === 'batch' && <Confirmation fallbackFocus={heading} title="まとめて提示の確認" onClose={closeModal} onConfirm={batchOffer} confirmLabel="各選手へ1回ずつ提示する"><p>対象 {modal.drafts.length}人 · 提示する年俸の合計：{money(total(modal.drafts.map(draftAmount)))}</p><ul>{modal.drafts.map(e => {
      const amount = draftAmount(e); const rule = salaryCutRule(e.player, amount);
      return <li key={e.player.id}><strong>{e.player.name}</strong> · 前年 {money(e.player.salary)} / 要求 {money(e.demand?.demandSalary)} → 提示 {money(amount)}・{e.years}年{!Number.isFinite(amount) || amount <= 0 ? '（金額不正・送信しても提示回数に含めません）' : ''}{rule.exceeds ? '（減額制限超過・選手の同意が必要）' : ''}</li>;
    })}</ul><p>各選手へ1回ずつ提示します。未解決者は個別に対応でき、自動で戦力外・自由契約にはしません。</p></Confirmation>}
    {modal?.type === 'batch_results' && <Confirmation fallbackFocus={heading} title="まとめて提示の返答" onClose={closeModal} onConfirm={closeModal} confirmLabel="結果を閉じる"><ul>{entries.filter(e => modal.ids.includes(e.player.id)).map(e => <li key={e.player.id}><strong>{e.player.name}：{labels[e.status]}</strong><p>{e.logs?.at(-1)}</p></li>)}</ul><p>未合意の選手は一覧から個別交渉を続けられます。</p></Confirmation>}
    {modal?.type === 'review' && <Confirmation fallbackFocus={heading} title="契約更改の最終確認" onClose={closeModal} onConfirm={next} confirmLabel="確定して次へ進む"><p>年俸総額の見込み：{money(projected)}（更改前 {money(session.baseline)}）</p><ul>{entries.map(e => <li key={e.player.id}>{e.player.name}：{labels[e.status]}{e.terms ? ` · ${money(e.terms.salary)}・${e.terms.years}年` : ''}</li>)}</ul><p>確定後、CPU球団の更改と次のオフシーズン処理へ進みます。</p></Confirmation>}
  </Frame>;
}
