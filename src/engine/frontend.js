/**
 * フロント関係の純関数 — オーナー目標・信頼度計算
 * @module frontend
 */

/**
 * プレーオフ結果とチームの目標から信頼度変動量を計算する（純関数）
 * @param {string}  myId    - 自チームID
 * @param {{ ownerGoal?: string, wins?: number, losses?: number } | null} myTeam - 自チームオブジェクト
 * @param {object | null} playoff - プレーオフ結果オブジェクト
 * @returns {number} 信頼度変動量（-25〜+30）
 */
export function calcOwnerTrustDelta(myId, myTeam, playoff) {
  if (!myTeam || !playoff) return 0;
  const isChampion = playoff.champion?.id === myId;
  const inJPSeries = playoff.jpSeries?.teams.some(t => t.id === myId);
  const inCS2 = playoff.cs2_se?.teams.some(t => t.id === myId) || playoff.cs2_pa?.teams.some(t => t.id === myId);
  const inCS1 = playoff.cs1_se?.teams.some(t => t.id === myId) || playoff.cs1_pa?.teams.some(t => t.id === myId);
  const inCS = inCS1 || inCS2 || inJPSeries || isChampion;
  switch (myTeam.ownerGoal || "cs") {
    case "champion": return isChampion ? 30 : inJPSeries ? -10 : inCS ? -20 : -25;
    case "pennant":  return inJPSeries ? 20 : inCS ? -5 : -20;
    case "cs":       return inCS ? 15 : -15;
    case "rebuild":  return (myTeam.wins >= myTeam.losses) ? 10 : -5;
    default:         return 0;
  }
}
