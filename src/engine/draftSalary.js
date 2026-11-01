import { MIN_SALARY_IKUSEI, MIN_SALARY_SHIHAKA } from '../constants';
import { isIkuseiPlayer } from './renewalRules';

// Quote before presentation. Missing/malformed evidence is never invented;
// established contracts must use their recorded terms, not this draft quote.
export function draftContractSalary(player) {
  const salary = player.salary;
  if (!Number.isSafeInteger(salary) || salary <= 0) return salary;
  return Math.max(salary, isIkuseiPlayer(player) ? MIN_SALARY_IKUSEI : MIN_SALARY_SHIHAKA);
}
