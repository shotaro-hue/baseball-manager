# A1-3b前のopen済みnative冬

`yearEndGrowthOldOpen.json.gz`はmain `ffbf4114a0f3729b3f5e99570fe4d90b15284c7b` の独立cloneで実producerから生成。
`yearEndReviewWorld()` → `reduceEconomyCommand(w, wrap(w, {id:yearEndRetirementsId(2026),type:'prepare-year-end-retirements',humanTeamId:0,decisions:[{playerId:'budget-0',choice:'accept'}]}))` → JSON/gzip。
open receiptは従来9field（growthCoachesなし）、引退判断保存済み、posting前、revision2。
新コードでopeningフィールドを削除したfixtureではない。SHA-256: `4ad8084c2cc6087e50663b4a408080cfa1fbacf377c747b6153b8fc5ead2d9c7`。

旧coachesは年度履歴を持たないため、旧openから新しく成長を実行する時点の配列を旧年度観測とする。過去の雇用変更を推定復元しない。新規openは年度末観測を固定する。
