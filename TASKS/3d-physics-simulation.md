---
task-id: 3d-physics-simulation
type: feature
commit-prefix: feat
created: 2026-04-29
roadmap-item: "独自追加タスク（ROADMAPに未登録）"
---

# Task: Three.js 3D打球軌跡シミュレーション

## 背景・目的

現在の試合シミュレーションは能力値ベースの確率テーブルで打席結果を決定し、
EV（打球速度）・LA（打ち出し角）フィールドは計算済みだが `dist`（飛距離）は常に 0 のまま。
Three.js を使った 3D 軌跡アニメーションをモーダルとして追加し、
ヒット・HR 発生時に「どんな打球だったか」をビジュアルで確認できるようにする。
ゲームバランス（確率テーブル）には一切触れない。演出専用レイヤーとして実装する。

## 機能説明

- HR・ヒット（s/d/t）発生時、イベントログに「3D再生」ボタンを追加する
- ボタン押下でフルスクリーンモーダルが開き、Three.js シーンが描画される
- Three.js シーンは球場をプロシージャルジオメトリで表現（外部アセット不要）
- ボールがマウンドから飛び出し、EV・LA・スプレー角に基づく放物線弧を描いて着弾する
- 着弾後、「EV: 108mph / LA: 32° / 124m（右翼スタンド）」のテキストをオーバーレイ表示
- ×ボタンまたは背景クリックでモーダルを閉じる
- `simulation.js` の `dist` フィールドを、EV・LA・球場フェンス距離から計算して埋める

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/simulation.js` | L75-88: STADIUMS定義（lf/cf/rf/hrMod）。L195-200: applyStadiumFactor。L207: simAtBat 開始。L554-565: ev/la/dist 計算ブロック（dist=0 がここ） |
| `src/components/TacticalGame.jsx` | L267-285: イベントログ表示ループ。L280: ev/la/dist の表示行（3D再生ボタンをここに追加） |
| `src/constants.js` | STADIUMS は simulation.js に定義済みのため参照のみ |
| `src/utils.js` | rng / rngf の使い方を確認（Math.random 禁止） |
| `package.json` | 現在の依存関係確認（three.js 未インストール） |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `package.json` | Modify | `three`, `@react-three/fiber`, `@react-three/drei` を dependencies に追加 |
| `src/engine/physics.js` | Create | 弾道計算関数を新規ファイルに実装 |
| `src/components/Baseball3DModal.jsx` | Create | Three.js モーダルコンポーネント |
| `src/engine/simulation.js` | Modify | L565 の `dist:0` を `dist:calcDist(ev,la)` に変更 |
| `src/components/TacticalGame.jsx` | Modify | L280 付近に「3D再生」ボタンと Baseball3DModal の呼び出しを追加 |

## 実装ガイダンス

### Step 1: パッケージ追加

```bash
npm install three @react-three/fiber @react-three/drei
```

- `three`: 物理演算・3Dレンダリング本体
- `@react-three/fiber`: React との統合ラッパー
- `@react-three/drei`: 便利ヘルパー（カメラコントロール等）

---

### Step 2: 弾道計算エンジン（src/engine/physics.js を新規作成）

以下の関数を実装する：

#### `calcBallDist(ev, la)`
空気抵抗・マグヌス効果を含む弾道距離計算。

```js
// Adair近似モデル（簡略版）
// ev: mph, la: degree → dist: meters
export function calcBallDist(ev, la) {
  const evMs = ev * 0.44704;               // mph → m/s
  const laRad = la * (Math.PI / 180);
  const g = 9.81;
  const dragCoeff = 0.35;                  // 野球ボールの空気抵抗係数
  const dt = 0.01;                         // 時間ステップ
  let vx = evMs * Math.cos(laRad);
  let vy = evMs * Math.sin(laRad);
  let x = 0, y = 0;
  while (y >= 0 || x < 1) {
    const v = Math.sqrt(vx**2 + vy**2);
    const drag = dragCoeff * v;
    vx -= drag * (vx / v) * dt;
    vy -= (g + drag * (vy / v)) * dt;
    x += vx * dt;
    y += vy * dt;
    if (y < 0) break;
  }
  return Math.round(x);
}
```

#### `calcSprayAngle(result)`
打球方向（スプレー角）をランダムサンプル。

```js
// result: 'hr'|'d'|'t'|'s'|'out'
// returns angle in degrees: 0=左翼, 45=中堅, 90=右翼
// rngf を使うこと（Math.random 禁止）
export function calcSprayAngle(result) {
  return rngf(0, 90);
}
```

#### `calcLandingZone(dist, sprayAngle, stadium)`
着弾ゾーンの文字列を返す。

```js
// stadium: { lf, cf, rf } in meters
// returns: '左翼スタンド' | '中堅フェンス直撃' | '右翼フェアゾーン' etc.
export function calcLandingZone(dist, sprayAngle, stadium) { ... }
```

---

### Step 3: simulation.js の dist 計算（L554-565 付近を修正）

```js
// 変更前（L565）:
const logEntry = { ..., dist:0, ... }

// 変更後:
import { calcBallDist, calcSprayAngle } from './physics.js';

// ev/la 計算の直後（既存 L554-564 の後）に追加:
let dist = 0, sprayAngle = 45;
if (ev > 0) {
  dist = calcBallDist(ev, la);
  sprayAngle = calcSprayAngle(result);
}

const logEntry = { ..., dist, sprayAngle, ... }
```

**注意**: `applyStadiumFactor`（L195-200）の HR 判定ロジックは変更しない。dist はあくまで演出値。

---

### Step 4: Baseball3DModal.jsx を新規作成

```jsx
// src/components/Baseball3DModal.jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export default function Baseball3DModal({ event, stadium, onClose }) {
  // event: { ev, la, dist, sprayAngle, result }
  // stadium: { lf, cf, rf, name }
  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_CONTENT_STYLE} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={CLOSE_BTN_STYLE}>×</button>
        <Canvas camera={{ position: [0, 30, 80], fov: 60 }}>
          <ambientLight intensity={0.8} />
          <StadiumGeometry stadium={stadium} />
          <BallTrajectory ev={event.ev} la={event.la} sprayAngle={event.sprayAngle} />
          <OrbitControls enableZoom={false} />
        </Canvas>
        <div style={INFO_OVERLAY_STYLE}>
          EV: {event.ev}mph / LA: {event.la}° / {event.dist}m
        </div>
      </div>
    </div>
  );
}

// StadiumGeometry: Box/Plane で外野フェンスをプロシージャル生成
// BallTrajectory: useFrame で放物線アニメーション
```

**モーダルスタイル:**
- オーバーレイ: `position:fixed, inset:0, background:rgba(0,0,0,0.85), zIndex:1000`
- コンテンツ: `width:600px, height:400px, margin:auto, position:relative`
- Canvas はコンテンツ内にフル充填

**StadiumGeometry の実装方針:**
- 地面: `<Plane>` (緑)
- 内野: `<Cylinder>` (茶)
- 外野フェンス: 3つの `<Box>` (lf/cf/rf 距離に配置)
- マウンド: `<Cylinder>` (小)
- 外部アセット・テクスチャは使わない

**BallTrajectory の実装方針:**
- `useRef` でボール `<Sphere>` を保持
- `useFrame` で dt ごとに弾道計算（calcBallDist と同じ式）して position 更新
- アニメーション完了後 1.5 秒で自動停止

---

### Step 5: TacticalGame.jsx に3D再生ボタンを追加（L280付近）

```jsx
// state 追加（コンポーネントトップ）:
const [modal3D, setModal3D] = useState(null); // { event, stadium }

// イベントログ内（既存 L280 の直後）:
{e.ev > 0 && (
  <button
    onClick={() => setModal3D({ event: e, stadium: currentStadium })}
    style={{ fontSize: 9, marginLeft: 4, padding: '1px 4px', cursor: 'pointer' }}
  >
    3D再生
  </button>
)}

// JSX の末尾（</div> の前）:
{modal3D && (
  <Baseball3DModal
    event={modal3D.event}
    stadium={modal3D.stadium}
    onClose={() => setModal3D(null)}
  />
)}
```

`currentStadium` は `STADIUMS[TEAM_STADIUM[homeTeamId]]` で取得。

---

## データモデル変更

```js
// simulation.js の logEntry に sprayAngle フィールドを追加
{
  ...,
  dist: 124,        // 0 → 計算値（meters）
  sprayAngle: 67,   // 新規追加（0=左翼, 45=中堅, 90=右翼 degrees）
}
```

## 受け入れ条件

- [ ] HR・ヒット時のイベントログに「3D再生」ボタンが表示される
- [ ] ボタン押下でモーダルが開き、ボールの放物線アニメーションが再生される
- [ ] 球場ごとに外野フェンスの位置が変わり、dist がフェンス距離と一致した見た目になる
- [ ] ×ボタンまたは背景クリックでモーダルが閉じる
- [ ] K・BB・HBP では「3D再生」ボタンが表示されない（ev=0のため）
- [ ] `npm run build` が通る
- [ ] 既存の vitest テストがすべてパスする

## テストケース

`src/engine/__tests__/physics.test.js` を新規作成：

```js
describe('calcBallDist', () => {
  test('HR相当（EV:108mph, LA:32°）は 100m 以上', () => {
    expect(calcBallDist(108, 32)).toBeGreaterThan(100);
  });
  test('打ち上げ（LA:0°）は距離が出ない', () => {
    expect(calcBallDist(90, 0)).toBeLessThan(30);
  });
  test('負のLAはほぼ 0m', () => {
    expect(calcBallDist(80, -5)).toBeLessThan(10);
  });
});
```

## NPB 協約上の制約

なし（演出専用レイヤーのため）

## 過去バグからの教訓

- B2 パターン: 3D再生はモーダルの state 変更のみ。試合シミュのトリガーには絶対に接続しない

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- `dist` の計算は演出専用。確率テーブルの HR/ヒット判定を上書きしない

## ROADMAP.md 更新指示

ROADMAP.md にこのタスクは登録されていない。
完了後に「独自追加機能」セクションを作成し、以下を追記する：

```
- ✅ 3D打球軌跡シミュレーション（Three.js、YYYY-MM-DD完了）
```

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — 3D打球軌跡シミュレーション（コミットハッシュ）

**仕様本文への影響なし（演出専用）**

- Three.js (@react-three/fiber) による3D軌跡モーダルを追加
- simulation.js の dist フィールドをAdair近似モデルで計算
- 球場フェンス距離（lf/cf/rf）に基づく着弾ゾーン表示
```

## SPEC.md 更新箇所

なし（演出専用機能のため）

## コミットメッセージ

`feat: Three.jsによる3D打球軌跡シミュレーション追加`

## PR タイトル

`feat: Three.jsによる3D打球軌跡シミュレーション追加`
