import { FIELDING_POSITIONS } from '../../constants';
export const batter = (id, pos = '一塁手', extra = {}) => ({
  id, name: String(id), pos, positions: { [pos]: 100 }, isPitcher: false,
  condition: 100, injuryDaysLeft: 0,
  batting: { contact: 50, power: 50, eye: 50, stamina: 50 }, ...extra,
});
export const pitcher = (id, extra = {}) => ({
  id, name: String(id), pos: '先発', subtype: '先発', isPitcher: true,
  condition: 100, injuryDaysLeft: 0, recentPitchingDays: [],
  pitching: { velocity: 50, control: 50, breaking: 50, stamina: 50 }, ...extra,
});
export const team = (id = 0, league = 'セ') => ({
  id, league, players: [], farm: [
    ...FIELDING_POSITIONS.map((pos, i) => batter(`${id}-b${i}`, pos)),
    batter(`${id}-dh`), ...Array.from({ length: 6 }, (_, i) => pitcher(`${id}-p${i}`)),
  ],
});
export const teams = () => Array.from({ length: 12 }, (_, i) => team(i, i < 6 ? 'セ' : 'パ'));
export const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
