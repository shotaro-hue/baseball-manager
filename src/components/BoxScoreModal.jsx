import { useResultDialog } from './useResultDialog';
import { fmtIP } from '../utils';
import { Button, DataTableFrame, StateLabel } from './design-system/primitives';
import './match-history.css';

const recorded = value => value ?? '—';

function InningScoreTable({ inningScores, homeTeamName, awayTeamName, homeTotal, awayTotal }) {
  if (!inningScores?.length) return null;
  return <DataTableFrame label="イニング別スコア。横にスクロールできます" className="history-innings">
    <table><thead><tr><th scope="col">球団</th>{inningScores.map(s => <th key={s.inning} scope="col" data-number>{s.inning}</th>)}<th scope="col" data-number>R</th></tr></thead>
      <tbody><tr><td>{awayTeamName}</td>{inningScores.map(s => <td key={s.inning} data-number>{recorded(s.away)}</td>)}<td data-number>{recorded(awayTotal)}</td></tr>
        <tr><td>{homeTeamName}</td>{inningScores.map(s => <td key={s.inning} data-number>{s.home === null ? '−' : recorded(s.home)}</td>)}<td data-number>{recorded(homeTotal)}</td></tr></tbody>
    </table>
  </DataTableFrame>;
}

function BattingTable({ batting, teamName }) {
  if (!batting?.length) return null;
  return <section className="history-player-table"><h2>{teamName} 打撃</h2>
    <DataTableFrame label={`${teamName} 打撃成績。横にスクロールできます`}><table><thead><tr><th scope="col">選手</th>{['AB','H','HR','RBI','BB','K'].map(key => <th key={key} scope="col" data-number>{key}</th>)}</tr></thead>
      <tbody>{batting.map(p => <tr key={p.id}><td>{p.name}<small>{p.pos}</small></td>{['AB','H','HR','RBI','BB','K'].map(key => <td key={key} data-number>{recorded(p[key])}</td>)}</tr>)}</tbody>
    </table></DataTableFrame>
  </section>;
}

function PitchingTable({ pitching, teamName }) {
  if (!pitching?.length) return null;
  return <section className="history-player-table"><h2>{teamName} 投手</h2>
    <DataTableFrame label={`${teamName} 投手成績。横にスクロールできます`}><table><thead><tr><th scope="col">投手</th>{['IP','H','ER','BB','K','結果'].map(key => <th key={key} scope="col" data-number>{key}</th>)}</tr></thead>
      <tbody>{pitching.map(p => <tr key={p.id}><td>{p.name}</td><td data-number>{p.ip == null ? '—' : fmtIP(p.ip)}</td>{['H','ER','BB','K'].map(key => <td key={key} data-number>{recorded(p[key])}</td>)}<td data-number>{p.result || '−'}</td></tr>)}</tbody>
    </table></DataTableFrame>
  </section>;
}

// Reads persisted team-perspective records, with per-field legacy fallbacks.
// Explicit empty arrays stay empty; no current roster or season totals are used.
export function BoxScoreModal({ result, myTeamName, oppTeamName, teamId, dayNo, date, year, onClose, label = '試合詳細' }) {
  const dialogRef = useResultDialog(onClose, Boolean(result));
  if (!result) return null;
  const { won, drew, myScore, oppScore, inningScores, homeId } = result;
  const isMyHome = homeId != null ? homeId === teamId : result.isHome;
  const myBatting = result.myBatting ?? (isMyHome ? result.homeBatting : result.awayBatting);
  const oppBatting = result.oppBatting ?? (isMyHome ? result.awayBatting : result.homeBatting);
  const myPitching = result.myPitching ?? (isMyHome ? result.homePitching : result.awayPitching);
  const oppPitching = result.oppPitching ?? (isMyHome ? result.awayPitching : result.homePitching);
  const homeTeamName = isMyHome ? myTeamName : oppTeamName;
  const awayTeamName = isMyHome ? oppTeamName : myTeamName;
  const outcome = drew ? '引き分け' : won === true ? '勝利' : won === false ? '敗北' : '勝敗未確認';
  const tone = drew || won == null ? 'neutral' : won ? 'success' : 'danger';
  const hasBoxScore = [myBatting, oppBatting, myPitching, oppPitching].some(rows => rows?.length > 0);
  return <div className="history-score-overlay" onClick={onClose}>
    <div ref={dialogRef} data-ds="history" className="history-score-dialog" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}>
      <header className="history-score-header"><div><p className="history-context">{year != null && `${year}年`}{date ? `${date.month}月${date.day}日 · ` : '日付未記録 · '}第{dayNo}戦{isMyHome != null && ` · ${isMyHome ? 'ホーム' : 'ビジター'}`}</p><h1>{label}</h1></div><Button variant="secondary" aria-label={`${label}を閉じる`} onClick={onClose}>閉じる</Button></header>
      <div className="history-score-band"><p>{myTeamName}の視点</p><div className="history-score-clubs"><strong>{myTeamName}<span>{recorded(myScore)}</span></strong><span aria-hidden="true">−</span><strong>{oppTeamName}<span>{recorded(oppScore)}</span></strong></div><StateLabel tone={tone} role="note">{outcome}</StateLabel></div>
      <p className="history-record-note">この試合の保存記録。— は未記録、イニングの − はホーム側の攻撃未実施。0は記録された値です。</p>
      <InningScoreTable inningScores={inningScores} homeTeamName={homeTeamName} awayTeamName={awayTeamName} homeTotal={isMyHome ? myScore : oppScore} awayTotal={isMyHome ? oppScore : myScore}/>
      {!inningScores?.length && <p className="history-record-note">イニング別スコアは未記録です。</p>}
      {hasBoxScore ? <div className="history-score-tables"><BattingTable batting={myBatting} teamName={myTeamName}/><BattingTable batting={oppBatting} teamName={oppTeamName}/><PitchingTable pitching={myPitching} teamName={myTeamName}/><PitchingTable pitching={oppPitching} teamName={oppTeamName}/></div> : <p className="history-empty">詳細成績データなし。この保存記録には選手別成績がありません。</p>}
    </div>
  </div>;
}
