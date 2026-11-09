import { reduceEconomyCommandAsync, toAnnualState } from './contractEconomy';
import { yearEndRetirementsId, requiresYearEndRetirements } from './annualYearEndRetirements';

export function yearEndRetirementsRequest(world, decisions) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch, baseRevision: world.contractEconomy?.revision,
    season: world.year, date: world.contractEconomy?.clock.date, teamId: world.myId, decisions };
}
export function reduceYearEndRetirementsRequestAsync(world, r) {
  try {
    const fields = ['saveId', 'epoch', 'baseRevision', 'season', 'date', 'teamId', 'decisions'];
    if (!r || Object.keys(r).length !== fields.length || Object.keys(r).some(k => !fields.includes(k))
      || !Number.isInteger(r.season) || r.season < 1 || r.season >= 9999
      || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0) throw Error('期末引退判断の確認内容が不正です。');
    const state = toAnnualState(world), e = world.contractEconomy;
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.baseRevision > e.revision)
      throw Error('セーブ・球団が変更されています。期末引退の判断を開き直してください。');
    const transaction = { id: yearEndRetirementsId(r.season), type: 'prepare-year-end-retirements', humanTeamId: r.teamId, decisions: r.decisions };
    if (!state.transactions.some(t => t.id === transaction.id)
      && (r.baseRevision !== e.revision || r.season !== world.year || r.date !== state.date || !requiresYearEndRetirements(world)))
      throw Error('状態が変更されています。期末引退の判断を開き直してください。');
    return reduceEconomyCommandAsync(world, { saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision, transaction });
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
