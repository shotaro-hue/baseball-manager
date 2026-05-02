import { rngf } from '../utils';
import { DEFAULT_ENVIRONMENT, DEFAULT_PHYSICS_PRESET, PHYSICS_PRESETS } from './physicsConstants';

const EPSILON = 0.0001;
const ENV_BOUNDS = {
  windOut: { min: -30, max: 30 },
  airDensity: { min: 0.7, max: 1.5 },
  temperatureC: { min: -40, max: 55 },
  altitudeM: { min: -430, max: 6000 },
};

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeEnvironmentValue(fieldName, rawValue, defaultValue, bounds) {
  const numericValue = toFiniteNumber(rawValue);
  if (numericValue === null) {
    if (rawValue !== undefined) {
      console.warn(`[physics] environment.${fieldName} が無効値のため既定値へフォールバックしました`, { rawValue, defaultValue });
    }
    return defaultValue;
  }

  const clampedValue = Math.min(bounds.max, Math.max(bounds.min, numericValue));
  if (clampedValue !== numericValue) {
    console.warn(`[physics] environment.${fieldName} を安全範囲へクランプしました`, {
      rawValue: numericValue,
      safeValue: clampedValue,
      min: bounds.min,
      max: bounds.max,
    });
  }
  return clampedValue;
}

export function sanitizeEnvironment(rawEnv = {}) {
  const safeRawEnv = rawEnv && typeof rawEnv === 'object' ? rawEnv : {};
  if (safeRawEnv !== rawEnv) {
    console.warn('[physics] environment がオブジェクトではないため既定値へフォールバックしました', { rawEnv });
  }

  return {
    windOut: sanitizeEnvironmentValue('windOut', safeRawEnv.windOut, DEFAULT_ENVIRONMENT.windOut, ENV_BOUNDS.windOut),
    airDensity: sanitizeEnvironmentValue('airDensity', safeRawEnv.airDensity, DEFAULT_ENVIRONMENT.airDensity, ENV_BOUNDS.airDensity),
    temperatureC: sanitizeEnvironmentValue('temperatureC', safeRawEnv.temperatureC, DEFAULT_ENVIRONMENT.temperatureC, ENV_BOUNDS.temperatureC),
    altitudeM: sanitizeEnvironmentValue('altitudeM', safeRawEnv.altitudeM, DEFAULT_ENVIRONMENT.altitudeM, ENV_BOUNDS.altitudeM),
  };
}


function getPhysicsConfig(options = {}) {
  const preset = PHYSICS_PRESETS[options.preset ?? DEFAULT_PHYSICS_PRESET] ?? PHYSICS_PRESETS[DEFAULT_PHYSICS_PRESET];
  return {
    ...preset,
    ...(options.config ?? {}),
  };
}



export function simulateFlight(ev, la, options = {}) {
  const config = getPhysicsConfig(options);
  const environment = sanitizeEnvironment(options.environment);
  const windOut = environment.windOut;
  const releaseHeight = options.releaseHeight ?? config.releaseHeight;

    // EVはkm/hで統一し、物理計算直前にm/sへ変換
  const evMs = ev / 3.6;
  const laRad = la * (Math.PI / 180);
  let vx = evMs * Math.cos(laRad) + windOut;
  let vy = evMs * Math.sin(laRad);
  let x = 0;
  let y = releaseHeight;

  const points = [[0, releaseHeight]];

  for (let i = 1; i <= config.maxSteps; i += 1) {
    const speed = Math.max(EPSILON, Math.hypot(vx, vy));
    const dragAccel = config.dragCoeff * speed * speed;
    vx -= dragAccel * (vx / speed) * config.dt;
    vy -= (config.gravity + dragAccel * (vy / speed)) * config.dt;

    x += vx * config.dt;
    y += vy * config.dt;

    if (y <= 0) {
      points.push([Math.max(0, x), 0]);
      break;
    }

    if (i % config.sampleInterval === 0) points.push([x, y]);
  }

  if (points[points.length - 1][1] > 0) {
    points.push([Math.max(0, x), 0]);
  }

  return {
    distance: Math.max(0, Math.round(points[points.length - 1][0])),
    points,
  };
}

export function calcBallDist(ev, la, options = {}) {
  return simulateFlight(ev, la, options).distance;
}

export function classifyBattedBallType(la) {
  // ⚠️ セキュリティ: 外部入力値を明示的に検証し、非数値は安全な既定値へフォールバック
  const launchAngleRaw = Number(la);
  const launchAngle = Number.isFinite(launchAngleRaw) ? launchAngleRaw : 10;

  if (launchAngle < 8) return 'grounder';
  if (launchAngle <= 18) return 'liner';
  return 'fly';
}

export function calcSprayAngle(result) {
  if (result === 'hr') return rngf(10, 80);
  if (result === 't') return rngf(25, 65);
  return rngf(0, 90);
}

export function resolveFieldSideBySprayAngle(sprayAngle) {
  // ⚠️ セキュリティ: 不正な入力値の混入を防ぐため、有限数のみ受け付ける
  const numericAngle = Number(sprayAngle);
  const safeAngle = Number.isFinite(numericAngle) ? numericAngle : 45;
  const clampedAngle = Math.min(90, Math.max(0, safeAngle));

  if (clampedAngle < 30) return { key: 'left', label: '左翼' };
  if (clampedAngle > 60) return { key: 'right', label: '右翼' };
  return { key: 'center', label: '中堅' };
}

export function calcLandingZone(dist, sprayAngle, stadium) {
  const side = resolveFieldSideBySprayAngle(sprayAngle);
  const targetFence = side.key === 'left' ? stadium.lf : side.key === 'right' ? stadium.rf : stadium.cf;

  if (dist >= targetFence + 8) return `${side.label}スタンド`;
  if (dist >= targetFence - 3) return `${side.label}フェンス直撃`;
  if (dist >= targetFence * 0.7) return `${side.label}深めフェアゾーン`;
  return `${side.label}フェアゾーン`;
}

export function calcTrajectory(ev, la, options = {}) {
  return simulateFlight(ev, la, options).points;
}
