import { MAX_ROSTER, MAX_SHIHAKA_TOTAL, MAX_外国人_一軍 } from '../constants';
import { ownedPlayers } from './renewalRules';

export function marketRosterError(team, player, teams = [team]) {
  if (player.id == null) return '選手IDが未記録です';
  if (teams.some(t => ownedPlayers(t).some(p => p.id === player.id))) return 'この選手はすでに球団に所属しています';
  if (!player.育成 && ownedPlayers(team).filter(p => !p.育成).length >= MAX_SHIHAKA_TOTAL) return `支配下登録枠（${MAX_SHIHAKA_TOTAL}人）が満員です`;
  return null;
}

export function marketPlacement(team, player) {
  if (player.育成) return { farm: true, reason: '育成契約のためファーム所属' };
  const active = team?.players || [];
  if (active.length >= MAX_ROSTER) return { farm: true, reason: '登録枠が満員' };
  if (player.isForeign) {
    const foreigners = active.filter(p => p.isForeign);
    if (foreigners.length >= MAX_外国人_一軍) return { farm: true, reason: '外国人枠が満員' };
    if (foreigners.length === MAX_外国人_一軍 - 1 && foreigners.every(p => Boolean(p.isPitcher) === Boolean(player.isPitcher))) return { farm: true, reason: '外国人4人が全員投手／全員野手になるため' };
  }
  return { farm: false, reason: '登録枠に空きあり' };
}
