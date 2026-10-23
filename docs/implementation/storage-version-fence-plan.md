# SAVE-01B-0B — 旧版タブのDB接続拒否と安全な更新

> For agentic workers: use superpowers:executing-plans inline; use test-driven-development and independent final review.

**Goal:** 不変archiveを導入する前提として、現行version3以下を指定する旧版writerが新DBへ書込めない境界を作る。更新が阻まれた場合は保存データを変更せず、原因別の安全な再試行を案内する。

**Architecture:** 既存DBをversion4へ非破壊upgrade（ストア/保存形式の変更なし）。最新接続はversionchangeで閉じ、openのblocked/失敗後に遅れて実行されるupgradeはabort/closeする。IndexedDBのVersionErrorで版指定旧callerを拒否する。saveの失敗診断/表示へ既知のreasonを通す。

**Tech Stack:** Existing Web IndexedDB, JavaScript, Vitest/fake-indexeddb, Playwright Chromium/mobile WebKit.

**Spec:** SAVE-01A 4.1/9/14節（正本PR #494）。main `66a8dda77132892946f0da69c323db853dbac4b9`、#496のCI13ジョブ成功確認済み。

## Scope / alternatives

- タブ通知やWeb Locksだけでは非参加旧版を止められない。DBの版指定openを拒否する方式を選ぶ。BroadcastChannelの追加やタイマーleaseは不要。
- v3の全ストア/全行/索引と、localStorageのprimary/bk1/bk2/metaを保全する。ユーザーの削除/初期化/サイトデータ消去は行わない。
- これはDB接続世代の境界。無版指定raw IDB、既存接続の任意コード、localStorageのみを直接変更するコードへの万能fenceではない。
- 旧版の既存接続が閉じない間は新規openを失敗させる。失敗後に旧接続が閉じても、その失敗した要求を勝手に成功/upgradeへ変えない。
- このPRに不変archiveの格納、試合結果receiptのstate/Worker統合、完全export/importを混ぜない。root対応にはaccepted progress receiptが必要と分かったため、#494に判断を集約して後続の独立差分とする。
- 実iPhone、設計凍結、B-1開始、完成した完全バックアップの認定は未完了。
- main push/merge/auto-mergeなし。専用PRを作成する。v4導入後の旧版rollbackは互換loaderが必要。

## Task 1 — DB fencing and recoverable failures

Files: `src/engine/baseballManagerDb.js`, `src/engine/saveload.js`, `src/engine/saveFeedback.js`, `src/engine/saveDiagnostics.js`; new `tests/storage-version-fence.test.js`, new `e2e/storage-version-fence.spec.js`, browser config/CI.

Interfaces: native open wait budget **10,000 ms**; a native request with no terminal event fails as **StorageOpenTimeoutError / storage_open_timeout** and its result remains abandoned until the request actually settles. This is an application timer budget, not a platform performance guarantee or a total per-helper-invocation deadline: concurrent callers may first wait for another successful open and then start their own native request. Per-realm pending opens share failure without sharing successful connection handles. DB version **4**; blocked error name **StorageUpgradeBlockedError**, save reason **storage_upgrade_blocked**; VersionError reason **storage_version_outdated**. Existing `openBaseballManagerDb()` Promise API and store names/indexes stay unchanged.

Review focus:
1. v3→v4 retains every store and mixed numeric/string keys, byte-equivalent payloads and root sentinels.
2. Blocked request rejects before changes; its delayed upgrade aborts after the old holder closes. Retry creates a fresh request and succeeds.
3. Newer-version notification closes helper-owned connections, permitting forward upgrades; older open rejects VersionError with no mutation.
4. A synchronous schema exception aborts the whole upgrade and leaves a fresh retry possible; abandoned success closes connections.
5. Save failure reasons survive safe diagnosis and provide conditional retry vs preserve-edits/reload guidance without payload/error-text disclosure.

- [x] Write unit/browser positive safety tests and observe RED against current production helper.
- [x] Implement the minimal open lifecycle + version bump; thread known failure reasons through existing save/diagnostic/feedback paths.
- [x] Run focused DB/archive/save/delete/load regressions and actual two-browser tests (1 worker/retry0), verify JSON artifact path, build.
- [x] Independent final review; preserve Promise API with RED→GREEN. Record scope, evidence and remaining root/archive/device gates.
- [ ] Publish a dedicated PR and inspect exact-head CI; keep #494 as the design authority. No false claim of real-device/full-backup completion.

Execution notes: initial 6 safety cases RED; stalled-open timeout and throwing-getter Promise contract also observed RED. A first implementation left later requests behind a rejected native open and timed out in two unit cases and a browser case. The per-factory pending-request record and cross-realm timeout corrected the cause. Schema exceptions actively abort and clear the record; blocked/timeout requests remain abandoned until native termination. Immediate retry before native termination may still report the original failure. Migration data comparisons occur before a successful game save, whose normal GC may reclaim orphan test rows. Evidence and review disposition: [validation](../validation/storage-version-fence/README.md). Exact-head CI remains a separate gate.
