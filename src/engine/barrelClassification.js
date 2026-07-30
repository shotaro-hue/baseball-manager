const KMH_PER_MPH = 1.609344;
const MIN_BARREL_EXIT_VELOCITY_MPH = 98;
const MIN_BARREL_EXIT_VELOCITY_KMH = MIN_BARREL_EXIT_VELOCITY_MPH * KMH_PER_MPH;
const MIN_BARREL_LAUNCH_ANGLE_DEG = 8;
const MAX_BARREL_LAUNCH_ANGLE_DEG = 50;
const FLOAT_EPSILON = 1e-9;

/**
 * EVと打球角度からStatcast方式のバレルゾーンを判定する。
 *
 * 98mphでは26〜30度。EVが上がるほど許容角度を広げ、
 * 116mph以上では8〜50度を上限とする。
 */
export function isBarreledBattedBall(exitVelocityKmh, launchAngleDeg) {
  const evKmh = Number(exitVelocityKmh);
  const launchAngle = Number(launchAngleDeg);
  if (!Number.isFinite(evKmh) || !Number.isFinite(launchAngle)) return false;

  const exitVelocityMph = evKmh / KMH_PER_MPH;
  if (evKmh < MIN_BARREL_EXIT_VELOCITY_KMH - FLOAT_EPSILON) return false;

  const minimumAngle = Math.max(
    MIN_BARREL_LAUNCH_ANGLE_DEG,
    124 - exitVelocityMph,
  );
  const maximumAngle = Math.min(
    MAX_BARREL_LAUNCH_ANGLE_DEG,
    (1.5 * exitVelocityMph) - 117,
  );
  return launchAngle >= minimumAngle - FLOAT_EPSILON
    && launchAngle <= maximumAngle + FLOAT_EPSILON;
}
