/**
 * 記者会見エンジン — 月次プレスカンファレンスの質問・回答データと結果計算
 * @module pressConference
 */

/**
 * @typedef {Object} PressChoice
 * @property {string} text    - 回答テキスト
 * @property {number} popMod  - 人気度変動 (-10〜+10)
 * @property {number} moraleMod - チームモラル平均変動 (-10〜+10)
 * @property {string} label   - 選択肢ラベル（短縮表示用）
 */

/**
 * @typedef {Object} PressQuestion
 * @property {string} id        - 質問ID
 * @property {string} question  - 質問文
 * @property {PressChoice[]} choices - 回答選択肢（2〜3個）
 */

/** @type {PressQuestion[]} */
export const PRESS_QUESTIONS = [
  {
    id: "season_goal",
    question: "監督、今季の目標について改めてお聞かせください。",
    choices: [
      { text: "「優勝だけを目指して戦います。それ以外は考えていません」", popMod: 5, moraleMod: 8, label: "強気宣言" },
      { text: "「まずCS出場、そこから勢いで頂点を目指します」",           popMod: 3, moraleMod: 5, label: "現実路線" },
      { text: "「若手の成長を最優先に、長期視点で戦います」",             popMod: 2, moraleMod: 3, label: "育成重視" },
    ],
  },
  {
    id: "losing_streak",
    question: "最近の結果について、ファンも心配しています。どうお考えですか？",
    choices: [
      { text: "「私の責任です。采配を見直して必ず立て直します」",         popMod: 6, moraleMod: -3, label: "誠実" },
      { text: "「選手は全力でやっています。流れは必ず変わります」",       popMod: 3, moraleMod: 5,  label: "前向き" },
      { text: "「課題は明確です。修正しながら戦い続けます」",             popMod: 2, moraleMod: 4,  label: "冷静分析" },
    ],
  },
  {
    id: "young_players",
    question: "若手選手の起用について、今後の方針を教えてください。",
    choices: [
      { text: "「どんどん使います。失敗を恐れずチャレンジさせます」",     popMod: 8, moraleMod: 7,  label: "積極起用" },
      { text: "「実績と状態を見ながら、適切に判断します」",               popMod: 2, moraleMod: 3,  label: "実力主義" },
      { text: "「今は勝負の時期。実績ある選手を中心に戦います」",         popMod: -2, moraleMod: -4, label: "勝利優先" },
    ],
  },
  {
    id: "trade_rumor",
    question: "補強の噂が絶えませんが、トレードや外部補強についてはいかがですか？",
    choices: [
      { text: "「今いる選手を信じます。内部から競争で底上げします」",     popMod: 5, moraleMod: 8,  label: "内部昇格" },
      { text: "「チームに必要なピースがあれば積極的に動きます」",         popMod: 3, moraleMod: 2,  label: "柔軟対応" },
      { text: "「ノーコメントです。フロントと相談しながら進めます」",     popMod: -1, moraleMod: -2, label: "慎重" },
    ],
  },
  {
    id: "season_midpoint",
    question: "シーズン折り返しの時期ですが、チームの状態を率直に教えてください。",
    choices: [
      { text: "「想定以上の結果が出ています。このまま突き進みます」",     popMod: 5, moraleMod: 7,  label: "自信" },
      { text: "「課題もありますが、手応えは感じています」",               popMod: 3, moraleMod: 6,  label: "バランス" },
      { text: "「まだまだです。後半戦に全てをぶつけます」",               popMod: 4, moraleMod: 5,  label: "後半への意気込み" },
    ],
  },
];

/**
 * gameDay からその月次ブロック番号を計算する（15日刻み）
 * @param {number} gameDay - 現在のゲーム日
 * @param {number} interval - インターバル（デフォルト 15）
 * @returns {number}
 */
export function pressCycleIndex(gameDay, interval = 15) {
  return Math.floor((gameDay - 1) / interval);
}

/**
 * 記者会見の回答結果を計算する（純関数）
 * @param {PressChoice} choice - 選択した回答
 * @returns {{ popDelta: number, moraleDelta: number }}
 */
export function calcPressDelta(choice) {
  if (!choice) return { popDelta: 0, moraleDelta: 0 };
  return {
    popDelta:    Math.round(choice.popMod    ?? 0),
    moraleDelta: Math.round(choice.moraleMod ?? 0),
  };
}

/**
 * gameDay に対応する質問を返す（周期的に選択）
 * @param {number} gameDay
 * @returns {PressQuestion}
 */
export function pickQuestion(gameDay) {
  const idx = pressCycleIndex(gameDay) % PRESS_QUESTIONS.length;
  return PRESS_QUESTIONS[idx];
}
