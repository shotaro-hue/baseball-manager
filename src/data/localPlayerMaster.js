import {compilePlayerMaster} from './playerMasterSchema';
export const MAX_LOCAL_MASTER_BYTES=8*1024*1024;
export async function readLocalPlayerMaster(file) {
 if(!file||file.size>MAX_LOCAL_MASTER_BYTES)throw Error('8MB以下の名簿JSONを選んでください');
 let master;
 try {master=JSON.parse(await file.text());}catch{throw Error('名簿JSONを読み込めませんでした');}
 if(!Array.isArray(master?.players)||master.players.length>1500)throw Error('名簿の人数が対応範囲外です');
 compilePlayerMaster(master,{localImport:true});
 return master;
}
