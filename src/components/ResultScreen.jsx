import { useEffect, useMemo, useState } from 'react';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from '../engine/postGameProcessing';

function buildResultScreenSummary(gsResult) {
  const won = gsResult.score.my > gsResult.score.opp;
  const drew = gsResult.score.my === gsResult.score.opp;
  const log = gsResult.log || [];
  const inningSummary = gsResult.inningSummary || [];
  const maxInning = Math.max(9, ...inningSummary.map((entry) => entry.inning));
  const innings = Array.from({ length: maxInning }, (_, index) => index + 1);
  const myRunsByInn = {};
  const oppRunsByInn = {};

  inningSummary.forEach(({ inning, isTop, runs }) => {
    if (isTop) oppRunsByInn[inning] = runs;
    else myRunsByInn[inning] = runs;
  });

  return {
    won,
    drew,
    log,
    maxInning,
    innings,
    myRunsByInn,
    oppRunsByInn,
    resultColor: won ? 'var(--gold)' : drew ? 'var(--blue)' : 'var(--red)',
    resultLabel: won ? 'VICTORY' : drew ? 'DRAW' : 'DEFEAT',
  };
}

function buildResultScreenDetails(gsResult, myTeam, oppTeam) {
  const log = gsResult.log || [];
  const isHit = (result) => ['s', 'd', 't', 'hr'].includes(result);
  const isOut = (result) => ['k', 'out', 'fo', 'go', 'sac', 'sf'].includes(result);
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

  log.forEach((event) => {
    if (!event || event.isStolenBase) return;
    if (event.result === 'hr') {
      if (event.scorer) myHREvts.push(event);
      else oppHREvts.push(event);
    }
    if (isHit(event.result)) {
      if (event.scorer) myHitsTotal += 1;
      else oppHitsTotal += 1;
    }
    if (event.batId && event.result && event.result !== 'change') {
      const targetMap = event.scorer ? myBatStatsMap : oppBatStatsMap;
      const targetOrder = event.scorer ? myBatOrder : oppBatOrder;
      const row = getBatterRow(targetMap, targetOrder, event);
      if (!['bb', 'hbp', 'sf'].includes(event.result)) row.AB += 1;
      if (isHit(event.result)) row.H += 1;
      if (event.result === 'hr') row.HR += 1;
      row.RBI += event.rbi || 0;
    }
    if (!event.pitcherId || !event.result || event.result === 'change') return;
    const pitcherIds = event.scorer ? oppPitcherIds : myPitcherIds;
    const pitcherSeen = event.scorer ? oppPitcherSeen : myPitcherSeen;
    const pitcherStats = event.scorer ? oppPitcherStats : myPitcherStats;
    if (!pitcherSeen.has(event.pitcherId)) {
      pitcherSeen.add(event.pitcherId);
      pitcherIds.push(event.pitcherId);
    }
    const row = getPitcherRow(pitcherStats, event.pitcherId);
    if (isOut(event.result)) row.outs += 1;
    if (isHit(event.result)) row.H += 1;
    if (event.result === 'k') row.K += 1;
    if (event.result === 'bb') row.BB += 1;
    if ((event.rbi || 0) > 0) row.ER += event.rbi;
    row.PC += event.pitches || 0;
  });

  const myPStats = myPitcherIds.map((id) => ({ id, ...(myPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const oppPStats = oppPitcherIds.map((id) => ({ id, ...(oppPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const myStarterOuts = myPStats[0]?.outs || 0;
  const oppStarterOuts = oppPStats[0]?.outs || 0;
  const finalLead = gsResult.score.my - gsResult.score.opp;
  const won = gsResult.score.my > gsResult.score.opp;
  const drew = gsResult.score.my === gsResult.score.opp;
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
  const findPlayer = (team, id) => team?.players?.find((player) => player.id === id) ?? team?.farm?.find((player) => player.id === id);

  return {
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
    myPRole: (id) => (id === myWinnerId ? 'W' : id === myLoserId ? 'L' : id === mySaverId ? 'S' : ''),
    oppPRole: (id) => (id === oppWinnerId ? 'W' : id === oppLoserId ? 'L' : id === oppSaverId ? 'S' : ''),
    findPlayer,
    myTeam,
    oppTeam,
  };
}

export function ResultScreen({ gsResult, myTeam, oppTeam, gameDay, onNext, nextLabel = 'ハブに戻る', isPostGameProcessing: isPostGameProcessingProp }) {
  const [activeTab, setActiveTab] = useState('bat');
  const [detailData, setDetailData] = useState(null);
  const [internalProcessing, setInternalProcessing] = useState(() => (
    isPostGameProcessingProp ?? !!gsResult
  ));
  const summary = useMemo(() => buildResultScreenSummary(gsResult), [gsResult]);
  const isPostGameProcessing = isPostGameProcessingProp ?? internalProcessing;

  useEffect(() => {
    if (!gsResult) {
      setDetailData(null);
      setInternalProcessing(false);
      return undefined;
    }

    setActiveTab('bat');
    setDetailData(null);
    setInternalProcessing(true);

    let isCancelled = false;
    const handle = scheduleDeferredPostGameWork(() => {
      if (isCancelled) return;
      const nextDetail = buildResultScreenDetails(gsResult, myTeam, oppTeam);
      if (isCancelled) return;
      setDetailData(nextDetail);
      setInternalProcessing(false);
    });

    return () => {
      isCancelled = true;
      cancelDeferredPostGameWork(handle);
    };
  }, [gsResult, myTeam, oppTeam]);

  const fmtIPlocal = (outs) => {
    const f = Math.floor(outs / 3);
    const r = outs % 3;
    return r === 0 ? `${f}` : `${f}.${r}`;
  };
  const hrLabel = (rbi) => ({ 1: 'ソロ', 2: '2ラン', 3: '3ラン', 4: '満塁' }[rbi] || `${rbi}点本塁打`);
  const fmtSeasonAvg = (player) => {
    if (!player?.stats) return '.---';
    const ab = player.stats.AB || 0;
    const h = player.stats.H || 0;
    return ab === 0 ? '.---' : `.${String(Math.round(h / ab * 1000)).padStart(3, '0')}`;
  };

  const cellSt = { textAlign: 'center', padding: '5px 3px', fontFamily: "'Share Tech Mono', monospace" };
  const thSt = { ...cellSt, fontSize: 9, color: 'var(--dim)', fontWeight: 400, padding: '3px 3px' };
  const detailReady = !!detailData;
  const detailCardTitle = activeTab === 'bat' ? '打者成績' : '投手成績';

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
              <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 52, lineHeight: 1, letterSpacing: '.05em', color: summary.resultColor }}>
                {gsResult.score.my}<span style={{ fontSize: 32, color: 'var(--dim)', margin: '0 4px' }}>-</span>{gsResult.score.opp}
              </div>
              <div style={{ fontSize: 9, letterSpacing: '.25em', color: summary.resultColor, marginTop: 3 }}>{summary.resultLabel}</div>
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
                  {summary.innings.map((inning) => <th key={inning} style={{ ...thSt, minWidth: 20 }}>{inning}</th>)}
                  <th style={{ ...thSt, borderLeft: '1px solid var(--border)', paddingLeft: 6, fontWeight: 700 }}>R</th>
                  <th style={{ ...thSt }}>H</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '5px 2px', fontSize: 11, fontWeight: 700, color: oppTeam.color || 'var(--text)', fontFamily: "'Share Tech Mono',monospace" }}>{oppTeam.short}</td>
                  {summary.innings.map((inning) => {
                    const runs = summary.oppRunsByInn[inning];
                    return <td key={inning} style={{ ...cellSt, fontSize: 12, color: runs > 0 ? 'var(--text)' : 'var(--dim)', fontWeight: runs > 0 ? 700 : 400 }}>{runs !== undefined ? runs : ''}</td>;
                  })}
                  <td style={{ ...cellSt, fontSize: 12, fontWeight: 700, color: 'var(--text)', borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>{gsResult.score.opp}</td>
                  <td style={{ ...cellSt, fontSize: 11, color: 'var(--dim)' }}>{detailReady ? detailData.oppHitsTotal : '...'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 2px', fontSize: 11, fontWeight: 700, color: myTeam.color || 'var(--gold)', fontFamily: "'Share Tech Mono',monospace" }}>{myTeam.short}</td>
                  {summary.innings.map((inning) => {
                    const runs = summary.myRunsByInn[inning];
                    const isX = runs === undefined && summary.won && inning === summary.maxInning && summary.oppRunsByInn[inning] !== undefined;
                    return <td key={inning} style={{ ...cellSt, fontSize: 12, color: runs > 0 ? 'var(--gold)' : 'var(--dim)', fontWeight: runs > 0 ? 700 : 400 }}>{runs !== undefined ? runs : isX ? 'X' : ''}</td>;
                  })}
                  <td style={{ ...cellSt, fontSize: 12, fontWeight: 700, color: 'var(--gold)', borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>{gsResult.score.my}</td>
                  <td style={{ ...cellSt, fontSize: 11, color: 'var(--dim)' }}>{detailReady ? detailData.myHitsTotal : '...'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {detailReady && (detailData.myWinnerId || detailData.myLoserId || detailData.mySaverId || detailData.oppWinnerId || detailData.oppLoserId || detailData.oppSaverId) && (
            <div className="card">
              <div className="card-h">勝敗投手</div>
              {[
                detailData.myWinnerId && { label: 'W', color: 'var(--green)', player: detailData.findPlayer(myTeam, detailData.myWinnerId), team: myTeam.short },
                detailData.oppWinnerId && { label: 'W', color: 'var(--green)', player: detailData.findPlayer(oppTeam, detailData.oppWinnerId), team: oppTeam.short },
                detailData.myLoserId && { label: 'L', color: 'var(--red)', player: detailData.findPlayer(myTeam, detailData.myLoserId), team: myTeam.short },
                detailData.oppLoserId && { label: 'L', color: 'var(--red)', player: detailData.findPlayer(oppTeam, detailData.oppLoserId), team: oppTeam.short },
                detailData.mySaverId && { label: 'S', color: 'var(--blue)', player: detailData.findPlayer(myTeam, detailData.mySaverId), team: myTeam.short },
                detailData.oppSaverId && { label: 'S', color: 'var(--blue)', player: detailData.findPlayer(oppTeam, detailData.oppSaverId), team: oppTeam.short },
              ].filter(Boolean).map((row, index) => (
                <div key={index} className="fsb" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 12, fontWeight: 700, color: row.color, fontSize: 11 }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{row.player?.name || '?'}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)' }}>{row.team}</span>
                </div>
              ))}
            </div>
          )}

          {detailReady && (detailData.myHREvts.length > 0 || detailData.oppHREvts.length > 0) && (
            <div className="card">
              <div className="card-h">本塁打</div>
              {[
                ...detailData.myHREvts.map((event) => ({ ...event, teamShort: myTeam.short, teamColor: myTeam.color || 'var(--gold)' })),
                ...detailData.oppHREvts.map((event) => ({ ...event, teamShort: oppTeam.short, teamColor: oppTeam.color || 'var(--text)' })),
              ].sort((a, b) => a.inning - b.inning || (a.isTop ? 0 : 1) - (b.isTop ? 0 : 1)).map((event, index) => (
                <div key={index} className="fsb" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>{event.batter}</span>
                    <span style={{ fontSize: 10, color: 'var(--red)' }}>HR</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)' }}>{event.inning}回{event.isTop ? '表' : '裏'} {hrLabel(event.rbi)} <span style={{ color: event.teamColor }}>{event.teamShort}</span></span>
                </div>
              ))}
            </div>
          )}

          {summary.log.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {[['bat', '打者成績'], ['pitch', '投手成績']].map(([tab, label]) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px 0', border: 'none', background: activeTab === tab ? 'rgba(245,200,66,.07)' : 'transparent', color: activeTab === tab ? 'var(--gold)' : 'var(--dim)', fontSize: 12, cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent', transition: '.15s', fontFamily: "'Noto Sans JP',sans-serif" }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ padding: '10px 8px' }}>
                {!detailReady && (
                  <div style={{ padding: '18px 8px', textAlign: 'center', color: 'var(--dim)', fontSize: 12 }}>
                    {detailCardTitle}を読み込み中...
                  </div>
                )}
                {detailReady && activeTab === 'bat' && (
                  <>
                    {[{ team: myTeam, batters: detailData.myBatStats }, { team: oppTeam, batters: detailData.oppBatStats }].map(({ team, batters }, teamIndex) => (
                      <div key={teamIndex} style={{ marginBottom: teamIndex === 0 ? 14 : 0 }}>
                        {teamIndex > 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 10 }} />}
                        <div style={{ fontSize: 10, fontWeight: 700, color: team.color || 'var(--text)', marginBottom: 6 }}>{team.short}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['選手', 'AVG', 'AB', 'H', 'RBI', 'HR'].map((header) => <th key={header} style={{ ...thSt, textAlign: header === '選手' ? 'left' : 'center' }}>{header}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {batters.map((batter) => {
                              const player = detailData.findPlayer(team, batter.id);
                              return (
                                <tr key={batter.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                  <td style={{ padding: '4px 2px', color: batter.H > 0 ? 'var(--text)' : 'var(--dim)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batter.name}</td>
                                  <td style={{ ...cellSt, fontSize: 10, color: '#6b7280' }}>{fmtSeasonAvg(player)}</td>
                                  <td style={{ ...cellSt }}>{batter.AB}</td>
                                  <td style={{ ...cellSt, color: batter.H > 0 ? 'var(--green)' : 'var(--dim)', fontWeight: batter.H > 0 ? 700 : 400 }}>{batter.H}</td>
                                  <td style={{ ...cellSt, color: batter.RBI > 0 ? 'var(--gold)' : 'var(--dim)' }}>{batter.RBI || 0}</td>
                                  <td style={{ ...cellSt, color: batter.HR > 0 ? 'var(--red)' : 'var(--dim)' }}>{batter.HR || 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
                {detailReady && activeTab === 'pitch' && (
                  <>
                    {[{ team: myTeam, pstats: detailData.myPStats, roleF: detailData.myPRole }, { team: oppTeam, pstats: detailData.oppPStats, roleF: detailData.oppPRole }].map(({ team, pstats, roleF }, teamIndex) => (
                      <div key={teamIndex} style={{ marginBottom: teamIndex === 0 ? 14 : 0 }}>
                        {teamIndex > 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 10 }} />}
                        <div style={{ fontSize: 10, fontWeight: 700, color: team.color || 'var(--text)', marginBottom: 6 }}>{team.short}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['投手', 'IP', 'PC', 'H', 'K', 'BB', 'ER'].map((header) => <th key={header} style={{ ...thSt, textAlign: header === '投手' ? 'left' : 'center' }}>{header}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {pstats.map((pitcherStats) => {
                              const player = detailData.findPlayer(team, pitcherStats.id);
                              const role = roleF(pitcherStats.id);
                              return (
                                <tr key={pitcherStats.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                  <td style={{ padding: '4px 2px', color: 'var(--text)' }}>
                                    {role && <span style={{ fontSize: 9, fontWeight: 700, marginRight: 4, color: role === 'W' ? 'var(--green)' : role === 'L' ? 'var(--red)' : 'var(--blue)' }}>{role}</span>}
                                    {player?.name || '?'}
                                  </td>
                                  <td style={{ ...cellSt, fontSize: 10 }}>{fmtIPlocal(pitcherStats.outs)}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{pitcherStats.PC || 0}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{pitcherStats.H}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{pitcherStats.K}</td>
                                  <td style={{ ...cellSt, color: 'var(--dim)' }}>{pitcherStats.BB}</td>
                                  <td style={{ ...cellSt, color: pitcherStats.ER > 0 ? 'var(--red)' : 'var(--dim)' }}>{pitcherStats.ER}</td>
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
              <span style={{ fontSize: 12, color: 'var(--text)' }}>試合詳細を整理中...</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>戻る操作は先に行えます</span>
            </div>
          )}

          <button className="btn btn-gold" style={{ width: '100%', padding: '14px 0', fontSize: 14, marginTop: 10 }} onClick={onNext}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
