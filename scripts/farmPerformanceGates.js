export const farmCalculationWithinBudget=(baselineMs,currentMs)=>
 Number.isFinite(baselineMs)&&Number.isFinite(currentMs)&&baselineMs>=0&&currentMs>=0
 &&currentMs-baselineMs<=Math.max(baselineMs*0.2,50);
