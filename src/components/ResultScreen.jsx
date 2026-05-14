import { useMemo, useState } from 'react';

function buildResultScreenData(gsResult, myTeam, oppTeam) {
  const won = gsResult.score.my > gsResult.score.opp;
  const drew = gsResult.score.my === gsResult.score.opp;
  const log = gsResult.log || [];
  const inningSummary = gsResult.inningSummary || [];
  const isHit = (result) => ['s', 'd', 't', 'hr'].includes(result);
  const isOut = (result) => ['k', 'out', 'fo', 'go', 'sac', 'sf'].includes(result);
  const maxInning = Math.max(9, ...inningSummary.map((e) => e.inning));
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);
  const myRunsByInn = {};
  const oppRunsByInn = {};

  inningSummary.forEach(({ inning, isTop, runs }) => {
    if (isTop) oppRunsByInn[inning] = runs;
    else myRunsByInn[inning] = runs;
  });
  let myHitsTotal = 0;
  let oppHitsTotal = 0;
  const myPitcherIds = [];
  const oppPitcherIds = [];
  const myPitcherSeen = new Set();
  const oppPitcherSeen = new Set();
  const myPitcherStats = {};
  const oppPitcherStats = {};
  const myBatStatsMap = {};
  const oppBatStatsMap = {};
  const myBatOrder = [];
  const oppBatOrder = [];
  const myHREvts = [];
  const oppHREvts = [];

  const getPitcherRow = (map, id) => {
    if (!map[id]) map[id] = { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 };
    return map[id];
  };
  const getBatterRow = (map, order, event) => {
    if (!map[event.batId]) {
      map[event.batId] = { name: event.batter || '', AB: 0, H: 0, HR: 0, RBI: 0 };
      order.push(event.batId);
    }
    return map[event.batId];
  };

  log.forEach((e) => {
    if (!e || e.isStolenBase) return;
    if (e.result === 'hr') {
      if (e.scorer) myHREvts.push(e);
      else oppHREvts.push(e);
    }
    if (isHit(e.result)) {
      if (e.scorer) myHitsTotal += 1;
      else oppHitsTotal += 1;
    }
    if (e.batId && e.result && e.result !== 'change') {
      const targetMap = e.scorer ? myBatStatsMap : oppBatStatsMap;
      const targetOrder = e.scorer ? myBatOrder : oppBatOrder;
      const row = getBatterRow(targetMap, targetOrder, e);
      if (!['bb', 'hbp', 'sf'].includes(e.result)) row.AB++;
      if (isHit(e.result)) row.H++;
      if (e.result === 'hr') row.HR++;
      row.RBI += (e.rbi || 0);
    }
    if (!e.pitcherId || !e.result || e.result === 'change') return;
    const pitcherIds = e.scorer ? oppPitcherIds : myPitcherIds;
    const pitcherSeen = e.scorer ? oppPitcherSeen : myPitcherSeen;
    const pitcherStats = e.scorer ? oppPitcherStats : myPitcherStats;
    if (!pitcherSeen.has(e.pitcherId)) {
      pitcherSeen.add(e.pitcherId);
      pitcherIds.push(e.pitcherId);
    }
    const row = getPitcherRow(pitcherStats, e.pitcherId);
    if (isOut(e.result)) row.outs++;
    if (isHit(e.result)) row.H++;
    if (e.result === 'k') row.K++;
    if (e.result === 'bb') row.BB++;
    if ((e.rbi || 0) > 0) row.ER += e.rbi;
    row.PC += (e.pitches || 0);
  });

  const myPStats = myPitcherIds.map((id) => ({ id, ...(myPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const oppPStats = oppPitcherIds.map((id) => ({ id, ...(oppPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const myStarterOuts = myPStats[0]?.outs || 0;
  const oppStarterOuts = oppPStats[0]?.outs || 0;
  const finalLead = gsResult.score.my - gsResult.score.opp;
  const myWinnerId = won ? (myStarterOuts >= 15 ? myPitcherIds[0] : (myPitcherIds[1] || myPitcherIds[0])) : null;
  const myLoserId = (!won && !drew) ? myPitcherIds[0] : null;
  const mySaveSituation = won && finalLead >= 1 && finalLead <= 3;
  const mySaverId = (won && mySaveSituation && myPitcherIds.length >= 2 && myPitcherIds[myPitcherIds.length - 1] !== myWinnerId)
    ? myPitcherIds[myPitcherIds.length - 1]
    : null;
  const oppWinnerId = (!won && !drew) ? (oppStarterOuts >= 15 ? oppPitcherIds[0] : (oppPitcherIds[1] || oppPitcherIds[0])) : null;
  const oppLoserId = (won && !drew) ? oppPitcherIds[0] : null;
  const oppSaveSituation = !won && !drew && Math.abs(finalLead) <= 3;
  const oppSaverId = (!won && oppSaveSituation && oppPitcherIds.length >= 2 && oppPitcherIds[oppPitcherIds.length - 1] !== oppWinnerId)
    ? oppPitcherIds[oppPitcherIds.length - 1]
    : null;

  return {
    won,
    drew,
    log,
    innings,
    maxInning,
    myRunsByInn,
    oppRunsByInn,
    myHitsTotal,
    oppHitsTotal,
    myPStats,
    oppPStats,
    myWinnerId,
    myLoserId,
    mySaverId,
    oppWinnerId,
    oppLoserId,
    oppSaverId,
    myHREvts,
    oppHREvts,
    myBatStats: myBatOrder.map((id) => ({ id, ...myBatStatsMap[id] })),
    oppBatStats: oppBatOrder.map((id) => ({ id, ...oppBatStatsMap[id] })),
    myPRole: (id) => id === myWinnerId ? 'W' : id === myLoserId ? 'L' : id === mySaverId ? 'S' : '',
    oppPRole: (id) => id === oppWinnerId ? 'W' : id === oppLoserId ? 'L' : id === oppSaverId ? 'S' : '',
    resultColor: won ? 'var(--gold)' : drew ? 'var(--blue)' : 'var(--red)',
    resultLabel: won ? 'VICTORY' : drew ? 'DRAW' : 'DEFEAT',
    findPlayer: (team, id) => team?.players?.find((p) => p.id === id) ?? team?.farm?.find((p) => p.id === id),
  };
}

export function ResultScreen({ gsResult, myTeam, oppTeam, gameDay, onNext, nextLabel = 'ハブに戻る', isPostGameProcessing: isPostGameProcessingProp }) {
  const [activeTab, setActiveTab] = useState('bat');
  const isPostGameProcessing = isPostGameProcessingProp ?? !!gsResult?.isPostGameProcessing;
  const {
    won, drew, log, innings, maxInning, myRunsByInn, oppRunsByInn, myHitsTotal, oppHitsTotal,
    myPStats, oppPStats, myWinnerId, myLoserId, mySaverId, oppWinnerId, oppLoserId, oppSaverId,
    myHREvts, oppHREvts, myBatStats, oppBatStats, myPRole, oppPRole, resultColor, resultLabel, findPlayer,
  } = useMemo(() => buildResultScreenData(gsResult, myTeam, oppTeam), [gsResult, myTeam, oppTeam]);

  const fmtIPlocal = (outs) => {
    const f = Math.floor(outs / 3);
    const r = outs % 3;
    return r === 0 ? `${f}` : `${f}.${r}`;
  };
  const hrLabel = (rbi) => ({ 1: 'ソロ', 2: '2ラン', 3: '3ラン', 4: '満塁' }[rbi] || `${rbi}点本塁打`);
  const fmtSeasonAvg = (p) => {
    if (!p?.stats) return '.---';
    const ab = p.stats.AB || 0;
    const h = p.stats.H || 0;
    return ab === 0 ? '.---' : `.${String(Math.round(h / ab * 1000)).padStart(3, '0')}`;
  };

  const cellSt = { textAlign: 'center', padding: '5px 3px', fontFamily: "'Share Tech Mono', monospace" };
  const thSt = { ...cellSt, fontSize: 9, color: 'var(--dim)', fontWeight: 400, padding: '3px 3px' };

  return (
    <div className="app">
      <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>
        <div style={{ background: 'linear-gradient(180deg,rgba(4,16,28,.95) 0%,var(--card) 100%)', padding: '20px 16px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '.2em', marginBottom: 10 }}>第{gameDay}戦</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 30 }}>{myTeam.emoji}</div>
              <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 3, fontWeight: 700 }}>{myTeam.short}</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 120 }}>
              <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 52, lineHeight: 1, letterSpacing: '.05em', color: resultColor }}>
                {gsResult.score.my}<span style={{ fontSize: 32, color: 'var(--dim)', margin: '0 4px' }}>-</span>{gsResult.score.opp}
              </div>
              <div style={{ fontSize: 9, letterSpacing: '.25em', color: resultColor, marginTop: 3 }}>{resultLabel}</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 30 }}>{oppTeam.emoji}</div>
              <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 3, fontWeight: 700 }}>{oppTeam.short}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            vs {oppTeam.name}
            <span style={{ color: 'var(--green)', marginLeft: 5 }}>{myTeam.wins}勝</span>
            <span style={{ color: '#4b5563', margin: '0 2px' }}>/</span>
            <span style={{ color: 'var(--red)' }}>{myTeam.losses}敗</span>
            {(myTeam.draws || 0) > 0 && <><span style={{ color: '#4b5563', margin: '0 2px' }}>/</span><span style={{ color: 'var(--dim)' }}>{myTeam.draws}分</span></>}
          </div>
        </div>

        <div style={{ padding: '12px 12px 0' }}>
          <div className="card" style={{ padding: '10px 8px', overflowX: 'auto' }}>
            <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '.2em', marginBottom: 8 }}>SCORE BY INNING</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, textAlign: 'left', width: 28 }}></th>
                  {innings.map((i) => <th key={i} style={{ ...thSt, minWidth: 20 }}>{i}</th>)}
                  <th style={{ ...thSt, borderLeft: '1px solid var(--border)', paddingLeft: 6, fontWeight: 700 }}>R</th>
                  <th style={{ ...thSt }}>H</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '5px 2px', fontSize: 11, fontWeight: 700, color: oppTeam.color || 'var(--text)', fontFamily: "'Share Tech Mono',monospace" }}>{oppTeam.short}</td>
                  {innings.map((i) => { const r = oppRunsByInn[i]; return <td key={i} style={{ ...cellSt, fontSize: 12, color: r > 0 ? 'var(--text)' : 'var(--dim)', fontWeight: r > 0 ? 700 : 400 }}>{r !== undefined ? r : ''}</td>; })}
                  <td style={{ ...cellSt, fontSize: 12, fontWeight: 700, color: 'var(--text)', borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>{gsResult.score.opp}</td>
                  <td style={{ ...cellSt, fontSize: 11, color: 'var(--dim)' }}>{oppHitsTotal}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 2px', fontSize: 11, fontWeight: 700, color: myTeam.color || 'var(--gold)', fontFamily: "'Share Tech Mono',monospace" }}>{myTeam.short}</td>
                  {innings.map((i) => {
                    const r = myRunsByInn[i];
                    const isX = r === undefined && won && i === maxInning && oppRunsByInn[i] !== undefined;
                    return <td key={i} style={{ ...cellSt, fontSize: 12, color: r > 0 ? 'var(--gold)' : 'var(--dim)', fontWeight: r > 0 ? 700 : 400 }}>{r !== undefined ? r : isX ? 'X' : ''}</td>;
                  })}
                  <td style={{ ...cellSt, fontSize: 12, fontWeight: 700, color: 'var(--gold)', borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>{gsResult.score.my}</td>
                  <td style={{ ...cellSt, fontSize: 11, color: 'var(--dim)' }}>{myHitsTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {(myWinnerId || myLoserId || mySaverId || oppWinnerId || oppLoserId || oppSaverId) && (
            <div className="card">
              <div className="card-h">責任投手</div>
              {[
                myWinnerId && { label: 'W', color: 'var(--green)', player: findPlayer(myTeam, myWinnerId), team: myTeam.short },
                oppWinnerId && { label: 'W', color: 'var(--green)', player: findPlayer(oppTeam, oppWinnerId), team: oppTeam.short },
                myLoserId && { label: 'L', color: 'var(--red)', player: findPlayer(myTeam, myLoserId), team: myTeam.short },
                oppLoserId && { label: 'L', color: 'var(--red)', player: findPlayer(oppTeam, oppLoserId), team: oppTeam.short },
                mySaverId && { label: 'S', color: 'var(--blue)', player: findPlayer(myTeam, mySaverId), team: myTeam.short },
                oppSaverId && { label: 'S', color: 'var(--blue)', player: findPlayer(oppTeam, oppSaverId), team: oppTeam.short },
              ].filter(Boolean).map((row, i) => (
                <div key={i} className="fsb" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 12, fontWeight: 700, color: row.color, fontSize: 11 }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{row.player?.name || '?'}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)' }}>{row.team}</span>
                </div>
              ))}
            </div>
          )}

          {(myHREvts.length > 0 || oppHREvts.length > 0) && (
            <div className="card">
              <div className="card-h">本塁打</div>
              {[
                ...myHREvts.map((e) => ({ ...e, teamShort: myTeam.short, teamColor: myTeam.color || 'var(--gold)', isMy: true })),
                ...oppHREvts.map((e) => ({ ...e, teamShort: oppTeam.short, teamColor: oppTeam.color || 'var(--text)', isMy: false })),
              ].sort((a, b) => a.inning - b.inning || (a.isTop ? 0 : 1) - (b.isTop ? 0 : 1)).map((e, i) => (
                <div key={i} className="fsb" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>{e.batter}</span>
                    <span style={{ fontSize: 10, color: 'var(--red)' }}>HR</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)' }}>{e.inning}回{e.isTop ? '表' : '裏'} {hrLabel(e.rbi)} <span style={{ color: e.teamColor }}>{e.teamShort}</span></span>
                </div>
              ))}
            </div>
          )}

          {log.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {[['bat', '打撃成績'], ['pitch', '投手成績']].map(([tab, label]) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px 0', border: 'none', background: activeTab === tab ? 'rgba(245,200,66,.07)' : 'transparent', color: activeTab === tab ? 'var(--gold)' : 'var(--dim)', fontSize: 12, cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent', transition: '.15s', fontFamily: "'Noto Sans JP',sans-serif" }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ padding: '10px 8px' }}>
                {activeTab === 'bat' && (
                  <>
                    {[{ team: myTeam, batters: myBatStats }, { team: oppTeam, batters: oppBatStats }].map(({ team, batters }, ti) => (
                      <div key={ti} style={{ marginBottom: ti === 0 ? 14 : 0 }}>
                        {ti > 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 10 }} />}
                        <div style={{ fontSize: 10, fontWeight: 700, color: team.color || 'var(--text)', marginBottom: 6 }}>{team.short}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['選手', 'AVG', 'AB', 'H', 'RBI', 'HR'].map((h) => <th key={h} style={{ ...thSt, textAlign: h === '選手' ? 'left' : 'center' }}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {batters.map((b) => {
                              const p = findPlayer(team, b.id);
                              return (
                                <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                  <td style={{ padding: '4px 2px', color: b.H > 0 ? 'var(--text)' : 'var(--dim)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</td>
                                  <td style={{ ...cellSt, fontSize: 10, color: '#6b7280' }}>{fmtSeasonAvg(p)}</td>
                                  <td style={{ ...cellSt }}>{b.AB}</td>
                                  <td style={{ ...cellSt, color: b.H > 0 ? 'var(--green)' : 'var(--dim)', fontWeight: b.H > 0 ? 700 : 400 }}>{b.H}</td>
                                  <td style={{ ...cellSt, color: b.RBI > 0 ? 'var(--gold)' : 'var(--dim)' }}>{b.RBI || 0}</td>
                                  <td style={{ ...cellSt, color: b.HR > 0 ? 'var(--red)' : 'var(--dim)' }}>{b.HR || 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
                {activeTab === 'pitch' && (
                  <>
                    {[{ team: myTeam, pstats: myPStats, roleF: myPRole }, { team: oppTeam, pstats: oppPStats, roleF: oppPRole }].map(({ team, pstats, roleF }, ti) => (
                      <div key={ti} style={{ marginBottom: ti === 0 ? 14 : 0 }}>
                        {ti > 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 10 }} />}
                        <div style={{ fontSize: 10, fontWeight: 700, color: team.color || 'var(--text)', marginBottom: 6 }}>{team.short}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['投手', 'IP', 'PC', 'H', 'K', 'BB', 'ER'].map((h) => <th key={h} style={{ ...thSt, textAlign: h === '投手' ? 'left' : 'center' }}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {pstats.map((ps) => {
                              const p = findPlayer(team, ps.id);
                              const role = roleF(ps.id);
                              return (
                                <tr key={ps.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                  <td style={{ padding: '4px 2px', color: 'var(--text)' }}>
                                    {role && <span style={{ fontSize: 9, fontWeight: 700, marginRight: 4, color: role === 'W' ? 'var(--green)' : role === 'L' ? 'var(--red)' : 'var(--blue)' }}>{role}</span>}
                                    {p?.name || '?'}
                                  </td>
                                  <td style={{ ...cellSt, fontSize: 10 }}>{fmtIPlocal(ps.outs)}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{ps.PC || 0}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{ps.H}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{ps.K}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{ps.BB}</td>
                                  <td style={{ ...cellSt, color: ps.ER > 0 ? 'var(--red)' : 'var(--dim)' }}>{ps.ER}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {isPostGameProcessing && (
            <div className="card" style={{ marginTop: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>試合後処理中...</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>成績・他球場・保存準備を更新しています</span>
            </div>
          )}

          <button className="btn btn-gold" style={{ width: '100%', padding: '14px 0', fontSize: 14, marginTop: 10, opacity: isPostGameProcessing ? 0.6 : 1, cursor: isPostGameProcessing ? 'not-allowed' : 'pointer' }} onClick={onNext} disabled={isPostGameProcessing}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
