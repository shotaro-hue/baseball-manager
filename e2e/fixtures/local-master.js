// Entirely synthetic, project-authored data; no redistributed external dataset.
export function localMasterFixture() {
 const positions=['一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'],players=[];
 for(let teamId=0;teamId<12;teamId++)for(let i=0;i<75;i++){
  const development=i>=60,pitcher=i<30||i>=60&&i%2===0,pos=pitcher?'先発':i<34?'捕手':positions[(i-34)%7];
  players.push({playerId:`local:${teamId}:${i}`,name:`名簿テスト${teamId}-${i}`,teamId,registration:development?'development':'controlled',kind:pitcher?'pitcher':'batter',birthDate:'2000-01-01',throws:'right',bats:'left',pos,positions:pitcher?{}:{[pos]:100},roleStatus:'verified',foreignQuotaStatus:'domestic',salaryStatus:'game-assumption',gameSalaryManYen:development?240:1000,contractStatus:'game-assumption',gameContractEndYear:2026,sourceIds:['local'],history:[]});
 }
 return {schemaVersion:1,asOf:'2026-03-27',status:'verified',teams:Array.from({length:12},(_,teamId)=>({teamId,controlled:60,development:15,verified:true})),sources:[{id:'local',url:'https://example.org/local-fixture',redistribution:'unconfirmed'}],players};
}
