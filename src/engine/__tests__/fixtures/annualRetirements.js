import { fromAnnualState, toAnnualState } from '../../contractEconomy';
export const wrap = (w, transaction) => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction });
export const reserve = (w, playerId = 0, extra = {}) => wrap(w, { id: 'retire-'+playerId, type: 'reserve-retirement', teamId: w.teams[0].id, playerId,
  contractId: [...w.teams[0].players,...w.teams[0].farm].find(p=>p.id===playerId)?.contractId, ...extra });
export const finish = w => wrap(w, { id:'finish', type:'finalize-retirement', reservationId:w.contractEconomy.engine.retirementReservations[0].id });
export const winter = w => { const n=structuredClone(w); n.contractEconomy.clock={season:w.year,phase:'offseason',date:`${w.year}-12-01`,offseasonTurn:0};
  n.contractEconomy.engine.spending.budgetSeason=w.year+1; return fromAnnualState(n,toAnnualState(n)); };
