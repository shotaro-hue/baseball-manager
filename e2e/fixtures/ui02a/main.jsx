import React from 'react';
import { createRoot } from 'react-dom/client';
import { MobileRoster } from '../../../src/components/MobileRoster';
import teamSource from './team.json';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';

const state = new URLSearchParams(location.search).get('state') || 'normal';
const team = structuredClone(teamSource);
if (state === 'empty') { team.players = []; team.farm = []; team.lineup = []; }
if (state === 'long') for (const p of [...team.players, ...team.farm]) p.name += '・ロングネーム確認選手';
if (state === 'missing') for (const p of [...team.players, ...team.farm]) { delete p.condition; p.stats = {}; }
if (state === 'injured') for (const p of [...team.players, ...team.farm]) { p.injuryDaysLeft = 4; p.injury = '負傷確認'; }
if (state === 'zero') for (const p of [...team.players, ...team.farm]) { p.condition = 0; p.batting = { ...p.batting, contact: 0, power: 0 }; p.stats = { AB: 10, H: 0, HR: 0 }; }
const record = (name, value) => { document.body.dataset.action = JSON.stringify({ name, value }); };
createRoot(document.getElementById('root')).render(<div className="app calm-shell" style={{ maxWidth: 1320, margin: 'auto', padding: 16 }}>
  <p style={{ fontSize: 12, color: '#526778' }}>編成一覧の表示検証（実昇降格・保存の証明ではありません）</p>
  <MobileRoster team={team} farmState={{ year: 2026 }} onPlayerClick={p => record('player', p.id)}
    onReplaceLineup={value => record('lineup', value)} onSetLineupOrder={(id, order) => record('order', { id, order })}
    onSetRosterDhMode={value => record('dh', value)} />
</div>);
