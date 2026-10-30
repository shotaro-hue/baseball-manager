import { NPB2025_ROSTERS } from './npb2025';
import { PLAYER_CORRECTIONS_2026 } from './playerMaster2026Corrections';
import release from './playerMaster2026.release.json';
import { compilePlayerMaster } from './playerMasterSchema';

// Facts, confidence and game estimates are separate. This adapter is new-game only.
// Until a fully verified, redistributable master is supplied, completeness stays false.
export function getOpeningRosters(master = release) {
  if(master!==null) return compilePlayerMaster(master);
  return Object.fromEntries(Object.entries(NPB2025_ROSTERS).map(([teamId,roster])=> {
    const normalize=(player,kind)=>{
      const correction=PLAYER_CORRECTIONS_2026[`${teamId}::${player.name}`]||{};
      return {...player,...correction,teamId:Number(teamId),kind,asOf:'2026-03-27',
        registration:correction.registration||'controlled',
        sourceRefs:[`legacy-spaia-20260417`,...(correction.sourceUrl?[correction.sourceUrl]:[])],
        dataQuality:{identity:'legacy-stable-id',membership:correction.registration?'official-dated':'legacy-unverified',
          salary:player.salary===5000?'game-assumption-ambiguous-legacy':'legacy-unverified',
          contract:'legacy-unverified',age:correction.birthDate?'official':'legacy-unverified',
          foreignQuota:correction.foreignQuotaStatus?'official-profile-reviewed':'legacy-unverified',
          history:kind==='pitcher'?'legacy-innings-precision-unverified':'legacy-unverified'},
      };
    };
    return [teamId,{complete:false,asOf:'2026-03-27',batters:roster.batters.map(p=>normalize(p,'batter')),pitchers:roster.pitchers.map(p=>normalize(p,'pitcher'))}];
  }));
}
