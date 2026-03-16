import { PVAL_DEFS } from '../constants';

/* ═══════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════ */

export function OV({ v }) {
  const c = v >= 85 ? "#ffd700" : v >= 75 ? "#34d399" : v >= 62 ? "#60a5fa" : v >= 50 ? "#94a3b8" : "#f87171";
  return <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 13, color: c, fontWeight: 700 }}>{v}</span>;
}

export function CondBadge({ p }) {
  if (p?.injury) return <span className="inj-badge">🤕{p.injury}</span>;
  const c = (p?.condition || 100) >= 80 ? "#34d399" : (p?.condition || 100) >= 60 ? "#f5c842" : "#f87171";
  return <span style={{ fontSize: 9, color: c }}>●{p?.condition || 100}</span>;
}

export function HandBadge({ p }) {
  if (!p?.isPitcher) return null;
  const isLeft = p.hand === "left";
  return (
    <span style={{
      fontSize: 9, fontFamily: "'Share Tech Mono',monospace",
      background: isLeft ? "rgba(167,139,250,.15)" : "rgba(96,165,250,.12)",
      color: isLeft ? "#a78bfa" : "#60a5fa",
      border: `1px solid ${isLeft ? "rgba(167,139,250,.4)" : "rgba(96,165,250,.3)"}`,
      borderRadius: 3, padding: "0px 4px", marginLeft: 4, fontWeight: 700,
    }}>
      {isLeft ? "左" : "右"}
    </span>
  );
}

export function PersonalityView({ p }) {
  return (
    <div style={{ marginTop: 8 }}>
      {PVAL_DEFS.map((d) => (
        <div key={d.k} className="pval-bar">
          <div className="pval-lbl">{d.lbl}</div>
          <div className="pval-track">
            <div className="pval-fill" style={{ width: `${p.personality[d.k]}%`, background: d.color }} />
          </div>
          <div className="pval-num" style={{ color: d.color }}>{p.personality[d.k]}</div>
        </div>
      ))}
    </div>
  );
}

// セイバーメトリクスの解説ツールチップ付きテーブルヘッダー
const STAT_TIPS = {
  "打席": { en: "PA", desc: "打席に立った回数" },
  "打率": { en: "AVG", desc: "安打 ÷ 打数。打者の基本指標" },
  "OPS":  { en: "OPS", desc: "出塁率+長打率。総合力の指標" },
  "wOBA": { en: "wOBA", desc: "各打撃結果を重み付けした出塁貢献度" },
  "wRC+": { en: "wRC+", desc: "リーグ平均を100とした得点創出力" },
  "ISO":  { en: "ISO", desc: "長打率-打率。純粋な長打力" },
  "BABIP":{ en: "BABIP", desc: "フェアゾーン打球の安打率。運の指標" },
  "四球率": { en: "BB%", desc: "打席における四球の割合" },
  "三振率": { en: "K%", desc: "打席における三振の割合" },
  "打球速度": { en: "Exit Velo", desc: "打球の初速（km/h）" },
  "打球角度": { en: "Launch Angle", desc: "打球の角度（度）" },
  "WAR":   { en: "WAR", desc: "代替選手との勝利貢献差" },
  "投球回": { en: "IP", desc: "投球した回数" },
  "防御率": { en: "ERA", desc: "9イニングあたりの自責点" },
  "WHIP":  { en: "WHIP", desc: "1イニングあたり出塁許可数" },
  "FIP":   { en: "FIP", desc: "守備に依存しない投手の真の実力指標" },
  "xFIP":  { en: "xFIP", desc: "被本塁打をリーグ平均に補正したFIP" },
};

export function ThCell({ label, openLabel, onOpen }) {
  const tip = STAT_TIPS[label];
  const isOpen = openLabel === label;
  return (
    <th
      style={{ position: "relative", cursor: tip ? "pointer" : "default" }}
      onClick={() => { if (tip) onOpen(isOpen ? null : label); }}
    >
      {label}
      {tip && <span style={{ fontSize: 8, color: "#60a5fa", marginLeft: 2 }}>ⓘ</span>}
      {isOpen && tip && (
        <div style={{
          position: "absolute", top: "100%", left: 0,
          background: "#0d2030", border: "1px solid rgba(96,165,250,.3)",
          borderRadius: 8, padding: "8px 11px", zIndex: 200, width: 180,
          boxShadow: "0 8px 24px rgba(0,0,0,.6)", marginTop: 4,
          animation: "fi .15s", pointerEvents: "none",
        }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#60a5fa", marginBottom: 3 }}>{tip.en}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, lineHeight: 1.5, whiteSpace: "normal", textAlign: "left" }}>{tip.desc}</div>
        </div>
      )}
    </th>
  );
}
