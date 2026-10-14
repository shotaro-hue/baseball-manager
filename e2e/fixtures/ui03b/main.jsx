import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import { ContractRenewalPhaseScreen } from '../../../src/components/ContractRenewalPhaseScreen';
import { applyAgreedContract } from '../../../src/engine/renewalRules';

const query = new URLSearchParams(location.search);
const state = query.get('state') || 'normal';
const names = ['佐藤 海斗', '田中 悠真', '小林 樹', '西川 涼', '山本 航', '鈴木 蓮'];
const players = Array.from({ length: state === 'many' ? 28 : 6 }, (_, id) => ({
  id, name: names[id] || `選手${id}`, age: 23 + id, pos: id === 1 ? '先発' : '遊撃', isPitcher: id === 1,
  salary: 4800, contractYearsLeft: 1, daysOnActiveRoster: id === 1 ? 900 : 0, 育成: id === 5,
  stats: id === 1 ? { IP: 120, ER: 0, W: 0, Kp: 120 } : { PA: 500, AB: 450, H: 129, HR: 14, RBI: 42, BB: 40, HBP: 5, SF: 5, D: 25, T: 3 },
  batting: { contact: 60, power: 58, eye: 50, speed: 66, arm: 60, defense: 66 }, personality: { money: 50 },
}));
if (state === 'long') players[0].name = 'アレクサンダー・とても長い選手名・表示確認';
if (state === 'missing') players.forEach(p => { delete p.salary; p.stats = {}; });
if (state === 'zero') players.forEach(p => { p.salary = 0; p.stats = { PA: 0, AB: 0, H: 0, HR: 0, RBI: 0 }; });
const club = { id: 0, name: '東京ヤクルトスワローズ', players: state === 'empty' ? [] : players.slice(0, -2), farm: state === 'empty' ? [] : players.slice(-2), wins: 80, losses: 60, lineup: [0], budget: 82000 };
const demands = Object.fromEntries(players.map(p => [p.id, { demandSalary: state === 'missing' ? undefined : 6200, minAcceptSalary: 6000 }]));
const statuses = ['pending', 'signed', 'cooldown', 'free_requested', 'fa', 'free', 'released'];
const saved = ['states', 'signed', 'cooldown', 'free_requested', 'stale'].includes(state) ? {
  baseline: 28800, others: [], entries: players.map((player, i) => ({ player, demand: demands[player.id], status: state === 'states' ? statuses[i] : i === 0 ? (state === 'stale' ? 'pending' : state) : 'pending', salary: '6200', years: 1, round: 1, retries: 0, logs: ['選手：保存された返答'], ...(state === 'signed' && i === 0 || state === 'states' && i === 1 ? { terms: { salary: 6200, years: 2 } } : {}) })),
} : undefined;
function Fixture() {
  const [teams, setTeams] = useState([club]);
  window.resolveRenewalTarget = id => setTeams(ts => ts.map(t => ({ ...t, players: t.players.map(p => p.id === id ? applyAgreedContract(p, 6200, 2, 2026) : p), farm: t.farm.map(p => p.id === id ? applyAgreedContract(p, 6200, 2, 2026) : p) })));
  const onSign = (id, salary, years) => { document.body.dataset.signs = String(Number(document.body.dataset.signs || 0) + 1); setTeams(ts => ts.map(t => ({ ...t, players: t.players.map(p => p.id === id ? applyAgreedContract(p, salary, years, 2026) : p), farm: t.farm.map(p => p.id === id ? applyAgreedContract(p, salary, years, 2026) : p) }))); };
  const onRelease = id => { document.body.dataset.releases = String(Number(document.body.dataset.releases || 0) + 1); setTeams(ts => ts.map(t => ({ ...t, players: t.players.filter(p => p.id !== id), farm: t.farm.filter(p => p.id !== id) }))); };
  const onSessionChange = useCallback(value => { window.renewalSession = JSON.parse(JSON.stringify(value)); }, []);
  return <div style={{ maxWidth: query.get('container') ? `${query.get('container')}px` : undefined, margin: '0 auto' }}>
    <ContractRenewalPhaseScreen teams={teams} myId={0} year={2026} saveId="fixture" demands={demands} embedded={query.has('embedded')} savedSession={saved} savedView={state === 'stale' ? { selectedId: 'missing', filter: 'pending' } : undefined} onSessionChange={onSessionChange} onSign={onSign} onRelease={onRelease} onNext={() => { document.body.dataset.next = 'true'; }} />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
