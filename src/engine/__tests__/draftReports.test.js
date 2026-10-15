import { expect, it } from 'vitest';
import { ensureDraftEvaluation, startDraftEvaluation, scoutDraftCandidate, draftReport, rememberDraftReport } from '../draftReports';

const teams = [{ id: 0 }, { id: 1 }];
const p = (id, extra = {}) => ({ id, name: `候補${id}`, age: 22, pos: '捕手', potential: 85,
  batting: { contact: 45, power: 42, eye: 50, speed: 40, defense: 85, catching: 88, arm: 78 }, ...extra });
const pool = Array.from({ length: 24 }, (_, i) => p(i));
const init = extra => ensureDraftEvaluation({ teams, pool, year: 2026, myId: 0, ...extra });

it('creates serializable stable public and private observations independent of candidate order', () => {
  const s = init();
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  expect(init({ pool: [...pool].reverse() })).toEqual(s);
  expect(draftReport(s, 0).strength).toMatch(/捕球|守備|送球/);
  expect(draftReport(s, 0, 0)).not.toEqual(draftReport(s, 0));
  expect(draftReport(s, 0, 0)).not.toEqual(draftReport(s, 0, 1));
});
it('keeps saved observations when hidden abilities change and does not mutate prospects', () => {
  const s = init(), before = structuredClone(pool);
  expect(init({ existing: s, pool: pool.map(p => ({ ...p, potential: 5 })) })).toBe(s);
  expect(draftReport(s, 0, 0).future).not.toBe(pool[0].potential);
  expect(pool).toEqual(before);
});
it('preserves legacy zero points and known candidates without inventing past snapshots', () => {
  const s = init({ legacy: { scoutPt: 0, scouted: [0] } });
  expect(s.points).toBe(0); expect(s.scouted).toContain(0); expect(s.snapshots).toEqual({});
  expect(scoutDraftCandidate(s, pool, 1)).toBe(s);
});
it('locks allocation once and chooses automatic reports from public observations', () => {
  const s = startDraftEvaluation(init(), pool, { pitcher: 10, batter: 90 });
  expect(s.locked).toBe(true); expect(s.scouted).toHaveLength(7);
  expect(startDraftEvaluation(s, pool, { pitcher: 90, batter: 10 })).toBe(s);
  const order = [...pool].sort((a,b) => draftReport(s,b.id).value - draftReport(s,a.id).value || String(a.id).localeCompare(String(b.id)));
  expect(new Set(s.scouted)).toEqual(new Set(order.slice(0,7).map(p=>p.id)));
});
it('shares five points from the first round, refines once and prevents duplicate consumption', () => {
  const s = startDraftEvaluation(init(), pool, { pitcher: 90, batter: 10 });
  const id = pool.find(p => !s.scouted.includes(p.id)).id;
  const before = draftReport(s,id,0), next = scoutDraftCandidate(s,pool,id);
  expect(next.points).toBe(4); expect(next.scouted).toContain(id);
  expect(draftReport(next,id,0).uncertainty).toBeLessThan(before.uncertainty);
  expect(scoutDraftCandidate(next,pool,id)).toBe(next);
  expect(scoutDraftCandidate(next,pool,'missing')).toBe(next);
});
it('freezes a pick-time report and keeps it across later observation changes', () => {
  const s = init(), saved = rememberDraftReport(s,0);
  const next = { ...saved, teams: { ...saved.teams, 0: { ...saved.teams[0], 0: { ...saved.teams[0][0], future: 20 } } } };
  expect(rememberDraftReport(next,0).snapshots[0]).toEqual(saved.snapshots[0]);
  expect(saved.snapshots[0].report).toEqual(draftReport(s,0,0));
});
it('keeps previously confirmed current skills private to the discovering team', () => {
  const s = init({ pool: [p(0,{ fromScout: true })] });
  expect(draftReport(s,0,0).skills.defense.low).toBe(85);
  expect(draftReport(s,0,0).skills.defense.high).toBe(85);
  expect(draftReport(s,0).uncertainty).toBeGreaterThan(0);
  expect(draftReport(s,0,1).uncertainty).toBeGreaterThan(0);
});
it('does not reuse observations belonging to another year or player organization', () => {
  const s = init();
  expect(init({existing:s,year:2027})).not.toBe(s);
  expect(init({existing:s,myId:1})).not.toBe(s);
});
it('higher allocation never reduces automatic coverage or widens refined uncertainty', () => {
  const low=startDraftEvaluation(init(),pool,{pitcher:90,batter:10});
  const high=startDraftEvaluation(init(),pool,{pitcher:10,batter:90});
  expect(high.scouted.length).toBeGreaterThan(low.scouted.length);
  const id=low.scouted[0];
  expect(draftReport(high,id,0).uncertainty).toBeLessThanOrEqual(draftReport(low,id,0).uncertainty);
});
it('repairs only missing reports without restoring spent points or losing saved evidence',()=>{
 let saved=startDraftEvaluation(init(),pool,{pitcher:10,batter:90});
 saved=rememberDraftReport({...saved,points:0},0);
 const incomplete=structuredClone(saved);
 delete incomplete.teams[1][0];delete incomplete.public[1];delete incomplete.teams[0][saved.scouted[0]];
 const restored=init({existing:incomplete});
 expect(restored.points).toBe(0);expect(restored.locked).toBe(true);
 expect(restored.allocation).toEqual(saved.allocation);expect(restored.scouted).toEqual(saved.scouted);
 expect(restored.snapshots).toEqual(saved.snapshots);
 expect(restored.teams[0][2]).toEqual(saved.teams[0][2]);
 expect(restored.teams[1][0]).toEqual(saved.teams[1][0]);
 expect(restored.public[1]).toEqual(saved.public[1]);
 expect(restored.teams[0][saved.scouted[0]]).toEqual(saved.teams[0][saved.scouted[0]]);
 expect(init({existing:restored})).toBe(restored);
});
