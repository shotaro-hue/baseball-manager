import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../design-system/primitives';
import './reading.css';
export function useReadingSelection(items, getKey = item => item.id) {
  const [selectedKey, setSelectedKey] = useState(null);
  const rows = useRef(new Map()),
    detailRef = useRef(null),
    listRef = useRef(null),
    origin = useRef(null);
  const selected = items.find(item => getKey(item) === selectedKey) ?? null;
  const select = item => {
    origin.current = {
      key: getKey(item),
      y: globalThis.window?.scrollY ?? 0
    };
    setSelectedKey(getKey(item));
  };
  const close = () => setSelectedKey(null);
  useLayoutEffect(() => {
    if (selectedKey == null && !origin.current) return;
    if (typeof window === 'undefined') return;
    const frame = requestAnimationFrame(() => {
      if (selected) {
        detailRef.current?.focus({
          preventScroll: true
        });
        if (window.matchMedia('(max-width: 760px)').matches) detailRef.current?.closest('.reading-detail')?.scrollIntoView({
          block: 'start'
        });
      } else {
        const previous = origin.current;
        if (previous) {
          (rows.current.get(previous.key) ?? listRef.current)?.focus({
            preventScroll: true
          });
          window.scrollTo(0, previous.y);
        }
        origin.current = null;
        if (selectedKey != null) setSelectedKey(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedKey, Boolean(selected)]);
  return {
    selected,
    selectedKey,
    select,
    close,
    detailRef,
    listRef,
    rowRef: key => node => {
      if (node) rows.current.set(key, node);else rows.current.delete(key);
    }
  };
}
export function ReadingList({
  items,
  getKey = item => item.id,
  searchText,
  renderItem,
  selection,
  label,
  emptyText = 'この条件に該当する項目はありません。'
}) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const filtered = query.trim() ? items.filter(item => searchText(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : items;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 40) - 1));
  const start = currentPage * 40;
  return <>
    <label className="reading-search">{label}を検索<input ref={selection?.listRef} type="search" value={query} onChange={event => {
        setQuery(event.target.value);
        setPage(0);
      }} /></label>
    <p className="reading-count" role="status">{filtered.length ? start + 1 : 0}–{Math.min(start + 40, filtered.length)} / {filtered.length}件</p>
    {!filtered.length && <p className="reading-empty">{query.trim() ? 'この条件に該当する項目はありません。' : emptyText}</p>}
    <div className="reading-rows">
      {filtered.slice(start, start + 40).map(item => selection ? <button type="button" key={getKey(item)} ref={selection.rowRef(getKey(item))} className="reading-row" aria-pressed={selection.selectedKey === getKey(item)} onClick={() => selection.select(item)}>{renderItem(item)}</button> : <div key={getKey(item)} className="reading-entry">{renderItem(item)}</div>)}
    </div>
    {filtered.length > 40 && <nav className="reading-pagination" aria-label={label + 'のページ'}>
      <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前の40件</Button>
      <span>{currentPage + 1} / {Math.ceil(filtered.length / 40)}</span>
      <Button variant="secondary" disabled={start + 40 >= filtered.length} onClick={() => setPage(currentPage + 1)}>次の40件</Button>
    </nav>}
  </>;
}
export function ReadingFilters({
  options,
  value,
  onChange,
  label
}) {
  return <div className="reading-filters" role="group" aria-label={label}>{options.map(([id, text]) => <Button key={id} variant="secondary" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</Button>)}</div>;
}
export function ReadingDetail({
  selection,
  title,
  children
}) {
  return <section className="reading-detail" aria-label={title}>
    <Button variant="secondary" onClick={selection.close}>一覧に戻る</Button>
    <h2 ref={selection.detailRef} tabIndex={-1}>{title}</h2>{children}
  </section>;
}
