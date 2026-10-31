import { it, expect } from 'vitest';
import { validateRosterReference } from './stage.mjs';
const player={playerId:'npb:test',teamId:0,registration:'development'};
const reference={asOf:'2026-03-27',scope:'all',status:'verified',players:[player]};
it('requires player-by-player identity, team and registration equivalence in both directions',()=>{
 expect(()=>validateRosterReference({players:[player]},reference)).not.toThrow();
 for(const players of [[],[player, {...player,playerId:'extra'}],[{...player,teamId:1}],[{...player,registration:'controlled'}]])
   expect(()=>validateRosterReference({players},reference)).toThrow();
});
it('cannot publish a reconstructed but not independently verified reference',()=>{
 expect(()=>validateRosterReference({players:[player]},{...reference,status:'reconstructed-not-independently-verified'})).toThrow(/verified/);
 expect(()=>validateRosterReference({players:[player]},{...reference,asOf:'2026-10-31'})).toThrow(/date/);
});
