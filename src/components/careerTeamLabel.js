import { TEAM_DEFS } from '../constants';

// Career entries may come from historical NPB records or game-season archives.
// Normalize names for display only. Do not rewrite saved names/team IDs: some
// imported historical rows have the player's current teamId, not the old one.
const aliases = {
  0: ['東京ヤクルト', 'ヤクルトスワローズ'],
  1: ['横浜DeNA', 'DeNAベイスターズ', '横浜ベイスターズ', '横浜'],
  2: ['広島東洋'],
  3: ['タイガース'],
  4: ['読売', '読売巨人軍', 'ジャイアンツ'],
  5: ['ドラゴンズ'],
  6: ['福岡ソフトバンク', 'ソフトバンクホークス', 'ソフトB'],
  7: ['東北楽天', '楽天イーグルス'],
  8: ['埼玉西武', '西武ライオンズ'],
  9: ['千葉ロッテ', 'ロッテマリーンズ'],
  10: ['北海道日本ハム', '日本ハムファイターズ', '日ハム'],
  11: ['オリックスバファローズ'],
};

const keyOf = name => name.normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase();
const shortByName = new Map();
const shortById = new Map();
for (const team of TEAM_DEFS) {
  shortById.set(String(team.id), team.short);
  for (const name of [team.name, team.short, ...(aliases[team.id] ?? [])]) {
    shortByName.set(keyOf(name), team.short);
  }
}

/** UI-only label; the recorded historical teamName wins over a potentially stale teamId. */
export function careerTeamLabel(row) {
  const name = typeof row?.teamName === 'string' ? row.teamName.trim() : '';
  if (name) return shortByName.get(keyOf(name)) ?? name;
  return row?.teamId == null ? '—' : shortById.get(String(row.teamId)) ?? '—';
}
