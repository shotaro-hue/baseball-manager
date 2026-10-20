import { useCallback, useMemo } from 'react';
import { tradeValue } from '../../engine/trade';
import { Button } from '../design-system/primitives';
import { PlayerFilters, PlayerList, useMobileDetail } from './PlayerList';
import { DEFAULT_PLAYER_FILTERS, filterPlayerEntries, rosterEntries } from './playerListModel';
import { PlayerActions, PlayerFacts, useDecisionReturn } from './DecisionParts';

export const initialTradeView = () => ({ side: 'outgoing', outgoing: { ...DEFAULT_PLAYER_FILTERS }, incoming: { ...DEFAULT_PLAYER_FILTERS }, detailId: null });

export function TradePlayerPicker({ mine, target, outgoing, incoming, onOutgoing, onIncoming, view, onViewChange, active, onPlayerClick, onToggleCompare, comparePlayerIds }) {
  const receiving = view.side === 'incoming', team = receiving ? target : mine;
  const selected = receiving ? incoming : outgoing, toggle = receiving ? onIncoming : onOutgoing;
  const entries = useMemo(() => rosterEntries(team).map(entry => {
    const value = tradeValue(entry.player);
    return { ...entry, evaluation: Number.isFinite(value) ? value : '未記録' };
  }), [team]);
  const visible = useMemo(() => filterPlayerEntries(entries, view[view.side]), [entries, view]);
  const player = entries.find(e => e.player.id === view.detailId)?.player;
  const focus = useDecisionReturn(view.detailId, active);
  const mobileDetail = useMobileDetail(view.detailId);
  const select = useCallback((p, event) => { focus.remember(event); onViewChange(previous => ({ ...previous, detailId: p.id })); }, [focus, onViewChange]);
  return <div className={view.detailId != null ? 'decision-selected' : ''}>
    <div className="decision-picker-tabs" role="group" aria-label="選手を選ぶ球団">
      <Button variant="secondary" aria-pressed={!receiving} onClick={event => { focus.remember(event); onViewChange(v => ({ ...v, side: 'outgoing', detailId: null })); }}>放出候補を選ぶ</Button>
      <Button variant="secondary" aria-pressed={receiving} onClick={event => { focus.remember(event); onViewChange(v => ({ ...v, side: 'incoming', detailId: null })); }}>獲得候補を選ぶ</Button>
    </div>
    <div className="decision-layout"><section ref={focus.list} className="decision-list" aria-label={receiving ? '獲得候補一覧' : '放出候補一覧'}>
      <h3>{team.name} ({visible.length}人)</h3>
      <PlayerFilters entries={entries} filters={view[view.side]} onChange={filters => onViewChange(v => ({ ...v, [v.side]: filters }))} />
      <p className="decision-note">{receiving ? '獲得したい選手にチェック。評価は参考値、能力のスカウト評価は詳細で確認できます。' : '放出候補にチェック。選手を出さず、金銭だけの提案もできます。'}</p>
      <PlayerList suspended={mobileDetail} entries={visible} selectedId={view.detailId} selectedIds={selected.map(p => p.id)} onSelect={select} onToggle={toggle} toggleLabel={receiving ? '獲得候補' : '放出候補'} />
    </section><section className="decision-detail" aria-label="トレード候補の詳細">
      {view.detailId == null ? <p>選手名を選ぶと成績・能力・契約を確認できます。</p> : <>
        <Button variant="secondary" onClick={() => onViewChange(v => ({ ...v, detailId: null }))}>← 選手一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{player?.name || 'この選手は現在所属していません'}</h3>
        {player && <><PlayerFacts player={player} noisy={receiving} /><PlayerActions player={player} teamName={team.name} {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
          <Button variant="secondary" onClick={() => toggle(player)}>{selected.some(p => p.id === player.id) ? '選択から外す' : receiving ? '獲得候補に選ぶ' : '放出候補に選ぶ'}</Button></>}
      </>}
    </section></div>
  </div>;
}

export function TradeSelectionSummary({ outgoing, incoming, onCompare, comparing }) {
  return <><section className="decision-selection-summary" aria-label="選択したトレード選手">
    <strong>放出 {outgoing.length}人 / 獲得 {incoming.length}人</strong>
    <Button variant="secondary" disabled={outgoing.length + incoming.length === 0} aria-pressed={comparing} onClick={onCompare}>{comparing ? '比較を閉じる' : '選択した選手を比較'}</Button>
  </section>
    {(outgoing.length + incoming.length) > 0 && <details><summary>選択した選手名</summary><p>放出：{outgoing.map(p => p.name).join('・') || '選手なし'}</p><p>獲得：{incoming.map(p => p.name).join('・') || '未選択'}</p></details>}
  </>;
}
