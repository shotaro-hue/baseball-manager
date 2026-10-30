# GM-01 A1-1d-1 Persistence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development. Independent whole-branch review before PR submission.

**Goal:** 新契約worldを既存世代保存で検証・保存・復元し、旧契約用補完と既知の降格を防ぐ。

**Architecture:** A1計画Task 4を分割する第1PR。既存saveloadへ純粋なeconomyPersistence検証を追加し、annualの契約は旧移行を通さず復元する。一般Appのannual再開は未接続のため明示拒否する。

**Tech Stack:** 現行JavaScript/Vitest/Playwright/fake-indexeddb。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-10-30-gm01-a1-integration-design.md` §§1,7、親計画Task 4。

## Global Constraints

- 基準main `9dd6cda2ff8bdeaf0b41b184c2fbaffff8103f55`、#520マージ済み、最終head CI成功。
- 一般公開ゲートOFF、DB version 5、main直接push/merge/auto-mergeなし。
- 旧セーブを移行しない。annualはテストfixtureだけ。旧形式の通常保存・復元は維持。
- 保存失敗時はprimary/backup/worldを保持。未記録値を補完しない。

## Review Focus

1. 冷起動・warm cacheの両方で同一saveIdのannual→legacy、epoch変更、revision逆行を拒否する。
2. 未知schemaと不完全engineは旧backupへ戻さない。読めるannual primaryの復旧は同一saveId/epochだけ。
3. inline/大root・圧縮有無・ID 0・育成・開始残高を保存で変えない。
4. 回答待ち更改の再読込→受諾→再保存で台帳/通知/予算を保全する。
5. dirtyScopesが空でもannualの通知は候補のworldと一致させる。

## Task 1: 保存境界の検証と非変更の復元

**Files:** Create `src/engine/economyPersistence.js`, `tests/economy-save-migration.test.js`; modify `src/engine/saveload.js`, `src/App.jsx`, `src/App.loadError.test.js`, `e2e/save-generations.spec.js`。

**Interfaces:** `validateEconomySave(world) -> mode`、`economySaveMetadata(world)`、`economyOverwriteIssue(previous,next) -> reason|null`。既存saveGame/loadGameを継続し、新たな保存エンジンを作らない。

- [x] テスト先行: 正常round-trip、未記録/未知schema拒否、年度/epoch/revision競合、失敗時の全root保持、同epoch復旧、Appゲート。
- [x] `npx vitest run tests/economy-save-migration.test.js src/App.loadError.test.js`でRED確認。
- [x] 保存前およびhydrate後に完全worldを検証。annualでは旧契約補完を通さない。比較用metadataを既存cacheへ保持。
- [x] annualのnews/mailboxは常に保存し、dirty scope漏れで別revisionの通知を再利用しない。
- [ ] 既存保存/履歴/容量/削除回帰と新規テストGREEN。実ブラウザで再読込・降格拒否を両browser確認。
- [ ] 独立レビュー、修正、専用PR、同head CI確認。

## 分割の判断・後続

Ruling: 親計画で認めるTask 4分割を採用。今回はI/O境界のみ。`commitEconomyCandidate`の非置換queueとpublish→adopt barrier、公開root由来ack、hookの原子的hydration、移行candidate/activation anchor/storage fenceは次PR。通常Appのannual読込を止めることで不完全な接続を公開しない。これをA1-1d全体の完了とは扱わない。

Ruling: 完全に判読不能なprimaryからの制度巻戻し防止は独立activation anchorが必要。今回の復旧制限は判読可能なannual/未知schemaと同プロセスの既知metadataまで。未知の破損からも保護できると報告しない。

Ruling: 独立レビューで既存adapterがsalary/budget等の表示投影を照合しないことも確認。新保存境界では不整合の永続化を拒否する。台帳・年度支出の既存selectorと比較し、読込時の自動修復はしない。将来producerが不正投影を渡すと保存が止まるため、元データを保全してproducer側を修正する。

Final review: Important 1件（旧形式の読込結果と比較cacheの参照共有）、Critical/Minor 0件。直接変更によるdowngrade/epoch/revision/条件変更4件をRED→GREEN。legacy career移行seedを維持して独立metadataへ変更。上記投影も7件RED→GREEN（区分矛盾1件は既存validatorで拒否済み）。詳細は `docs/validation/gm-01-a1-1d1/README.md`。
