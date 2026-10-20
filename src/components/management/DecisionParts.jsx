import { useEffect, useRef } from 'react';
import { fmtSal, scoutNoise } from '../../utils';
import { contractSalaryStatus } from '../../engine/contractPayroll';
import { marketMetrics } from '../hub/faMarket';
import { Button } from '../design-system/primitives';
import './management-decisions.css';

export const money = value => Number.isFinite(value) ? fmtSal(value) : '— 未記録';
// Keep fmtSal's number and unit, with the design system's smaller unit type.
export function moneyMetric(label, formatted) {
  const match = /^([-\d.,]+)(億円|万円|円)$/.exec(formatted);
  return { label, value: match ? match[1] : formatted, unit: match?.[2] };
}
export const salaryText = value => contractSalaryStatus(value) === 'recorded' ? fmtSal(value)
  : contractSalaryStatus(value) === 'missing' ? '— 未記録' : '— 不正値';

export function PlayerFacts({ player, noisy = false }) {
  const ability = player.isPitcher ? [['球速', 'velocity'], ['制球', 'control'], ['スタミナ', 'stamina']]
    : [['ミート', 'contact'], ['長打', 'power'], ['走力', 'speed']];
  const values = player.isPitcher ? player.pitching : player.batting;
  return <>
    <p className="decision-note">{player.pos || '役割未記録'} · {player.age ?? '未記録'}歳 · 現年俸 {salaryText(player.salary)} · 契約残り {Number.isFinite(player.contractYearsLeft) ? `${player.contractYearsLeft}年` : '未記録'}</p>
    <div className="decision-facts" aria-label="保存された一軍成績">{marketMetrics(player).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div>
    <p className="decision-note">{noisy ? 'スカウト評価（誤差を含む）' : '能力'}：{ability.map(([label, key]) => `${label} ${Number.isFinite(values?.[key]) ? noisy ? scoutNoise(values[key], player.id, key) : values[key] : '未記録'}`).join(' · ')}</p>
  </>;
}

export function PlayerActions({ player, teamName, onPlayerClick, onToggleCompare, comparePlayerIds = [] }) {
  return <div className="decision-actions">
    {onPlayerClick && <Button variant="secondary" onClick={() => onPlayerClick(player, teamName)}>選手詳細・年度別成績</Button>}
    {onToggleCompare && <Button variant="secondary" aria-pressed={comparePlayerIds.includes(player.id)} onClick={() => onToggleCompare(player, teamName)}>{comparePlayerIds.includes(player.id) ? '比較から外す' : '比較に追加'}</Button>}
  </div>;
}

// Inline confirmation: no new game state or nested dialog is introduced.
export function DecisionConfirmation({ title, children, onCancel, onConfirm, confirmLabel, error, danger = false, fallbackFocus }) {
  const heading = useRef(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const opener = document.activeElement;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'nearest' });
    return () => {
      const available = node => node?.isConnected && !node.closest('[hidden]') && node.getClientRects().length > 0;
      const target = available(opener) ? opener : available(fallbackFocus?.current) ? fallbackFocus.current : null;
      target?.focus({ preventScroll: true });
    };
  }, []);
  return <section className="decision-confirm" role="region" aria-label={title} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  }}>
    <h3 ref={heading} tabIndex={-1}>{title}</h3>{children}
    {error && <p className="decision-warning" role="alert">{error}</p>}
    <div className="decision-actions"><Button variant="secondary" onClick={onCancel}>戻って見直す</Button>
      <Button data-danger={danger || undefined} disabled={Boolean(error)} onClick={onConfirm}>{confirmLabel}</Button></div>
  </section>;
}

export function useDecisionReturn(selected, active = true) {
  const heading = useRef(null), opener = useRef(null), scroll = useRef(0);
  const previous = useRef(selected);
  useEffect(() => {
    if (typeof window === 'undefined' || !active || previous.current === selected) return;
    previous.current = selected;
    if (selected != null) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({ block: 'nearest' });
    } else {
      if (opener.current?.isConnected && !opener.current.closest('[hidden]')) opener.current.focus({ preventScroll: true });
      window.scrollTo(0, scroll.current);
    }
  }, [selected, active]);
  return { heading, remember: event => { opener.current = event?.currentTarget; scroll.current = typeof window === 'undefined' ? 0 : window.scrollY; } };
}
