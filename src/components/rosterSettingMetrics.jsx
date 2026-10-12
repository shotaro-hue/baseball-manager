import React from 'react';
import { fmtAvg, fmtEra } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const absent = reason => <span className="settings-missing">— <small>{reason}</small></span>;
export const settingNumber = value => Number.isFinite(value) ? value : absent('未記録');

// Display guards only. Keep the existing calculations and saved stats intact.
export function settingBatterRate(player, metric) {
  const s = player.stats || {};
  const required = metric === 'AVG' ? ['AB', 'H'] : ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'];
  if (required.some(key => !Number.isFinite(s[key]))) return absent('未記録');
  if (s.AB <= 0) return absent('算出不可 · 0打数');
  return metric === 'AVG' ? (Number(fmtAvg(s.H, s.AB).slice(1)) / 1000).toFixed(3)
    : saberBatter(s).OPS.toFixed(3);
}

export function settingPitcherRate(player, metric) {
  const s = player.stats || {};
  const required = metric === 'ERA' ? ['IP', 'ER'] : ['IP', 'BBp', 'Hp'];
  if (required.some(key => !Number.isFinite(s[key]))) return absent('未記録');
  if (s.IP <= 0) return absent('算出不可 · 0投球回');
  const value = saberPitcher(s)[metric];
  return metric === 'ERA' ? (value === 0 ? '0.00' : fmtEra(value)) : value.toFixed(2);
}

export function SettingCondition({ player }) {
  if ((player.injuryDaysLeft ?? 0) > 0) return <span className="settings-injury">負傷中 · 残{player.injuryDaysLeft}試合</span>;
  return <span>状態 {settingNumber(player.condition)}</span>;
}
