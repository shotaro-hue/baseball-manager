import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ResultScreen } from '../../../src/components/ResultScreen';
import { BoxScoreModal } from '../../../src/components/BoxScoreModal';
import { computeBoxScore } from '../../../src/engine/postGame';
import { decisionFixture, decisionScenarios } from '../../../tests/fixtures/pitcherDecisions';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';

const query = new URLSearchParams(location.search);
const name = query.get('scenario') || 'own relief loss';
const isHome = query.get('home') !== 'false';
const { result, myTeam, oppTeam } = decisionFixture(decisionScenarios[name], isHome);
const teams = [myTeam, oppTeam];
const box = computeBoxScore(result.log, [], isHome ? myTeam.players : oppTeam.players,
  isHome ? oppTeam.players : myTeam.players, isHome ? result.score.my : result.score.opp,
  isHome ? result.score.opp : result.score.my);
const savedResult = {
  myScore: result.score.my, oppScore: result.score.opp, isHome,
  homeId: isHome ? myTeam.id : oppTeam.id, awayId: isHome ? oppTeam.id : myTeam.id,
  won: result.score.my > result.score.opp, drew: result.score.my === result.score.opp,
  myPitching: isHome ? box.homePitching : box.awayPitching,
  oppPitching: isHome ? box.awayPitching : box.homePitching,
};
function App() {
  const [open, setOpen] = useState(false);
  return <>
    <p style={{ padding: 8, margin: 0, background: '#fff', color: '#17243a' }}>固定ログの表示検証（実試合・保存成功の証明ではありません）</p>
    <ResultScreen gsResult={result} myTeam={myTeam} oppTeam={oppTeam} teams={teams} gameDay={1}
      nextLabel="同じログの試合詳細" onNext={() => setOpen(true)} />
    {open && <BoxScoreModal result={savedResult} dayNo={1} teamId={myTeam.id} myTeamName="自軍" oppTeamName="相手" onClose={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
