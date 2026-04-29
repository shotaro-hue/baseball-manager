import { rngf } from '../utils';

const GRAVITY = 9.81;
const DRAG_COEFF = 0.35;
const DT = 0.01;

export function calcBallDist(ev, la) {
  const evMs = ev * 0.44704;
  const laRad = la * (Math.PI / 180);
  let vx = evMs * Math.cos(laRad);
  let vy = evMs * Math.sin(laRad);
  let x = 0;
  let y = 1;

  for (let i = 0; i < 12000; i += 1) {
    const v = Math.max(0.0001, Math.sqrt(vx ** 2 + vy ** 2));
    const drag = DRAG_COEFF * v;
    vx -= drag * (vx / v) * DT;
    vy -= (GRAVITY + drag * (vy / v)) * DT;
    x += vx * DT;
    y += vy * DT;
    if (y < 0) break;
  }

  return Math.max(0, Math.round(x));
}

export function calcSprayAngle(result) {
  if (result === 'hr') return rngf(10, 80);
  if (result === 't') return rngf(25, 65);
  return rngf(0, 90);
}

export function calcLandingZone(dist, sprayAngle, stadium) {
  const side = sprayAngle < 30 ? '左翼' : sprayAngle > 60 ? '右翼' : '中堅';
  const targetFence = sprayAngle < 30 ? stadium.lf : sprayAngle > 60 ? stadium.rf : stadium.cf;

  if (dist >= targetFence + 8) return `${side}スタンド`;
  if (dist >= targetFence - 3) return `${side}フェンス直撃`;
  if (dist >= targetFence * 0.7) return `${side}深めフェアゾーン`;
  return `${side}フェアゾーン`;
}
