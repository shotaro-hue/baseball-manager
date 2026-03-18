/* ═══════════════════════════════════════════════
   年度別シーズンパラメータ
   - 各年度の開幕日・交流戦開始日・AllStar休暇・甲子園使用制限を定義
   - 記載のない年度は getDefaultParams() でアルゴリズム算出
═══════════════════════════════════════════════ */

export const SEASON_PARAMS = {
  2025: {
    // 2025年度 実績値
    openingDate: { month: 3, day: 28 },          // 金曜開幕
    interleagueStart: { month: 6, day: 3 },       // 6/3(火)〜6/22(日) 18日
    // AllStar: 7/23(水)・7/24(木)。7/22(火)〜7/24(木) の3日を追加スキップ
    allStarSkipDates: [
      { month: 7, day: 22 },
      { month: 7, day: 23 },
      { month: 7, day: 24 },
    ],
    koshienBlackout: {
      // センバツ期間（3月下旬〜4月上旬）: 阪神は京セラ、オリックスはアウェイ
      spring: { start: { month: 3, day: 20 }, end: { month: 4, day: 6 } },
      // 夏の甲子園（8月上旬〜中旬）
      summer: { start: { month: 8, day: 4 }, end: { month: 8, day: 24 } },
    },
    // 交流戦ラウンド1の先攻カード: paId → [ceIds...] で「パがホスト」
    // 2025年実績: 日本ハム-阪神, 楽天-DeNA, 西武-ヤクルト, ロッテ-巨人, オリックス-広島, SB-中日
    interleagueRound1PaHosts: {
      10: [3],  // 日本ハム(10)が阪神(3)をホスト
      7:  [1],  // 楽天(7)がDeNA(1)をホスト
      8:  [0],  // 西武(8)がヤクルト(0)をホスト
      9:  [4],  // ロッテ(9)が巨人(4)をホスト
      11: [2],  // オリックス(11)が広島(2)をホスト
      6:  [5],  // ソフトバンク(6)が中日(5)をホスト
    },
  },
};

/**
 * 指定年度のデフォルトパラメータを算出
 * @param {number} year
 * @returns {object}
 */
export function getDefaultParams(year) {
  return {
    openingDate: getLastFridayOfMarch(year),
    interleagueStart: getFirstTuesdayOfJune(year),
    allStarSkipDates: getDefaultAllStarSkip(year),
    koshienBlackout: getDefaultKoshienBlackout(year),
    interleagueRound1PaHosts: null, // nullの場合は固定回転を使用
  };
}

/** 3月最終金曜日（3/25〜3/31の間） */
function getLastFridayOfMarch(year) {
  for (let day = 31; day >= 25; day--) {
    if (new Date(year, 2, day).getDay() === 5) { // 5=金曜日
      return { month: 3, day };
    }
  }
  return { month: 3, day: 28 };
}

/** 6月第1火曜日 */
function getFirstTuesdayOfJune(year) {
  for (let day = 1; day <= 7; day++) {
    if (new Date(year, 5, day).getDay() === 2) { // 2=火曜日
      return { month: 6, day };
    }
  }
  return { month: 6, day: 3 };
}

/**
 * AllStar休暇の追加スキップ日（月曜以外）
 * 7月中旬〜下旬の火〜木の3日間
 */
function getDefaultAllStarSkip(year) {
  // 7/18付近で火曜日を探す
  for (let day = 14; day <= 25; day++) {
    const dow = new Date(year, 6, day).getDay(); // 7月
    if (dow === 2) { // 火曜日
      return [
        { month: 7, day },
        { month: 7, day: day + 1 }, // 水曜
        { month: 7, day: day + 2 }, // 木曜
      ];
    }
  }
  return [];
}

/**
 * 甲子園ブラックアウト期間（概算）
 * 春: 3月第3土曜日〜4月第1日曜日
 * 夏: 8月第1木曜日〜8月第4日曜日
 */
function getDefaultKoshienBlackout(year) {
  // 春: 3月の第3土曜日
  let springStart = 14;
  for (let d = 15; d <= 21; d++) {
    if (new Date(year, 2, d).getDay() === 6) { springStart = d; break; }
  }
  // 4月の第1日曜日
  let springEnd = 6;
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, 3, d).getDay() === 0) { springEnd = d; break; }
  }

  // 夏: 8月の第1木曜日
  let summerStart = 7;
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, 7, d).getDay() === 4) { summerStart = d; break; }
  }
  // 8月の第4日曜日
  let summerEnd = 24;
  let sunCount = 0;
  for (let d = 1; d <= 31; d++) {
    if (new Date(year, 7, d).getDay() === 0) {
      sunCount++;
      if (sunCount === 4) { summerEnd = d; break; }
    }
  }

  return {
    spring: { start: { month: 3, day: springStart }, end: { month: 4, day: springEnd } },
    summer: { start: { month: 8, day: summerStart }, end: { month: 8, day: summerEnd } },
  };
}
