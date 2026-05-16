
export function RetireModal({modal,onRetain,onAccept,retireRole,setRetireRole,onStartRetireGame,onSkipRetireGame}){
  if(!modal) return null;
  const p=modal.player;
  const rsLabel=p.retireStyle===undefined?"---":p.retireStyle>=70?"潔い引退型":p.retireStyle<=30?"燃え尽き型":"普通型";
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}>
      <div style={{background:"#1a2233",borderRadius:12,padding:24,width:"100%",maxWidth:380,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:13,color:"#f5c842",fontWeight:700,marginBottom:4}}>⚾ 引退表明</div>
        <div style={{fontSize:16,fontWeight:700,color:"#e0d4bf",marginBottom:8}}>{p.name} <span style={{fontSize:11,color:"#94a3b8"}}>{p.age}歳 / {p.pos}</span></div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16,lineHeight:1.7}}>
          引退に関する価値観：<span style={{color:"#a78bfa"}}>{rsLabel}</span><br/>
          {p.name}選手が今季限りでの引退を示唆しています。
        </div>
        {modal.type==="announce"&&(
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>どうしますか？</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button className="bsm btn-gold" style={{flex:1,padding:"8px 0"}} onClick={onRetain}>引き留める</button>
              <button className="bsm bgr" style={{flex:1,padding:"8px 0"}} onClick={onAccept}>受け入れる</button>
            </div>
          </div>
        )}
        {modal.type==="retire_game"&&(
          <div>
            <div style={{fontSize:11,color:"#f5c842",fontWeight:700,marginBottom:8}}>引退試合の起用法を選んでください</div>
            {["starter","reliever","pinch","runner"].map(role=>{
              const labels={starter:"先発",reliever:"リリーフ",pinch:"代打",runner:"代走"};
              return(
                <button key={role} className={"bsm "+(retireRole===role?"btn-gold":"bga")} style={{display:"block",width:"100%",marginBottom:6,padding:"7px 0",textAlign:"center"}} onClick={()=>setRetireRole(role)}>
                  {labels[role]}
                </button>
              );
            })}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="bsm bgg" style={{flex:1,padding:"8px 0"}} onClick={onStartRetireGame} disabled={!retireRole}>引退試合を行う 🎉</button>
              <button className="bsm bga" style={{flex:1,padding:"8px 0"}} onClick={onSkipRetireGame}>行わない</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RETIRE PHASE SCREEN
═══════════════════════════════════════════════ */
