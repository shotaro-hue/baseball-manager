#!/usr/bin/env node
/**
 * Read-only audit of the 2026 opening-day player baseline.
 * Never changes the roster or saved games. --strict requires a complete,
 * independently verified 2026-03-27 controlled + development roster.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NPB2025_ROSTERS, MULTI_YEAR_CONTRACT_END_YEAR_BY_PLAYER } from '../src/data/npb2025.js';
import { TEAM_DEFS } from '../src/constants.js';

export const AS_OF = '2026-03-27';
export const normalizedName = name => String(name ?? '').normalize('NFKC').replace(/[\s\u3000・･]+/g, '');
export const rosterKey = (teamId, name) => `${teamId}:${normalizedName(name)}`;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const recordIssue = (severity, code, p, detail = '') =>
  ({ severity, code, teamId: p.teamId, player: p.name, detail });

export function auditPlayerMaster(rosters = NPB2025_ROSTERS, reference = null) {
  const teams = TEAM_DEFS.map(team => ({
    teamId: team.id, team: team.name, controlled: 0, development: 0,
    batters: rosters[team.id]?.batters?.length ?? 0,
    pitchers: rosters[team.id]?.pitchers?.length ?? 0,
  }));
  const players = teams.flatMap(t => {
    const roster = rosters[t.teamId];
    return [
      ...(roster?.batters ?? []).map(p => ({ ...p, teamId: t.teamId, kind: 'batter' })),
      ...(roster?.pitchers ?? []).map(p => ({ ...p, teamId: t.teamId, kind: 'pitcher' })),
    ];
  });
  const issues = [], byKey = new Map(), byId = new Map();
  for (const team of teams)
    if (!rosters[team.teamId]) issues.push({ severity: 'critical', code: 'missing-team', teamId: team.teamId });
  for (const p of players) {
    const key = rosterKey(p.teamId, p.name);
    if (p.playerId) {
      if (byId.has(p.playerId)) issues.push(recordIssue('critical', 'duplicate-player-id', p));
      else byId.set(p.playerId,p);
    }
    if (!normalizedName(p.name)) issues.push(recordIssue('critical', 'missing-name', p));
    if (byKey.has(key)) issues.push(recordIssue('critical', 'duplicate-team-name', p));
    else byKey.set(key, p);
    if (!Number.isInteger(p.age) || p.age < 15 || p.age > 65)
      issues.push(recordIssue('error', 'invalid-age', p, String(p.age)));
    if (!finite(p.salary) || p.salary < 200 || p.salary > 200000)
      issues.push(recordIssue('error', 'invalid-salary', p, String(p.salary)));
    if (p.salary === 5000) issues.push(recordIssue('review', 'ambiguous-salary-5000', p, 'Verify; may be actual salary or fallback (万円)'));
    if (!p.history?.length) issues.push(recordIssue('review', 'missing-history', p));
    if (p.stats?.G > 0) issues.push(recordIssue('error', 'post-opening-performance', p, '2026 observed performance must not inform a 2026-03-27 game start'));
    if (['内野手', '外野手'].includes(p.pos)) issues.push(recordIssue('review', 'generic-position', p, String(p.pos)));
    if (p.kind === 'pitcher' && finite(p.stats?.IP) && p.stats.IP > 0) {
      const { IP, ERA, ER } = p.stats;
      if (Number.isInteger(IP)) issues.push(recordIssue('review', 'integer-innings', p, String(IP)));
      if (finite(ERA) && finite(ER) && Math.abs(ERA - ER * 9 / IP) > 0.08)
        issues.push(recordIssue('review', 'era-innings-mismatch', p, `ERA=${ERA} ER=${ER} IP=${IP}`));
    }
    if (p.育成 || p.isIkusei) teams[p.teamId].development++;
    else teams[p.teamId].controlled++;
  }
  for (const team of teams) if (team.controlled>70) issues.push({severity:'critical',code:'controlled-cap-exceeded',teamId:team.teamId});
  const unmatchedContracts = [];
  for (const [nameKey, endYear] of MULTI_YEAR_CONTRACT_END_YEAR_BY_PLAYER) {
    const [teamName, playerName] = nameKey.split('::');
    const team = TEAM_DEFS.find(t => t.name === teamName);
    if (!team) {
      issues.push({ severity: 'critical', code: 'unknown-contract-team', detail: nameKey });
      continue;
    }
    const p = byKey.get(rosterKey(team.id, playerName));
    if (!p) { unmatchedContracts.push(nameKey); continue; }
    if (p.contractEndYear !== endYear)
      issues.push(recordIssue('error', 'contract-year-not-applied', p, `expected ${endYear} got ${p.contractEndYear}`));
  }

  let referenceCount = null;
  const missing = [], unexpected = [], mismatched = [];
  if (reference) {
    if (reference.scope !== 'all' || reference.asOf !== AS_OF || !Array.isArray(reference.players))
      throw new Error(`reference requires scope=all, asOf=${AS_OF} and players[]`);
    if (reference.status !== 'verified' || !Array.isArray(reference.teams) || reference.teams.length!==12)
      issues.push({severity:'critical',code:'reference-not-verified',detail:'Requires per-team controlled/development review; counts or reconstruction alone are insufficient'});
    const refByKey = new Map(), refIds = new Set();
    for (const p of reference.players) {
      if (!Number.isInteger(p.teamId) || p.teamId < 0 || p.teamId > 11 ||
          !normalizedName(p.name) || !['controlled', 'development'].includes(p.registration))
        throw new Error(`invalid reference row: ${JSON.stringify(p)}`);
      if(p.playerId && refIds.has(p.playerId)) throw new Error(`duplicate reference player ID: ${p.playerId}`);
      if(p.playerId) refIds.add(p.playerId);
      if(!p.sourceUrl) issues.push(recordIssue('error','missing-reference-source',p));
      const k = rosterKey(p.teamId, p.name);
      if (refByKey.has(k)) throw new Error(`duplicate reference row: ${k}`);
      refByKey.set(k, p);
    }
    if (refByKey.size < 800) throw new Error('reference not exhaustive: fewer than 800 players');
    referenceCount = refByKey.size;
    for(const team of teams) {
      const rows=reference.players.filter(p=>p.teamId===team.teamId);
      const evidence=reference.teams?.find(t=>t.teamId===team.teamId);
      const controlled=rows.filter(p=>p.registration==='controlled').length;
      if(!rows.length||controlled>70||!evidence||evidence.verified!==true||evidence.controlled!==controlled||evidence.development!==rows.length-controlled)
        issues.push({severity:'error',code:'reference-team-evidence',teamId:team.teamId});
    }
    for (const [key, p] of refByKey) {
      const actual = (p.playerId && byId.get(p.playerId)) || byKey.get(key);
      if (!actual) { missing.push(p); continue; }
      const registration = actual.育成 || actual.isIkusei ? 'development' : 'controlled';
      if (actual.teamId!==p.teamId || registration !== p.registration || (p.kind && actual.kind !== p.kind))
        mismatched.push({ teamId: p.teamId, name: p.name, registration, expectedRegistration: p.registration, kind: actual.kind, expectedKind: p.kind });
    }
    for (const [key, p] of byKey) if (!refByKey.has(key)) unexpected.push({teamId:p.teamId,name:p.name});
    for (const p of missing) issues.push(recordIssue('critical', 'missing-reference-player', p));
    for (const p of mismatched) issues.push(recordIssue('error', 'reference-registration-mismatch', p));
    for (const p of unexpected) issues.push(recordIssue('error', 'not-in-reference', p));
  }
  const counts = Object.fromEntries([...new Set(issues.map(x => x.code))].map(code => [code, issues.filter(x => x.code === code).length]));
  return {
    readyForRelease: Boolean(reference) && !issues.some(x=>['critical','error'].includes(x.severity)),
    asOf: AS_OF, source: 'src/data/npb2025.js', currentCount: players.length,
    controlled: teams.reduce((n, t) => n + t.controlled, 0),
    development: teams.reduce((n, t) => n + t.development, 0),
    referenceCount, teams,
    matchedContracts: MULTI_YEAR_CONTRACT_END_YEAR_BY_PLAYER.size - unmatchedContracts.length,
    unmatchedContracts, missing, mismatched, unexpected, counts, issues,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  try {
    const refPath = value('--reference');
    const reference = refPath ? JSON.parse(await readFile(resolve(refPath), 'utf8')) : null;
    const result = auditPlayerMaster(NPB2025_ROSTERS, reference);
    if (value('--output')) await writeFile(resolve(value('--output')), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({
      asOf: result.asOf, currentCount: result.currentCount, controlled: result.controlled,
      development: result.development, referenceCount: result.referenceCount,
      matchedContracts: result.matchedContracts, unmatchedContracts: result.unmatchedContracts.length,
      missing: result.missing.length, mismatched: result.mismatched.length, counts: result.counts,
      teams: result.teams,
    }, null, 2));
    // A complete 2026 opening-day verification must never pass without reference evidence.
    if (args.includes('--strict') && !result.readyForRelease)
      process.exitCode = 1;
  } catch (error) {
    console.error(`Player master audit failed: ${error.message}`);
    process.exitCode = 2;
  }
}
