import { acquisitionFixture } from './acquisitionWorld';
import { fromAnnualState, toAnnualState } from '../../contractEconomy';

export function rookieFixture() {
  const w = acquisitionFixture({ phase: 'offseason', date: '2026-12-01' });
  const pool = [
    { id: 'rookie', name: '支配下新人', age: 18, pos: '捕手', salary: 600 },
    { id: 'development', name: '育成新人', age: 18, pos: '外野手', salary: 240, 育成: true },
    { id: 'other', name: '他球団新人', age: 22, pos: '投手', salary: 1000 },
  ];
  w.screen = 'draft_review';
  w.offseasonPlan = { year: w.year, resumeScreen: 'draft_review', draftPool: pool,
    draftResult: { pool, drafted: { rookie: 0, development: 0, other: 1 } }, draftViews: {} };
  return fromAnnualState(w, toAnnualState(w));
}
