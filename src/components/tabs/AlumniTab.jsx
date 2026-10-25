import React from 'react';
import { CareerTable } from './CareerTable';
import { StateLabel } from '../design-system/primitives';
import { ReadingList, ReadingDetail, useReadingSelection } from '../reading/ReadingParts';
const entryKey = p => JSON.stringify([p.id, p.exitYear, p.exitReason]);
export function AlumniTab({
  myTeam,
  year,
  saveId
}) {
  const history = [...(myTeam?.history ?? [])].sort((a, b) => (b.tenure ?? 0) - (a.tenure ?? 0));
  const selection = useReadingSelection(history, entryKey),
    selected = selection.selected;
  return <main className="club-reading" data-ds="alumni"><h1>OB・歴代選手</h1>
    <p className="reading-muted">退団・引退した{history.length}人。在籍年数の長い順に表示しています。</p>
    <div className="reading-workspace" data-detail={Boolean(selected)}>
      <section className="reading-list" aria-label="歴代選手の一覧">
        {!history.length && <p className="reading-empty">まだ退団・引退選手はいません</p>}
        <ReadingList items={history} getKey={entryKey} label="歴代選手" selection={selection} searchText={p => [p.name, p.pos, p.exitReason, p.exitYear].join(' ')} renderItem={p => <><strong>{p.name} · {p.pos}</strong><span className="reading-status"><StateLabel>{p.exitReason || '退団'}</StateLabel></span><small>{p.exitYear ?? '—'}年退団 · {p.tenure ?? '—'}年在籍</small></>} />
      </section>
      {selected && <ReadingDetail selection={selection} title={selected.name}>
        <p className="reading-muted">{selected.pos} · {selected.age != null ? `${selected.age}歳 · ` : ''}{selected.exitYear ?? '—'}年退団 · {selected.exitReason} · 在籍{selected.tenure ?? '—'}年</p>
        <div className="reading-career"><CareerTable player={selected} year={year} teamId={myTeam?.id} teamName={myTeam?.name} saveId={saveId} /></div>
      </ReadingDetail>}
    </div>
  </main>;
}
