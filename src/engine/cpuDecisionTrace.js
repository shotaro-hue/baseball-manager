// Diagnostics are opt-in and live outside React/save state. The harness owns
// streaming/retention; ordinary games accumulate no decision history here.
const listeners=new Set();
export function subscribeCpuDecisions(listener){
 listeners.add(listener);return ()=>listeners.delete(listener);
}
export function emitCpuDecision(event){for(const listener of listeners)listener(event);}
