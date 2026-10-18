import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {request} from '@playwright/test';
import {fetchInstrumentationSource} from '../e2e/helpers/sourceInstrumentation';

async function transport({resets=0,status=200},run){
 let hits=0;
 const server=createServer((req,res)=>{hits++;if(hits<=resets){req.socket.destroy();return;}res.writeHead(status,{'Content-Type':'application/javascript'});res.end('export const realSource = 1;');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const api=await request.newContext(),url=`http://127.0.0.1:${server.address().port}/module.js`;
 try{await run({route:{fetch:options=>api.get(url,options)},hits:()=>hits});}
 finally{await api.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
it('recovers one real connection reset while retaining the fetched source bytes',async()=>{
 await transport({resets:1},async({route,hits})=>{const response=await fetchInstrumentationSource(route);
  expect(response.status()).toBe(200);expect(await response.text()).toBe('export const realSource = 1;');expect(hits()).toBe(2);});
});
it('does not retry or hide HTTP errors from the source server',async()=>{
 await transport({status:500},async({route,hits})=>{const response=await fetchInstrumentationSource(route);expect(response.status()).toBe(500);expect(hits()).toBe(1);});
});
it('fails normally when the bounded retry also suffers a reset',async()=>{
 await transport({resets:3},async({route,hits})=>{await expect(fetchInstrumentationSource(route)).rejects.toThrow(/ECONNRESET|socket hang up/);expect(hits()).toBe(2);});
});
