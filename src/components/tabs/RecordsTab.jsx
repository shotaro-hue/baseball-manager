import React, { useState } from "react";

export function awardWinners(award) {
  return Array.isArray(award?.winners) ? award.winners : award?.name ? [award] : [];
}

export function leagueAward(award, league) {
  if (!award) return null;
  if ('central' in award || 'pacific' in award) return award[league === 'セ' ? 'central' : 'pacific'];
  return league === 'セ' ? award : null;
}

export function RecordsTab({ history }) {
  const [subTab, setSubTab] = useState("awards");
  const { awards = [], records = {}, hallOfFame = [], championships = [], standingsHistory = [] } = history || {};
  const latest = awards.length > 0 ? awards[awards.length - 1] : null;
  const topCareerHR = Object.values(records.careerHR || {}).sort((a, b) => b.value - a.value).slice(0, 5);
  const topCareerW  = Object.values(records.careerW  || {}).sort((a, b) => b.value - a.value).slice(0, 5);

  // リーグ分割MVPの互換表示（旧: mvp={name,...}, 新: mvp={central,pacific}）
  const getMvp = (a, league) => {
    if (!a?.mvp) return null;
    if ('central' in a.mvp || 'pacific' in a.mvp) return league === 'セ' ? a.mvp.central : a.mvp.pacific;
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
    <div className="calm-detail detail-records">
      <h1>記録・表彰</h1>
      {/* サブタブナビ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {SUB_TABS.map(t => (
          <button key={t.id} aria-pressed={subTab === t.id} onClick={() => setSubTab(t.id)}
            style={{ fontSize: 14, padding: "4px 10px", borderRadius: 10, cursor: "pointer", border: subTab === t.id ? "1px solid rgba(245,200,66,.5)" : "1px solid #edf4fc", background: subTab === t.id ? "rgba(245,200,66,.15)" : "transparent", color: subTab === t.id ? "#805700" : "#53657c" }}>
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
                  <div key={lg} style={{ fontSize: 14, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between" }}>
                    <span><span style={{ color: "#805700", fontWeight: 700 }}>{lg}MVP</span> <span style={{ color: "#17243a" }}>{mvp.name}</span></span>
                    <span style={{ fontSize: 14, color: "#53657c" }}>({mvp.teamName}) {mvp.pos === '投手' ? `防御率 ${mvp.ERA?.toFixed(2) ?? '—'}` : `OPS ${mvp.OPS?.toFixed(3) ?? '—'}`}</span>
                  </div>
                ) : null;
              })}
              {latest.sawamura && (
                <div style={{ fontSize: 14, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between" }}>
                  <span><span style={{ color: "#095cc7", fontWeight: 700 }}>沢村賞</span> <span style={{ color: "#17243a" }}>{latest.sawamura.name}</span></span>
                  <span style={{ fontSize: 14, color: "#53657c" }}>({latest.sawamura.teamName}) {latest.sawamura.W}勝 ERA {latest.sawamura.ERA}</span>
                </div>
              )}
              {latest.version >= 2 && !latest.sawamura && <div style={{ fontSize: 14, padding: '4px 0', color: '#53657c' }}>沢村賞：該当者なし</div>}
              {['セ','パ'].map(lg => {
                const rookie = leagueAward(latest.rookie, lg);
                return rookie ? <div key={lg} style={{ fontSize: 14, padding: '4px 0' }}>
                  <span style={{ color: '#14714b', fontWeight: 700 }}>{latest.version >= 2 ? `${lg}新人王` : '新人王（旧集計）'}</span>
                  <span style={{ marginLeft: 8 }}>{rookie.name}（{rookie.teamName}）</span>
                </div> : null;
              })}
              <details style={{ marginTop: 8 }}>
                <summary style={{ minHeight: 44, cursor: 'pointer', padding: '10px 0' }}>表彰の選出基準</summary>
                <div style={{ fontSize: 14, color: '#53657c', lineHeight: 1.7 }}>
                  MVP・新人王・ベストナインはゲーム独自の成績評価です。MVPは野手80打席／投手40回以上の貢献スコアとチーム勝利数で選出します。
                  新人王は27歳以下、過去の通算が投手30回未満／野手60打席未満で、今季出場した選手が対象です。
                  沢村賞は130回・10勝・防御率3.50以下を満たす投手からFIPで選出します。
                  最高勝率は13勝以上。最多ホールドはホールド数のみで、NPBのホールドポイントとは異なります。旧年度の記録は当時の集計を保持しています。
                  首位打者・最高出塁率の規定打席はリーグ最多試合数（最低80）×3.1を四捨五入、防御率の規定投球回は同試合数です。
                </div>
              </details>
            </div>
          ) : <div className="card"><div style={{ fontSize: 14, color: "#53657c" }}>シーズン未完了</div></div>}
          {championships.length > 0 && (
            <div className="card">
              <div className="card-h">🏆 優勝履歴</div>
              {[...championships].reverse().map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #dce6f2" }}>
                  <span style={{ fontSize: 16 }}>🏆</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#805700" }}>{c.year}年 日本シリーズ制覇</div>
                    <div style={{ fontSize: 14, color: "#53657c" }}>{c.championName} vs {c.opponent}（{c.seriesResult}）</div>
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
            ? <div className="card"><div style={{ fontSize: 14, color: "#53657c" }}>タイトルデータはシーズン終了後に記録されます</div></div>
            : standingsHistory.filter(s => s.titles).slice().reverse().map(snap => (
            <div key={snap.year} className="card" style={{ marginBottom: 8 }}>
              <div className="card-h">{snap.year}年</div>
              {["セ","パ"].map(lg => {
                const t = lg === "セ" ? snap.titles?.central : snap.titles?.pacific;
                if (!t) return null;
                const rows = [
                  ["首位打者", t.avg, v => v != null ? `.${String(Math.round(v*1000)).padStart(3,"0")}` : ""],
                  ["最高出塁率", t.obp, v => v != null ? v.toFixed(3).replace(/^0/, '') : ""],
                  ["本塁打王", t.hr,  v => v != null ? `${v}本` : ""],
                  ["打点王",   t.rbi, v => v != null ? `${v}打点` : ""],
                  ["盗塁王",   t.sb,  v => v != null ? `${v}盗塁` : ""],
                  ["防御率王", t.era, v => v != null ? `${v.toFixed(2)}` : ""],
                  ["最多勝",   t.win, v => v != null ? `${v}勝` : ""],
                  ["最高勝率", t.winPct, v => v != null ? v.toFixed(3).replace(/^0/, '') : ""],
                  ["最多奪三振",t.so, v => v != null ? `${v}K` : ""],
                  [t.version >= 2 ? "最多セーブ" : "セーブ＋ホールド（旧集計）", t.sv, v => v != null ? `${v}${t.version >= 2 ? 'S' : ''}` : ""],
                  ["最多ホールド", t.hld, v => v != null ? `${v}H` : ""],
                ];
                return (
                  <div key={lg} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 14, color: "#53657c", marginBottom: 3, letterSpacing: ".05em" }}>{lg}リーグ</div>
                    {rows.flatMap(([label, award, fmt]) => awardWinners(award).map((r, index) => (
                      <div key={`${label}-${index}`} className="fsb" style={{ fontSize: 14, padding: "6px 0", gap: 8, flexWrap: 'wrap', borderBottom: "1px solid #dce6f2" }}>
                        <span style={{ color: "#53657c", minWidth: 70 }}>{label}</span>
                        <span style={{ flex: 1, color: "#17243a" }}>{r?.name}</span>
                        <span style={{ color: "#805700", fontSize: 14 }}>{r ? fmt(r.value) : ""} <span style={{ color: "#53657c" }}>{r?.teamName}</span></span>
                      </div>
                    )))}
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
            {records.singleSeasonHR && <div className="fsb" style={{ fontSize: 14, padding: "3px 0", borderBottom: "1px solid #dce6f2" }}><span style={{ color: "#53657c" }}>シーズン本塁打</span><span style={{ color: "#805700", fontWeight: 700 }}>{records.singleSeasonHR.value}本 {records.singleSeasonHR.playerName}</span></div>}
            {records.singleSeasonAVG && <div className="fsb" style={{ fontSize: 14, padding: "3px 0", borderBottom: "1px solid #dce6f2" }}><span style={{ color: "#53657c" }}>シーズン打率</span><span style={{ color: "#805700", fontWeight: 700 }}>.{String(Math.round(records.singleSeasonAVG.value * 1000)).padStart(3,"0")} {records.singleSeasonAVG.playerName}</span></div>}
            {records.singleSeasonK  && <div className="fsb" style={{ fontSize: 14, padding: "3px 0" }}><span style={{ color: "#53657c" }}>シーズン奪三振</span><span style={{ color: "#805700", fontWeight: 700 }}>{records.singleSeasonK.value}K {records.singleSeasonK.playerName}</span></div>}
            {!records.singleSeasonHR && <div style={{ fontSize: 14, color: "#53657c" }}>記録なし</div>}
          </div>
          {topCareerHR.length > 0 && (
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-h">💪 通算本塁打</div>
              {topCareerHR.map((r, i) => (
                <div key={i} className="fsb" style={{ fontSize: 14, padding: "3px 0", borderBottom: "1px solid #dce6f2" }}>
                  <span style={{ color: "#53657c" }}><span style={{ color: i===0?"#805700":i===1?"#53657c":i===2?"#b45309":"#53657c", marginRight: 6, fontWeight: 700 }}>{i+1}.</span>{r.playerName}</span>
                  <span style={{ color: "#805700", fontWeight: 700 }}>{r.value}本</span>
                </div>
              ))}
            </div>
          )}
          {topCareerW.length > 0 && (
            <div className="card">
              <div className="card-h">🏆 通算勝利</div>
              {topCareerW.map((r, i) => (
                <div key={i} className="fsb" style={{ fontSize: 14, padding: "3px 0", borderBottom: "1px solid #dce6f2" }}>
                  <span style={{ color: "#53657c" }}><span style={{ color: i===0?"#805700":i===1?"#53657c":i===2?"#b45309":"#53657c", marginRight: 6, fontWeight: 700 }}>{i+1}.</span>{r.playerName}</span>
                  <span style={{ color: "#805700", fontWeight: 700 }}>{r.value}勝</span>
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
                <details key={snap.year} open={idx === 0} style={{marginBottom:6, borderBottom:"1px solid #dce6f2"}}>
                  <summary style={{cursor:"pointer", fontSize: 14, fontWeight:700, color:"#805700", padding:"4px 0", listStyle:"none", userSelect:"none"}}>
                    ▸ {snap.year}年 {snap.playerAwards?.mvpCentral ? `セMVP ${snap.playerAwards.mvpCentral.name}` : ""}
                  </summary>
                  <div style={{paddingTop:8, paddingBottom:4}}>
                    {[["セ",snap.central],["パ",snap.pacific]].map(([lg,ranking])=>(
                      <div key={lg} style={{marginBottom:8}}>
                        <div style={{fontSize: 14,color:"#53657c",marginBottom:3}}>{lg}リーグ</div>
                        {(ranking||[]).map((t,i)=>(
                          <div key={t.id} className="fsb" style={{fontSize: 14,padding:"2px 0"}}>
                            <span>{i+1}位 {t.emoji} {t.name}</span>
                            <span style={{color:"#53657c"}}>{t.wins}勝{t.losses}敗</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="card"><div style={{ fontSize: 14, color: "#53657c" }}>シーズン未完了</div></div>}
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#805700", marginBottom: 2 }}>{h.playerName}</div>
                    <div style={{ fontSize: 14, color: "#53657c", marginBottom: 4 }}>{h.inductYear}年度殿堂入り</div>
                    {h.careerHR > 0 && <div style={{ fontSize: 14, color: "#17243a" }}>通算{h.careerHR}本塁打</div>}
                    {h.careerW  > 0 && <div style={{ fontSize: 14, color: "#17243a" }}>通算{h.careerW}勝</div>}
                    {h.careerPA > 0 && <div style={{ fontSize: 14, color: "#53657c" }}>{h.careerPA}打席</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="card"><div style={{ fontSize: 14, color: "#53657c" }}>殿堂入り選手なし</div></div>}
        </div>
      )}
    </div>
  );
}
