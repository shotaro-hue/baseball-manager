import React, { useEffect, useRef, useState } from 'react';
import { ACCEPT_THRESHOLD } from '../../constants';
import { ownedPlayers, renewalEligible, ikuseiContractYears, validContractOffer } from '../../engine/renewalRules';
import { evalOffer, calcPlayerDemand } from '../../engine/contract';
import { isPendingContractReply } from '../../engine/contractReplies';
import { contractPayroll, contractSalaryStatus } from '../../engine/contractPayroll';
import { ContractPayroll } from './ContractPayroll';
import { Button, MetricBand, StateLabel } from '../design-system/primitives';
import { payrollText } from './financeView';
import { DecisionConfirmation, PlayerActions, PlayerFacts, money, moneyMetric, salaryText, useDecisionReturn } from '../management/DecisionParts';

export function ContractTab({ team, allTeams = [team], onOffer, onRelease, year, gameDay, mailbox = [],
  onPlayerClick, onToggleCompare, comparePlayerIds, focusRequest, onResumeOffseason, active = true }) {
  const [selectedId, setSelectedId] = useState(null), [snapshot, setSnapshot] = useState(null);
  const [filter, setFilter] = useState('expiring'), [search, setSearch] = useState('');
  const [salary, setSalary] = useState(0), [years, setYears] = useState(1);
  const [performanceBonusRate, setPerformanceBonusRate] = useState(0), [titleBonus, setTitleBonus] = useState(0), [optOut, setOptOut] = useState(false);
  const [confirmation, setConfirmation] = useState(null), [receipt, setReceipt] = useState(null), [error, setError] = useState(null);
  const [editingReply, setEditingReply] = useState(false);
  const busy = useRef(false), current = useRef(null);
  const owned = ownedPlayers(team), expiring = owned.filter(p => renewalEligible(p, year));
  const live = owned.find(p => p.id === selectedId), selected = selectedId != null ? live || snapshot : null;
  const relevantMail = mailbox.filter(m => m.decision?.playerId === selectedId
    && (m.decision.teamId == null || m.decision.teamId === team?.id)
    && (m.decision.offeredYear == null || m.decision.offeredYear === year));
  const pending = relevantMail.find(isPendingContractReply);
  const reply = [...relevantMail].reverse().find(m => m.type === 'contract_reply');
  const waiting = pending || (!reply && receipt?.kind === 'offer' && receipt.player.id === selectedId ? receipt : null);
  const canRelease = live && renewalEligible(live, year) && !onResumeOffseason;
  const eligible = canRelease && contractSalaryStatus(live.salary) === 'recorded';
  const terms = { salary: Number(salary), years, incentives: { performanceBonusRate, titleBonus, optOut } };
  const valid = eligible && String(salary).trim() !== '' && validContractOffer(live, terms.salary, years);
  const preview = valid ? evalOffer(live, terms, team, allTeams) : null;
  const demand = eligible ? calcPlayerDemand(live, { team, year }) : null;
  const focus = useDecisionReturn(selectedId, active);
  const select = (p, event) => {
    focus.remember(event); setSelectedId(p.id); setSnapshot(p); setSalary(Math.max(1000, Math.round(p.salary / 100) * 100));
    setYears(1); setPerformanceBonusRate(0); setTitleBonus(0); setOptOut(false); setConfirmation(null); setReceipt(null); setError(null); setEditingReply(false); busy.current = false;
  };
  useEffect(() => {
    if (focusRequest?.id == null) return;
    const p = owned.find(p => p.id === focusRequest.id);
    if (p) select(p);
    // A new explicit link selects its target once; ordinary roster updates preserve drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token]);
  current.current = { live, eligible, canRelease, valid, terms, preview, confirmation };
  const confirm = () => {
    const c = current.current;
    if (busy.current || !c.confirmation || !c.live || c.live.id !== c.confirmation.playerId) return;
    if (c.confirmation.kind === 'release' ? !c.canRelease : !c.eligible) return;
    if (c.confirmation.kind === 'offer' && !c.valid) return;
    busy.current = true;
    const p = c.live;
    if (c.confirmation.kind === 'release') {
      if (onRelease?.(p.id) !== true) { busy.current = false; setConfirmation(null); setError('自由契約を確定できませんでした。現在の所属・契約を確認してください。'); return; }
      setReceipt({ kind: 'release', player: p });
    } else {
      const responseAfterDays = c.preview.total >= ACCEPT_THRESHOLD ? 2 : c.preview.total >= 55 ? 3 : 4;
      if (onOffer?.(p.id, c.terms.salary, c.terms.years, { score: c.preview.total, responseAfterDays, incentives: c.terms.incentives }) !== true) {
        busy.current = false; setConfirmation(null); setError('提示を送れませんでした。所属・金額・契約年数を確認してください。'); return;
      }
      setReceipt({ kind: 'offer', player: p, ...c.terms, deliverOnDay: Number.isFinite(gameDay) ? gameDay + responseAfterDays : null });
      setEditingReply(false);
    }
    setConfirmation(null); setError(null);
  };
  const status = p => p.contractSignedYear === year ? '当年契約済み'
    : mailbox.some(m => isPendingContractReply(m) && m.decision?.playerId === p.id && (m.decision.teamId == null || m.decision.teamId === team.id) && (m.decision.offeredYear == null || m.decision.offeredYear === year)) ? '回答待ち'
      : renewalEligible(p, year) ? '今季満了' : '継続契約';
  const visible = owned.filter(p => p.name?.includes(search.trim()) && (filter === 'all' || filter === 'expiring' && renewalEligible(p, year)
    || filter === 'waiting' && status(p) === '回答待ち' || filter === 'signed' && p.contractSignedYear === year));
  const payroll = contractPayroll(team);
  return <main className={`management-decisions ${selectedId != null ? 'decision-selected' : ''}`} data-ds="contract-management">
    <h1>契約状況</h1><p>現契約と回答状況を確認し、満了選手の条件を検討します。</p>
    <MetricBand items={[moneyMetric('編成予算の残枠', money(team?.budget)), moneyMetric('契約年俸総額 / 年', payrollText(payroll.total)), { label: '今季満了', value: expiring.length, unit: '人' }]} />
    {onResumeOffseason && <div className="decision-warning"><p>契約更改の進行中です。合意済みの条件と対応待ちは、オフシーズンの同じ一覧で扱います。</p><Button onClick={onResumeOffseason}>オフシーズンの契約更改へ戻る</Button></div>}
    <div className="decision-layout"><section className="decision-list" aria-label="所属選手の契約一覧">
      <h2>契約満了選手 ({expiring.length}人)</h2>
      <div className="decision-filters"><label>契約状態<select value={filter} onChange={e => setFilter(e.target.value)}><option value="expiring">今季満了</option><option value="all">全所属選手</option><option value="waiting">回答待ち</option><option value="signed">当年契約済み</option></select></label><label>選手名<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {!visible.length && <p>{expiring.length === 0 && filter === 'expiring' ? '今季満了の選手はいません' : 'この条件に該当する選手はいません。絞り込みを変更してください。'}</p>}
      {visible.map(p => <article key={p.id} className="decision-row" aria-current={p.id === selectedId}>
        <div><button className="decision-select" aria-label={`${p.name}の契約を確認`} onClick={e => select(p, e)}>{p.name}</button>
          <p className="decision-note">{team?.farm?.some(f => f.id === p.id) ? 'ファーム' : '登録選手'} · {p.pos} · {p.age ?? '未記録'}歳</p><StateLabel>{status(p)}</StateLabel></div>
        <div className="decision-row-money"><strong>{salaryText(p.salary)}</strong><p className="decision-note">残り {Number.isFinite(p.contractYearsLeft) ? `${p.contractYearsLeft}年` : '未記録'}</p></div>
      </article>)}
    </section><section className="decision-detail" aria-label="選んだ選手の契約条件">
      {!selected ? <p>選手を選ぶと成績・年俸・契約条件を確認できます。</p> : <>
        <Button variant="secondary" onClick={() => { setSelectedId(null); setConfirmation(null); }}>← 選手一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{selected.name}</h3><PlayerFacts player={selected} />
        <PlayerActions player={live || selected} teamName={team.name} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
        {receipt?.kind === 'release' ? <div className="decision-receipt" role="status">自由契約にしました。自由契約市場から確認できます。</div>
          : !live ? <p role="status">この選手は現在所属していません。契約操作はできません。</p> : <>
          {waiting && <div className="decision-warning" role="status"><strong>回答待ち</strong><p>最終提示：{money(waiting.decision?.salary ?? waiting.salary)} / {waiting.decision?.years ?? waiting.years}年</p>
            <p>{Number.isFinite(waiting.deliverOnDay) ? `第${waiting.deliverOnDay}日以降に受信箱へ回答が届きます。` : '数日後に受信箱へ回答が届きます。'}</p>
            {!editingReply && eligible && <Button variant="secondary" onClick={() => { busy.current = false; setEditingReply(true); }}>条件を見直して再提示する</Button>}</div>}
          {reply && <details><summary>最新の契約回答</summary><p>{reply.body}</p></details>}
          {eligible && (!waiting || editingReply) ? <>
            <h3>契約交渉</h3><p>現年俸 {salaryText(live.salary)} · 要求年俸の参考 {money(demand?.demandSalary)}</p>
            <div className="decision-fields"><label>提示年俸（万円）<input type="number" min="1" step="100" value={salary} onChange={e => { setSalary(e.target.value); setConfirmation(null); }} /></label>
              <label>契約年数<select aria-label="契約年数" value={years} onChange={e => { setYears(Number(e.target.value)); setConfirmation(null); }}>{[1, 2, 3, 4, 5].filter(y => !live.育成 || y <= ikuseiContractYears(live)).map(y => <option key={y} value={y}>{y}年</option>)}</select></label></div>
            <p className="decision-note">通常更改の年俸は、この画面の提示時に予算から差し引きません。参考要求額は成績に基づく目安で、シーズン中の交渉の確定条件ではありません。</p>
            <details><summary>出来高・条項</summary><div className="decision-fields">
              <label>出来高<select value={performanceBonusRate} onChange={e => { setPerformanceBonusRate(Number(e.target.value)); setConfirmation(null); }}>{[0, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}</select></label>
              <label>タイトルボーナス（万円）<select value={titleBonus} onChange={e => { setTitleBonus(Number(e.target.value)); setConfirmation(null); }}>{[0, 300, 500, 800, 1000].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div>
              <label><input type="checkbox" checked={optOut} onChange={e => { setOptOut(e.target.checked); setConfirmation(null); }} />オプトアウト条項を付与</label></details>
            {preview && <p>反応の目安：{preview.total >= ACCEPT_THRESHOLD ? '受諾見込み' : '条件の見直しを推奨'}（評価 {preview.total}）</p>}
            <Button disabled={!valid} onClick={() => { busy.current = false; setError(null); setConfirmation({ kind: 'offer', playerId: live.id }); }}>提示条件を確認する</Button>
            {!valid && <p className="decision-warning">提示年俸と契約年数を確認してください。</p>}
          </> : !eligible && <p className="decision-note">{onResumeOffseason ? '進行中の更改画面から判断してください。' : contractSalaryStatus(live.salary) !== 'recorded' ? '現年俸が未記録・不正値のため提示できません。' : '当年契約済み・継続契約のため、今季の更改対象ではありません。'}</p>}
          {canRelease && <details><summary>自由契約にする</summary><p>所属から外れ、自由契約市場へ移ります。主力の放出で人気が下がる場合があります。</p><Button variant="secondary" onClick={() => { busy.current = false; setConfirmation({ kind: 'release', playerId: live.id }); }}>自由契約の影響を確認</Button></details>}
        </>}
        {error && <p className="decision-error" role="alert">{error}</p>}
        {confirmation && <DecisionConfirmation fallbackFocus={focus.heading} title={confirmation.kind === 'offer' ? '提示条件の最終確認' : '自由契約の最終確認'} onCancel={() => setConfirmation(null)} onConfirm={confirm}
          confirmLabel={confirmation.kind === 'offer' ? 'この条件で最終オファー' : '自由契約を確定する'} danger={confirmation.kind === 'release'} error={!(confirmation.kind === 'release' ? canRelease : eligible) ? '所属または契約状況が変わっています。選び直してください。' : confirmation.kind === 'offer' && !valid ? '提示条件を確認してください。' : null}>
          <p><strong>{selected.name}</strong></p>{confirmation.kind === 'offer' ? <><p>年俸 {money(terms.salary)} / {years}年</p><p>出来高 {performanceBonusRate}% · タイトル {money(titleBonus)} · オプトアウト {optOut ? 'あり' : 'なし'}</p><p>提示時の予算控除はありません。数日後の回答で契約が確定します。{waiting && '現在の回答予定を取り消して、この条件へ置き換えます。'}</p></>
            : <p>自由契約市場へ移し、所属・起用から外します。取消はできません。編成予算の払い戻しはありません。</p>}
        </DecisionConfirmation>}
      </>}
    </section></div>
    <details><summary>所属選手の年俸内訳・年俸上位</summary><ContractPayroll team={team} leaders onPlayerClick={onPlayerClick} /></details>
    <p className="decision-note">一軍成績の0は実測値。「未記録」は欠測、「—」は分母不足などで算出できない状態です。提示の辞退だけでは所属と現契約は変わりません。</p>
  </main>;
}
