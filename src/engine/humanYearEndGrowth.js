import { reduceEconomyCommandAsync } from './contractEconomy';
import { growthPlayerIds, requiresYearEndGrowth, yearEndGrowthId } from './annualYearEndGrowth';

export function yearEndGrowthRequest(world) {
  const e = world.contractEconomy;
  const saved = e?.engine.transactions.find(t => t.id === yearEndGrowthId(world.year));
  return { saveId: world.saveId, epoch: e?.epoch, baseRevision: e?.revision, season: world.year,
    date: e?.clock.date, playerIds: saved ? JSON.parse(saved.signature).playerIds : growthPlayerIds(world) };
}
export function reduceYearEndGrowthRequestAsync(world, r) {
  try {
    const e = world.contractEconomy, saved = e.engine.transactions.some(t => t.id === yearEndGrowthId(r?.season));
    if (!r || Object.keys(r).length !== 6 || Object.keys(r).some(k => !['saveId','epoch','baseRevision','season','date','playerIds'].includes(k)) || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0
      || !Number.isInteger(r.season) || r.season < 1 || r.season >= 9999
      || !saved && (r.baseRevision !== e.revision || r.season !== world.year || r.date !== e.clock.date || !requiresYearEndGrowth(world)))
      throw Error('状態が変更されています。年度末成長・要求年俸を開き直してください。');
    return reduceEconomyCommandAsync(world, { saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision,
      transaction: { id: yearEndGrowthId(r.season), type: 'prepare-year-end-growth', playerIds: r.playerIds } });
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
