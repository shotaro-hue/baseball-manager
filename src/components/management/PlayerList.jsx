import { memo, useSyncExternalStore } from 'react';
import { salaryText } from './DecisionParts';
import { GROUP_LABELS } from './playerListModel';

const subscribe = callback => {
  if (typeof window === 'undefined') return () => {};
  const query = window.matchMedia('(max-width: 760px)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const mobileSnapshot = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
export const useMobileDetail = selectedId => useSyncExternalStore(subscribe, mobileSnapshot, () => false) && selectedId != null;

export function PlayerFilters({ filters, onChange, entries, children, groups = true, expiry = false, searchLabel = '選手名' }) {
  const positions = [...new Set(entries.map(e => e.player.pos).filter(Boolean))];
  const change = (key, value, event) => {
    const section = event.currentTarget?.closest('[data-player-controls]');
    if (section?.getBoundingClientRect().top < 80) section.scrollIntoView({ block: 'start', behavior: 'instant' });
    onChange({ ...filters, [key]: value });
  };
  return <div className="player-list-filters" data-player-controls>
    <label>{searchLabel}<input type="search" value={filters.search} onChange={e => change('search', e.target.value, e)} /></label>
    {children}
    <details><summary>絞り込み・並び順</summary><div className="decision-fields">
      {groups && <label>所属<select aria-label="所属" value={filters.group} onChange={e => change('group', e.target.value, e)}><option value="all">一軍・二軍・育成</option>{Object.entries(GROUP_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <label>ポジション<select aria-label="ポジション" value={filters.position} onChange={e => change('position', e.target.value, e)}><option value="all">全ポジション</option>{positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></label>
      <label>並び順<select aria-label="並び順" value={filters.sort} onChange={e => change('sort', e.target.value, e)}><option value="default">一覧の順</option><option value="salary-desc">年俸が高い順</option><option value="salary-asc">年俸が安い順</option><option value="age">年齢が若い順</option>{expiry && <option value="expiry">契約満了が近い順</option>}</select></label>
    </div></details>
  </div>;
}

const PlayerRow = memo(function PlayerRow({ entry, selected, checked, onSelect, onToggle, actionLabel, toggleLabel }) {
  const p = entry.player;
  const content = <><strong>{p.name || '氏名未記録'}</strong><span className="player-list-salary">{salaryText(p.salary)}</span>
    <small>{[GROUP_LABELS[entry.group], p.pos, `${p.age ?? '未記録'}歳`, entry.status, entry.evaluation != null && `評価 ${entry.evaluation}`].filter(Boolean).join(' · ')}</small></>;
  const button = <button type="button" className={`player-list-row${onToggle ? ' player-list-open' : ''}`} data-player-id={String(p.id)} aria-label={`${p.name}${actionLabel}`} aria-current={selected || undefined} onClick={event => onSelect(p, event)}>{content}</button>;
  return onToggle ? <div className="player-list-choice"><label><input type="checkbox" aria-label={`${p.name}を${toggleLabel}に選ぶ`} checked={checked} onChange={() => onToggle(p)} /><span className="sr-only">{p.name}</span></label>{button}</div> : button;
});

export const PlayerList = memo(function PlayerList({ entries, selectedId, selectedIds = [], onSelect, onToggle, actionLabel = 'の条件を見る', toggleLabel, suspended = false, empty = 'この条件に該当する選手はいません。絞り込みを変更してください。' }) {
  return <div className="player-list" data-player-list>
    {!suspended && (entries.length === 0 ? <p>{empty}</p> : entries.map(entry => <PlayerRow key={entry.player.id} entry={entry} selected={entry.player.id === selectedId} checked={selectedIds.includes(entry.player.id)} {...{ onSelect, onToggle, actionLabel, toggleLabel }} />))}
  </div>;
});
