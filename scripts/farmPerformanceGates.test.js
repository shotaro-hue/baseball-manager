import {it,expect} from 'vitest';import {farmCalculationWithinBudget} from './farmPerformanceGates';
it('does not add the percentage and absolute regression budgets',()=>{
 expect(farmCalculationWithinBudget(100,165)).toBe(false);
 expect(farmCalculationWithinBudget(100,150)).toBe(true);
 expect(farmCalculationWithinBudget(1000,1200)).toBe(true);
 expect(farmCalculationWithinBudget(1000,1201)).toBe(false);
});
