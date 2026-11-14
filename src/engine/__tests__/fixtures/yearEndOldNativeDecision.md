# 開始receiptなしの保存済み期末判断

`yearEndOldNativeDecision.json.gz`は修正前HEAD
`88f081ad8a5a23d1a5db3fa3566be8cd8661c9fe`の実producerで生成したworld。

生成経路: `winter(economyFixture())`（既存の旧native冬fixture）→
`gameDay = 144`、自球団選手を`age:42, retireStyle:100`、CPU選手を
`age:35, retireStyle:0, stats:{PA:500}`へ設定→
`reduceEconomyCommand(world, wrap(world, { id: yearEndRetirementsId(2026),
type:'prepare-year-end-retirements', humanTeamId:0,
decisions:[{playerId:0, choice:'accept'}] }))`→JSON/gzip。

自球団accepted・CPU continued、revision 1、open-offseason receiptなし。
既存形式で既に保存できた操作を、開始条件の強化で読込不能・再実行不能にしないための固定fixture。
新規操作の正当性を示すfixtureではなく、後から開始receiptを削除したものでもない。
SHA-256: `4ad666560d020fa0676f3da9a12a61fce6c09279be694841fe06898cb1758f26`。
