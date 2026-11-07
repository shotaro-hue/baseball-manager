// Version 1: FNV-1a mixing UTF-16 JSON code units, then the Numerical Recipes LCG.
// A fresh context restarts one purpose's stream; unrelated purposes or players
// never consume its draws. No global RNG or persistent cursor is replaced.
const id = value => (typeof value === 'string' && value.trim().length > 0)
  || (Number.isSafeInteger(value) && value >= 0);
export function economyRandomContext(root, scope, purpose) {
  if (root?.algorithmVersion !== 1 || typeof root.seed !== 'string' || !root.seed.trim()
    || !scope || ![scope.saveId, scope.epoch, scope.subjectId, scope.operationId].every(id)
    || !Number.isInteger(scope.season) || scope.season < 1 || scope.season > 9999
    || typeof purpose !== 'string' || !purpose.trim()) throw Error('経済処理の乱数ルート・対象・用途を確認してください。');
  const key = JSON.stringify([1, root.seed, scope.saveId, scope.epoch, scope.season, scope.subjectId, scope.operationId, purpose]);
  let state = 2166136261;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619) >>> 0;
  return { random: () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  } };
}
