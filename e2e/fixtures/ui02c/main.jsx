import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import source from '../ui02b/team.json';
import { PlayerModal } from '../../../src/components/PlayerModal';
import { PlayerComparisonDialog, PlayerComparisonTray } from '../../../src/components/PlayerComparisonTray';
import OffseasonPlanningScreen from '../../../src/components/OffseasonPlanningScreen';
import OffseasonFaPhaseScreen from '../../../src/components/OffseasonFaPhaseScreen';
import { GrowthSummaryScreen } from '../../../src/components/OffseasonReviewScreens';
import { record as measuredRecord } from '../../../src/engine/__tests__/farmRankingFixtures';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';

const state = new URLSearchParams(location.search).get('state') || 'normal';
const team = structuredClone(source);
const players = [team.players.find(p => !p.isPitcher), team.players.find(p => p.isPitcher), team.farm.find(p => !p.isPitcher)];
if (state === 'long') players.forEach(p => { p.name += '・ロングネーム確認選手ロングネーム確認'; });
if (state === 'injured') players.forEach(p => { p.injuryDaysLeft = 4; p.injury = '負傷確認'; });
if (state === 'missing') players.forEach(p => { delete p.stats; delete p.condition; delete p.morale; delete p.batting; delete p.pitching; });
if (state === 'zero') players.forEach(p => {
  p.condition = 0; p.morale = 0;
  p.stats = { PA: 4, AB: 4, H: 0, D: 0, T: 0, HR: 0, RBI: 0, SB: 0, BB: 0, HBP: 0, SF: 0, IP: 3, ER: 0, BBp: 0, Hp: 0, evN: 4, hardHit: 0 };
});
if (state === 'denominator') players.forEach(p => {
  p.stats = { PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, HBP: 0, SF: 0, IP: 0, ER: 0, BBp: 0, Hp: 0 };
});
players[2].stats2 = { PA: 10, H: 3 }; // Legacy estimates never become first-team/farm measured stats.
if (state === 'legacy') players.forEach(p => { p.stats2 = { PA: 10, H: 3 }; });
const farmState = { year: 2026, teams: [team] };
if (state === 'measured') {
  // Synthesized display fixture, not a claim of a valid played/persisted season.
  const competition = measuredRecord();
  competition.players[0].playerId = players[2].id;
  competition.players[0].name = players[2].name;
  competition.legacy = { source: 'legacy-estimated', entries: [{ playerId: players[2].id, year: null, stats: players[2].stats2 }] };
  farmState.farmCompetition = competition;
  farmState.seasonHistory = { farmArchives: [{ ...structuredClone(competition), year: 2025, startRound: 60 }] };
}
function Fixture() {
  const [profile, setProfile] = useState(null), [compared, setCompared] = useState([]), [open, setOpen] = useState(false);
  const toggle = player => setCompared(current => current.some(p => p.id === player.id) ? current.filter(p => p.id !== player.id) : current.length < 2 ? [...current, { ...player, _teamName: team.name }] : current);
  const remove = id => { setCompared(current => current.filter(p => p.id !== id)); setOpen(false); };
  return <div className="app calm-shell" style={{ padding: 16, minHeight: 1800 }}>
    <h1>選手詳細・比較の表示検証</h1>
    {players.map((p, i) => <button key={p.id} data-player-index={i} onClick={() => setProfile(p)}>{p.name}</button>)}
    <PlayerComparisonTray players={compared} onRemove={remove} onClear={() => { setCompared([]); setOpen(false); }} onOpen={() => setOpen(true)} />
    {open && <PlayerComparisonDialog year={2026} teams={[team]} players={compared} onRemove={remove} onClose={() => setOpen(false)} />}
    {profile && <PlayerModal key={profile.id} player={profile} farmState={farmState} teams={[team]} teamName={team.name} year={2026} isMyTeam onToggleCompare={toggle} isCompared={compared.some(p => p.id === profile.id)} onNavigate={tab => { document.body.dataset.action = tab; setProfile(null); }} onClose={() => setProfile(null)} />}
  </div>;
}
const mode = new URLSearchParams(location.search).get('mode');
const noop = () => {};
const gs = { teams: [team], year: 2026, gameDay: 143, faYears: {}, faPool: [{ ...players[2], id: 'free-agent', name: 'FA候補確認', isFA: true }],
  setFaYears: noop, setFaPool: noop, upd: noop, notify: noop, setOffseasonPlan: noop, getSeasonHistory: () => ({}),
  offseasonPlan: { version: 1, myId: team.id, year: 2026, stage: 'planning', tab: 'roster', intents: [], demands: {}, releasedIds: [], growth: { growth: [], decline: [], breakout: [] } } };
const common = { gs, os: {}, myTeam: team, myId: team.id, year: 2026 };
createRoot(document.getElementById('root')).render(mode === 'planning' ? <OffseasonPlanningScreen {...common} />
  : mode === 'fa' ? <OffseasonFaPhaseScreen {...common} />
  : mode === 'review' ? <GrowthSummaryScreen year={2026} teams={[team]} myId={team.id} summary={{growth:[{p:players[0],diff:3}],decline:[],breakout:[]}} onNext={noop} />
  : <Fixture />);
