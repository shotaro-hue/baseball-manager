# PR-C posting済み旧native fixture

`yearEndOldPosting.json.gz`は、期末判断順序ガードを加える前のHEAD
`e636103dd245f316d124b6be6262f68481bfafa6`で、実producerから固定した保存world。

生成経路：`yearEndReviewWorld()` →
`reduceOffseasonPostingRequest(world, offseasonPostingRequest(world))` → JSON/gzip。
実日付付き閉幕/財務/PR-C open-offseason receiptを持つ12球団の小規模fixture。
期末新規引退の親receiptはなく、既存postingの親/phase/全12球団の希望確認を持つ。
revisionは2。年齢・policy等は明示テスト条件で、本番校正値ではない。

目的は、以前の有効な順序で既に保存されたpostingを読込・再利用し、
後付け引退抽選や旧判断の改変を要求しないことの検証。
修正後の新規APIで不正な順序を作る回避をfixture生成には使用しない。
