import { rng, clamp } from '../utils';
import { POSITIONS, DRAFT_POOL_SIZE } from '../constants';
import { makePlayer } from './player';

/* ═══════════════════════════════════════════════
   DRAFT SYSTEM
═══════════════════════════════════════════════ */

export function draftOverallComment(pool) {
  const avgPot = Math.round(pool.slice(0, 5).reduce((s, p) => s + p.potential, 0) / 5);
  if (avgPot >= 80) return "今年は豊作！上位候補の質が非常に高く、激しい争奪戦が予想される。";
  if (avgPot >= 70) return "例年並みの水準。上位3選手が抜けており、そこへの集中が予想される。";
  return "やや小粒なドラフト。ポテンシャル重視で掘り出し物を狙うチームが有利かもしれない。";
}

export function recommendForTeam(team, pool) {
  const needsPitcher = team.players.filter((p) => p.isPitcher).length < 8;
  return pool
    .map((p) => ({
      ...p,
      recScore: p.potential + (needsPitcher && p.isPitcher ? 15 : 0) + (!needsPitcher && !p.isPitcher ? 10 : 0) + (p.age <= 20 ? 8 : p.age <= 21 ? 4 : 0),
    }))
    .sort((a, b) => b.recScore - a.recScore)
    .slice(0, 5);
}

export function initDraftPool(myTeam) {
  const pos = [...Array(6)].map(() => "先発")
    .concat([...Array(3)].map(() => "中継ぎ"))
    .concat([...Array(3)].map(() => "抑え"))
    .concat(POSITIONS.flatMap((q) => [q, q, q, q]));
  const raw = Array.from({ length: DRAFT_POOL_SIZE }, (_, i) => {
    const isPitch = i < 12;
    const q = rng(40, 78);
    return makePlayer(isPitch ? pos[i % 12] : POSITIONS[i % 7], q, isPitch, rng(18, 22));
  });
  const scoutedPlayers = (myTeam?.scoutResults || []).map((p) => ({
    ...p, fromScout: true, age: clamp(p.age || 20, 18, 22),
  }));
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
