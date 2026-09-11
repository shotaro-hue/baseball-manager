// 投手は個別能力を持たず、試合中だけ全員共通の打撃プロフィールを使う。
// 物理演算後の安打保持率も含め、十分な母数で投手全体の打率が約1割になるよう調整する。
export const PITCHER_BATTING_DEFAULTS = Object.freeze({
  contact: 1,
  power: 1,
  eye: 1,
  speed: 30,
  arm: 30,
  defense: 30,
  catching: 1,
  clutch: 1,
  breakingBall: 1,
  vsLeft: 1,
  stealSkill: 10,
  baseRunning: 25,
  stamina: 50,
  recovery: 50,
  nonHomeRunHitRetention: 0.435,
});

export function withEffectiveBatting(player) {
  if (!player?.isPitcher) return player;
  return {
    ...player,
    batting: { ...PITCHER_BATTING_DEFAULTS },
  };
}
