import { simulateFlight, sanitizeEnvironment } from './physics';
import { NEUTRAL_ENVIRONMENT } from './physicsConstants';

export function analyzeEnvironmentEffect({ ev, la, options = {}, actualEnvironment = {}, neutralEnvironment = NEUTRAL_ENVIRONMENT }) {
  const safeEv = Number.isFinite(Number(ev)) ? Number(ev) : 0;
  const safeLa = Number.isFinite(Number(la)) ? Number(la) : 0;
  const safeActualEnvironment = sanitizeEnvironment(actualEnvironment);
  const safeNeutralEnvironment = sanitizeEnvironment(neutralEnvironment);
  const actual = simulateFlight(safeEv, safeLa, { ...options, environment: safeActualEnvironment });
  const neutral = simulateFlight(safeEv, safeLa, { ...options, environment: safeNeutralEnvironment });
  const actualDistanceM = Number.isFinite(Number(actual.distance)) ? Number(actual.distance) : 0;
  const neutralDistanceM = Number.isFinite(Number(neutral.distance)) ? Number(neutral.distance) : 0;
  const environmentDeltaM = actualDistanceM - neutralDistanceM;
  const effectTags = [];
  if (environmentDeltaM <= -3 && safeActualEnvironment.windOut < -3) effectTags.push('HEADWIND_LOSS');
  if (environmentDeltaM >= 3 && safeActualEnvironment.windOut > 3) effectTags.push('WIND_AIDED');
  if (safeActualEnvironment.temperatureC >= 30 && environmentDeltaM >= 1) effectTags.push('HOT_AIR_BOOST');
  if (safeActualEnvironment.temperatureC <= 5 && environmentDeltaM <= -1) effectTags.push('COLD_AIR_SUPPRESSED');
  if (safeActualEnvironment.altitudeM >= 500 && environmentDeltaM >= 1) effectTags.push('ALTITUDE_BOOST');
  if (safeActualEnvironment.airDensity > 1.285 && environmentDeltaM <= -1) effectTags.push('DENSE_AIR_SUPPRESSED');
  if (effectTags.length === 0 || (environmentDeltaM > -3 && environmentDeltaM < 3)) effectTags.push('NEUTRAL_ENVIRONMENT');
  return { actualDistanceM, neutralDistanceM, environmentDeltaM, effectTags };
}
