import { clamp } from '../utils';
import { PHYSICS_BAT } from '../constants';

export function getFenceDistanceBySpray(stadium, sprayAngle) {
  if (!stadium) return null;
  const angle = clamp(Number(sprayAngle), 0, 90);
  const lf = Number(stadium.lf);
  const cf = Number(stadium.cf);
  const rf = Number(stadium.rf);
  if (![lf, cf, rf].every(Number.isFinite)) return null;
  if (angle <= 45) {
    const t = angle / 45;
    return lf + (cf - lf) * Math.sin(t * Math.PI / 2);
  }
  const t = (angle - 45) / 45;
  return cf + (rf - cf) * (1 - Math.cos(t * Math.PI / 2));
}

export function evaluateTrajectoryAgainstPark({ trajectory, sprayAngleDeg, stadium, wallHeightM = PHYSICS_BAT.HR.WALL_HEIGHT }) {
  const points = Array.isArray(trajectory) ? trajectory : [];
  const safeWall = Number.isFinite(Number(wallHeightM)) ? Math.max(0, Number(wallHeightM)) : PHYSICS_BAT.HR.WALL_HEIGHT;
  const fenceDistanceM = getFenceDistanceBySpray(stadium, sprayAngleDeg);
  const fallback = {
    stadiumId: stadium?.id || 'unknown', stadiumName: stadium?.name || '不明球場', direction: sprayAngleDeg <= 45 ? 'left-center' : 'right-center',
    fenceDistanceM: Number.isFinite(fenceDistanceM) ? fenceDistanceM : Number.NaN, wallHeightM: safeWall, isHomeRun: false, reason: 'INVALID_TRAJECTORY',
    yAtFenceM: Number.NaN, yAtFencePlus3m: Number.NaN, landingDistanceM: Number.NaN, marginM: Number.NaN, wallClearanceM: Number.NaN,
  };
  if (points.length < 2 || !Number.isFinite(fenceDistanceM)) return fallback;

  let yAtFenceM = Number.NaN;
  let yAtFencePlus3m = Number.NaN;
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const crossesFence = (x1 <= fenceDistanceM && x2 >= fenceDistanceM) || (x2 <= fenceDistanceM && x1 >= fenceDistanceM);
    if (crossesFence && !Number.isFinite(yAtFenceM)) yAtFenceM = y1 + (y2 - y1) * ((fenceDistanceM - x1) / Math.max(1e-9, (x2 - x1)));
    const fencePlus = fenceDistanceM + 3;
    const crossesFencePlus = (x1 <= fencePlus && x2 >= fencePlus) || (x2 <= fencePlus && x1 >= fencePlus);
    if (crossesFencePlus && !Number.isFinite(yAtFencePlus3m)) yAtFencePlus3m = y1 + (y2 - y1) * ((fencePlus - x1) / Math.max(1e-9, (x2 - x1)));
  }
  const landingDistanceM = Number(points[points.length - 1]?.[0]);
  if (!Number.isFinite(landingDistanceM) || landingDistanceM < fenceDistanceM) return { ...fallback, fenceDistanceM, yAtFenceM, yAtFencePlus3m, landingDistanceM, reason: 'LANDED_SHORT', marginM: landingDistanceM - fenceDistanceM };
  if (!Number.isFinite(yAtFenceM) || !Number.isFinite(yAtFencePlus3m)) return { ...fallback, fenceDistanceM, yAtFenceM, yAtFencePlus3m, landingDistanceM, reason: 'FENCE_DIRECT', marginM: landingDistanceM - fenceDistanceM };
  const wallClearanceM = yAtFenceM - safeWall;
  const isHomeRun = wallClearanceM >= 0 && yAtFencePlus3m >= 0.5;
  const reason = isHomeRun ? (wallClearanceM <= 1 ? 'BARELY_CLEARED' : 'CLEARED_FENCE') : (wallClearanceM < 0 ? 'WALL_HEIGHT_FAILED' : 'FENCE_DIRECT');
  return { stadiumId: stadium?.id || 'unknown', stadiumName: stadium?.name || '不明球場', direction: sprayAngleDeg <= 45 ? 'left-center' : 'right-center', fenceDistanceM, wallHeightM: safeWall, isHomeRun, reason, yAtFenceM, yAtFencePlus3m, landingDistanceM, marginM: landingDistanceM - fenceDistanceM, wallClearanceM };
}

export function evaluateAcrossParks({ trajectory, sprayAngleDeg, stadiums, currentStadiumId }) {
  const entries = Object.entries(stadiums || {});
  const parkResults = entries.map(([parkId, park]) => {
    const result = evaluateTrajectoryAgainstPark({ trajectory, sprayAngleDeg, stadium: { ...park, id: park.id || parkId }, wallHeightM: park?.wallHeightM });
    return { parkId, ...result };
  });
  const hrParkIds = parkResults.filter((r) => r.isHomeRun).map((r) => r.parkId);
  const nonHrParkIds = parkResults.filter((r) => !r.isHomeRun).map((r) => r.parkId);
  const totalParkCount = parkResults.length;
  const parkHrCount = hrParkIds.length;
  const currentParkHr = parkResults.find((r) => r.parkId === currentStadiumId)?.isHomeRun ?? false;
  const neutralParkHr = totalParkCount > 0 ? parkHrCount / totalParkCount >= 0.5 : false;
  return { hrParkIds, nonHrParkIds, parkHrCount, totalParkCount, currentParkHr, neutralParkHr, parkSuppressed: !currentParkHr && neutralParkHr, parkAided: currentParkHr && !neutralParkHr, parkResults };
}
