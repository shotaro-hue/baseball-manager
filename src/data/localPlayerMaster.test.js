import {expect,it} from 'vitest';
import {syntheticMaster} from './playerMasterSchema.test';
import {compilePlayerMaster} from './playerMasterSchema';
import {readLocalPlayerMaster,MAX_LOCAL_MASTER_BYTES} from './localPlayerMaster';

it('permits unconfirmed redistribution only through explicit local import, never release compilation',()=>{
 const m=syntheticMaster();m.sources[0].redistribution='unconfirmed';delete m.sources[0].rightsEvidence;
 expect(()=>compilePlayerMaster(m)).toThrow(/rights/);
 expect(()=>compilePlayerMaster(m,{localImport:true})).not.toThrow();
 m.players[0].history=[{year:2026,outs:3}];
 expect(()=>compilePlayerMaster(m,{localImport:true})).toThrow(/future/);
});
it('rejects an object-valued career team name before it can crash the career table',()=>{
 const m=syntheticMaster();m.players[0].history=[{year:2025,outs:3,teamName:{name:'球団'}}];
 expect(()=>compilePlayerMaster(m,{localImport:true})).toThrow(/team name/);
});
it('rejects oversized, malformed and incomplete files before initialization',async()=>{
 const text=()=>Promise.resolve('{}');
 await expect(readLocalPlayerMaster({size:MAX_LOCAL_MASTER_BYTES+1,text})).rejects.toThrow(/8MB/);
 await expect(readLocalPlayerMaster({size:1,text:async()=>'{'})).rejects.toThrow(/JSON/);
 await expect(readLocalPlayerMaster({size:2,text})).rejects.toThrow(/人数/);
});
