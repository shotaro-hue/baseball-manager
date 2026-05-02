import React from 'react';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatFiniteValue(value) {
  if (!isFiniteNumber(value)) return null;
  return Math.round(value * 100) / 100;
}

function collectRows(physicsMeta) {
  if (!physicsMeta || typeof physicsMeta !== 'object' || Array.isArray(physicsMeta)) {
    return [];
  }

  const rows = [
    { label: 'EV', value: formatFiniteValue(physicsMeta?.physics?.ev), unit: 'km/h' },
    { label: 'LA', value: formatFiniteValue(physicsMeta?.physics?.la), unit: '°' },
    { label: '飛距離', value: formatFiniteValue(physicsMeta?.physics?.distance), unit: 'm' },
    { label: '滞空時間', value: formatFiniteValue(physicsMeta?.physics?.hangTime), unit: 's' },
    { label: '球場係数', value: formatFiniteValue(physicsMeta?.park?.factor), unit: '' },
    { label: 'フェンス補正', value: formatFiniteValue(physicsMeta?.park?.fenceAdjustment), unit: '' },
    { label: 'クロス球場補正', value: formatFiniteValue(physicsMeta?.crossPark?.adjustment), unit: '' },
    { label: '風速', value: formatFiniteValue(physicsMeta?.environment?.windSpeed), unit: 'm/s' },
    { label: '気温', value: formatFiniteValue(physicsMeta?.environment?.temperature), unit: '℃' },
    { label: 'コメント係数', value: formatFiniteValue(physicsMeta?.commentary?.impact), unit: '' },
  ];

  return rows.filter((row) => row.value !== null);
}

export default function PhysicsInsightPanel({ physicsMeta }) {
  const rows = collectRows(physicsMeta);
  if (rows.length === 0) return null;

  return (
    <div className="card2" style={{ margin: '8px 0' }}>
      {/* 受信済みデータの主要値のみを表示。UI側で再計算しない。 */}
      <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '.15em', marginBottom: 6, textTransform: 'uppercase' }}>
        physics insight
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ fontSize: 11, color: '#1e2d3d' }}>
            <span style={{ color: '#64748b', marginRight: 4 }}>{row.label}:</span>
            <span style={{ fontFamily: 'monospace' }}>{row.value}{row.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
