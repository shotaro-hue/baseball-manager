import { useCallback, useMemo, useState } from 'react';
import { Button } from '../design-system/primitives';
import { PlayerActions, PlayerFacts, money, useDecisionReturn } from '../management/DecisionParts';
import { PlayerFilters, PlayerList, useMobileDetail } from '../management/PlayerList';
import { DEFAULT_PLAYER_FILTERS, filterPlayerEntries } from '../management/playerListModel';

// Keep the old route ID and stored fields; this screen never writes game data.
export default function HubScoutTab({ myTeam, onNavigate, onPlayerClick, onToggleCompare, comparePlayerIds, active = true }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_PLAYER_FILTERS);
  const focus = useDecisionReturn(selectedId, active);
  const candidates = myTeam?.scoutResults || [];
  const missions = myTeam?.scoutMissions || [];
  const entries = useMemo(() => candidates.map(player => ({ player, status: '旧報告・閲覧専用' })), [candidates]);
  const visible = useMemo(() => filterPlayerEntries(entries, filters), [entries, filters]);
  const mobileDetail = useMobileDetail(selectedId);
  const selected = selectedId != null ? candidates.find(p => p.id === selectedId) : null;
  const select = useCallback((p, event) => { focus.remember(event); setSelectedId(p.id); }, [focus]);
  return <main className={`management-decisions ${selectedId != null ? 'decision-selected' : ''}`} data-ds="scouting-management">
    <h1>旧スカウト記録</h1>
    <p>旧スカウトによる選手生成・直接獲得は終了しました。過去の報告は閲覧できますが、この画面からは契約できません。獲得済みの選手には影響しません。</p>
    <p className="decision-note">旧派遣は機能終了により停止しています。過去の派遣費・獲得費の返金はありません。</p>
    <Button variant="secondary" onClick={() => onNavigate?.('reinforcement')}>補強トップへ</Button>
    {!candidates.length && !missions.length && <p>旧スカウト記録はありません。</p>}
    {candidates.length > 0 && <div className="decision-layout"><section ref={focus.list} className="decision-list" aria-label="旧スカウト報告一覧"><h2>過去の報告 ({visible.length}人)</h2>
      <PlayerFilters entries={entries} filters={filters} onChange={setFilters} groups={false} searchLabel="候補の選手名" />
      <PlayerList suspended={mobileDetail} entries={visible} selectedId={selectedId} onSelect={select} actionLabel="の旧報告を見る" />
    </section><section className="decision-detail" aria-label="旧スカウト報告の詳細">
      {!selected ? <p>選手を選ぶと保存された能力・成績を確認できます。</p> : <>
        <Button variant="secondary" onClick={() => setSelectedId(null)}>← 選手一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{selected.name}</h3><PlayerFacts player={selected} />
        <PlayerActions player={selected} teamName="旧スカウト報告" {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
        <p className="decision-note">旧報告の記録です。契約・市場への移動・候補の削除はできません。</p>
      </>}
    </section></div>}
    {missions.length > 0 && <section aria-label="旧派遣記録"><h2>旧派遣記録</h2>{missions.map((m, i) => <p key={m.id ?? i}>{m.name} · 機能終了により停止 · 記録上の派遣費 {money(m.cost)}</p>)}</section>}
    {candidates.length > 0 && <p className="decision-note">保存された報告を表示しています。成績の0は実測値、「未記録」は欠測、「—」は算出できない率です。</p>}
  </main>;
}
