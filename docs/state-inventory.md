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

## ⚠️ リスク
- Persistent data を急に完全分離すると既存タブの参照が壊れる可能性がある。
- そのため、まずは描画負荷の高いログ表示と autosave 依存の縮小を先行し、段階移行する。
