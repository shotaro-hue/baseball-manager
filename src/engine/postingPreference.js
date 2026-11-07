import { rng } from '../utils';
import { economyRandomContext } from './economyRandom';

// Wishes and market acceptance share one annual preference, including when the
// real roster has no overseas trait. Never write an estimate into personality.
export function postingPreference(overseas, root, scope) {
  if (overseas !== null && overseas !== undefined) {
    if (!Number.isFinite(overseas) || overseas < 0 || overseas > 100) throw Error('海外志向を確認してください。');
    return { source: 'recorded', value: overseas };
  }
  return { source: 'game-estimate', value: rng(0, 100,
    economyRandomContext(root, { ...scope, operationId: 'posting-preference' }, 'posting:preference:v1')) };
}
