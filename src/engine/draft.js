import { rng, clamp } from '../utils';
import { POSITIONS, DRAFT_POOL_SIZE, PROSPECT_TYPE_WEIGHTS, PROSPECT_ENTRY_AGE, PROSPECT_READINESS_RANGE } from '../constants';
import { makePlayer } from './player';

/* ═══════════════════════════════════════════════
   DRAFT SYSTEM
═══════════════════════════════════════════════ */

/** prospectType を確率で抽選する */
function pickProspectType() {
  const r = rng(1, 100);
  if (r <= PROSPECT_TYPE_WEIGHTS.高卒) return '高卒';
  if (r <= PROSPECT_TYPE_WEIGHTS.高卒 + PROSPECT_TYPE_WEIGHTS.大卒) return '大卒';
  return '社会人';
}

/** prospectType から entryAge を決定する */
function entryAgeFromType(type) {
  const val = PROSPECT_ENTRY_AGE[type];
  return Array.isArray(val) ? rng(val[0], val[1]) : val;
}

/** prospectType から即戦力スコア（readinessScore）を決定する */
function readinessFromType(type) {
  const [min, max] = PROSPECT_READINESS_RANGE[type];
  return rng(min, max);
}

export function draftOverallComment(pool) {
  const avgPot = Math.round(pool.slice(0, 5).reduce((s, p) => s + p.potential, 0) / 5);
  const socialCount = pool.filter(p => p.prospectType === '社会人').length;
  const hsCount = pool.filter(p => p.prospectType === '高卒').length;
  const typeNote = socialCount >= 20 ? "即戦力型の社会人が多く、チームの穴を埋めやすい年だ。" :
                   hsCount >= 35 ? "高校生の素材型が豊富。将来を見据えた指名が鍵になる。" : "";
  if (avgPot >= 80) return `今年は豊作！上位候補の質が非常に高く、激しい争奪戦が予想される。${typeNote}`;
  if (avgPot >= 70) return `例年並みの水準。上位3選手が抜けており、そこへの集中が予想される。${typeNote}`;
  return `やや小粒なドラフト。ポテンシャル重視で掘り出し物を狙うチームが有利かもしれない。${typeNote}`;
}

export function recommendForTeam(team, pool) {
  const needsPitcher = team.players.filter((p) => p.isPitcher).length < 8;
  // 勝ち越しているチームは即戦力を優先
  const wantImmediacy = (team.wins || 0) > (team.losses || 0) + 10;
  return pool
    .map((p) => ({
      ...p,
      recScore: p.potential
        + (needsPitcher && p.isPitcher ? 15 : 0)
        + (!needsPitcher && !p.isPitcher ? 10 : 0)
        + (p.age <= 20 ? 8 : p.age <= 21 ? 4 : 0)
        + (wantImmediacy ? Math.round((p.readinessScore ?? 50) * 0.3) : 0),
    }))
    .sort((a, b) => b.recScore - a.recScore)
    .slice(0, 5);
}

export function initDraftPool(myTeam) {
  const pitPos = [...Array(12)].map(() => "先発")
    .concat([...Array(10)].map(() => "中継ぎ"))
    .concat([...Array(8)].map(() => "抑え"));  // 30 slots
  const raw = Array.from({ length: DRAFT_POOL_SIZE }, (_, i) => {
    const isPitch = i < 30;
    const prospectType = pickProspectType();
    const age = entryAgeFromType(prospectType);
    const q = rng(40, 78);
    const p = makePlayer(isPitch ? pitPos[i % 30] : POSITIONS[i % 8], q, isPitch, age);
    p.prospectType = prospectType;
    p.readinessScore = readinessFromType(prospectType);
    return p;
  });
  const scoutedPlayers = (myTeam?.scoutResults || []).map((p) => {
    const prospectType = p.prospectType ?? pickProspectType();
    const age = p.age ?? entryAgeFromType(prospectType);
    return {
      ...p,
      fromScout: true,
      age: clamp(age, 18, 25),
      prospectType,
      readinessScore: p.readinessScore ?? readinessFromType(prospectType),
    };
  });
  const combined = [...raw, ...scoutedPlayers].sort((a, b) => {
    const ov = (x) => x.isPitcher
      ? (x.pitching.velocity + x.pitching.control + x.pitching.breaking) / 3
      : (x.batting.contact + x.batting.power + x.batting.eye) / 3;
    return ov(b) - ov(a);
  });
  combined.slice(0, 3).forEach((p, i) => {
    p.spotlight = ["👑 今年の目玉", "⭐ 超高評価", "🔥 注目株"][i];
  });
  return combined;
}
