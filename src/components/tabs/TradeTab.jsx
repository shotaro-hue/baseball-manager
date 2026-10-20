import React, { useEffect, useRef, useState } from 'react';
import { rngf } from '../../utils';
import { tradeValue, evalTradeForCpu, analyzeTeamNeeds } from '../../engine/trade';
import { applyTradeTransaction } from '../../engine/tradeTransaction';
import { evaluateRosterCapacity } from '../../engine/rosterCapacity';
import { Button, MetricBand, StateLabel } from '../design-system/primitives';
import { DecisionConfirmation, PlayerActions, PlayerFacts, money, moneyMetric } from '../management/DecisionParts';

function TradeTerms({ mine, target, outgoing = [], incoming = [], cash, preview, capacityContext }) {
  const after = preview?.ok ? preview.teams.find(t => t.id === mine.id) : null;
  const otherAfter = preview?.ok ? preview.teams.find(t => t.id === target?.id) : null;
  const capacity = after ? evaluateRosterCapacity(after, { ...capacityContext, teams: preview.teams }) : null;
  return <><div className="decision-terms"><div><strong>あなたが出す</strong><ul>{outgoing.map(p => <li key={p.id}>{p.name}</li>)}</ul>{!outgoing.length && <p>選手なし</p>}
    <p>支払金額 {money(Math.max(0, cash))}</p></div><div><strong>あなたが受け取る</strong><ul>{incoming.map(p => <li key={p.id}>{p.name}</li>)}</ul>{!incoming.length && <p>選手なし</p>}
    <p>受取金額 {money(Math.max(0, -cash))}</p></div></div>
    {after && <><p>取引後の予算：自球団 {money(after.budget)} / {target?.name} {money(otherAfter.budget)}</p>
      <p>自球団の支配下 {capacity?.ok ? `${capacity.controlledCount}人 · 残り${capacity.remainingSlots}枠` : '算出不可'} · 配属先は登録枠・故障・外国人枠などの条件で決まります。</p></>}
  </>;
}

function TradePlayers({ team, selected, onToggle, incoming, onPlayerClick, onToggleCompare, comparePlayerIds }) {
  return <section><h3>{incoming ? '相手から受け取る' : '自分が出す選手（任意）'}</h3>
    <p className="decision-note">{incoming ? '能力欄はスカウト評価で誤差を含みます。' : '選手を出さず、金銭だけの提案もできます。'}</p>
    <div className="decision-trade-players">{(team?.players || []).map(p => <article key={p.id}>
      <label><input type="checkbox" aria-label={`${p.name}を${incoming ? '獲得候補' : '放出候補'}に選ぶ`} checked={selected.some(s => s.id === p.id)} onChange={() => onToggle(p)} /><strong>{p.name}</strong></label>
      <PlayerFacts player={p} noisy={incoming} /><p className="decision-note">取引評価 {tradeValue(p)}</p>
      <PlayerActions player={p} teamName={team.name} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
    </article>)}</div>
  </section>;
}

export function TradeTab({ myTeam, teams, onTrade, cpuOffers = [], offerMails, onAcceptOffer, onDeclineOffer,
  deadlinePassed = false, onPlayerClick, onToggleCompare, comparePlayerIds, capacityContext = {}, focusRequest, active = true }) {
  const [phase, setPhase] = useState('top'), [targetId, setTargetId] = useState(null);
  const [myOut, setMyOut] = useState([]), [theirIn, setTheirIn] = useState([]), [myCash, setMyCash] = useState(0);
  const [tradeResult, setTradeResult] = useState(null), [counter, setCounter] = useState(null), [counterRound, setCounterRound] = useState(0), [cpuReasons, setCpuReasons] = useState([]);
  const [confirmation, setConfirmation] = useState(null), [error, setError] = useState(null);
  const [selectedMailId, setSelectedMailId] = useState(null), [mailReceipt, setMailReceipt] = useState(null);
  const busy = useRef(false), current = useRef(null), handled = useRef(new Set());
  const caseHeading = useRef(null), negotiationHeading = useRef(null);
  const offers = offerMails ?? cpuOffers.map((offer, index) => ({ id: `cpu-${index}`, title: `${offer.from?.name}からのオファー`, offer }));
  const selectedMail = offers.find(m => m.id === selectedMailId);
  const targetTeam = teams.find(t => t.id === targetId);
  const others = teams.filter(t => t.id !== myTeam.id);
  const reset = () => { setPhase('top'); setTargetId(null); setMyOut([]); setTheirIn([]); setMyCash(0); setTradeResult(null); setCounter(null); setCounterRound(0); setCpuReasons([]); setConfirmation(null); setSelectedMailId(null); setMailReceipt(null); setError(null); busy.current = false; };
  const open = action => { setError(null); busy.current = false; setConfirmation(action); };
  useEffect(() => {
    if (focusRequest?.id == null) return;
    setSelectedMailId(focusRequest.id); setConfirmation(null); setError(null); setMailReceipt(null); busy.current = false;
  }, [focusRequest?.token]);
  useEffect(() => {
    if (active && selectedMailId != null) {
      caseHeading.current?.focus({ preventScroll: true });
      caseHeading.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedMailId, focusRequest?.token, active]);
  const buildQuote = (outgoing, incoming, target, cash) => deadlinePassed ? { ok: false, error: 'トレード期限を過ぎています' }
    : applyTradeTransaction(teams, { fromId: myTeam.id, toId: target?.id, outgoing, incoming, cash }, capacityContext);
  const quote = confirmation && ['proposal', 'counter'].includes(confirmation.kind)
    ? buildQuote(confirmation.outgoing, confirmation.incoming, targetTeam, confirmation.cash)
    : selectedMail?.offer && !selectedMail.resolved ? buildQuote(selectedMail.offer.want, selectedMail.offer.offer, selectedMail.offer.from, -(selectedMail.offer.cash ?? 0) / 10000) : null;
  const issue = confirmation?.kind === 'decline' ? !selectedMail || selectedMail.resolved || handled.current.has(selectedMail.id) ? 'この案件は対応済み、または一覧にありません。' : null
    : confirmation?.kind === 'accept' && (!selectedMail || selectedMail.resolved || handled.current.has(selectedMail.id)) ? 'この案件は対応済み、または一覧にありません。'
      : confirmation && quote && !quote.ok ? quote.error : null;
  current.current = { confirmation, selectedMail, offers, quote, issue, targetTeam, myTeam, teams };
  const executeTrade = (outgoing, incoming, cash) => {
    setTradeResult(onTrade?.(outgoing, incoming, targetTeam, cash) === true ? 'accept' : 'invalid');
  };
  // The negotiation's scoring, random thresholds and counter rules are unchanged.
  const proposeTrade = (outgoing, incoming, cash) => {
    const ev = evalTradeForCpu(targetTeam, outgoing, incoming, cash);
    setCpuReasons(ev.reasons || []);
    if (counterRound >= 2) {
      if (ev.favorable || (ev.fair && rngf(0, 1) < 0.5)) executeTrade(outgoing, incoming, cash);
      else setTradeResult('reject');
      return;
    }
    const acceptThreshold = counterRound === 0 ? 0.55 : 0.30;
    if (ev.favorable) executeTrade(outgoing, incoming, cash);
    else if (ev.fair) {
      if (rngf(0, 1) < acceptThreshold) executeTrade(outgoing, incoming, cash);
      else {
        const extra = myTeam.players.filter(p => !outgoing.some(x => x.id === p.id)).sort((a, b) => tradeValue(a) - tradeValue(b))[0];
        const needCash = Math.max(0, Math.round((incoming.reduce((s, p) => s + tradeValue(p), 0) - outgoing.reduce((s, p) => s + tradeValue(p), 0) - cash * 0.3) * 10));
        const cashMult = counterRound === 1 ? 1.5 : 1;
        const askPlayer = extra && rngf(0, 1) < 0.5;
        setCounter({ extraPlayer: askPlayer ? extra : null, extraCash: askPlayer ? 0 : Math.round(needCash * cashMult) });
        setCounterRound(r => r + 1); setTradeResult('counter');
      }
    } else setTradeResult('reject');
  };
  const confirm = () => {
    const c = current.current;
    if (busy.current || !c.confirmation || c.issue) return;
    busy.current = true; current.current = { ...c, confirmation: null };
    const action = c.confirmation;
    if (action.kind === 'accept' || action.kind === 'decline') {
      const index = c.offers.findIndex(m => m.id === c.selectedMail?.id);
      if (index < 0) { busy.current = false; return; }
      const succeeded = (action.kind === 'accept' ? onAcceptOffer?.(index) : onDeclineOffer?.(index)) === true;
      if (!succeeded) { setError('案件を確定できませんでした。通知と最新の所属・予算を確認してください。'); busy.current = false; }
      else { handled.current.add(c.selectedMail.id); setMailReceipt({ id: c.selectedMail.id, action: action.kind }); }
    } else if (action.kind === 'counter') executeTrade(c.quote.outgoing, c.quote.incoming, action.cash);
    else proposeTrade(c.quote.outgoing, c.quote.incoming, action.cash);
    setConfirmation(null);
  };
  const selection = (setter, p) => { setConfirmation(null); setter(prev => prev.some(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]); };
  const mailDone = selectedMail?.resolved || mailReceipt?.id === selectedMailId || handled.current.has(selectedMailId);
  const capacity = evaluateRosterCapacity(myTeam, { ...capacityContext, teams });
  return <main className="management-decisions" data-ds="trade-management">
    <h1>トレード</h1><p>選手・契約・金銭を比較し、両球団への影響を確認して提案します。</p>
    <MetricBand items={[moneyMetric('編成予算の残枠', money(myTeam.budget)), { label: '残り支配下枠', value: capacity.ok ? capacity.remainingSlots : null, unit: '人', state: 'unavailable' }, { label: '未解決の提案', value: offers.filter(m => !m.resolved).length, unit: '件' }]} />
    {offers.length > 0 && <section aria-label="受信したトレード提案"><h2>受信した提案</h2><div className="decision-actions">{offers.filter(m => !m.resolved || m.id === selectedMailId).map(m => <Button key={m.id} variant="secondary" aria-pressed={selectedMailId === m.id}
      onClick={() => { setSelectedMailId(m.id); setConfirmation(null); setMailReceipt(null); setError(null); }}>{m.title || `${m.offer.from?.name}からのオファー`}</Button>)}</div></section>}
    {selectedMailId != null ? <section className="decision-detail" aria-label="選択したトレード案件">
      <Button variant="secondary" onClick={() => { setSelectedMailId(null); setConfirmation(null); }}>交渉画面へ戻る</Button>
      {!selectedMail ? <p role="status">この案件は現在の受信箱にありません。最新の通知を確認してください。</p> : <>
        <h2 ref={caseHeading} tabIndex={-1}>{selectedMail.title || `${selectedMail.offer.from?.name}からのオファー`}</h2><StateLabel tone={mailDone ? 'success' : 'warning'}>{mailDone ? '対応済み' : '要対応'}</StateLabel>
        <TradeTerms mine={myTeam} target={selectedMail.offer.from} outgoing={selectedMail.offer.want} incoming={selectedMail.offer.offer} cash={-(selectedMail.offer.cash ?? 0) / 10000} preview={!mailDone ? quote : null} capacityContext={capacityContext} />
        <div className="decision-exchange">{[...(selectedMail.offer.want || []), ...(selectedMail.offer.offer || [])].map(p => {
          const owner = teams.find(t => [...(t.players || []), ...(t.farm || [])].some(x => x.id === p.id));
          const live = owner && [...owner.players, ...(owner.farm || [])].find(x => x.id === p.id);
          return <section key={p.id}><h3>{p.name}</h3><PlayerFacts player={live || p} /><PlayerActions player={live || p} teamName={owner?.name || 'トレード提案'} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} /></section>;
        })}</div>
        {mailDone ? <p className="decision-receipt" role="status">この提案は対応済みです。再実行はできません。</p> : <>
          {quote && !quote.ok && <p className="decision-warning">{quote.error}</p>}
          <div className="decision-actions"><Button disabled={!quote?.ok} onClick={() => open({ kind: 'accept' })}>承諾内容を確認する</Button><Button variant="secondary" onClick={() => open({ kind: 'decline' })}>辞退内容を確認する</Button></div>
        </>}
      </>}
    </section> : <>
      {phase === 'top' ? <section><h2>交渉する球団を選ぶ</h2>{deadlinePassed && <p className="decision-warning">トレード期限終了 — 8月以降は新たな取引を確定できません。</p>}
        <div className="decision-teams">{others.map(t => <div key={t.id}><Button variant="secondary" disabled={deadlinePassed} onClick={() => { setTargetId(t.id); setPhase('build'); busy.current = false; }}>{t.name}と交渉する</Button><p className="decision-note">{analyzeTeamNeeds(t).map(n => n.type).join(' · ') || '目立った人数不足なし'}</p></div>)}</div>
      </section> : targetTeam && <section>
        <Button variant="secondary" onClick={reset}>← 球団選択に戻る</Button><h2 ref={negotiationHeading} tabIndex={-1}>{targetTeam.name}との交渉</h2>
        {!tradeResult ? <>
          <div className="decision-exchange"><TradePlayers team={myTeam} selected={myOut} onToggle={p => selection(setMyOut, p)} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
            <TradePlayers team={targetTeam} selected={theirIn} incoming onToggle={p => selection(setTheirIn, p)} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} /></div>
          <label>支払金額（万円）<input type="number" aria-label="支払金額（万円）" value={myCash} step="100" min="0" onChange={e => { setMyCash(e.target.value === '' ? '' : Math.max(0, Number(e.target.value))); setConfirmation(null); }} /></label>
          <p>放出 {myOut.length}人 / 獲得 {theirIn.length}人 · 支払金額 {money(Number(myCash))}</p>
          <Button disabled={!theirIn.length || deadlinePassed || !Number.isFinite(Number(myCash))} onClick={() => open({ kind: 'proposal', outgoing: myOut, incoming: theirIn, cash: Number(myCash) })}>トレードを提案する</Button>
          {!theirIn.length && <p className="decision-note">受け取る選手を1人以上選んでください。</p>}
        </> : <section className="decision-detail" aria-label="トレード交渉の結果">
          {tradeResult === 'accept' && <div className="decision-receipt" role="status"><h3>トレード成立！</h3><p>{targetTeam.name}との取引を反映しました。編成で登録と起用を確認できます。</p></div>}
          {tradeResult === 'invalid' && <p className="decision-error" role="alert">取引を確定できませんでした。通知を確認し、最新の予算・所属・条件を選び直してください。</p>}
          {tradeResult === 'reject' && <div role="status"><h3>拒否されました</h3><p>条件を見直して再提案できます。</p></div>}
          {tradeResult === 'counter' && counter && <><h3>逆提案が来ました！</h3><p>交渉 {counterRound}/3 ラウンド目</p>
            {counter.extraPlayer ? <p>{counter.extraPlayer.name}も一緒に欲しい</p> : <p>{money(counter.extraCash)}を上乗せしてほしい</p>}
            <p>最終支払金額 {money(Number(myCash) + counter.extraCash)}</p>{cpuReasons.map((reason, i) => <p key={i}>{reason}</p>)}
            <Button onClick={() => open({ kind: 'counter', outgoing: counter.extraPlayer ? [...myOut, counter.extraPlayer] : myOut, incoming: theirIn, cash: Number(myCash) + counter.extraCash })}>受け入れる</Button>
          </>}
          <div className="decision-actions">{tradeResult !== 'accept' && <Button variant="secondary" onClick={() => { setTradeResult(null); setConfirmation(null); busy.current = false; }}>条件を見直す</Button>}<Button variant="secondary" onClick={reset}>続けて交渉する</Button></div>
        </section>}
      </section>}
    </>}
    {error && <p className="decision-error" role="alert">{error}</p>}
    {confirmation && <DecisionConfirmation fallbackFocus={selectedMailId != null ? caseHeading : negotiationHeading} title={confirmation.kind === 'decline' ? '提案辞退の確認' : 'トレード条件の最終確認'} onCancel={() => setConfirmation(null)} onConfirm={confirm} error={issue}
      confirmLabel={confirmation.kind === 'accept' ? '承諾を確定する' : confirmation.kind === 'decline' ? '辞退を確定する' : confirmation.kind === 'counter' ? '逆提案を確定する' : '確認して提案する'}>
      {confirmation.kind === 'decline' ? <p>{selectedMail?.title}を辞退します。所属と予算は変わりません。辞退した提案へは戻せません。</p>
        : <><TradeTerms mine={myTeam} target={confirmation.kind === 'accept' ? selectedMail?.offer.from : targetTeam}
          outgoing={confirmation.kind === 'accept' ? selectedMail?.offer.want : confirmation.outgoing} incoming={confirmation.kind === 'accept' ? selectedMail?.offer.offer : confirmation.incoming}
          cash={confirmation.kind === 'accept' ? -(selectedMail?.offer.cash ?? 0) / 10000 : confirmation.cash} preview={quote} capacityContext={capacityContext} />
          <p>{confirmation.kind === 'proposal' ? '相手が受諾した場合、この条件で取引が確定します。逆提案は改めて確認します。' : '確定すると選手の所属と金銭を反映します。取消はできません。'}</p></>}
    </DecisionConfirmation>}
    <p className="decision-note">金額は万円。成立後は編成で登録と起用を確認できます。</p>
  </main>;
}
