import React, { useMemo, useRef, useState } from 'react';
import { Button, StateLabel, Section } from '../design-system/primitives';
import { ReadingList, ReadingFilters, ReadingDetail, useReadingSelection } from '../reading/ReadingParts';
export function NewsTab({
  news = [],
  transfers = [],
  onInterview,
  currentYear
}) {
  const selection = useReadingSelection(news),
    selected = selection.selected;
  const [filter, setFilter] = useState('all'),
    [transferYear, setTransferYear] = useState('all'),
    [error, setError] = useState(null);
  const answered = useRef(new Set());
  const years = useMemo(() => [...new Set(transfers.map(t => t?.year).filter(Boolean))].sort((a, b) => b - a), [transfers]);
  const shown = news.filter(n => filter === 'waiting' ? n.type === 'interview' && !n.answered : filter === 'answered' ? n.type === 'interview' && n.answered : true);
  const filteredTransfers = transfers.filter(t => transferYear === 'all' || String(t.year) === transferYear);
  const answer = opt => {
    if (answered.current.has(selected.id) || selected.answered) return;
    if (onInterview?.(selected.id, opt) === true) answered.current.add(selected.id);else setError('回答を確定できませんでした。最新の記事と球団の状態を確認してください。');
  };
  return <main className="club-reading" data-ds="news"><h1>ニュース</h1>
    <p className="reading-muted">球界の動向と記者会見。回答待ち {news.filter(n => n.type === 'interview' && !n.answered).length}件</p>
    <div className="reading-workspace" data-detail={Boolean(selected)}>
      <section className="reading-list" aria-label="ニュースの一覧">
        <ReadingFilters label="ニュースの絞り込み" options={[['all', 'すべて'], ['waiting', '回答待ち'], ['answered', '回答済み']]} value={filter} onChange={value => {
          setFilter(value);
          selection.close();
        }} />
        <ReadingList key={filter} items={shown} label="ニュース" selection={{
          ...selection,
          select: item => {
            setError(null);
            selection.select(item);
          }
        }} searchText={n => [n.headline, n.source].join(' ')} renderItem={n => <><strong>{n.headline}</strong>{n.type === 'interview' && <span className="reading-status"><StateLabel tone={n.answered ? 'neutral' : 'warning'}>{n.answered ? '回答済み' : '回答待ち'}</StateLabel></span>}<small>{n.source} · {n.dateLabel}</small></>} />
      </section>
      {selected && <ReadingDetail selection={selection} title={selected.headline}>
        <p className="reading-muted">{selected.source} · {selected.dateLabel}</p>
        <p className="reading-body">{selected.body}</p>
        {selected.type === 'interview' && (selected.answered ? <StateLabel>回答済み</StateLabel> : <>
          <h3>記者からの質問</h3><p>{selected.question}</p><p className="reading-muted">回答は球団人気・選手モラルに影響します。</p>
          <div className="reading-choices">{selected.options?.map((opt, i) => <Button key={i} variant="secondary" disabled={answered.current.has(selected.id)} onClick={() => answer(opt)}>
            {opt.text}<small>人気 {opt.popMod >= 0 ? '+' : ''}{opt.popMod} ／ モラル {opt.moraleMod >= 0 ? '+' : ''}{opt.moraleMod}</small>
          </Button>)}</div>{error && <p role="alert">{error}</p>}
        </>)}
      </ReadingDetail>}
    </div>
    <Section className="reading-section" title="球界移籍トラッカー">
      <p className="reading-muted">シーズン中の全球団トレード履歴。金銭は万円単位です。</p>
      <label className="reading-year">移籍の年度<select value={transferYear} onChange={e => setTransferYear(e.target.value)}>
        <option value="all">全年度</option>{years.map(y => <option key={y} value={String(y)}>{y}年{y === currentYear ? '（今季）' : ''}</option>)}
      </select></label>
      <ReadingList key={transferYear} items={filteredTransfers} label="移籍履歴" emptyText="この年度の移籍ログはまだありません" searchText={t => [t.headline, ...(t.playersIn ?? []), ...(t.playersOut ?? [])].join(' ')} renderItem={item => {
        const cash = typeof item.cash === 'number' || typeof item.cash === 'string' ? Number(item.cash) : NaN;
        return <details key={item.id}>
        <summary>{item.headline || 'トレード'} · {item.year}年 {item.day ? `${item.day}日目` : ''}</summary>
        <p>IN: {(item.playersIn || []).join('、') || 'なし'} / OUT: {(item.playersOut || []).join('、') || 'なし'}</p>
        {Number.isFinite(cash) && cash !== 0 && <p>{cash > 0 ? '金銭支払い' : '金銭受取'} {Math.abs(cash).toLocaleString()}万円</p>}
        {item.detail && <p className="reading-body">{item.detail}</p>}
      </details>;
      }} />
    </Section>
  </main>;
}
