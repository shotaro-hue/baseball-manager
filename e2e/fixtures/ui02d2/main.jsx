import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';
import source from '../ui02b/team.json';
import { LeaderboardTab } from '../../../src/components/tabs/LeaderboardTab';
import { PlayerModal } from '../../../src/components/PlayerModal';
import { PlayerComparisonDialog, PlayerComparisonTray } from '../../../src/components/PlayerComparisonTray';
import { emptyStats } from '../../../src/engine/playerCore';

const state = new URLSearchParams(location.search).get('state') || 'normal';
const team = structuredClone(source), opponent = structuredClone(source);
opponent.id = 999; opponent.name = '他球団確認'; opponent.league = 'パ';
for (const [ti,t] of [team,opponent].entries()) for (const p of [...t.players,...t.farm]) {
  p.id = `${ti}-${p.id}`; if (ti) p.name = `他球団・${p.name}`;
  p.stats = { ...emptyStats(), PA: 20, AB: 16, H: 5, D: 1, HR: 1, RBI: 3, BB: 3, HBP: 1, K: 4, IP: 6, ER: 2, BF: 24, Kp: 6, Hp: 4, evN: 6, evSum: 810, laN: 6, laSum: 60 };
  if (state === 'long') p.name += '・ロングネーム確認選手ロングネーム';
  if (state === 'injured') { p.injuryDaysLeft = 4; p.condition = 0; }
}
const batter = team.players.find(p => !p.isPitcher), pitcher = team.players.find(p => p.isPitcher);
const demoted = team.farm.find(p => !p.isPitcher); demoted.name = '二軍所属の一軍記録'; demoted.stats2 = { HR: 99 };
const farmOnly = team.farm.find(p => p !== demoted); farmOnly.name = '二軍だけの旧推定'; farmOnly.stats = emptyStats(); farmOnly.stats2 = { HR: 88, PA: 100 };
if (state === 'zero') for (const p of [batter,pitcher]) p.stats = { ...emptyStats(), PA: 10, AB: 10, IP: 5, BF: 15, evN: 1, laN: 1 };
if (state === 'denominator') { batter.stats = {...emptyStats(),PA:10}; pitcher.stats={...emptyStats(),IP:5}; }
if (state === 'missing') { batter.stats={PA:10}; pitcher.stats={IP:5}; }
if (state === 'legacy') { batter.stats = { PA: 10, AB: 10, H: 0 }; pitcher.stats = { IP: 5, BF: 15, W: 0 }; }
const specialNames={zero:['実測0野手','実測0投手'],missing:['欠測野手','欠測投手'],denominator:['分母0野手','分母0投手'],legacy:['旧記録野手','旧記録投手']};
if(specialNames[state]) [batter.name,pitcher.name]=specialNames[state];
function Fixture() {
  const [profile,setProfile] = useState(null), [compared,setCompared] = useState([]), [open,setOpen] = useState(false);
  const toggle = (p,name) => setCompared(current => current.some(s => s.id === p.id) ? current.filter(s => s.id !== p.id) : current.length < 2 ? [...current,{...p,_teamName:name}] : current);
  const remove = id => { setCompared(c => c.filter(p => p.id !== id)); setOpen(false); };
  return <div className="app calm-shell" style={{padding:16}}>
    <LeaderboardTab gameDay={10} teams={[team,opponent]} myId={team.id} year={2026} farmState={{year:2026,teams:[team,opponent]}} onPlayerClick={(p,name,tab) => setProfile({p,name,tab})} onToggleCompare={toggle} comparePlayerIds={compared.map(p => p.id)} />
    <PlayerComparisonTray players={compared} onRemove={remove} onClear={() => {setCompared([]);setOpen(false);}} onOpen={() => setOpen(true)} />
    {open && <PlayerComparisonDialog year={2026} teams={[team,opponent]} players={compared} onRemove={remove} onClose={() => setOpen(false)} />}
    {profile && <PlayerModal key={profile.p.id} player={profile.p} teamName={profile.name} teams={[team,opponent]} farmState={{year:2026,teams:[team,opponent]}} year={2026} initialSection={profile.tab} onToggleCompare={toggle} isCompared={compared.some(p => p.id === profile.p.id)} onClose={() => setProfile(null)} />}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
