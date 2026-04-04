import { saberBatter, saberPitcher } from '../engine/sabermetrics';

function SelectionTable({ players }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {players.map((p) => {
        const bat = saberBatter(p.stats || {});
        const pit = saberPitcher(p.stats || {});
        return (
          <div key={`${p.id}-${p.allStarSource}`} className="fsb" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</span>
              <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>{p.allStarTeamName}</span>
              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>{p.allStarRole}</span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              {p.isPitcher
                ? `FIP ${pit.FIP} / SV ${p.stats?.SV || 0} / HLD ${p.stats?.HLD || 0}`
                : `wOBA ${bat.wOBA}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AllStarScreen({ year, rosters, gameResult, gameResults, onEnd }) {
  const ceFan = (rosters?.ce || []).filter(p => p.allStarSource === 'fan');
  const paFan = (rosters?.pa || []).filter(p => p.allStarSource === 'fan');
  const ceMgr = (rosters?.ce || []).filter(p => p.allStarSource === 'manager');
  const paMgr = (rosters?.pa || []).filter(p => p.allStarSource === 'manager');
  const results = (gameResults && gameResults.length > 0)
    ? gameResults
    : (gameResult ? [{ ...gameResult, gameNo: 1, venue: { stadiumLabel: '未設定球場' } }] : []);
  const totalCe = results.reduce((s, g) => s + (g?.score?.ce || 0), 0);
  const totalPa = results.reduce((s, g) => s + (g?.score?.pa || 0), 0);

  return (
    <div className="app">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 14px' }}>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '.15em' }}>SPECIAL EVENT</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#f5c842', marginBottom: 12 }}>{year}年 プロ野球オールスターゲーム</div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            セ・リーグ {totalCe} - {totalPa} パ・リーグ
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {results.map((g) => (
              <div key={g.gameNo} className="fsb" style={{ fontSize: 12, color: '#cbd5e1' }}>
                <div>第{g.gameNo}戦（{g.venue?.stadiumLabel || '-'}） セ {g.score?.ce ?? 0} - {g.score?.pa ?? 0} パ</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>MVP: {g.mvp?.name || '-'}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ファン投票選出</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#60a5fa', marginBottom: 4 }}>セ・リーグ ({ceFan.length})</div>
            <SelectionTable players={ceFan} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4 }}>パ・リーグ ({paFan.length})</div>
            <SelectionTable players={paFan} />
          </div>
        </div>

        <details className="card" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>監督推薦選出を見る</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#60a5fa', marginBottom: 4 }}>セ・リーグ ({ceMgr.length})</div>
              <SelectionTable players={ceMgr} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4 }}>パ・リーグ ({paMgr.length})</div>
              <SelectionTable players={paMgr} />
            </div>
          </div>
        </details>

        <button className="btn btn-gold" onClick={onEnd}>続ける →</button>
      </div>
    </div>
  );
}
