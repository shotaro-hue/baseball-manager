import React from 'react';
import { createRoot } from 'react-dom/client';
import teamSource from './team.json';
import { RosterTab } from '../../../src/components/tabs/RosterTab';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';

const state = new URLSearchParams(location.search).get('state') || 'normal';
const team = structuredClone(teamSource);
if (state === 'empty') { team.players = []; team.farm = []; team.lineup = []; team.rotation = []; }
if (state === 'long') for (const p of team.players) p.name += '・ロングネーム確認選手';
if (state === 'missing') for (const p of team.players) { delete p.condition; delete p.morale; p.stats = {}; }
if (state === 'injured') for (const p of team.players) { p.injuryDaysLeft = 4; p.injury = '負傷確認'; }
if (state === 'zero') for (const p of team.players) { p.condition = 0; p.morale = 0; p.stats = { AB: 10, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, IP: 3, ER: 0, BBp: 0, Hp: 0 }; }
const record = (name, value) => { document.body.dataset.action = JSON.stringify({ name, value }); };
const callbacks = Object.fromEntries(['ReplaceLineup', 'SetLineupOrder', 'SetRosterDhMode', 'SetPlayerPosition', 'SetStarter', 'Promo', 'Demo', 'SetTrainingFocus', 'ConvertIkusei', 'MoveRotation', 'RemoveFromRotation', 'SetPitchingPattern', 'ReplaceRotation', 'ApplyRosterPlan', 'PlayerClick', 'SetDevGoal', 'PlayerTalk', 'SetConvertTarget', 'SetManagementPolicy', 'SetRosterAutomationMode'].map(key => [`on${key}`, (...args) => record(key, args)]));
createRoot(document.getElementById('root')).render(<div className="app calm-shell" style={{ maxWidth: 1320, margin: 'auto', padding: 16 }}>
  <RosterTab team={team} allTeams={[team]} farmState={{ year: 2026 }} {...callbacks} />
</div>);
