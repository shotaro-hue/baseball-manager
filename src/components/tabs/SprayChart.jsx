import React from "react";

const HIT_TYPE_STYLES = {
  single: { color: "#f59e0b", label: "単打" },
  double: { color: "#3b82f6", label: "二塁打" },
  triple: { color: "#facc15", label: "三塁打" },
  homeRun: { color: "#f472b6", label: "本塁打" },
  out: { color: "#9ca3af", label: "アウト" },
};

const DEFAULT_STYLE = { color: "#6b7280", label: "その他" };
const DEFAULT_FENCE_RATIO = 0.84;
const CHART_SIZE = 260;
const CHART_PADDING = 18;
const DOT_RADIUS = 4;
const FOUL_ANGLE_RAD = Math.PI / 4;
const HOME_X = CHART_SIZE / 2;
const HOME_Y = CHART_SIZE - CHART_PADDING;
const FIELD_RADIUS = CHART_SIZE / 2 - CHART_PADDING;
const WARNING_TRACK_RADIUS = FIELD_RADIUS * 0.92;
const INFIELD_RADIUS = FIELD_RADIUS * 0.42;

function normalizeCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  // 0〜1 保存形式と 0〜100 旧形式の両方を吸収する
  if (numeric >= 0 && numeric <= 1) return numeric;
  if (numeric >= 0 && numeric <= 100) return numeric / 100;
  return null;
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];

  return events
    .map((event, index) => {
      const x = normalizeCoordinate(event?.x);
      const y = normalizeCoordinate(event?.y);
      const hitType = typeof event?.hitType === "string" ? event.hitType : "out";

      const rawFenceRatio = Number(event?.fenceRatio);
      const fenceRatio = Number.isFinite(rawFenceRatio)
        ? Math.min(0.95, Math.max(0.55, rawFenceRatio))
        : DEFAULT_FENCE_RATIO;

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      const rawClearance = Number(event?.hrClearance);
      const hrClearance = Number.isFinite(rawClearance) ? rawClearance : null;
      const rawFenceDistance = Number(event?.fenceDistance);
      const fenceDistance = Number.isFinite(rawFenceDistance) ? rawFenceDistance : null;

      const warningReasons = Array.isArray(event?.warningReasons)
        ? event.warningReasons.filter((reason) => typeof reason === "string" && reason.length > 0)
        : [];

      return {
        id: event?.id ?? `spray-${index}`,
        x,
        y,
        hitType,
        fenceRatio,
        hrClearance,
        fenceDistance,
        isDisplayInconsistent: Boolean(event?.isDisplayInconsistent) || warningReasons.length > 0,
        warningReasons,
      };
    })
    .filter(Boolean);
}

function polarToPoint(angleRad, radius) {
  return {
    x: HOME_X + radius * Math.cos(angleRad),
    y: HOME_Y - radius * Math.sin(angleRad),
  };
}

function toChartPoint(event) {
  const clampedX = Math.min(1, Math.max(0, event.x));
  const clampedY = Math.min(1, Math.max(0, event.y));
  const angle = Math.PI - FOUL_ANGLE_RAD - clampedX * (Math.PI - FOUL_ANGLE_RAD * 2);
  const radius = clampedY * FIELD_RADIUS;
  return polarToPoint(angle, radius);
}

export function SprayChart({ events }) {
  const safeEvents = sanitizeEvents(events);
  const avgFenceRatio =
  safeEvents.length > 0
    ? safeEvents.reduce((sum, event) => sum + (Number.isFinite(event.fenceRatio) ? event.fenceRatio : DEFAULT_FENCE_RATIO), 0) / safeEvents.length
    : DEFAULT_FENCE_RATIO;
  
  const fenceRadius = FIELD_RADIUS * avgFenceRatio;
  const warningTrackRadius = fenceRadius * 0.92;
  
  const leftFoulPoint = polarToPoint(Math.PI - FOUL_ANGLE_RAD, fenceRadius);
  const rightFoulPoint = polarToPoint(FOUL_ANGLE_RAD, fenceRadius);
  const infieldLeftPoint = polarToPoint(Math.PI - FOUL_ANGLE_RAD, INFIELD_RADIUS);
  const infieldRightPoint = polarToPoint(FOUL_ANGLE_RAD, INFIELD_RADIUS);
  const warnings = safeEvents
    .filter((event) => event.isDisplayInconsistent)
    .flatMap((event) => event.warningReasons.map((reason) => `${event.id}: ${reason}`));

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

        {/* 外野芝 */}
        <path
          d={`M ${leftFoulPoint.x} ${leftFoulPoint.y} A ${fenceRadius} ${fenceRadius} 0 0 1 ${rightFoulPoint.x} ${rightFoulPoint.y} L ${HOME_X} ${HOME_Y} Z`}
          fill="rgba(34,197,94,0.08)"
          stroke="rgba(74,222,128,0.22)"
          strokeWidth="1"
        />

        {/* フェンス【＝本塁打ライン】 */}
        <path
          d={`M ${leftFoulPoint.x} ${leftFoulPoint.y} A ${fenceRadius} ${fenceRadius} 0 0 1 ${rightFoulPoint.x} ${rightFoulPoint.y}`}
          fill="none"
          stroke="rgba(248,113,113,0.9)"
          strokeWidth="2.2"
        />

        {/* ウォーニングトラック【＝フェンス手前の帯】 */}
        <path
          d={`M ${polarToPoint(Math.PI - FOUL_ANGLE_RAD, warningTrackRadius).x} ${polarToPoint(Math.PI - FOUL_ANGLE_RAD, warningTrackRadius).y} A ${warningTrackRadius} ${warningTrackRadius} 0 0 1 ${polarToPoint(FOUL_ANGLE_RAD, warningTrackRadius).x} ${polarToPoint(FOUL_ANGLE_RAD, warningTrackRadius).y}`}
          fill="none"
          stroke="rgba(251,191,36,0.35)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />

        {/* ファウルライン */}
        <line x1={HOME_X} y1={HOME_Y} x2={leftFoulPoint.x} y2={leftFoulPoint.y} stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
        <line x1={HOME_X} y1={HOME_Y} x2={rightFoulPoint.x} y2={rightFoulPoint.y} stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />

        {/* 内野弧 */}
        <path
          d={`M ${infieldLeftPoint.x} ${infieldLeftPoint.y} A ${INFIELD_RADIUS} ${INFIELD_RADIUS} 0 0 1 ${infieldRightPoint.x} ${infieldRightPoint.y}`}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />

        {safeEvents.map((event) => {
          const style = HIT_TYPE_STYLES[event.hitType] ?? DEFAULT_STYLE;
          const point = toChartPoint(event);
          const titleText = event.hitType === "homeRun"
            ? `本塁打: クリアランス【＝フェンス超過高】${event.hrClearance ?? "N/A"}m / フェンス${event.fenceDistance ?? "N/A"}m`
            : `${style.label}: 推定飛距離プロット`;
          return (
            <circle key={event.id} cx={point.x} cy={point.y} r={DOT_RADIUS} fill={style.color} opacity={0.78}>
              <title>{titleText}</title>
            </circle>
          );
        })}
      </svg>

      {warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#fca5a5", lineHeight: 1.5 }}>
          <div>表示警告: {warnings.length}件</div>
          {warnings.slice(0, 3).map((warning) => (
            <div key={warning}>- {warning}</div>
          ))}
        </div>
      )}

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
