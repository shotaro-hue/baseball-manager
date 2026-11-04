import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { economyPolicy } from './economyWorld';

export const envelope = (w, transaction) => ({ saveId:w.saveId, epoch:w.contractEconomy.epoch, baseRevision:w.contractEconomy.revision, transaction });
export function declaration(w, playerId=0, extra={}) {
  const player=[...w.teams[0].players,...w.teams[0].farm].find(p=>p.id===playerId);
  return envelope(w,{id:'declare-'+playerId,type:'declare-fa',teamId:w.teams[0].id,playerId,contractId:player?.contractId,kind:'domestic-fa',...extra});
}
export function faWinter({target=0,teams,foreign=false,development=false,years=1}={}) {
  const players=Array.from({length:12},(_,i)=>({id:i,name:'FA '+i,pos:'一塁手',age:33,salary:12000-i*1000,contractYearsLeft:1,
    entryType:'高卒',daysOnActiveRoster:1080,isForeign:false,stats:{HR:10},serviceYears:9}));
  players[target].isForeign=foreign;players[target].isIkusei=development;players[target].contractYearsLeft=years;
  const clubs=teams??[{id:0,name:'Club 0',players:players.slice(0,6),farm:players.slice(6),lineup:[0,1],rotation:[0],fieldingDh:{0:'一塁手'},pitchingPattern:{closerId:0,middleOrder:[0]}},
    {id:1,name:'Club 1',players:[{...players[0],id:'other',salary:1000,contractYearsLeft:3}],farm:[]}];
  const w=createAnnualNewGameWorld({teams:structuredClone(clubs),faPool:[],myId:clubs[0].id,saveId:'fa-declarations',season:2026,
    policy:economyPolicy(clubs,2026,1000000),randomRoot:{algorithmVersion:1,seed:'fa-declarations'}});
  w.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};
  w.contractEconomy.engine.spending.budgetSeason=2027;
  return fromAnnualState(w,toAnnualState(w));
}
