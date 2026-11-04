import { envelope } from './faDeclarations';
export const postingRequest = (w, extra = {}) => envelope(w, { id: 'request', type: 'request-posting', teamId: 0, playerId: 0,
  contractId: w.teams[0].players[0].contractId, ...extra });
export const postingDecision = (w, decision = 'approve', extra = {}) => envelope(w,
  { id: 'decision', type: 'decide-posting', requestId: 'request', decision, ...extra });
