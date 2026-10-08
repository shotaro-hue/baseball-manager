import '../mobile-flow.css';
import { useResultDialog } from './useResultDialog';
import { fmtIP } from '../utils';

/**
 * イニング別スコア表
 * inningScores は常に [{inning, away, home}] 形式
 */
function InningScoreTable({ inningScores, homeTeamName, awayTeamName, homeTotal, awayTotal }) {
  if (!inningScores || !inningScores.length) return null;
  const abbr = (name) => (name || '').slice(0, 5);
  return (
    <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="イニング別スコア" style={{ marginBottom: 14 }}>
      <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 240 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(148,163,184,.18)', color: '#53657c' }}>
            <th style={{ textAlign: 'left', padding: '3px 6px', minWidth: 60 }}>チーム</th>
            {inningScores.map(s => (
              <th key={s.inning} style={{ textAlign: 'center', padding: '3px 3px', minWidth: 18 }}>{s.inning}</th>
            ))}
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 700, color: '#17243a', borderLeft: '1px solid rgba(148,163,184,.18)' }}>R</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid rgba(148,163,184,.07)' }}>
            <td style={{ padding: '3px 6px', color: '#53657c', fontSize: 14 }}>{abbr(awayTeamName)}</td>
            {inningScores.map(s => (
              <td key={s.inning} style={{ textAlign: 'center', padding: '3px 3px', color: '#334962' }}>{s.away ?? 0}</td>
            ))}
            <td style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 700, color: '#17243a', borderLeft: '1px solid rgba(148,163,184,.18)' }}>{awayTotal}</td>
          </tr>
          <tr>
            <td style={{ padding: '3px 6px', color: '#53657c', fontSize: 14 }}>{abbr(homeTeamName)}</td>
            {inningScores.map(s => (
              <td key={s.inning} style={{ textAlign: 'center', padding: '3px 3px', color: '#334962' }}>{s.home ?? '-'}</td>
            ))}
            <td style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 700, color: '#17243a', borderLeft: '1px solid rgba(148,163,184,.18)' }}>{homeTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 打撃成績テーブル
function BattingTable({ batting, teamName }) {
  if (!batting || !batting.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, color: '#53657c', marginBottom: 5, fontWeight: 600 }}>{teamName} 打撃</div>
      <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績表。横にスクロールできます">
        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(148,163,184,.18)', color: '#53657c' }}>
              <th style={{ textAlign: 'left', padding: '3px 5px', minWidth: 72 }}>選手</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>AB</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>H</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 28 }}>HR</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 28 }}>RBI</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>BB</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>K</th>
            </tr>
          </thead>
          <tbody>
            {batting.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.05)' }}>
                <td style={{ padding: '3px 5px', color: '#17243a' }}>
                  {p.name}
                  <span style={{ fontSize: 14, color: '#53657c', marginLeft: 4 }}>{p.pos}</span>
                </td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.AB}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#17243a', fontWeight: p.H > 0 ? 700 : 400 }}>{p.H}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: p.HR > 0 ? '#805700' : '#53657c' }}>{p.HR}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.RBI}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.BB}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.K}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 投手成績テーブル
function PitchingTable({ pitching, teamName }) {
  if (!pitching || !pitching.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, color: '#53657c', marginBottom: 5, fontWeight: 600 }}>{teamName} 投手</div>
      <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績表。横にスクロールできます">
        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(148,163,184,.18)', color: '#53657c' }}>
              <th style={{ textAlign: 'left', padding: '3px 5px', minWidth: 72 }}>投手</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 30 }}>IP</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>H</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>ER</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>BB</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 24 }}>K</th>
              <th style={{ textAlign: 'center', padding: '3px 4px', minWidth: 28 }}>結果</th>
            </tr>
          </thead>
          <tbody>
            {pitching.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.05)' }}>
                <td style={{ padding: '3px 5px', color: '#17243a' }}>{p.name}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{fmtIP(p.ip)}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.H}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: p.ER > 0 ? '#b42332' : '#53657c' }}>{p.ER}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.BB}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px', color: '#53657c' }}>{p.K}</td>
                <td style={{ textAlign: 'center', padding: '3px 4px' }}>
                  {p.result && (
                    <span style={{ color: p.result === 'W' ? '#14714b' : p.result === 'L' ? '#b42332' : '#7050ad', fontWeight: 700 }}>
                      {p.result}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * ボックススコアモーダル
 *
 * result: allTeamResultsMap[teamId][dayNo] の形式
 *   Workerの視点形式: { myBatting, oppBatting, myPitching, oppPitching, inningScores, ... }
 *   旧形式・戦術ホーム: { homeBatting, awayBatting, homePitching, awayPitching, inningScores, ... }
 *
 * teamId: 表示視点チームの ID（home/away 判定に使用）
 */
export function BoxScoreModal({ result, myTeamName, oppTeamName, teamId, dayNo, onClose }) {
  const dialogRef = useResultDialog(onClose, Boolean(result));

  if (!result) return null;

  const { won, drew, myScore, oppScore, inningScores, homeId, awayId } = result;

  // ホーム/アウェイ判定: homeId に teamId が含まれているか
  const isMyHome = homeId === teamId;

  // Worker records use team-perspective keys even at home. Preserve legacy
  // records as a fallback, but do not replace explicitly recorded empty arrays.
  const myBatting = result.myBatting ?? (isMyHome ? result.homeBatting : result.awayBatting);
  const oppBatting = result.oppBatting ?? (isMyHome ? result.awayBatting : result.homeBatting);
  const myPitching = result.myPitching ?? (isMyHome ? result.homePitching : result.awayPitching);
  const oppPitching = result.oppPitching ?? (isMyHome ? result.awayPitching : result.homePitching);

  // イニング別スコア表のホーム/アウェイ名・合計
  const homeTeamName = isMyHome ? myTeamName : oppTeamName;
  const awayTeamName = isMyHome ? oppTeamName : myTeamName;
  const homeTotal = isMyHome ? myScore : oppScore;
  const awayTotal = isMyHome ? oppScore : myScore;

  const resultLabel = drew ? '引き分け' : won ? '勝利' : '敗北';
  const resultColor = drew ? '#53657c' : won ? '#14714b' : '#b42332';

  const hasBoxScore = (myBatting && myBatting.length > 0) || (myPitching && myPitching.length > 0);

  return (
    <div
      className="detail-score-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}
    >
      <div
        ref={dialogRef} className="calm-detail detail-score-dialog" role="dialog" aria-modal="true" aria-label="試合詳細"
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', border: '1px solid #c5d8ed', borderRadius: 12, padding: '18px 20px', width: '100%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,.6)', marginBottom: 16 }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, color: '#53657c', marginBottom: 3 }}>第{dayNo}戦 — {isMyHome ? 'ホーム' : 'ビジター'}</div>
            <div style={{ fontSize: 14, color: '#53657c', marginBottom: 6 }}>
              {awayTeamName} <span style={{ color: '#53657c' }}>@</span> {homeTeamName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#17243a' }}>{myScore}</span>
              <span style={{ fontSize: 14, color: '#53657c' }}>-</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#17243a' }}>{oppScore}</span>
              <span style={{
                background: drew ? 'rgba(107,114,128,.2)' : won ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)',
                color: resultColor,
                border: `1px solid ${resultColor}40`,
                borderRadius: 6,
                padding: '3px 12px',
                fontSize: 14,
                fontWeight: 700,
              }}>
                {resultLabel}
              </span>
            </div>
          </div>
          <button
            aria-label="試合詳細を閉じる"
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#53657c', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
          >✕</button>
        </div>

        {/* イニング別スコア */}
        {inningScores && inningScores.length > 0 && (
          <InningScoreTable
            inningScores={inningScores}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            homeTotal={homeTotal}
            awayTotal={awayTotal}
          />
        )}

        {hasBoxScore ? (
          <>
            {/* 自チーム打撃 */}
            <BattingTable batting={myBatting} teamName={myTeamName} />
            {/* 相手打撃 */}
            <BattingTable batting={oppBatting} teamName={oppTeamName} />
            {/* 自チーム投手 */}
            <PitchingTable pitching={myPitching} teamName={myTeamName} />
            {/* 相手投手 */}
            <PitchingTable pitching={oppPitching} teamName={oppTeamName} />
          </>
        ) : (
          <div style={{ fontSize: 14, color: '#53657c', textAlign: 'center', padding: '12px 0' }}>
            詳細成績データなし（バッチシム以前の試合）
          </div>
        )}
      </div>
    </div>
  );
}
