import React from "react";

const HIT_TYPE_STYLES = {
  single: { color: "#f59e0b", label: "単打" },
  double: { color: "#3b82f6", label: "二塁打" },
  triple: { color: "#facc15", label: "三塁打" },
  homeRun: { color: "#f472b6", label: "本塁打" },
  out: { color: "#9ca3af", label: "アウト" },
};

const DEFAULT_STYLE = { color: "#6b7280", label: "その他" };
const CHART_SIZE = 260;
const CHART_PADDING = 18;
const DOT_RADIUS = 4;

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];

  return events
    .map((event, index) => {
      const x = Number(event?.x);
      const y = Number(event?.y);
      const hitType = typeof event?.hitType === "string" ? event.hitType : "out";

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return {
        id: event?.id ?? `spray-${index}`,
        x,
        y,
        hitType,
      };
    })
    .filter(Boolean);
}

export function SprayChart({ events }) {
  const safeEvents = sanitizeEvents(events);

  if (safeEvents.length === 0) {
    return (
      <div className="card" style={{ marginTop: 10 }}>
        <div className="card-h">スプレーチャート</div>
        <div style={{ fontSize: 12, color: "#9ca3af", padding: "12px 2px" }}>打球データなし</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="card-h">スプレーチャート</div>
      <svg viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} width="100%" height="260" role="img" aria-label="打球方向チャート">
        <rect x="0" y="0" width={CHART_SIZE} height={CHART_SIZE} fill="rgba(255,255,255,0.02)" rx="8" />
        <line x1={CHART_SIZE / 2} y1={CHART_SIZE - CHART_PADDING} x2={CHART_PADDING} y2={CHART_PADDING} stroke="rgba(255,255,255,0.12)" />
        <line x1={CHART_SIZE / 2} y1={CHART_SIZE - CHART_PADDING} x2={CHART_SIZE - CHART_PADDING} y2={CHART_PADDING} stroke="rgba(255,255,255,0.12)" />

        {safeEvents.map((event) => {
          const style = HIT_TYPE_STYLES[event.hitType] ?? DEFAULT_STYLE;
          const clampedX = Math.min(100, Math.max(0, event.x));
          const clampedY = Math.min(100, Math.max(0, event.y));
          const px = CHART_PADDING + (clampedX / 100) * (CHART_SIZE - CHART_PADDING * 2);
          const py = CHART_SIZE - CHART_PADDING - (clampedY / 100) * (CHART_SIZE - CHART_PADDING * 2);

          return <circle key={event.id} cx={px} cy={py} r={DOT_RADIUS} fill={style.color} opacity={0.72} />;
        })}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {Object.entries(HIT_TYPE_STYLES).map(([key, item]) => (
          <div key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#cbd5e1" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
