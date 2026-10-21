# FIX-CORE-02 — 移籍金額表示・タイトル読込警告

作成日: 2026-10-21。照合main: `46d75e21b1f6e27c0f60274a38cd7619a80d951d`、tree: `e30e6ae52859a7a355be210f19261e4f31442090`。GitHub上で#489マージ済み、open PR 0件、mainのCI #463成功を確認した。添付ZIPは2026-05時点の旧ソースなので使用していない。既存ローカルオブジェクトをGitHubの署名付きmainオブジェクト/SHAと完全なtreeに照合して専用checkoutを作り、既存作業は変更していない。

## 原因・修正の範囲

| 対象 | コードで確認した原因 | 最小修正 |
|---|---|---|
| 移籍金額 | `useSeasonFlow.js`のCPU間トレード生成2経路はcashを持たない。NewsTabの`Number(item.cash)!==0`ではNaNも通る | NewsTabの描画時だけnumber/stringを数値化し、有限かつ非ゼロの場合に既存の金額ラベルを表示。履歴を書き換えない |
| 再開失敗警告 | Appの失敗メッセージ→gs.notify→3,500ms後にnotif=null→RouterのTitleScreen.loadError=null | Appの一時的なloadErrorを既存のTitleScreen alertへ直接渡す。失敗/再試行中に保持し、成功・新規ゲーム選択・明示削除成功時に解除。一般通知の仕組みは変更しない |

金額の正本は`applyTradeTransaction`の既存仕様（万円）。プレイヤーの予算から正のcashを引き、相手へ加算するため、正=支払い/負=受取を維持する。`useOffseason.handleTrade`はそのcashを履歴へ記録する。CPU受諾時に既存の円→万円/視点変換があるが変更していない。CPU履歴に架空のcash=0を追加しない。

ゲーム中の保存結果は既存HubHeaderのsaveResultで「保存失敗」「保存済み・一部履歴は要確認」等が保持され、保存ボタンで再試行できる。本PRは警告の保持が不足していたタイトル側を直す。失敗した読込を一般通知へ重複登録すると成功直後のhubにも古い警告が出るため、読込失敗だけを専用エラーへ移す。正常な一般通知とバックアップ復旧成功の通知は既存どおり。

初回実装の製品変更はNewsTab、App、AppScreenRouterの3ファイル。明示削除/新規選択でApp内の読込世代を更新する方式は、後述のPR #490レビュー追補で削除開始時へ修正した。追補ではTitleScreenとloadGame/deleteSaveの競合処理も変更する。トレード/CPU/金額単位・保存形式/保存キー/マニフェスト/保存世代形式・CSS/幅判定は変更しない。削除は従来の明示確認操作のみ。今回の復旧確認で破損候補を自動削除・修復しない。

## 受入テストとRED→GREEN

| 観点 | 検証 |
|---|---|
| CPU間cash未設定/undefined | 実NewsTabの描画と入力不変。ブラウザでも省略キーのまま保存/再開 |
| cash=0/-0/null/NaN/±Infinity/不正文字列 | 金額ラベルを省略。null/不正文字列を0へ書き換えず、保存後も維持 |
| 不正な型 | boolean/配列/objectを金額に変換しない |
| 正/負の数・数値文字列 | 1,250万円支払い/受取、保存済み文字列500/-500の互換性 |
| 保存再開・年度・空表示 | 既存core-reliability旅程を拡張。選択年度の符号付き金額、全年度/履歴なし、元履歴不変を確認 |
| 読込全破損/候補なし/例外 | 実App/Router/Titleのalertが通知寿命後も残り、他の通知で上書きされない |
| 再試行 | 未完了中に警告を保持。失敗再試行も可能、成功後とタイトル再訪時に古い警告なし |
| 新規選択/明示削除 | 成功後に古い読込エラーを残さない。既存の初期化/古いload無効化テストを保持。削除成功後に遅延完了する読込のnull/例外/正常データの3パターンも無効化 |
| 正常な通知 | 一般通知は3.5秒で消える。バックアップ復旧成功の案内も従来経路 |

ローカルbaselineは4ファイル23件成功。追加テストは金額9件失敗（23件中）、タイトル警告6件失敗（6件中）を修正前に確認。初回のApp fixtureには一軍/二軍日程と日数の不一致があったため、製品変更前に既存の実new-game fixtureへ交換し、失敗理由が警告消失/未解除であることを再確認した。新規選択の非同期処理は実際のTitleScreen callbackとyieldを完了まで待つようにした。

追加の成功直後の古いnotifテストも1件RED→GREEN。入力fixtureや期待値で不具合を隠していない。NaNはメモリ上のrendererで検証し、JSON標準のNaN→null変換を独自修復やデータ保持と取り違えない。

## 実行結果

- `npx vitest run ... --maxWorkers=2 --minWorkers=1`: 関連10ファイル123件成功（レビュー修正後）。App/タイトル/移籍・hookの取引/金額エンジン/会見/保存状態/通知ナビを含む。意図的な破損入力による既存console出力はある。
- 最初のworker制限なしの関連実行は終了コード0でも集計フッターが欠けていたため、完了証拠に数えなかった。上記は全ファイル/件数が出た実行。製品やテスト設定は変えていない。
- `npm run build`: 成功。既存の500kB超chunk警告あり。
- `npm run test:e2e -- core-reliability.spec.js --project=chromium --workers=1 --retries=0`: 14件成功（3.3分）。レビューの読込世代修正後にも対象の破損/再試行シナリオ1件を再実行し成功。全保存候補、5秒後の全破損警告と再試行、同一タイトルからの成功、360/390/1440pxの会見/金額/年度/保存再開、空履歴を含む。
- ローカルWebKitは1シナリオを試行したがOS共有ライブラリ不足でブラウザ起動前に失敗。製品assertionは未実行。CIは既存の`playwright install --with-deps chromium webkit`による標準環境で確認する。
- 最終提出headの全Vitest/Chromium/WebKit・全ジョブの成否はPR本文を正本とする。CI待ちを成功扱いにしない。

## 同一状態の画面比較

実保存fixtureを同じmainと修正後で表示し、日本語フォントを全要素へ揃える（フォント未取得の欠落画像は提出版へ含めない）。金額未設定/不正文字列のNaN表示、正常な支払い/受取、失敗から5秒後のalert、再開ボタンと破損rootsの保持をDOMでも照合する。[実行用スクリプト](./capture.mjs) / [集計](./capture-summary.json)。

| 幅 | 移籍金額 | 読込失敗から5秒後 |
|---|---|---|
| 360px | [前](./before-news-360.jpg) / [後](./after-news-360.jpg) | [前](./before-title-360.jpg) / [後](./after-title-360.jpg) |
| 390px | [前](./before-news-390.jpg) / [後](./after-news-390.jpg) | [前](./before-title-390.jpg) / [後](./after-title-390.jpg) |
| 1440px | [前](./before-news-1440.jpg) / [後](./after-news-1440.jpg) | [前](./before-title-1440.jpg) / [後](./after-title-1440.jpg) |

撮影初回は別セルで起動した開発サーバーが終了し接続不可だったため、baseline/修正後サーバーを撮影と同じ親プロセスで管理する方式へ変更した。製品コード・テストの問題ではない。最初の撮影では失敗後に仮想時計を入れたため既存のnative通知タイマーが進まず、導入を失敗前へ移して撮影をやり直した。誤った時刻条件の画像/集計は提出版へ含めない。

## 限界・次工程

実iPhone Safariの指の追従/キーボード/速度、別端末の実ユーザーセーブ、10年/20年の総合QA、外部バックアップは今回未検証。Chromium/WebKitの自動化を実機確認と表現しない。

順序はFIX-CORE-02→SAVE-01A（構造棚卸し/方式比較/安全復元設計）→SAVE-01B（設計承認後のみ実装）→QA-04A→UI-04D→QA-04B。各工程は独立レビュー/マージ待ち。コードを伴わない保存設計の先行は可能だが、今回の修正へバックアップ実装やUI全面刷新を混在させない。

## 独立レビューの追加検証

削除成功後に未完了の読込が返ると、警告が再発したり既に削除したゲームを画面へ適用する経路を独立レビューのP2指摘として追加3テストでRED確認した。App内の読込世代を明示削除/新規選択で進め、既存の初期化attempt検査と合わせて古いcontinuationを拒否する最小修正でGREEN。ストレージの削除・読み書き・キューを作り直していない。独立レビューでは元の差分に他の対応必須指摘はなかった。修正自体は親担当がRED→GREENで検証し、再レビューは行っていない。最終提出前の全テストは同一head CIが正本。

## PR #490レビュー追補 — 削除開始と遅延IndexedDB読込

対象基点: `2f782c0629f9301482a32d5c40e53f9a067722c9`。remote mainは引き続き`46d75e21b1f6e27c0f60274a38cd7619a80d951d`。初回のcallback-onlyテストでは削除完了前の競合と保存エンジンのキャッシュ再生を検出できていなかったため、実App/Router/Title・実`deleteSave()`・実保存世代読込を通す統合テストへ追加した。

- **P1:** 確認ダイアログの承認後、動的importや保存ロック待ちに入る前にAppの読込世代を更新し、同期refで新しい読込も禁止する。取消時は世代を進めない。失敗時はタイトルと再試行操作を維持し、削除前に開始した読込は成功/欠損/IDB例外のいずれでも画面や警告へ反映しない。既存警告の解除は削除成功時のまま。`useGameState.runTitleLoad`は同じepochのみ重複実行を抑止し、失敗削除後の別epochの再試行は古い読込に続けて実行する。新規初期化もこの直列tailの完了を待つ。
- **P2:** 読込開始時のstorage・削除epoch・primary/backupのraw値を保持し、非同期読込後のobservations、validatedRoots、validatedRawRoots、chunk metadata、lastLoadResultの公開を検査する。削除epochが変化した読込はnullで終了。別タブのroot変更時はキャッシュ公開を避け、既存観測で確実に`save_conflict`になる場合だけ以前の返却互換性を保つ。新しい読込で保存が許可済みの場合や最初のstorage例外で観測がない場合は古いstateを返さずnullにする。
- **削除失敗:** 全キー削除の成功後だけキャッシュを初期化する。途中のremove失敗では消したroot/metaを戻し、既存観測を保持して再試行可能にする。ロック・保存形式・世代manifest・保存対象は追加しない。localStorage自体が復元のsetItemも拒否する場合の完全な原子性は保証しない（既存の複数キーAPIの限界）。

### 追加検証

`tests/save-delete-load.test.js`と`src/App.deleteLoad.integration.test.js`の20件は修正前に**17失敗/3成功**、修正後に**20成功**。本物のfake-indexeddbトランザクションのcomplete/abort通知だけを保留し、`readGeneration`や`deleteSave`はmockしない。削除中/削除後の成功・欠損・例外、取消、削除失敗後の再開、4箇所のremove失敗とroot/meta保持、削除直後の新規保存/再読込、古い読込が新しいキャッシュを上書きしないこと、cold tabのprimary/backup変更による競合を検査する。初回RED実行で未解放ロックが後続テストを止めたため、test helperに失敗時も解放するteardownを追加してから上記件数を採用した。

- 別agentの新規レビューで、古い返却stateによる新しいrootの上書き、削除失敗直後のretryが古いpromiseへ合流して消える問題、cold storageの初回getItem例外で観測がない状態での上書きを指摘。3ケースをそれぞれRED確認後に修正し、追加テストは合計**23件成功**。最終差分の再レビューで対応必須指摘なし（reviewer自身のテスト再実行はなく、実装担当が下記を実行）。
- `npx vitest run tests/save-delete-load.test.js src/App.deleteLoad.integration.test.js src/App.loadError.test.js src/App.initialization.test.js src/components/TitleScreen.initialization.test.js src/components/TitleScreen.resume.test.js tests/save-generations.test.js --maxWorkers=2 --minWorkers=1`: 最終差分で**7ファイル84件成功**。
- `npm run test:e2e -- core-reliability.spec.js --project=chromium --grep 'deletion rejects' --workers=1 --retries=0`: **2件成功**。ブラウザのIndexedDB通知とnative Web Lockを保留し、実際の削除確認・途中の操作禁止・遅延読込後のhub/警告非復活・fresh save・reload/resumeを確認した。既存CIでこのspecのChromium/WebKitも実行対象。
- レビュー修正後も削除2件は成功。既存`unrecoverable roots`を加えた実行は、他の重い比較検証と並行中にその1件だけ30秒timeoutとなった。変更・retry設定の緩和なしで同ケースを単独実行すると**1件成功（19.5秒）**。最初のtimeoutを隠さず、通常CIで再確認する。
- `npm run build`: **成功**。既存の500kB超chunk警告あり。
- 追加の保存/通算/二軍/移籍表示回帰12ファイル: **81成功/1失敗**。失敗は`farmRuntime.integration.test.js`の`manual save retains an adopted farm round after failure, and retries without re-simulation`（line54、`loadGame()`がnull）。無変更の基点`2f782c0`を別worktreeに作り同ファイル全体を実行すると**同じ箇所で1失敗/2成功**。修正後の同ファイル再実行は**3成功**、両treeの対象1件単独実行も成功。順序/タイミング依存の既存失敗として記録し、このPRで期待値・skip・保存fixtureを変更していない。比較は`--testTimeout=60000 --maxWorkers=1 --minWorkers=1`で実行（最初のbaseline単独実行は既定10秒timeoutで比較不能だったため）。

同一commitの全件Vitest・通常CI・WebKitはPR側の品質ゲートで確認し、ローカルの部分検証を全件成功と表現しない。実iPhone、10年/20年QA、SAVE-01A以降の実装は対象外。


## 2026-10-21 最終P2修正（#490）

- P2-A: 競合時に旧stateを返す互換分岐を廃止。storageごとの読込attempt世代を検査し、新しい読込が同一rootを読んだ場合も古い結果を返さない。最新attemptだけが`conflict/load_conflict`を公開し、Appはタイトルに理由と「続きから」で最新保存を読む経路を保持する。既存observationsは勝手に更新せず、旧状態のsave_conflictを維持する。通常読込・バックアップ復旧は変更しない。
- P2-B: meta→backup2→backup1→primaryの順で削除。途中失敗は全キーの復元を個別に試み、一つの復元失敗で他の復元を止めない。各removeItemが例外時に対象キーを変更しないlocalStorageの仕様を前提に、最後のprimaryは失敗時に残る。複数キー全体の原子性、ブラウザによる領域消去や外部改変、失敗時の全バックアップ復元までは保証しない。
- RED: 新規/強化した読込・App・remove+rollback例外検証は28件中7失敗、21成功。旧テストが期待していた「旧stateを返し保存時に拒否」を「旧stateを返さず、保存時の拒否も維持し、明示再読込で最新rootへ復帰」に強化。テストの削除/skip/期待値緩和なし。
- GREEN: save-delete-load / App.deleteLoad / App.loadError / save-generations / farm-save-generations / saveload / saveloadScopes の7ファイル81件成功。production build成功（既存の大きなchunk警告あり）。
- 実iPhoneの元障害reasonは未確定。この修正から実機障害の解消は主張しない。両PR統合検証は#491側の追補を参照。最新headの通常CI結果はPR本文が正本。
