import { TEAM_DEFS } from '../constants.js';

export const TEAM_ID_BY_SHORT = Object.freeze(
  Object.fromEntries(TEAM_DEFS.map((team) => [team.short, team.id]))
);

export const TEAM_ID_BY_NAME = Object.freeze(
  Object.fromEntries(TEAM_DEFS.map((team) => [team.name, team.id]))
);

const TEAM_ID_BY_ANY_NAME = Object.freeze({
  ...TEAM_ID_BY_SHORT,
  ...TEAM_ID_BY_NAME,
});

export function getTeamIdByAnyName(teamName) {
  const id = TEAM_ID_BY_ANY_NAME[teamName];
  if (typeof id !== 'number') {
    throw new Error(`Unknown team name/short: ${teamName}`);
  }
  return id;
}
