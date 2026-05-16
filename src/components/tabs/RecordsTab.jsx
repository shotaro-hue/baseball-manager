import React, { useState } from "react";

export function RecordsTab({ history }) {
  const [subTab, setSubTab] = useState("awards");
  const { awards = [], records = {}, hallOfFame = [], championships = [], standingsHistory = [] } = history || {};
  const latest = awards.length > 0 ? awards[awards.length - 1] : null;
  const topCareerHR = Object.values(records.careerHR || {}).sort((a, b) => b.value - a.value).slice(0, 5);
  const topCareerW  = Object.values(records.careerW  || {}).sort((a, b) => b.value - a.value).slice(0, 5);

  // リーグ分割MVPの互換表示（旧: mvp={name,...}, 新: mvp={central,pacific}）
  const getMvp = (a, league) => {
    if (!a?.mvp) return null;
    if (a.mvp.central || a.mvp.pacific) return league === 'セ' ? a.mvp.central : a.mvp.pacific;
    return league === 'セ' ? a.mvp : null; // 旧形式は全体MVPをセに表示
  };

  const SUB_TABS = [
    { id: "awards",    label: "今季表彰" },
    { id: "titles",    label: "タイトル歴代" },
    { id: "career",    label: "通算記録" },
    { id: "standings", label: "年度別順位" },
    { id: "hof",       label: "殿堂" },
  ];

  return (
    <div>
      {/* サブタブナビ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ fontSize: 10, padding: "4px 10px", borderRadius: 10, cursor: "pointer", border: subTab === t.id ? "1px solid rgba(245,200,66,.5)" : "1px solid rgba(255,255,255,.08)", background: subTab === t.id ? "rgba(245,200,66,.15)" : "transparent", color: subTab === t.id ? "#f5c842" : "#6b7280" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 今季表彰 */}
      {subTab === "awards" && (
        <div>
          {latest ? (
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-h">🏆 {latest.year}年シーズン表彰</div>
              {["セ","パ"].map(lg => {
                const mvp = getMvp(latest, lg);
                return mvp ? (
                  <div key={lg} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between" }}>
                    <span><span style={{ color: "#f5c842", fontWeight: 700 }}>{lg}MVP</span> <span style={{ color: "#e0d4bf" }}>{mvp.name}</span></span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>({mvp.teamName}) OPS {mvp.OPS?.toFixed(3)}</span>
                  </div>
                ) : null;
              })}
              {latest.sawamura && (
                <div style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between" }}>
                  <span><span style={{ color: "#60a5fa", fontWeight: 700 }}>沢村賞</span> <span style={{ color: "#e0d4bf" }}>{latest.sawamura.name}</span></span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>({latest.sawamura.teamName}) {latest.sawamura.W}勝 ERA {latest.sawamura.ERA}</span>
                </div>
              )}
              {latest.rookie && (
                <div style={{ fontSize: 12, padding: "4px 0" }}>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>新人王</span>
                  <span style={{ marginLeft: 8, color: "#e0d4bf" }}>{latest.rookie.name}</span>
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>({latest.rookie.teamName})</span>
                </div>
              )}
            </div>
          ) : <div className="card"><div style={{ fontSize: 12, color: "#374151" }}>シーズン未完了</div></div>}
          {championships.length > 0 && (
            <div className="card">
              <div className="card-h">🏆 優勝履歴</div>
              {[...championships].reverse().map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ fontSize: 16 }}>🏆</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f5c842" }}>{c.year}年 日本シリーズ制覇</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{c.championName} vs {c.opponent}（{c.seriesResult}）</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* タイトル歴代 */}
      {subTab === "titles" && (
        <div>
          {standingsHistory.filter(s => s.titles).length === 0
            ? <div className="card"><div style={{ fontSize: 12, color: "#374151" }}>タイトルデータはシーズン終了後に記録されます</div></div>
            : standingsHistory.filter(s => s.titles).slice().reverse().map(snap => (
            <div key={snap.year} className="card" style={{ marginBottom: 8 }}>
              <div className="card-h">{snap.year}年</div>
              {["セ","パ"].map(lg => {
                const t = lg === "セ" ? snap.titles?.central : snap.titles?.pacific;
                if (!t) return null;
                const rows = [
                  ["首位打者", t.avg, v => v != null ? `.${String(Math.round(v*1000)).padStart(3,"0")}` : ""],
                  ["本塁打王", t.hr,  v => v != null ? `${v}本` : ""],
                  ["打点王",   t.rbi, v => v != null ? `${v}打点` : ""],
                  ["盗塁王",   t.sb,  v => v != null ? `${v}盗塁` : ""],
                  ["防御率王", t.era, v => v != null ? `${v.toFixed(2)}` : ""],
                  ["最多勝",   t.win, v => v != null ? `${v}勝` : ""],
                  ["最多奪三振",t.so, v => v != null ? `${v}K` : ""],
                  ["セーブ王", t.sv,  v => v != null ? `${v}S` : ""],
                ];
                return (
                  <div key={lg} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 3, letterSpacing: ".05em" }}>{lg}リーグ</div>
                    {rows.filter(([,r]) => r?.name).map(([label, r, fmt]) => (
                      <div key={label} className="fsb" style={{ fontSize: 11, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                        <span style={{ color: "#94a3b8", minWidth: 70 }}>{label}</span>
                        <span style={{ flex: 1, color: "#e0d4bf" }}>{r?.name}</span>
                        <span style={{ color: "#f5c842", fontSize: 10 }}>{r ? fmt(r.value) : ""} <span style={{ color: "#64748b" }}>{r?.teamName}</span></span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* 通算記録 */}
      {subTab === "career" && (
        <div>
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-h">📜 歴代シーズン記録</div>
            {records.singleSeasonHR && <div className="fsb" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}><span style={{ color: "#94a3b8" }}>シーズン本塁打</span><span style={{ color: "#f5c842", fontWeight: 700 }}>{records.singleSeasonHR.value}本 {records.singleSeasonHR.playerName}</span></div>}
            {records.singleSeasonAVG && <div className="fsb" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}><span style={{ color: "#94a3b8" }}>シーズン打率</span><span style={{ color: "#f5c842", fontWeight: 700 }}>.{String(Math.round(records.singleSeasonAVG.value * 1000)).padStart(3,"0")} {records.singleSeasonAVG.playerName}</span></div>}
            {records.singleSeasonK  && <div className="fsb" style={{ fontSize: 11, padding: "3px 0" }}><span style={{ color: "#94a3b8" }}>シーズン奪三振</span><span style={{ color: "#f5c842", fontWeight: 700 }}>{records.singleSeasonK.value}K {records.singleSeasonK.playerName}</span></div>}
            {!records.singleSeasonHR && <div style={{ fontSize: 11, color: "#374151" }}>記録なし</div>}
          </div>
          {topCareerHR.length > 0 && (
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-h">💪 通算本塁打</div>
              {topCareerHR.map((r, i) => (
                <div key={i} className="fsb" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "#94a3b8" }}><span style={{ color: i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#b45309":"#374151", marginRight: 6, fontWeight: 700 }}>{i+1}.</span>{r.playerName}</span>
                  <span style={{ color: "#f5c842", fontWeight: 700 }}>{r.value}本</span>
                </div>
              ))}
            </div>
          )}
          {topCareerW.length > 0 && (
            <div className="card">
              <div className="card-h">🏆 通算勝利</div>
              {topCareerW.map((r, i) => (
                <div key={i} className="fsb" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "#94a3b8" }}><span style={{ color: i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#b45309":"#374151", marginRight: 6, fontWeight: 700 }}>{i+1}.</span>{r.playerName}</span>
                  <span style={{ color: "#f5c842", fontWeight: 700 }}>{r.value}勝</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 年度別順位 */}
      {subTab === "standings" && (
        <div>
          {standingsHistory.length > 0 ? (
            <div className="card">
              <div className="card-h">📊 年度別最終順位</div>
              {[...standingsHistory].reverse().map((snap, idx) => (
                <details key={snap.year} open={idx === 0} style={{marginBottom:6, borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                  <summary style={{cursor:"pointer", fontSize:12, fontWeight:700, color:"#f5c842", padding:"4px 0", listStyle:"none", userSelect:"none"}}>
                    ▸ {snap.year}年 {snap.playerAwards?.mvpCentral ? `セMVP ${snap.playerAwards.mvpCentral.name}` : ""}
                  </summary>
                  <div style={{paddingTop:8, paddingBottom:4}}>
                    {[["セ",snap.central],["パ",snap.pacific]].map(([lg,ranking])=>(
                      <div key={lg} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>{lg}リーグ</div>
                        {(ranking||[]).map((t,i)=>(
                          <div key={t.id} className="fsb" style={{fontSize:11,padding:"2px 0"}}>
                            <span>{i+1}位 {t.emoji} {t.name}</span>
                            <span style={{color:"#94a3b8"}}>{t.wins}勝{t.losses}敗</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="card"><div style={{ fontSize: 12, color: "#374151" }}>シーズン未完了</div></div>}
        </div>
      )}

      {/* 殿堂 */}
      {subTab === "hof" && (
        <div>
          {hallOfFame.length > 0 ? (
            <div className="card">
              <div className="card-h">🏛 球団殿堂</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                {hallOfFame.map((h, i) => (
                  <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(245,200,66,.05)", border: "1px solid rgba(245,200,66,.12)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f5c842", marginBottom: 2 }}>{h.playerName}</div>
                    <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>{h.inductYear}年度殿堂入り</div>
                    {h.careerHR > 0 && <div style={{ fontSize: 10, color: "#e0d4bf" }}>通算{h.careerHR}本塁打</div>}
                    {h.careerW  > 0 && <div style={{ fontSize: 10, color: "#e0d4bf" }}>通算{h.careerW}勝</div>}
                    {h.careerPA > 0 && <div style={{ fontSize: 10, color: "#94a3b8" }}>{h.careerPA}打席</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="card"><div style={{ fontSize: 12, color: "#374151" }}>殿堂入り選手なし</div></div>}
        </div>
      )}
    </div>
  );
}
