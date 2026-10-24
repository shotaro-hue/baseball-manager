import React, { useRef, useState } from 'react';
import { DecisionConfirmation, money } from '../management/DecisionParts';
import { Button, StateLabel } from '../design-system/primitives';
import { ReadingList, ReadingFilters, ReadingDetail, useReadingSelection } from '../reading/ReadingParts';
const actionable = m => !m.resolved && (m.type === 'posting_request' || m.type === 'trade' && m.offer);
const label = type => ({
  trade: 'トレードオファー',
  posting_request: 'ポスティング申請',
  contract_reply: '契約回答',
  scout: 'スカウト報告',
  posting_result: 'ポスティング結果',
  cpu_fa_summary: 'FA移籍情報'
})[type] ?? 'お知らせ';
export function MailboxTab({
  mailbox = [],
  unreadCount = 0,
  onRead,
  onAction,
  teams,
  onTeamClick,
  onNavigate
}) {
  const selection = useReadingSelection(mailbox),
    selected = selection.selected;
  const [filter, setFilter] = useState('all'),
    [confirmation, setConfirmation] = useState(null),
    [actionError, setActionError] = useState(null);
  const busy = useRef(false),
    current = useRef(null),
    handled = useRef(new Set());
  current.current = {
    selected,
    confirmation
  };
  const decide = action => {
    busy.current = false;
    setActionError(null);
    setConfirmation({
      id: selected.id,
      action
    });
  };
  const confirm = () => {
    const c = current.current;
    if (busy.current || !c.confirmation || !c.selected || c.selected.id !== c.confirmation.id || c.selected.resolved || handled.current.has(c.selected.id)) return;
    busy.current = true;
    if (onAction(c.selected.id, c.confirmation.action) === true) handled.current.add(c.selected.id);else {
      busy.current = false;
      setActionError('確定できませんでした。通知と最新の所属・予算を確認してください。');
    }
    setConfirmation(null);
  };
  const rowSelection = {
    ...selection,
    select: m => {
      setConfirmation(null);
      setActionError(null);
      selection.select(m);
      if (!m.read) onRead(m.id);
    }
  };
  const shown = mailbox.filter(m => filter === 'unread' ? !m.read : filter === 'actionable' ? actionable(m) : filter === 'done' ? m.resolved : true);
  return <main className="club-reading" data-ds="mailbox">
    <h1>受信箱</h1><p className="reading-muted">未読 {unreadCount}件 · 要対応 {mailbox.filter(actionable).length}件。既読にしても判断は確定しません。</p>
    <div className="reading-workspace" data-detail={Boolean(selected)}>
      <section className="reading-list" aria-label="通知の一覧">
        <ReadingFilters label="通知の絞り込み" options={[['all', 'すべて'], ['unread', '未読'], ['actionable', '要対応'], ['done', '対応済み']]} value={filter} onChange={value => {
          setFilter(value);
          selection.close();
        }} />
        <ReadingList key={filter} items={shown} label="通知" selection={rowSelection} searchText={m => [m.title, m.from, label(m.type)].join(' ')} renderItem={m => <><strong>{m.title}</strong><span className="reading-status">{!m.read && <StateLabel>未読</StateLabel>}{actionable(m) && <StateLabel tone="warning">要対応</StateLabel>}{m.resolved && <StateLabel>対応済み</StateLabel>}</span><small>{label(m.type)} · {m.from} · {m.dateLabel}</small></>} />
      </section>
      {selected && <ReadingDetail selection={selection} title={selected.title}>
        <p className="reading-muted">{label(selected.type)} · 差出人: {selected.from} · {selected.dateLabel}</p>
        <div className="reading-status">{actionable(selected) && <StateLabel tone="warning">要対応</StateLabel>}{selected.resolved && <StateLabel>対応済み</StateLabel>}</div>
        <p className="reading-body">{selected.body}</p>
        {selected.type === 'trade' && selected.offer && !selected.resolved && <>
          <div className="reading-offer"><section><h3>あなたが出す</h3>{selected.offer.want.map(p => <p key={p.id}>{p.name} <small>{p.pos}</small></p>)}</section>
            <section><h3>あなたが受け取る</h3>{selected.offer.offer.map(p => <p key={p.id}>{p.name} <small>{p.pos}</small></p>)}{selected.offer.cash > 0 && <p>金銭受取 {money(selected.offer.cash / 10000)}</p>}</section></div>
          <div className="reading-actions"><Button disabled={handled.current.has(selected.id)} onClick={() => decide('accept')}>✅ 承諾する</Button><Button variant="secondary" disabled={handled.current.has(selected.id)} onClick={() => decide('decline')}>❌ 断る</Button></div>
        </>}
        {selected.type === 'posting_request' && !selected.resolved && <>
          <h3>ポスティング判断</h3><p>承認すると選手はMLBへ移籍し、球団に移籍金収入が入ります。拒否すると残留し、モラルが10下がります。</p>
          <div className="reading-actions"><Button disabled={handled.current.has(selected.id)} onClick={() => decide('accept')}>✅ 承認する</Button><Button variant="secondary" disabled={handled.current.has(selected.id)} onClick={() => decide('decline')}>❌ 拒否する</Button></div>
        </>}
        {selected.type === 'cpu_fa_summary' && selected.signings?.map(s => {
          const team = teams?.find(t => t.id === s.teamId);
          return <section key={s.teamId}><Button variant="secondary" disabled={!team} onClick={() => team && onTeamClick?.(team)}>{s.teamEmoji} {s.teamName}</Button><p>{s.players.join('、')}</p></section>;
        })}
        {onNavigate && selected.type === 'trade' && selected.offer && <Button variant="secondary" onClick={() => onNavigate('trade', selected.id)}>トレード画面で検討する</Button>}
        {onNavigate && selected.type === 'contract_reply' && selected.decision?.playerId != null && <Button variant="secondary" onClick={() => onNavigate('contract', selected.decision.playerId)}>この選手の契約状況を見る</Button>}
        {actionError && <p role="alert">{actionError}</p>}
        {confirmation?.id === selected.id && <div className="management-decisions"><DecisionConfirmation fallbackFocus={selection.detailRef} title={selected.type === 'posting_request' ? 'ポスティング判断の確認' : 'トレード判断の確認'} onCancel={() => setConfirmation(null)} onConfirm={confirm} confirmLabel={confirmation.action === 'decline' ? '辞退を確定する' : selected.type === 'posting_request' ? '承認を確定する' : '承諾を確定する'} error={selected.resolved || handled.current.has(selected.id) ? 'この案件は対応済みです。再実行できません。' : null}>
          <p>{selected.title}</p>
          {confirmation.action === 'decline' ? <p>{selected.type === 'posting_request' ? '移籍を拒否し、選手のモラルが10下がります。' : 'この提案を辞退します。所属・予算は変わりません。'}</p> : selected.type === 'posting_request' ? <p>選手は所属を離れてMLBへ移籍し、既存ルールによる移籍金を受け取ります。</p> : <><p>放出：{selected.offer.want.map(p => p.name).join('、') || 'なし'} / 獲得：{selected.offer.offer.map(p => p.name).join('、') || 'なし'}</p><p>金銭受取 {money((selected.offer.cash ?? 0) / 10000)}。確定時に両球団の予算と所属を検証します。</p></>}
          <p>確定後は取消できません。</p>
        </DecisionConfirmation></div>}
      </ReadingDetail>}
    </div>
  </main>;
}
