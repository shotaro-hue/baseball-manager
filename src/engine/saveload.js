/* ═══════════════════════════════════════════════
   SAVE / LOAD — localStorage
═══════════════════════════════════════════════ */

const SAVE_KEY = 'baseball_manager_v1';
const META_KEY = 'baseball_manager_v1_meta';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const myTeam = state.teams?.find(t => t.id === state.myId);
    localStorage.setItem(META_KEY, JSON.stringify({
      teamName:  myTeam?.name  ?? '不明',
      teamEmoji: myTeam?.emoji ?? '⚾',
      year:      state.year,
      gameDay:   state.gameDay,
      wins:      myTeam?.wins  ?? 0,
      losses:    myTeam?.losses ?? 0,
      savedAt:   new Date().toLocaleString('ja-JP'),
    }));
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Load failed:', e);
    return null;
  }
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function getSaveMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(META_KEY);
}
