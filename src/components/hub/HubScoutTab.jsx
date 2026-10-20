import { useCallback, useMemo, useRef, useState } from 'react';
import { marketRosterError } from '../../engine/marketRoster';
import { evaluateRosterCapacity } from '../../engine/rosterCapacity';
import { Button, MetricBand } from '../design-system/primitives';
import { DecisionConfirmation, PlayerActions, PlayerFacts, money, moneyMetric, salaryText, useDecisionReturn } from '../management/DecisionParts';
import { PlayerFilters, PlayerList, useMobileDetail } from '../management/PlayerList';
import { DEFAULT_PLAYER_FILTERS, filterPlayerEntries } from '../management/playerListModel';

export default function HubScoutTab({ myTeam, teams = [myTeam], capacityContext = {}, scoutRegions = [], onSendScout,
  onSignPlayer, onRemoveScoutResult, onPlayerClick, onToggleCompare, comparePlayerIds, active = true }) {
  const [selectedId, setSelectedId] = useState(null), [snapshot, setSnapshot] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_PLAYER_FILTERS), [confirmation, setConfirmation] = useState(null);
  const [section, setSection] = useState('reports');
  const [receipt, setReceipt] = useState(null), [error, setError] = useState(null);
  const busy = useRef(false), current = useRef(null), dispatchHeading = useRef(null);
  const focus = useDecisionReturn(selectedId, active);
  const candidates = myTeam?.scoutResults || [];
  const entries = useMemo(() => candidates.map(player => ({ player, status: '未契約' })), [candidates]);
  const visible = useMemo(() => filterPlayerEntries(entries, filters), [entries, filters]);
  const mobileDetail = useMobileDetail(selectedId);
  const selected = selectedId != null ? candidates.find(p => p.id === selectedId) || snapshot : null;
  const capacity = evaluateRosterCapacity(myTeam, { ...capacityContext, teams });
  const signingError = (team, p, results) => {
    if (!p || !results.some(c => c.id === p.id)) return 'この候補は現在の報告一覧にいません。';
    if (!Number.isFinite(p.salary) || p.salary < 0) return '年俸が未記録・不正値のため契約できません。';
    if (!Number.isFinite(team?.budget)) return '予算が未記録のため契約できません。';
    if (team.budget < p.salary) return '予算が不足しています。';
    return marketRosterError(team, p, teams, capacityContext);
  };
  const issue = confirmation?.kind === 'dispatch' ? (!Number.isFinite(myTeam?.budget) || myTeam.budget < confirmation.region.cost ? '予算が不足しているか未記録です。' : null)
    : confirmation?.kind === 'sign' ? signingError(myTeam, selected, candidates)
      : confirmation && !candidates.some(p => p.id === confirmation.playerId) ? 'この候補は現在の報告一覧にいません。' : null;
  current.current = { myTeam, candidates, confirmation, issue };
  const select = useCallback((p, event) => { focus.remember(event); setSelectedId(p.id); setSnapshot(p); setConfirmation(null); setReceipt(null); setError(null); busy.current = false; }, [focus]);
  const confirm = () => {
    const c = current.current;
    if (busy.current || !c.confirmation || c.issue) return;
    busy.current = true;
    let succeeded;
    if (c.confirmation.kind === 'dispatch') succeeded = onSendScout?.(c.confirmation.region) === true;
    else {
      const index = c.candidates.findIndex(p => p.id === c.confirmation.playerId);
      if (index < 0) { busy.current = false; return; }
      succeeded = (c.confirmation.kind === 'sign' ? onSignPlayer?.(index) : onRemoveScoutResult?.(index)) === true;
    }
    if (!succeeded) { busy.current = false; setConfirmation(null); setError('操作を確定できませんでした。最新の予算・候補・登録枠を確認してください。'); return; }
    setReceipt({ kind: c.confirmation.kind, playerId: c.confirmation.playerId, region: c.confirmation.region });
    setConfirmation(null); setError(null);
  };
  const open = action => { busy.current = false; setReceipt(null); setError(null); setConfirmation(action); };
  return <main className={`management-decisions ${selectedId != null && section === 'reports' ? 'decision-selected' : ''}`} data-ds="scouting-management">
    <h1>スカウト</h1><p>候補を選び、獲得条件を確認します。</p>
    <MetricBand items={[moneyMetric('編成予算の残枠', money(myTeam?.budget)), { label: '報告済みの候補', value: candidates.length, unit: '人' }, { label: '残り支配下枠', value: capacity.ok ? capacity.remainingSlots : null, unit: '人', state: 'unavailable' }]} />
    <div className="decision-picker-tabs" role="group" aria-label="スカウトの表示"><Button variant="secondary" aria-pressed={section === 'reports'} onClick={() => setSection('reports')}>報告済み候補</Button><Button variant="secondary" aria-pressed={section === 'dispatch'} onClick={() => { setSection('dispatch'); setConfirmation(null); }}>派遣先・調査中</Button></div>
    <div hidden={section !== 'reports'} className="decision-layout"><section ref={focus.list} className="decision-list" aria-label="スカウト候補一覧"><h2>報告済み候補 ({visible.length}人)</h2>
      <PlayerFilters entries={entries} filters={filters} onChange={setFilters} groups={false} searchLabel="候補の選手名" />
      <PlayerList suspended={mobileDetail || section !== 'reports'} entries={visible} selectedId={selectedId} onSelect={select} empty={!candidates.length ? '現在、報告済みの候補はいません。派遣先を選ぶと調査を依頼できます。' : undefined} />
    </section><section className="decision-detail" aria-label="スカウト候補の契約条件">
      {!selected ? <p>候補を選ぶと能力・成績・契約条件を確認できます。</p> : <>
        <Button variant="secondary" onClick={() => { setSelectedId(null); setConfirmation(null); }}>← 選手一覧に戻る</Button>
        <h3 ref={focus.heading} tabIndex={-1}>{selected.name}</h3><PlayerFacts player={selected} />
        <PlayerActions player={selected} teamName="スカウト報告" {...{ onPlayerClick, onToggleCompare, comparePlayerIds }} />
        {receipt?.playerId === selectedId && ['sign', 'remove'].includes(receipt.kind) ? <p className="decision-receipt" role="status">{receipt.kind === 'sign' ? '契約を確定しました。ファームの所属選手から起用を調整できます。' : '候補から外しました。'}</p>
          : !candidates.some(p => p.id === selectedId) ? <p role="status">この候補は現在の報告一覧にいません。所属と新しい報告を確認してください。</p> : <>
            <h3>獲得条件</h3><p>契約年俸 {salaryText(selected.salary)} / 契約残り2年 · ファーム配属</p>
            <p>確定時の控除 {money(selected.salary)} · 獲得後の予算 {Number.isFinite(myTeam?.budget) && Number.isFinite(selected.salary) ? money(myTeam.budget - selected.salary) : '— 未記録'}</p>
            <p className="decision-note">スカウト候補は年俸1年分を契約時に控除し、契約残り2年でファームに加わります。FAは年俸×年数を先払いします。</p>
            <Button disabled={Boolean(signingError(myTeam, selected, candidates))} onClick={() => open({ kind: 'sign', playerId: selected.id })}>契約条件を確認する</Button>
            {signingError(myTeam, selected, candidates) && <p className="decision-warning">{signingError(myTeam, selected, candidates)}</p>}
            <details><summary>報告の整理</summary><p>候補から外すと、この報告を再び選ぶことはできません。費用の払い戻しはありません。</p><Button variant="secondary" onClick={() => open({ kind: 'remove', playerId: selected.id })}>候補から外す</Button></details>
          </>}
      </>}
    </section></div>
    {error && <p className="decision-error" role="alert">{error}</p>}
    {confirmation && <DecisionConfirmation fallbackFocus={confirmation.kind === 'dispatch' ? dispatchHeading : focus.heading} title={confirmation.kind === 'dispatch' ? 'スカウト派遣の確認' : confirmation.kind === 'sign' ? 'スカウト契約の最終確認' : '候補削除の確認'}
      onCancel={() => setConfirmation(null)} onConfirm={confirm} confirmLabel={confirmation.kind === 'dispatch' ? '派遣を確定する' : confirmation.kind === 'sign' ? '契約を確定する' : '候補から外すことを確定'} error={issue} danger={confirmation.kind === 'remove'}>
      {confirmation.kind === 'dispatch' ? <><p>{confirmation.region.name} · 派遣費用 {money(confirmation.region.cost)}</p><p>派遣後の予算 {money(myTeam.budget - confirmation.region.cost)}</p><p>確定時に派遣費用を差し引きます。派遣の取消・返金はできません。</p></>
        : <><p>{selected?.name}</p>{confirmation.kind === 'sign' ? <><p>年俸 {salaryText(selected?.salary)} · 契約残り2年 · ファーム配属</p><p>確定時の控除 {money(selected?.salary)} · 獲得後の予算 {money(myTeam.budget - selected?.salary)}</p></> : <p>この候補を報告一覧から削除します。所属・予算は変わりません。削除の取消はできません。</p>}</>}
    </DecisionConfirmation>}
    {receipt?.kind === 'dispatch' && <p className="decision-receipt" role="status">{receipt.region.name}へ派遣しました。報告が届くと候補一覧へ追加されます。</p>}
    {section === 'dispatch' && <><section aria-label="スカウト派遣先"><h2 ref={dispatchHeading} tabIndex={-1}>スカウト派遣</h2><div className="decision-teams">
      {scoutRegions.map(region => <div key={region.id}><h3>{region.name}</h3><p>費用 {money(region.cost)}</p><p className="decision-note">候補の能力帯 Lv{region.qMin}–{region.qMax}（能力・成果を保証する値ではありません）</p>
        <Button variant="secondary" disabled={!Number.isFinite(myTeam?.budget) || myTeam.budget < region.cost} onClick={() => open({ kind: 'dispatch', region })}>{region.name}への派遣を検討</Button>
        {(!Number.isFinite(myTeam?.budget) || myTeam.budget < region.cost) && <p className="decision-note">予算不足・未記録のため派遣できません。</p>}</div>)}
    </div></section>
    {(myTeam?.scoutMissions || []).length > 0 && <section><h2>調査中</h2>{myTeam.scoutMissions.map((m, i) => <p key={m.id ?? i}>{m.name} · 報告待ち</p>)}</section>}</>}
    <p className="decision-note">保存された報告を表示しています。成績の0は実測値、「未記録」は欠測、「—」は算出できない率です。</p>
  </main>;
}
