import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtSal, rngf } from '../../utils';
import { MAX_ROSTER, FOREIGN_AGENT_ACCEPT_PROB, FOREIGN_AGENT_SALARY_RATIO, FOREIGN_DEADLINE_DAY, MIN_ACTIVE_CATCHERS, MIN_TOTAL_BY_POS } from '../../constants';
import { useResultDialog } from '../useResultDialog';
import { marketMetrics, marketNeeds, marketPlacement, validateMarketContract, addMarketSigning } from './faMarket';
import { planningPlayer } from '../../engine/offseasonPlanning';
import '../../calm-fa.css';

const money = n => Number.isFinite(n) ? fmtSal(n) : '未記録';
function Confirm({ offer, budget, placement, onClose, onConfirm, error }) {
  const ref = useResultDialog(onClose, true);
  const cost = offer.salary * offer.years;
  return <div className="fa-overlay"><section className="fa-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="fa-confirm-title">
    <h2 id="fa-confirm-title" tabIndex={0}>契約条件の最終確認</h2>
    <h3>{offer.player.name}</h3><p>年俸 {money(offer.salary)} × {offer.years}年</p><p>契約総額：<strong>{money(cost)}</strong></p>
    <p>契約後の予算：{Number.isFinite(budget) ? money(budget - cost) : '未記録'}</p><p>配属先：{placement.farm ? 'ファーム' : '登録選手'}（{placement.reason}）</p>
    <p>現在のゲームでは、年俸×年数の総額を契約時に予算から差し引きます。</p>
    {error && <p role="alert">{error}</p>}<div className="fa-actions"><button onClick={onClose}>戻って見直す</button><button className="fa-primary" disabled={Boolean(error)} onClick={onConfirm}>契約を確定する</button></div>
  </section></div>;
}

export default function HubFaTab({ myTeam, faPool = [], faYears = {}, setFaYears, foreignActiveCount, gameDay, year, myId, notify, upd, setFaPool, onPlayerClick, onToggleCompare, comparePlayerIds = [], marketMode = 'season', savedView, onViewChange }) {
  const [selectedId, setSelectedId] = useState(savedView?.selectedId ?? null);
  const [snapshot, setSnapshot] = useState(savedView?.snapshot ?? null);
  const [type, setType] = useState(savedView?.type ?? 'all');
  const [role, setRole] = useState(savedView?.role ?? 'all');
  const [search, setSearch] = useState(savedView?.search ?? '');
  const [sort, setSort] = useState(savedView?.sort ?? 'default');
  const [negotiations, setNegotiations] = useState(new Map());
  const negotiationRef = useRef(negotiations);
  const [offer, setOffer] = useState(null);
  const [receipt, setReceipt] = useState(savedView?.receipt ?? null);
  const signedIds = useRef(new Set());
  const processing = useRef(false);
  const heading = useRef(null);
  const rowRefs = useRef(new Map());
  const list = useRef(null);
  const scroll = useRef({ window: 0, list: 0 });
  const returning = useRef(null);
  const ledger = useRef({ budget: myTeam?.budget, spent: 0 });
  useEffect(() => { onViewChange?.({ selectedId, type, role, search, sort,
    snapshot: snapshot ? planningPlayer(snapshot) : null,
    receipt: receipt ? { ...receipt, player: planningPlayer(receipt.player) } : null });
  }, [selectedId, type, role, search, sort, snapshot, receipt, onViewChange]);
  if (ledger.current.budget !== myTeam?.budget) ledger.current = { budget: myTeam?.budget, spent: 0 };
  const budget = Number.isFinite(myTeam?.budget) ? myTeam.budget - ledger.current.spent : undefined;
  const writeNeg = (id, entry) => {
    const next = new Map(negotiationRef.current); next.set(id, entry); negotiationRef.current = next; setNegotiations(next);
  };
  useEffect(() => {
    if (selectedId != null) heading.current?.focus({ preventScroll: true });
    else if (returning.current != null) {
      if (typeof window !== 'undefined') window.scrollTo?.(0, scroll.current.window);
      if (list.current) list.current.scrollTop = scroll.current.list;
      (rowRefs.current.get(returning.current) || list.current)?.focus({ preventScroll: true }); returning.current = null;
    }
  }, [selectedId]);
  const close = useCallback(() => setOffer(null), []);
  const select = player => {
    scroll.current = { window: typeof window === 'undefined' ? 0 : window.scrollY, list: list.current?.scrollTop ?? 0 };
    setSnapshot(player); setSelectedId(player.id); setReceipt(null);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches) window.scrollTo?.(0, 0);
  };
  const back = () => { returning.current = selectedId; setSelectedId(null); };
  const start = player => {
    if (!Number.isFinite(gameDay) || gameDay > FOREIGN_DEADLINE_DAY || !Number.isFinite(player.salary) || player.salary <= 0 || !faPool.some(p => p.id === player.id)) return;
    const old = negotiationRef.current.get(player.id);
    if (old && !['failed', 'cancelled'].includes(old.stage)) return;
    writeNeg(player.id, { stage: 'salary', salaryDemand: Math.ceil(player.salary * FOREIGN_AGENT_SALARY_RATIO), minYears: player.age <= 30 ? 2 : 1, logs: [...(old?.logs || []), '代理人との交渉を開始しました。'] });
  };
  const negotiate = (player, currentSalary) => {
    const n = negotiationRef.current.get(player.id);
    if (!n || n.stage !== 'salary' || !faPool.some(p => p.id === player.id) || !Number.isFinite(gameDay) || gameDay > FOREIGN_DEADLINE_DAY) return;
    if (currentSalary && rngf(0, 1) >= FOREIGN_AGENT_ACCEPT_PROB) {
      writeNeg(player.id, { ...n, stage: 'failed', logs: [...n.logs, '代理人：現年俸での交渉はまとまりませんでした。'] }); return;
    }
    const salaryOffer = currentSalary ? player.salary : n.salaryDemand;
    writeNeg(player.id, { ...n, stage: 'years', salaryOffer, logs: [...n.logs, `代理人：年俸${money(salaryOffer)}・${n.minYears}年で契約できます。`] });
  };
  const confirm = () => {
    if (processing.current || !offer || signedIds.current.has(offer.player.id)) return;
    const error = validateMarketContract({ team: { ...myTeam, budget }, pool: faPool, player: offer.player, salary: offer.salary, years: offer.years, gameDay });
    if (error) { notify(error, 'warn'); setOffer(null); return; }
    processing.current = true; signedIds.current.add(offer.player.id);
    const placement = marketPlacement(myTeam, offer.player);
    ledger.current.spent += offer.salary * offer.years;
    upd(myId, team => addMarketSigning(team, offer.player, offer.salary, offer.years, year, marketMode));
    setFaPool(prev => prev.filter(p => p.id !== offer.player.id));
    setFaYears(prev => { const next = { ...prev }; delete next[offer.player.id]; return next; });
    setReceipt({ ...offer, placement }); setOffer(null);
    notify(`${offer.player.name}を契約しました${placement.farm ? '（ファーム配属）' : ''}`, placement.farm ? 'warn' : 'ok');
    processing.current = false;
  };
  if (!myTeam) return <section className="fa-market">球団情報を読み込み中です。</section>;
  const selected = faPool.find(p => p.id === selectedId) || snapshot;
  const onMarket = selected && faPool.some(p => p.id === selected.id) && !signedIds.current.has(selected.id);
  const n = selected ? negotiations.get(selected.id) : null;
  const years = selected?.isForeign ? n?.minYears : faYears[selectedId] ?? 1;
  const salary = selected?.isForeign ? n?.salaryOffer ?? n?.salaryDemand : selected?.salary;
  const error = selected ? validateMarketContract({ team: { ...myTeam, budget }, pool: faPool, player: selected, salary, years, gameDay }) : null;
  const placement = selected ? marketPlacement(myTeam, selected) : null;
  const needs = marketNeeds(myTeam);
  const visible = faPool.filter(p => (type === 'all' || (type === 'foreign' ? p.isForeign : !p.isForeign)) && (role === 'all' || (role === 'pitcher' ? p.isPitcher : !p.isPitcher)) && p.name?.includes(search.trim()));
  if (sort !== 'default') visible.sort((a, b) => {
    const av = sort === 'salary' ? a.salary : a.age; const bv = sort === 'salary' ? b.salary : b.age;
    return (Number.isFinite(av) ? av : Infinity) - (Number.isFinite(bv) ? bv : Infinity);
  });
  const canOffer = onMarket && (!selected.isForeign || n?.stage === 'years') && !error;
  return <section className={`fa-market ${selectedId != null ? 'fa-selected' : ''}`}>
    <header><h2>FA・自由契約市場</h2><p>補強候補を比較し、条件と配属先を確認して契約します。</p>
      <div className="fa-summary"><span>予算 <strong>{money(budget)}</strong></span><span>登録 {myTeam.players.length}/{MAX_ROSTER}人</span><span>外国人 {Number.isFinite(foreignActiveCount) ? foreignActiveCount : myTeam.players.filter(p => p.isForeign).length}/4人</span><span>市場 {faPool.length}人</span></div>
      <details><summary>人数から見る補強ポイント</summary><p>先発4・中継ぎ3・抑え1は登録選手、捕手は登録{MIN_ACTIVE_CATCHERS}・登録＋ファーム{MIN_TOTAL_BY_POS['捕手']}の目安です。選手の能力や将来性を保証する評価ではありません。</p>{needs.length ? <ul>{needs.map(h => <li key={h}>{h}</li>)}</ul> : <p>この人数の目安を満たしています。</p>}</details>
      <p className="fa-note">{marketMode === 'offseason' ? '国内FA・自由契約の補強期間です。外国人補強は翌シーズンの市場で行えます。' : `外国人補強：${gameDay > FOREIGN_DEADLINE_DAY ? '期限終了' : Number.isFinite(gameDay) ? `期限まであと${FOREIGN_DEADLINE_DAY - gameDay}日（第${FOREIGN_DEADLINE_DAY}日まで）` : '日程未記録'}`}</p>
    </header>
    <div className="fa-layout"><section className="fa-list" ref={list} tabIndex={-1} aria-label="市場の候補一覧">
      <div className="fa-filters"><label>市場<select value={type} onChange={e => setType(e.target.value)}><option value="all">全員</option><option value="domestic">国内FA・自由契約</option><option value="foreign">外国人FA</option></select></label><label>役割<select value={role} onChange={e => setRole(e.target.value)}><option value="all">全役割</option><option value="pitcher">投手</option><option value="batter">野手</option></select></label><label>並び順<select value={sort} onChange={e => setSort(e.target.value)}><option value="default">市場の順</option><option value="salary">年俸が安い順</option><option value="age">年齢が若い順</option></select></label><label>選手名<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <p>{visible.length}人を表示</p>{visible.map(p => <article className="fa-candidate" key={p.id}>
        <button className="fa-row" ref={node => { if (node) rowRefs.current.set(p.id, node); else rowRefs.current.delete(p.id); }} aria-label={`${p.name}の条件を見る`} aria-pressed={selectedId === p.id} onClick={() => select(p)}><strong>{p.name}</strong><span>{p.pos} · {p.age ?? '未記録'}歳 · {p.marketEntryReason || (p.isForeign ? '外国人' : '国内FA・自由契約')}</span><span>{p.marketEntryReason === '国内FA宣言' ? '要求年俸' : '契約年俸'} {money(p.salary)} / 年</span>{p.marketEntryReason === '国内FA宣言' && p.faOriginTeamId === myId && <span>自球団から宣言 · 宣言残留可能</span>}</button>
        {onToggleCompare && <button aria-pressed={comparePlayerIds.includes(p.id)} onClick={() => onToggleCompare(p, 'FA市場')}>{comparePlayerIds.includes(p.id) ? '比較から外す' : '比較に追加'}</button>}
      </article>)}{!visible.length && <p>{faPool.length ? 'この条件の候補はいません。絞り込みを変更してください。' : '現在、市場に候補はいません。'}</p>}
    </section><section className="fa-detail" aria-label="候補の条件と交渉">
      {selectedId == null || !selected ? <p>候補を選ぶと成績・契約条件を確認できます。「比較に追加」で候補同士や自チームの選手と比べられます。</p> : <>
        <button onClick={back}>← 候補一覧に戻る</button><h3 ref={heading} tabIndex={-1}>{selected.name}</h3><p>{selected.pos} · {selected.age ?? '未記録'}歳 · {selected.isForeign ? '外国人代理人交渉' : '国内FA・自由契約'}</p>
        <div className="fa-actions">{onPlayerClick && <button onClick={() => onPlayerClick(selected, 'FA市場')}>選手詳細・年度別成績</button>}{onToggleCompare && <button aria-pressed={comparePlayerIds.includes(selected.id)} onClick={() => onToggleCompare(selected, 'FA市場')}>比較{comparePlayerIds.includes(selected.id) ? 'から外す' : 'に追加'}</button>}</div>
        {(selected.faDeclarationDecision?.declared || selected.faNegotiationReason) && <div className="fa-card"><h4>FA宣言の理由</h4><p>{selected.faNegotiationReason || selected.faDeclarationDecision.reasons.join('・')}</p>{selected.faOriginTeamId === myId && <p>自球団から宣言した選手です。市場で契約すれば宣言残留になります。</p>}<p>前年年俸：{money(selected.faPreviousSalary)}</p></div>}
        <div className="fa-card"><h4>保存されている成績</h4><div className="fa-metrics">{marketMetrics(selected).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div><p className="fa-note">カウントの0は実測値。「未記録」は欠測、率の「—」は分母がない・算出できない状態です。</p></div>
        {receipt?.player.id === selected.id ? <div className="fa-card" role="status"><h4>契約完了</h4><p>年俸 {money(receipt.salary)}・{receipt.years}年 / 総額 {money(receipt.salary * receipt.years)}</p><p>{receipt.placement.farm ? 'ファームに配属しました。編成で登録を調整できます。' : '登録選手に加わりました。編成で起用を調整できます。'}</p></div> : !onMarket ? <p role="status">この選手は現在の市場にいません。一覧から候補を選び直してください。</p> : <div className="fa-card"><h4>契約条件</h4>
          {!selected.isForeign ? <><p>提示年俸：{money(selected.salary)} / 年（現在のゲームでは固定額）</p><label>契約年数<select value={years} onChange={e => setFaYears(prev => ({ ...prev, [selected.id]: Number(e.target.value) }))}>{[1, 2, 3].map(v => <option key={v} value={v}>{v}年</option>)}</select></label></> : <>
            {!n || ['cancelled', 'failed'].includes(n.stage) ? <><p>代理人希望年俸：{Number.isFinite(selected.salary) ? money(Math.ceil(selected.salary * FOREIGN_AGENT_SALARY_RATIO)) : '未記録'} / 年</p><button disabled={gameDay > FOREIGN_DEADLINE_DAY || !Number.isFinite(gameDay) || !(selected.salary > 0)} onClick={() => start(selected)}>{n ? '再交渉を始める' : '交渉開始'}</button></> : n.stage === 'salary' ? <><p>代理人希望年俸：{money(n.salaryDemand)} / 年</p><div className="fa-actions"><button disabled={gameDay > FOREIGN_DEADLINE_DAY} onClick={() => negotiate(selected, false)}>条件を受ける</button><button disabled={gameDay > FOREIGN_DEADLINE_DAY} onClick={() => negotiate(selected, true)}>現年俸で交渉</button></div><p className="fa-note">現年俸の交渉は不合意になる場合があります。</p></> : <p>提示年俸：{money(n.salaryOffer)} / 年 · 契約年数 {n.minYears}年</p>}
            {n && !['failed', 'cancelled'].includes(n.stage) && <button onClick={() => writeNeg(selected.id, { ...n, stage: 'cancelled', logs: [...n.logs, '交渉を中止しました。'] })}>交渉を中止する</button>}
          </>}
          {( !selected.isForeign || n?.stage === 'years') && <><p>契約総額 <strong>{money(salary * years)}</strong> · 契約後の予算 {Number.isFinite(budget) && Number.isFinite(salary) ? money(budget - salary * years) : '未記録'}</p><p>配属予定：{placement.farm ? 'ファーム' : '登録選手'}（{placement.reason}）</p><p className="fa-note">総額を契約時に予算から差し引きます。ファーム配属でも契約金額は変わりません。</p><button className="fa-primary" disabled={!canOffer} onClick={() => setOffer({ player: selected, salary, years })}>契約条件を確認する</button></>}
          {error && (!selected.isForeign || n?.stage === 'years') && <p className="fa-warning" role="status">{error}</p>}
        </div>}
        {n && <div className="fa-card"><h4>最新の返答</h4><p role="status">{n.logs.at(-1)}</p><details><summary>交渉履歴</summary><ol>{n.logs.map((log, i) => <li key={i}>{log}</li>)}</ol></details></div>}
      </>}
    </section></div>
    {offer && <Confirm offer={offer} budget={budget} placement={marketPlacement(myTeam, offer.player)} onClose={close} onConfirm={confirm} error={validateMarketContract({ team: { ...myTeam, budget }, pool: faPool, player: offer.player, salary: offer.salary, years: offer.years, gameDay })} />}
  </section>;
}
