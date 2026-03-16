# ⚾ Baseball Manager 2025 — セットアップ手順書

プログラミング未経験の方でも大丈夫！  
以下の手順通りに進めれば、ゲームをローカル環境で動かせます。

---

## 📋 事前準備（1回だけ）

### ステップ 1: Node.js をインストールする

Node.js とは、JavaScriptをパソコンで動かすためのソフトです。

1. **https://nodejs.org** にアクセス
2. **「LTS」と書かれた緑色のボタン**をクリックしてダウンロード
3. ダウンロードしたファイルを開いて、画面の指示に従って「Next」を押し続ける
4. 完了！

**確認方法（省略可能）:**  
ターミナル（Mac）またはコマンドプロンプト（Windows）を開いて以下を入力：
```
node --version
```
`v18.x.x` や `v20.x.x` のような数字が表示されればOKです。

> **ターミナルの開き方:**
> - **Mac:** Spotlight（Cmd + Space）で「ターミナル」と入力して開く
> - **Windows:** スタートメニューで「cmd」と検索して「コマンドプロンプト」を開く

---

## 🚀 ゲームの起動

### ステップ 2: プロジェクトフォルダを用意する

1. ダウンロードした `baseball-manager` フォルダを、わかりやすい場所に置いてください
   - 例: デスクトップや「ドキュメント」フォルダ

### ステップ 3: ターミナルでフォルダに移動する

ターミナル（Mac）またはコマンドプロンプト（Windows）を開きます。

```bash
cd デスクトップ/baseball-manager
```

> **💡 ヒント:** `cd` は「このフォルダに移動する」という意味です。  
> フォルダの場所がわからない場合は、フォルダをターミナルにドラッグ＆ドロップすると、パスが自動入力されます（Macの場合）。

### ステップ 4: 必要なパッケージをインストールする（初回のみ）

```bash
npm install
```

このコマンドは「ゲームに必要な部品をダウンロードする」意味です。  
数分かかる場合があります。完了するまで待ちましょう。  

> 途中で `WARN` という黄色い警告が出ても大丈夫です。`ERR` と赤く表示された場合のみ問題です。

### ステップ 5: ゲームを起動する

```bash
npm run dev
```

以下のような表示が出れば成功です：

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### ステップ 6: ブラウザで遊ぶ

表示されたURL（通常は **http://localhost:5173/**）をブラウザで開きます。  
ゲーム画面が表示されれば成功です！🎉

---

## 🛑 ゲームを終了する

ターミナルで `Ctrl + C` を押すと停止します。

---

## 🔄 2回目以降の起動

毎回やることは2つだけです：

```bash
cd baseball-manager   # フォルダに移動
npm run dev            # ゲームを起動
```

`npm install` は最初の1回だけでOKです。

---

## 🔄 選手データの更新（spaia.jp API）

`src/data/npb2025.js` の選手成績データは、spaia.jp から自動取得できます。

```bash
node scripts/fetch-spaia.js
```

### オプション

| コマンド | 説明 |
|---|---|
| `node scripts/fetch-spaia.js` | 2024年成績を取得して `src/data/npb2025.js` を上書き |
| `node scripts/fetch-spaia.js --year=2023` | 取得する年度を指定 |
| `node scripts/fetch-spaia.js --dry-run` | ファイルを書き込まずコンソールに出力して確認 |

**注意:**
- Node.js v18 以上が必要です（`fetch` が組み込みで使えるバージョン）
- 実行すると元のファイルが自動バックアップされます（`src/data/npb2025.backup.*.js`）
- spaia.jp は非公式 API のため、レスポンス形式が変わる場合があります

---

## 📁 ファイル構成（参考）

```
baseball-manager/
├── scripts/
│   └── fetch-spaia.js      ← spaia.jp から選手データを取得するスクリプト
├── src/
│   ├── constants.js        ← チーム定義、ポジション等の定数
│   ├── utils.js            ← 汎用関数（乱数、フォーマット等）
│   ├── engine/             ← ゲームロジック（シミュレーション等）
│   │   ├── player.js       ← 選手生成、引退判定
│   │   ├── realplayer.js   ← 実成績 → ゲーム能力値変換
│   │   ├── sabermetrics.js ← セイバーメトリクス計算
│   │   ├── contract.js     ← 契約交渉ロジック
│   │   ├── simulation.js   ← 打席・試合シミュレーション
│   │   ├── postGame.js     ← 試合後の成績反映
│   │   ├── trade.js        ← トレード評価
│   │   ├── finance.js      ← 収益計算
│   │   ├── draft.js        ← ドラフト候補生成
│   │   ├── saveload.js     ← セーブ／ロード（localStorage）
│   │   └── playoff.js      ← プレーオフ構造
│   ├── data/
│   │   └── npb2025.js      ← NPB選手データ（fetch-spaia.js で更新可能）
│   ├── components/         ← 画面パーツ（UI）
│   │   ├── ui.jsx          ← 小さな共通部品
│   │   ├── TacticalGame.jsx← 采配モード画面
│   │   ├── BatchResult.jsx ← まとめシム結果画面
│   │   ├── Screens.jsx     ← 各種画面（結果、引退等）
│   │   ├── Tabs.jsx        ← ロースター、順位表等のタブ
│   │   ├── Draft.jsx       ← ドラフト関連画面
│   │   ├── PlayoffScreen.jsx ← プレーオフ画面
│   │   └── RetireModal.jsx ← 引退モーダル
│   ├── styles.css          ← 見た目のスタイル定義
│   ├── App.jsx             ← アプリ全体の制御
│   └── main.jsx            ← 起動ポイント
├── index.html              ← ベースHTML
├── package.json            ← パッケージ情報
└── vite.config.js          ← ビルドツール設定
```

**何かを直したいときは、該当するファイルだけを編集すれば OK です。**  
例：打席の確率を変えたい → `src/engine/simulation.js` だけ  
例：画面の色を変えたい → `src/styles.css` だけ

---

## ❓ よくあるトラブル

| 症状 | 解決策 |
|---|---|
| `node: command not found` | Node.js がインストールされていません。ステップ1をやり直してください |
| `npm ERR!` が出る | ターミナルで `baseball-manager` フォルダにいるか確認。`cd` でフォルダに移動してから再実行 |
| ブラウザに何も表示されない | URLが `http://localhost:5173/` になっているか確認 |
| ポートが使えないエラー | 他のプログラムが同じポートを使っている可能性。ターミナルを全部閉じてやり直す |

困ったときはお気軽に聞いてください！
