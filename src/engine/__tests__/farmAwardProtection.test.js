import {it,expect} from 'vitest';import {calcSeasonAwards} from '../awards';import {teams} from './farmFixtures';
it('does not award new-year farm titles from preserved legacy estimates after introduction',()=>{
 const ts=teams();ts[0].farm[0].stats2={PA:300,AB:200,H:100,HR:20};
 expect(calcSeasonAwards(ts,2026).farmAwards.eastern.hr).not.toBeNull();
 const protectedAwards=calcSeasonAwards(ts,2026,{farmCompetition:{year:2026}});
 expect(protectedAwards.farmAwards).toMatchObject({status:'pending',eastern:{batting:null,hr:null,wins:null},western:{batting:null,hr:null,wins:null}});
 expect(protectedAwards.titles).toEqual(calcSeasonAwards(ts,2026).titles);
});
