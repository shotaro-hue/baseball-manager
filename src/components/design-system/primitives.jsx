import React, { useId } from 'react';
import './foundation.css';

// Each primitive owns its token scope. Importing this module never themes a page.
export function Button({ variant = 'primary', type = 'button', ...props }) {
  return <button {...props} type={type} data-ds="button" data-variant={variant} />;
}

export function StateLabel({ tone = 'neutral', children, ...props }) {
  const role = tone === 'danger' ? 'alert' : ['processing', 'success'].includes(tone) ? 'status' : undefined;
  return <span {...props} data-ds="state" data-tone={tone} role={props.role ?? role}>{children}</span>;
}

const METRIC_STATES = { unrecorded: '未記録', unavailable: '算出不可', excluded: '対象外' };
export function MetricBand({ items, ...props }) {
  return <dl {...props} data-ds="metrics" data-count={items.length}>
    {items.map(({ label, value, unit, state = 'unrecorded', reason }, index) => <div key={index}>
      <dt>{label}</dt>
      <dd>{value == null ? '—' : value}{value != null && unit && <small>{unit}</small>}</dd>
      {value == null && <p data-ds-metric-reason>{METRIC_STATES[state] ?? METRIC_STATES.unrecorded}{reason && ` · ${reason}`}</p>}
    </div>)}
  </dl>;
}

export function Section({ title, headingId, children, ...props }) {
  const generatedId = useId();
  const id = headingId ?? generatedId;
  return <section {...props} data-ds="section" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>{children}
  </section>;
}

// Callers own table semantics, formatting and sorting. Only the frame scrolls.
export function DataTableFrame({ label, stickyColumn = 1, children, ...props }) {
  return <div {...props} data-ds="table" data-sticky-column={stickyColumn} role="region" aria-label={label} tabIndex={0}>
    {children}
  </div>;
}
