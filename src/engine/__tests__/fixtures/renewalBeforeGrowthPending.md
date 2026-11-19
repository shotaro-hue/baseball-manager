# 成長保存前の更改提示（修正前の実producer）

`renewalBeforeGrowthPending.json.gz` は PR #563 HEAD `baa30d7a77022b85551c5b4bcaf28b0edeafc147` の未修正producerで生成した有効な保存元。

生成経路: `reviewRenewalWinter()`（12球団のnew-game→実日程/閉幕→open-offseason→期末引退確定）→`reduceRenewalRequest(w, renewalRequest(w,{type:'offer',playerId:w.teams[0].players[0].id,salary:2000,years:2}))`→JSON/gzip。
fixture helperは今修正に追加したテスト用若手/満了名簿を既存実producerへ渡すだけで、回答/契約/予算/年度receiptを手書きしていない。

修正前の結果: 提示成功、turn0/dueTurn2/dueDate:null、due0件、成長保存拒否。取消は可能だがnative UIのターン進行は未接続で、不要な取消を要求する。保存済みの旧提示は新規入口ガードで遡及拒否せず、replay/取消/期日到来後回答を保全する。

SHA-256: `3bba07d880ce4b6c0182d186a1b3171a7b7e5c73d3ce88e489aed9ef6b6bbe58`。
