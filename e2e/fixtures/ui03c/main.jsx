import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import OffseasonFaPhaseScreen from '../../../src/components/OffseasonFaPhaseScreen';
import HubFaTab from '../../../src/components/hub/HubFaTab';
const query = new URLSearchParams(location.search), state = query.get('state') || 'normal';
const player = (id, extra = {}) => ({ id, name: `候補${id}`, age: 26, pos: '外野', salary: 1000, isFA: true, contractYearsLeft: 0,
  stats: { PA: 500, AB: 450, H: 129, D: 25, T: 3, HR: 14, RBI: 42, BB: 40, HBP: 5, SF: 5 }, ...extra });
let pool = Array.from({ length: state === 'many' ? 30 : 4 }, (_, id) => player(id, id === 1 ? { pos: '先発', isPitcher: true, stats: { IP: 120, ER: 0, W: 0, SV: 0, HLD: 0, Kp: 100 } } : {}));
if (state === 'long') pool[0].name = 'アレクサンダー・とても長い選手名・表示確認';
if (state === 'zero') pool[0] = player(0, { salary: 0, stats: { PA: 10, AB: 10, H: 0, HR: 0 } });
if (state === 'missing') pool[0] = player(0, { salary: null, stats: {} });
if (state === 'empty') pool = [];
if (state === 'declared') pool[0] = player(0, { marketEntryReason: '国内FA宣言', faPreviousSalary: 900, faOriginTeamId: 9, faNegotiationReason: '出場機会を求める' });
if (state === 'foreign' || state === 'deadline') pool = [player(0, { isForeign: true }), player(1)];
const owned = Array.from({ length: state === 'full' ? 28 : 3 }, (_, i) => player(`own-${i}`, { name: `所属${i}`, isFA: false, contractYearsLeft: 3 }));
function Fixture() {
  const [teams, setTeams] = useState([{ id: 9, name: '自球団', players: owned, farm: [], budget: state === 'budget' ? 1 : 10000, history: [] }]);
  const [faPool, setFaPool] = useState(pool), [faYears, setFaYears] = useState({}), [plan, setOffseasonPlan] = useState({ marketView: null });
  const gs = { teams, faPool, faYears, setFaYears, setFaPool, offseasonPlan: plan, setOffseasonPlan, year: 2026,
    gameDay: state === 'deadline' ? 101 : ['foreign'].includes(state) ? 100 : 143, notify: () => {},
    upd: (id, update) => { document.body.dataset.signs = String(Number(document.body.dataset.signs || 0) + 1); setTeams(current => current.map(t => t.id === id ? update(t) : t)); } };
  window.marketFixture = { snapshot: () => ({ teams, faPool, faYears, plan }), remove: id => setFaPool(current => current.filter(p => p.id !== id)) };
  const season = ['foreign', 'deadline'].includes(state), embedded = query.has('embedded');
  return <div style={{ maxWidth: query.get('container') ? `${query.get('container')}px` : undefined, margin: '0 auto', paddingTop: query.has('spacer') ? 600 : 0 }}>
    {season ? <HubFaTab myTeam={teams[0]} myId={9} year={2026} {...gs} marketMode="season" /> : <OffseasonFaPhaseScreen gs={gs} os={{ handleFaPhaseNext: () => { document.body.dataset.next = 'true'; } }} myTeam={teams[0]} myId={9} year={2026} embedded={embedded} />}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
