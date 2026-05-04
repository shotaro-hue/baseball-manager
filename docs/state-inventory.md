# 状態管理棚卸し（UI state / Game view state / Persistent data）

## 目的
- 1打席進行【＝1回のプレー処理】で不要な再描画を抑え、体感速度を維持する。
- 永続データ【＝保存主体の大きなデータ】を分離し、React state の肥大化を防ぐ。

## 3分類一覧

| 区分 | 主なデータ | 現状 | 方針 |
|---|---|---|---|
| UI state【＝表示制御だけの状態】 | `screen`, `tab`, `playerModal`, `retireModal`, `notif` | `useState` | 継続（軽量） |
| Game view state【＝試合画面専用】 | TacticalGame の `gs`, `autoRunning`, `showMenu`, `visibleLogIds` | `TacticalGame.jsx` 内で管理 | Hub系と分離維持 |
| Persistent data【＝保存主体の大きなデータ】 | `seasonHistory`, `news`, `mailbox`, `scheduleArchive`, `gameResultsMap` | `useGameState` の `useState` | サマリ state + 本体遅延参照へ段階移行 |

## 影響範囲
- `src/hooks/useGameState.js`
- `src/App.jsx`
- `src/components/TacticalGame.jsx`

## 回帰テスト観点
1. 表示同等性【＝見た目と操作結果が従来と同じ】
   - ダッシュボード、日程、メール、ニュース、順位、成績の表示件数・内容。
2. 進行同等性【＝試合結果とシーズン進行が従来と同じ】
   - 1打席進行、自動進行、試合終了後の結果反映。
3. 保存同等性
   - 手動セーブ/オートセーブ後に再読み込みして主要データが再現されること。

## 次に実施するタスク（実装順）
1. Persistent data の分離実装
   - `seasonHistory` / `news` / `mailbox` / `scheduleArchive` / `gameResultsMap` を「本体ストア【＝大量データを保持する保管領域】」へ寄せ、React state には件数・最新ID・未読件数などのサマリのみ残す。
   - ⚠️ 互換性維持のため、既存UIが参照する読み取り関数を同時に提供し、既存タブ呼び出しを壊さない。
2. App の props 縮小
   - `teams` 全量受け渡しを優先タブ（Dashboard/Schedule/Mailbox/Trade/Contract/Standings/Stats/Leaderboard/Balance）から順に廃止し、selector【＝必要項目だけ抽出する関数】経由の最小データに置き換える。
   - ⚠️ 子コンポーネント側で null 安全【＝値が未設定でも落ちない処理】を徹底する。
3. autosave の完全リビジョン駆動化
   - `setNews` / `setMailbox` / `setFaPool` など直接 setter 経路を保存ラッパー化し、保存漏れを防ぐ。
   - 明示的に保存対象外の UI state を整理して、不要な dirty 化【＝保存必要フラグが立つこと】を抑制する。
4. TacticalGame ログの段階読み込み
   - `visibleLogIds` のみ描画を維持しつつ、ユーザー操作（「過去ログをさらに表示」）で古い表示窓を追加できる実装にする。
   - ⚠️ メモリ使用量増加を防ぐため、表示窓の上限件数を検証して適用する。
5. 回帰テストの固定化
   - 画面表示同等・試合進行同等・保存同等の3軸テスト手順を `docs/` に追記し、変更ごとに実行するチェックリストとして運用する。

## ⚠️ リスク
- Persistent data を急に完全分離すると既存タブの参照が壊れる可能性がある。
- そのため、まずは描画負荷の高いログ表示と autosave 依存の縮小を先行し、段階移行する。

## セキュリティ観点
- ⚠️ 入力値検証【＝不正値を弾く処理】を通さずにストアへ格納しない。
- ⚠️ 永続化データの読み込み時は型チェック【＝期待する型かを確認】を行い、不正データをUIに直接渡さない。
