# saveGame性能計測のテスト手順

この手順は、`saveGame` の処理時間を安全に再現計測するためのガイドです。  
目的は「どこが遅いか」を感覚ではなく数字で判断することです。

## 1. 事前準備

1. 開発サーバーを起動します。

```bash
npm run dev
```

2. ブラウザでゲームを開き、セーブ可能な画面まで進めます。
3. 開発者ツールのコンソールを開きます。

## 2. 計測ログを初期化

まず古いログを消して、今回の計測だけを対象にします。

```js
import { clearSavePerfLogs } from '/src/engine/saveload.js';
clearSavePerfLogs();
```

期待値:
- `{ ok: true }` が返ること

エラー時の確認:
- `ok: false` の場合は、ブラウザ拡張やプライベートモードで `localStorage` が制限されていないか確認

## 3. 実運用に近い操作で10〜30回セーブを発生

以下のどちらかで実施します。

- 通常プレイで日送り・試合進行を行い、自然に `saveGame` を複数回発生させる
- 同じ操作を繰り返し、最低10回、理想は30回のサンプルを集める

> 理由: 単発値は外れ値【＝たまたま大きく/小さく出る値】の影響を受けやすいため。

## 4. サマリー確認（まずはこれだけ見ればOK）

```js
import { getSavePerfSummary } from '/src/engine/saveload.js';
console.table(getSavePerfSummary());
```

確認ポイント:
- `count`: サンプル件数（10以上あるか）
- `average.totalMs`: 平均保存時間
- `average.writeMainSaveMs`: 本体保存の平均
- `average.rotateBackupMs`: バックアップ回転の平均
- `average.writeMetaMs`: メタ情報保存の平均
- `slowest`: 最遅回の詳細

## 5. 詳細ログ確認（必要時のみ）

```js
import { getSavePerfLogs } from '/src/engine/saveload.js';
console.table(getSavePerfLogs());
```

詳細で見るべき点:
- `jsonLength` と `compressedLength` が極端に大きい回はないか
- `fallbackOverwrite: true` が出ていないか（容量不足の兆候）

## 6. 判定基準（原因の当たりをつける）

- `writeMainSaveMs` が最大
  - `localStorage.setItem` が律速【＝最も処理時間を支配している工程】
- `rotateBackupMs` が大きい
  - バックアップ回転のコストが高い
- `totalMs` だけ大きく、上記が小さい
  - `JSON.stringify` / `compressToUTF16` 側の追加計測が必要

## 7. 回帰テスト【＝変更後に悪化していないか確認】

最適化後に同条件で再計測し、以下を比較します。

- `average.totalMs`
- `average.writeMainSaveMs`
- `average.rotateBackupMs`
- `slowest.totalMs`

比較時のルール:
- サンプル件数を同じにする（例: どちらも20件）
- 同じブラウザ、同じ端末、同じ操作手順で実施

## 8. ⚠️ よくある失敗と対処

- ⚠️ サンプル数が少ない（1〜3件）
  - 対処: 最低10件まで増やす
- ⚠️ バックグラウンドで重い処理が動いている
  - 対処: 他タブを閉じて再計測
- ⚠️ `localStorage` 容量制限に近い
  - 対処: 不要な保存データや計測ログを削除して再実行

## 9. 参考: 単体テスト実行

今回追加したAPIはユーティリティテストを優先実行できます。

```bash
npx vitest run src/engine/__tests__/utils.test.js
```

プロジェクト全体テストを行う場合:

```bash
npm test
```

> 既存テストが失敗する環境では、まず対象機能に近いテストから実行して切り分けるのが安全です。
