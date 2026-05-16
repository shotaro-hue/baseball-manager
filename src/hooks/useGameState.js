import { useState, useReducer, useMemo, useCallback, useEffect, useRef } from "react";
import { gameStateReducer, G } from './gameStateReducer';
import { uid, clamp, rng, pname, scoutedValue, fmtSal } from '../utils';
import { buildTeam, makePlayer, resolveTrainingFocusFromGoal, generateForeignFaPool } from '../engine/player';
import { enqueueSaveGame, getSaveQueueSnapshot, hasSave, getAutoSaveIntervalMs } from '../engine/saveload';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../engine/scheduleGen';
import { buildRealTeam } from '../engine/realplayer';
import { NPB2025_ROSTERS } from '../data/npb2025';
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
import {
  TEAM_DEFS, POSITIONS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS,
  MAX_ROSTER, MAX_外国人_一軍, MIN_SALARY_SHIHAKA,
  MAX_SHIHAKA_TOTAL, REGISTRATION_COOLDOWN_DAYS, TALK_COOLDOWN_DAYS,
  PRESS_CONFERENCE_INTERVAL,
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX,
} from '../constants';
import { pickQuestion, calcPressDelta } from '../engine/pressConference';
import { createPersistentDataStore } from '../state/persistentDataStore';

const STATE_RECENT_CAREER_LOG_YEARS = 3;
const STATE_MAX_SPRAY_POINTS = 40;
const STATE_MAX_BATTED_BALL_EVENTS = 80;

function slimPlayerForState(player) {
  if (!player || typeof player !== 'object') return player;
  const stats = player.stats && typeof player.stats === 'object' ? player.stats : {};
  const recentCareerLog = Array.isArray(player.recentCareerLog)
    ? player.recentCareerLog.slice(-STATE_RECENT_CAREER_LOG_YEARS)
    : [];
  return {
    ...player,
    // React state軽量化: 全量履歴はIndexedDB側を参照する
    careerLog: [],
    recentCareerLog,
    stats: {
      ...stats,
      sprayPoints: Array.isArray(stats.sprayPoints) ? stats.sprayPoints.slice(-STATE_MAX_SPRAY_POINTS) : [],
      battedBallEvents: Array.isArray(stats.battedBallEvents) ? stats.battedBallEvents.slice(-STATE_MAX_BATTED_BALL_EVENTS) : [],
    },
  };
}

function slimTeamForState(team) {
  if (!team || typeof team !== 'object') return team;
  const nextPlayers = Array.isArray(team.players) ? team.players.map(slimPlayerForState) : [];
  const nextFarm = Array.isArray(team.farm) ? team.farm.map(slimPlayerForState) : [];
  const playersChanged = nextPlayers.length !== (team.players?.length || 0) || nextPlayers.some((player, index) => player !== team.players[index]);
  const farmChanged = nextFarm.length !== (team.farm?.length || 0) || nextFarm.some((player, index) => player !== team.farm[index]);
  return {
    ...team,
    players: playersChanged ? nextPlayers : (team.players || []),
    farm: farmChanged ? nextFarm : (team.farm || []),
  };
}

function slimTeamsForState(teams) {
  if (!Array.isArray(teams)) return [];
  return teams.map(slimTeamForState);
}

function normalizeDirtyScopes(scopes) {
  if (Array.isArray(scopes)) return scopes.filter((scope) => typeof scope === 'string' && scope);
  if (typeof scopes === 'string' && scopes) return [scopes];
  return [];
}

const INIT_TEAMS = TEAM_DEFS.map(function(d){
  const t = NPB2025_ROSTERS[d.id] ? buildRealTeam(d, NPB2025_ROSTERS[d.id]) : buildTeam(d);
  const nonPitcherIds = (t.players || []).filter(p => !p.isPitcher).map(p => p.id);
  t.lineupNoDh = (t.lineupNoDh || t.lineup || nonPitcherIds).filter(id => nonPitcherIds.includes(id)).slice(0, 8);
  t.lineupDh = (t.lineupDh || t.lineup || nonPitcherIds).filter(id => nonPitcherIds.includes(id)).slice(0, 9);
  t.rosterDhMode = t.rosterDhMode ?? t.dhEnabled ?? false;
  t.lineup = (t.rosterDhMode ? t.lineupDh : t.lineupNoDh).slice();
  t.history = [];
  return slimTeamForState(t);
});

export function useGameState() {
  const [screen, setScreen] = useState("title");
  const [retireModal, setRetireModal] = useState(null);
  const [playerModal, setPlayerModal] = useState(null);
  const [viewingTeam, setViewingTeam] = useState(null);  // チーム詳細画面で表示中のチーム
  const [pregameError, setPregameError] = useState(null); // 試合開始バリデーションエラー { message }
  const [allTeamResultsMap, setAllTeamResultsMap] = useState({}); // { [teamId]: { [gameDay]: boxScoreResult } }
  const [retireGamePlayer, setRetireGamePlayer] = useState(null);
  const [retireRole, setRetireRole] = useState(null);
  const [gameState, dispatch] = useReducer(gameStateReducer, { teams: INIT_TEAMS, gameDay: 1, year: 2026, myId: null });
  const { teams, gameDay, year, myId } = gameState;
  const dirtySaveScopesRef = useRef(new Set(['core', 'fa', 'seasonHistory', 'news', 'mailbox']));
  const markSaveScopes = useCallback((scopes = []) => {
    const normalized = normalizeDirtyScopes(scopes);
    if (normalized.length === 0) return;
    normalized.forEach((scope) => dirtySaveScopesRef.current.add(scope));
  }, []);
  const markSaveDirty = useCallback((scopes = ['core'])=>{
    markSaveScopes(scopes);
    setSaveRevision(prev=>prev+1);
    setSaveDirty(true);
  },[markSaveScopes]);
  const setTeams   = useCallback((n) => { dispatch({ type: G.SET_TEAMS, teams: (prev) => slimTeamsForState(typeof n === 'function' ? n(prev) : n) }); markSaveDirty(); },    [markSaveDirty]);
