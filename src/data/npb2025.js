/* NPB 2025 実選手データ（2024成績ベース、2025推計値）
   ※実在の選手・成績に基づく参考データです
*/
export const NPB2025_ROSTERS = {
  // 0: 東京スワローズ
  0: {
    batters: [
      { name:'村上 宗隆', age:25, pos:'三塁手', hometown:'熊本', salary:60000, stats:{ AVG:0.262, HR:26, RBI:90, SB:1, BB:85, PA:520, OPS:0.850 } },
      { name:'塩見 泰隆', age:31, pos:'中堅手', hometown:'石川', salary:13000, stats:{ AVG:0.255, HR:8, RBI:38, SB:18, BB:32, PA:340, OPS:0.720 } },
      { name:'山田 哲人', age:32, pos:'二塁手', hometown:'大阪', salary:45000, stats:{ AVG:0.248, HR:14, RBI:55, SB:12, BB:58, PA:480, OPS:0.770 } },
      { name:'長岡 秀樹', age:24, pos:'遊撃手', hometown:'千葉', salary:5000, stats:{ AVG:0.258, HR:5, RBI:42, SB:6, BB:28, PA:420, OPS:0.660 } },
      { name:'サンタナ', age:30, pos:'右翼手', hometown:'ドミニカ', isForeign:true, salary:20000, stats:{ AVG:0.275, HR:22, RBI:75, SB:2, BB:40, PA:460, OPS:0.830 } },
      { name:'西川 遥輝', age:33, pos:'左翼手', hometown:'兵庫', salary:10000, stats:{ AVG:0.262, HR:4, RBI:28, SB:14, BB:35, PA:380, OPS:0.700 } },
      { name:'内山 壮真', age:22, pos:'捕手', hometown:'新潟', salary:3000, stats:{ AVG:0.240, HR:8, RBI:32, SB:3, BB:22, PA:320, OPS:0.680 } },
      { name:'武岡 龍世', age:24, pos:'一塁手', hometown:'愛媛', salary:3000, stats:{ AVG:0.245, HR:6, RBI:30, SB:4, BB:20, PA:280, OPS:0.660 } },
      { name:'丸山 和郁', age:25, pos:'左翼手', hometown:'新潟', salary:4000, stats:{ AVG:0.260, HR:3, RBI:22, SB:10, BB:18, PA:260, OPS:0.650 } },
    ],
    pitchers: [
      { name:'小川 泰弘', age:34, pos:'先発', hand:'right', hometown:'愛知', salary:20000, stats:{ ERA:3.42, W:10, L:9, IP:160, K:128, BB:38, WHIP:1.20 } },
      { name:'高橋 奎二', age:27, pos:'先発', hand:'left', hometown:'沖縄', salary:8000, stats:{ ERA:3.25, W:11, L:8, IP:155, K:140, BB:45, WHIP:1.18 } },
      { name:'吉村 貢司郎', age:25, pos:'先発', hand:'right', hometown:'栃木', salary:5000, stats:{ ERA:3.80, W:8, L:10, IP:145, K:118, BB:42, WHIP:1.28 } },
      { name:'原 樹理', age:31, pos:'先発', hand:'right', hometown:'兵庫', salary:8000, stats:{ ERA:4.10, W:7, L:9, IP:130, K:105, BB:40, WHIP:1.35 } },
      { name:'石山 泰稚', age:35, pos:'中継ぎ', hand:'right', hometown:'島根', salary:12000, stats:{ ERA:2.95, W:3, L:3, IP:65, K:62, BB:18, WHIP:1.10 } },
      { name:'清水 昇', age:28, pos:'中継ぎ', hand:'right', hometown:'東京', salary:8000, stats:{ ERA:2.60, W:4, L:2, IP:72, K:80, BB:20, WHIP:1.05 } },
      { name:'マクガフ', age:32, pos:'抑え', hand:'right', hometown:'アメリカ', isForeign:true, salary:18000, stats:{ ERA:2.20, W:2, L:3, SV:28, IP:58, K:65, BB:14, WHIP:0.95 } },
    ],
  },

  // 1: 横浜ベイスターズ
  1: {
    batters: [
      { name:'牧 秀悟', age:26, pos:'二塁手', hometown:'岡山', salary:30000, stats:{ AVG:0.295, HR:24, RBI:85, SB:2, BB:52, PA:540, OPS:0.880 } },
      { name:'佐野 恵太', age:30, pos:'左翼手', hometown:'兵庫', salary:20000, stats:{ AVG:0.278, HR:15, RBI:60, SB:1, BB:48, PA:480, OPS:0.800 } },
      { name:'宮崎 敏郎', age:36, pos:'三塁手', hometown:'宮崎', salary:22000, stats:{ AVG:0.288, HR:10, RBI:55, SB:0, BB:42, PA:430, OPS:0.790 } },
      { name:'大田 泰示', age:34, pos:'右翼手', hometown:'広島', salary:12000, stats:{ AVG:0.255, HR:12, RBI:45, SB:5, BB:30, PA:380, OPS:0.730 } },
      { name:'京田 陽太', age:30, pos:'遊撃手', hometown:'神奈川', salary:10000, stats:{ AVG:0.248, HR:3, RBI:32, SB:8, BB:28, PA:420, OPS:0.630 } },
      { name:'関根 大気', age:30, pos:'中堅手', hometown:'埼玉', salary:6000, stats:{ AVG:0.265, HR:5, RBI:30, SB:12, BB:25, PA:350, OPS:0.690 } },
      { name:'山本 祐大', age:25, pos:'捕手', hometown:'大阪', salary:4000, stats:{ AVG:0.255, HR:8, RBI:40, SB:2, BB:20, PA:360, OPS:0.710 } },
      { name:'ソト', age:33, pos:'一塁手', hometown:'ベネズエラ', isForeign:true, salary:18000, stats:{ AVG:0.265, HR:20, RBI:72, SB:1, BB:45, PA:480, OPS:0.820 } },
      { name:'梶原 昂希', age:24, pos:'中堅手', hometown:'神奈川', salary:3500, stats:{ AVG:0.270, HR:6, RBI:28, SB:15, BB:18, PA:300, OPS:0.720 } },
    ],
    pitchers: [
      { name:'東 克樹', age:29, pos:'先発', hand:'left', hometown:'神奈川', salary:22000, stats:{ ERA:2.89, W:13, L:7, IP:172, K:165, BB:38, WHIP:1.10 } },
      { name:'今永 昇太', age:30, pos:'先発', hand:'left', hometown:'熊本', salary:25000, stats:{ ERA:2.60, W:12, L:5, IP:168, K:178, BB:35, WHIP:1.02 } },
      { name:'濱口 遥大', age:30, pos:'先発', hand:'left', hometown:'静岡', salary:12000, stats:{ ERA:3.80, W:9, L:8, IP:148, K:130, BB:55, WHIP:1.28 } },
      { name:'石田 裕太郎', age:24, pos:'先発', hand:'left', hometown:'神奈川', salary:4000, stats:{ ERA:3.55, W:7, L:9, IP:138, K:120, BB:42, WHIP:1.22 } },
      { name:'山崎 康晃', age:32, pos:'抑え', hand:'right', hometown:'大阪', salary:20000, stats:{ ERA:2.35, W:2, L:4, SV:30, IP:60, K:58, BB:15, WHIP:1.00 } },
      { name:'伊勢 大夢', age:27, pos:'中継ぎ', hand:'right', hometown:'広島', salary:6000, stats:{ ERA:2.70, W:4, L:2, IP:68, K:72, BB:22, WHIP:1.08 } },
      { name:'エスコバー', age:33, pos:'中継ぎ', hand:'left', hometown:'ベネズエラ', isForeign:true, salary:12000, stats:{ ERA:2.55, W:3, L:3, IP:65, K:75, BB:18, WHIP:1.02 } },
    ],
  },

  // 2: 広島カープ
  2: {
    batters: [
      { name:'小園 海斗', age:24, pos:'遊撃手', hometown:'大阪', salary:12000, stats:{ AVG:0.285, HR:9, RBI:50, SB:10, BB:40, PA:500, OPS:0.760 } },
      { name:'西川 龍馬', age:29, pos:'左翼手', hometown:'鳥取', salary:18000, stats:{ AVG:0.302, HR:8, RBI:52, SB:8, BB:35, PA:480, OPS:0.790 } },
      { name:'秋山 翔吾', age:36, pos:'中堅手', hometown:'神奈川', salary:25000, stats:{ AVG:0.265, HR:6, RBI:38, SB:5, BB:42, PA:460, OPS:0.720 } },
      { name:'末包 昇大', age:28, pos:'右翼手', hometown:'兵庫', salary:5000, stats:{ AVG:0.255, HR:16, RBI:58, SB:2, BB:30, PA:420, OPS:0.770 } },
      { name:'堂林 翔太', age:33, pos:'三塁手', hometown:'愛知', salary:10000, stats:{ AVG:0.250, HR:11, RBI:48, SB:1, BB:28, PA:400, OPS:0.720 } },
      { name:'坂倉 将吾', age:26, pos:'捕手', hometown:'神奈川', salary:12000, stats:{ AVG:0.275, HR:10, RBI:50, SB:2, BB:35, PA:440, OPS:0.775 } },
      { name:'野間 峻祥', age:31, pos:'中堅手', hometown:'島根', salary:8000, stats:{ AVG:0.270, HR:2, RBI:24, SB:16, BB:28, PA:350, OPS:0.670 } },
      { name:'マクブルーム', age:30, pos:'一塁手', hometown:'アメリカ', isForeign:true, salary:18000, stats:{ AVG:0.260, HR:18, RBI:65, SB:0, BB:42, PA:480, OPS:0.790 } },
      { name:'菊池 涼介', age:34, pos:'二塁手', hometown:'愛媛', salary:20000, stats:{ AVG:0.248, HR:5, RBI:30, SB:5, BB:22, PA:420, OPS:0.640 } },
    ],
    pitchers: [
      { name:'九里 亜蓮', age:32, pos:'先発', hand:'right', hometown:'広島', salary:15000, stats:{ ERA:3.40, W:11, L:8, IP:162, K:138, BB:40, WHIP:1.22 } },
      { name:'床田 寛樹', age:28, pos:'先発', hand:'left', hometown:'島根', salary:15000, stats:{ ERA:2.88, W:12, L:8, IP:168, K:148, BB:35, WHIP:1.12 } },
      { name:'森下 暢仁', age:27, pos:'先発', hand:'right', hometown:'大分', salary:18000, stats:{ ERA:3.05, W:11, L:9, IP:165, K:155, BB:42, WHIP:1.15 } },
      { name:'大瀬良 大地', age:33, pos:'先発', hand:'right', hometown:'長崎', salary:20000, stats:{ ERA:3.55, W:9, L:8, IP:148, K:120, BB:38, WHIP:1.25 } },
      { name:'栗林 良吏', age:28, pos:'抑え', hand:'right', hometown:'愛知', salary:15000, stats:{ ERA:2.15, W:2, L:4, SV:32, IP:58, K:65, BB:14, WHIP:0.98 } },
      { name:'島内 颯太郎', age:28, pos:'中継ぎ', hand:'right', hometown:'三重', salary:5000, stats:{ ERA:2.85, W:4, L:2, IP:65, K:68, BB:18, WHIP:1.08 } },
      { name:'塹江 敦哉', age:28, pos:'中継ぎ', hand:'left', hometown:'広島', salary:4500, stats:{ ERA:3.10, W:3, L:3, IP:58, K:55, BB:22, WHIP:1.18 } },
    ],
  },

  // 3: 阪神タイガース
  3: {
    batters: [
      { name:'近本 光司', age:29, pos:'中堅手', hometown:'兵庫', salary:22000, stats:{ AVG:0.285, HR:8, RBI:42, SB:28, BB:38, PA:560, OPS:0.750 } },
      { name:'中野 拓夢', age:27, pos:'遊撃手', hometown:'愛知', salary:10000, stats:{ AVG:0.272, HR:4, RBI:36, SB:22, BB:32, PA:520, OPS:0.690 } },
      { name:'大山 悠輔', age:30, pos:'一塁手', hometown:'兵庫', salary:25000, stats:{ AVG:0.280, HR:20, RBI:80, SB:1, BB:52, PA:530, OPS:0.830 } },
      { name:'佐藤 輝明', age:26, pos:'三塁手', hometown:'大阪', salary:18000, stats:{ AVG:0.255, HR:22, RBI:72, SB:5, BB:58, PA:510, OPS:0.820 } },
      { name:'ノイジー', age:30, pos:'右翼手', hometown:'アメリカ', isForeign:true, salary:18000, stats:{ AVG:0.248, HR:16, RBI:60, SB:4, BB:40, PA:470, OPS:0.780 } },
      { name:'坂本 誠志郎', age:31, pos:'捕手', hometown:'兵庫', salary:8000, stats:{ AVG:0.238, HR:4, RBI:28, SB:1, BB:25, PA:320, OPS:0.620 } },
      { name:'森下 翔太', age:24, pos:'右翼手', hometown:'大阪', salary:5000, stats:{ AVG:0.260, HR:12, RBI:48, SB:6, BB:30, PA:420, OPS:0.760 } },
      { name:'木浪 聖也', age:29, pos:'二塁手', hometown:'大阪', salary:6000, stats:{ AVG:0.268, HR:3, RBI:28, SB:8, BB:22, PA:380, OPS:0.660 } },
      { name:'島田 海吏', age:29, pos:'左翼手', hometown:'大阪', salary:5000, stats:{ AVG:0.258, HR:2, RBI:20, SB:18, BB:20, PA:300, OPS:0.640 } },
    ],
    pitchers: [
      { name:'青柳 晃洋', age:31, pos:'先発', hand:'right', hometown:'大阪', salary:20000, stats:{ ERA:3.25, W:12, L:7, IP:165, K:140, BB:38, WHIP:1.18 } },
      { name:'才木 浩人', age:25, pos:'先発', hand:'right', hometown:'兵庫', salary:8000, stats:{ ERA:3.05, W:13, L:6, IP:168, K:160, BB:40, WHIP:1.12 } },
      { name:'伊藤 将司', age:28, pos:'先発', hand:'left', hometown:'大阪', salary:12000, stats:{ ERA:3.40, W:10, L:9, IP:155, K:130, BB:38, WHIP:1.20 } },
      { name:'村上 頌樹', age:25, pos:'先発', hand:'right', hometown:'大阪', salary:5000, stats:{ ERA:2.75, W:12, L:6, IP:162, K:150, BB:35, WHIP:1.08 } },
      { name:'岩崎 優', age:34, pos:'抑え', hand:'left', hometown:'奈良', salary:15000, stats:{ ERA:2.05, W:3, L:3, SV:35, IP:62, K:65, BB:16, WHIP:0.95 } },
      { name:'桐敷 拓馬', age:25, pos:'中継ぎ', hand:'left', hometown:'新潟', salary:4000, stats:{ ERA:2.80, W:4, L:2, IP:68, K:70, BB:20, WHIP:1.05 } },
      { name:'湯浅 京己', age:24, pos:'中継ぎ', hand:'right', hometown:'大阪', salary:5000, stats:{ ERA:2.90, W:3, L:3, IP:65, K:72, BB:22, WHIP:1.10 } },
    ],
  },

  // 4: 読売ジャイアンツ
  4: {
    batters: [
      { name:'岡本 和真', age:28, pos:'三塁手', hometown:'奈良', salary:65000, stats:{ AVG:0.305, HR:41, RBI:120, SB:1, BB:82, PA:560, OPS:1.012 } },
      { name:'坂本 勇人', age:36, pos:'遊撃手', hometown:'兵庫', salary:40000, stats:{ AVG:0.255, HR:10, RBI:48, SB:4, BB:40, PA:440, OPS:0.720 } },
      { name:'丸 佳浩', age:35, pos:'中堅手', hometown:'千葉', salary:38000, stats:{ AVG:0.258, HR:15, RBI:55, SB:3, BB:55, PA:480, OPS:0.780 } },
      { name:'吉川 尚輝', age:29, pos:'二塁手', hometown:'岐阜', salary:12000, stats:{ AVG:0.278, HR:6, RBI:40, SB:14, BB:35, PA:480, OPS:0.720 } },
      { name:'大城 卓三', age:31, pos:'捕手', hometown:'沖縄', salary:10000, stats:{ AVG:0.260, HR:12, RBI:50, SB:1, BB:30, PA:400, OPS:0.740 } },
      { name:'ブリンソン', age:30, pos:'右翼手', hometown:'アメリカ', isForeign:true, salary:20000, stats:{ AVG:0.252, HR:22, RBI:70, SB:8, BB:38, PA:480, OPS:0.800 } },
      { name:'モンテス', age:28, pos:'一塁手', hometown:'メキシコ', isForeign:true, salary:18000, stats:{ AVG:0.270, HR:18, RBI:65, SB:0, BB:40, PA:460, OPS:0.820 } },
      { name:'門脇 誠', age:24, pos:'遊撃手', hometown:'石川', salary:4000, stats:{ AVG:0.248, HR:5, RBI:30, SB:10, BB:25, PA:380, OPS:0.650 } },
      { name:'オコエ 瑠偉', age:28, pos:'左翼手', hometown:'東京', salary:5000, stats:{ AVG:0.252, HR:8, RBI:35, SB:12, BB:22, PA:340, OPS:0.700 } },
    ],
    pitchers: [
      { name:'戸郷 翔征', age:25, pos:'先発', hand:'right', hometown:'宮崎', salary:18000, stats:{ ERA:2.80, W:14, L:7, IP:175, K:168, BB:38, WHIP:1.08 } },
      { name:'菅野 智之', age:35, pos:'先発', hand:'right', hometown:'東京', salary:55000, stats:{ ERA:3.25, W:11, L:8, IP:165, K:148, BB:35, WHIP:1.18 } },
      { name:'グリフィン', age:28, pos:'先発', hand:'right', hometown:'アメリカ', isForeign:true, salary:20000, stats:{ ERA:3.45, W:9, L:8, IP:155, K:138, BB:42, WHIP:1.22 } },
      { name:'山崎 伊織', age:25, pos:'先発', hand:'right', hometown:'神奈川', salary:5000, stats:{ ERA:3.10, W:10, L:8, IP:158, K:145, BB:38, WHIP:1.15 } },
      { name:'大勢', age:25, pos:'抑え', hand:'right', hometown:'大阪', salary:12000, stats:{ ERA:2.10, W:3, L:2, SV:36, IP:60, K:68, BB:15, WHIP:0.92 } },
      { name:'高梨 雄平', age:32, pos:'中継ぎ', hand:'left', hometown:'秋田', salary:8000, stats:{ ERA:2.75, W:4, L:2, IP:70, K:72, BB:18, WHIP:1.08 } },
      { name:'中川 皓太', age:30, pos:'中継ぎ', hand:'left', hometown:'愛知', salary:7000, stats:{ ERA:2.90, W:3, L:3, IP:65, K:65, BB:20, WHIP:1.10 } },
    ],
  },

  // 5: 中日ドラゴンズ
  5: {
    batters: [
      { name:'岡林 勇希', age:23, pos:'中堅手', hometown:'愛知', salary:8000, stats:{ AVG:0.282, HR:3, RBI:35, SB:20, BB:28, PA:520, OPS:0.680 } },
      { name:'石川 昂弥', age:23, pos:'三塁手', hometown:'愛知', salary:5000, stats:{ AVG:0.255, HR:14, RBI:55, SB:1, BB:30, PA:420, OPS:0.750 } },
      { name:'カリステ', age:28, pos:'二塁手', hometown:'アメリカ', isForeign:true, salary:15000, stats:{ AVG:0.268, HR:12, RBI:52, SB:8, BB:35, PA:480, OPS:0.770 } },
      { name:'ビシエド', age:35, pos:'一塁手', hometown:'キューバ', isForeign:true, salary:18000, stats:{ AVG:0.258, HR:10, RBI:52, SB:0, BB:32, PA:420, OPS:0.730 } },
      { name:'大島 洋平', age:39, pos:'中堅手', hometown:'愛知', salary:12000, stats:{ AVG:0.268, HR:1, RBI:22, SB:8, BB:30, PA:380, OPS:0.650 } },
      { name:'木下 拓哉', age:32, pos:'捕手', hometown:'愛媛', salary:8000, stats:{ AVG:0.248, HR:8, RBI:38, SB:1, BB:28, PA:380, OPS:0.690 } },
      { name:'福永 裕基', age:27, pos:'一塁手', hometown:'愛知', salary:4000, stats:{ AVG:0.272, HR:10, RBI:45, SB:2, BB:25, PA:380, OPS:0.750 } },
      { name:'村松 開人', age:24, pos:'遊撃手', hometown:'静岡', salary:3500, stats:{ AVG:0.258, HR:4, RBI:28, SB:12, BB:22, PA:380, OPS:0.660 } },
      { name:'細川 成也', age:26, pos:'右翼手', hometown:'千葉', salary:5000, stats:{ AVG:0.265, HR:15, RBI:60, SB:4, BB:28, PA:420, OPS:0.770 } },
    ],
    pitchers: [
      { name:'柳 裕也', age:30, pos:'先発', hand:'right', hometown:'神奈川', salary:15000, stats:{ ERA:3.45, W:10, L:10, IP:165, K:145, BB:42, WHIP:1.22 } },
      { name:'小笠原 慎之介', age:26, pos:'先発', hand:'left', hometown:'神奈川', salary:10000, stats:{ ERA:3.60, W:9, L:10, IP:155, K:148, BB:48, WHIP:1.25 } },
      { name:'大野 雄大', age:35, pos:'先発', hand:'left', hometown:'大阪', salary:20000, stats:{ ERA:3.75, W:8, L:10, IP:148, K:130, BB:40, WHIP:1.28 } },
      { name:'梅津 晃大', age:28, pos:'先発', hand:'right', hometown:'宮城', salary:5000, stats:{ ERA:4.00, W:7, L:9, IP:138, K:118, BB:45, WHIP:1.35 } },
      { name:'マルティネス', age:31, pos:'抑え', hand:'right', hometown:'ドミニカ', isForeign:true, salary:20000, stats:{ ERA:1.85, W:2, L:2, SV:38, IP:58, K:70, BB:12, WHIP:0.90 } },
      { name:'清水 達也', age:27, pos:'中継ぎ', hand:'right', hometown:'愛知', salary:4500, stats:{ ERA:2.95, W:3, L:3, IP:62, K:60, BB:18, WHIP:1.12 } },
      { name:'橋本 侑樹', age:28, pos:'中継ぎ', hand:'left', hometown:'愛知', salary:4000, stats:{ ERA:3.05, W:3, L:2, IP:60, K:58, BB:22, WHIP:1.15 } },
    ],
  },

  // 6: 福岡ホークス
  6: {
    batters: [
      { name:'柳田 悠岐', age:36, pos:'中堅手', hometown:'広島', salary:65000, stats:{ AVG:0.295, HR:22, RBI:80, SB:8, BB:75, PA:520, OPS:0.920 } },
      { name:'近藤 健介', age:30, pos:'左翼手', hometown:'神奈川', salary:65000, stats:{ AVG:0.315, HR:15, RBI:70, SB:5, BB:90, PA:540, OPS:0.960 } },
      { name:'牧原 大成', age:32, pos:'二塁手', hometown:'福岡', salary:10000, stats:{ AVG:0.265, HR:6, RBI:35, SB:12, BB:30, PA:420, OPS:0.700 } },
      { name:'今宮 健太', age:34, pos:'遊撃手', hometown:'大分', salary:15000, stats:{ AVG:0.240, HR:5, RBI:30, SB:6, BB:28, PA:400, OPS:0.630 } },
      { name:'甲斐 拓也', age:32, pos:'捕手', hometown:'大分', salary:15000, stats:{ AVG:0.240, HR:8, RBI:38, SB:5, BB:22, PA:380, OPS:0.650 } },
      { name:'周東 佑京', age:28, pos:'中堅手', hometown:'沖縄', salary:8000, stats:{ AVG:0.258, HR:2, RBI:22, SB:38, BB:25, PA:360, OPS:0.660 } },
      { name:'アルバレス', age:27, pos:'一塁手', hometown:'キューバ', isForeign:true, salary:22000, stats:{ AVG:0.285, HR:28, RBI:95, SB:0, BB:55, PA:520, OPS:0.910 } },
      { name:'栗原 陵矢', age:28, pos:'一塁手', hometown:'福岡', salary:10000, stats:{ AVG:0.275, HR:15, RBI:60, SB:2, BB:35, PA:440, OPS:0.800 } },
      { name:'三森 大貴', age:25, pos:'二塁手', hometown:'福岡', salary:4000, stats:{ AVG:0.260, HR:4, RBI:28, SB:15, BB:20, PA:380, OPS:0.670 } },
    ],
    pitchers: [
      { name:'有原 航平', age:32, pos:'先発', hand:'right', hometown:'広島', salary:35000, stats:{ ERA:2.60, W:14, L:6, IP:175, K:170, BB:35, WHIP:1.05 } },
      { name:'東浜 巨', age:34, pos:'先発', hand:'right', hometown:'沖縄', salary:20000, stats:{ ERA:3.20, W:11, L:8, IP:160, K:138, BB:38, WHIP:1.18 } },
      { name:'和田 毅', age:43, pos:'先発', hand:'left', hometown:'島根', salary:20000, stats:{ ERA:3.45, W:8, L:7, IP:142, K:115, BB:30, WHIP:1.22 } },
      { name:'スチュワート・ジュニア', age:26, pos:'先発', hand:'right', hometown:'アメリカ', isForeign:true, salary:18000, stats:{ ERA:3.35, W:10, L:8, IP:158, K:155, BB:45, WHIP:1.20 } },
      { name:'オスナ', age:32, pos:'抑え', hand:'right', hometown:'メキシコ', isForeign:true, salary:20000, stats:{ ERA:2.00, W:2, L:2, SV:35, IP:58, K:72, BB:12, WHIP:0.88 } },
      { name:'松本 裕樹', age:28, pos:'中継ぎ', hand:'left', hometown:'青森', salary:5000, stats:{ ERA:2.80, W:4, L:2, IP:68, K:65, BB:20, WHIP:1.08 } },
      { name:'泉 圭輔', age:27, pos:'中継ぎ', hand:'right', hometown:'岐阜', salary:4000, stats:{ ERA:3.00, W:3, L:3, IP:62, K:60, BB:18, WHIP:1.12 } },
    ],
  },

  // 7: 東北イーグルス
  7: {
    batters: [
      { name:'浅村 栄斗', age:34, pos:'二塁手', hometown:'大阪', salary:38000, stats:{ AVG:0.275, HR:22, RBI:80, SB:3, BB:60, PA:540, OPS:0.830 } },
      { name:'島内 宏明', age:34, pos:'右翼手', hometown:'山口', salary:15000, stats:{ AVG:0.278, HR:10, RBI:52, SB:5, BB:38, PA:460, OPS:0.760 } },
      { name:'辰己 涼介', age:28, pos:'中堅手', hometown:'大阪', salary:10000, stats:{ AVG:0.258, HR:10, RBI:48, SB:18, BB:40, PA:500, OPS:0.740 } },
      { name:'鈴木 大地', age:35, pos:'三塁手', hometown:'兵庫', salary:10000, stats:{ AVG:0.262, HR:5, RBI:32, SB:4, BB:32, PA:400, OPS:0.680 } },
      { name:'太田 光', age:26, pos:'捕手', hometown:'大阪', salary:5000, stats:{ AVG:0.248, HR:6, RBI:35, SB:2, BB:20, PA:360, OPS:0.670 } },
      { name:'マルモレホス', age:30, pos:'左翼手', hometown:'ドミニカ', isForeign:true, salary:18000, stats:{ AVG:0.270, HR:20, RBI:72, SB:1, BB:42, PA:480, OPS:0.820 } },
      { name:'岡島 豪郎', age:36, pos:'左翼手', hometown:'宮城', salary:8000, stats:{ AVG:0.262, HR:4, RBI:28, SB:8, BB:28, PA:360, OPS:0.680 } },
      { name:'小深田 大翔', age:27, pos:'遊撃手', hometown:'大阪', salary:4000, stats:{ AVG:0.255, HR:3, RBI:25, SB:15, BB:22, PA:380, OPS:0.640 } },
      { name:'炭谷 銀仁朗', age:37, pos:'捕手', hometown:'兵庫', salary:7000, stats:{ AVG:0.238, HR:3, RBI:22, SB:1, BB:18, PA:280, OPS:0.610 } },
    ],
    pitchers: [
      { name:'則本 昂大', age:33, pos:'先発', hand:'right', hometown:'兵庫', salary:28000, stats:{ ERA:3.20, W:11, L:9, IP:165, K:165, BB:45, WHIP:1.18 } },
      { name:'岸 孝之', age:40, pos:'先発', hand:'right', hometown:'岐阜', salary:25000, stats:{ ERA:3.50, W:9, L:8, IP:148, K:128, BB:28, WHIP:1.18 } },
      { name:'瀧中 瞭太', age:29, pos:'先発', hand:'right', hometown:'愛知', salary:5000, stats:{ ERA:3.80, W:8, L:9, IP:145, K:118, BB:42, WHIP:1.28 } },
      { name:'荘司 康誠', age:24, pos:'先発', hand:'right', hometown:'新潟', salary:4500, stats:{ ERA:3.55, W:8, L:8, IP:148, K:130, BB:45, WHIP:1.25 } },
      { name:'松井 裕樹', age:30, pos:'抑え', hand:'left', hometown:'神奈川', salary:15000, stats:{ ERA:2.40, W:2, L:3, SV:28, IP:60, K:68, BB:18, WHIP:1.02 } },
      { name:'宋 家豪', age:31, pos:'中継ぎ', hand:'right', hometown:'台湾', isForeign:true, salary:6000, stats:{ ERA:2.80, W:4, L:2, IP:68, K:70, BB:20, WHIP:1.08 } },
      { name:'酒居 知史', age:31, pos:'中継ぎ', hand:'right', hometown:'大阪', salary:5000, stats:{ ERA:3.00, W:3, L:3, IP:60, K:55, BB:16, WHIP:1.12 } },
    ],
  },

  // 8: 埼玉ライオンズ
  8: {
    batters: [
      { name:'源田 壮亮', age:31, pos:'遊撃手', hometown:'大分', salary:18000, stats:{ AVG:0.272, HR:5, RBI:40, SB:22, BB:35, PA:520, OPS:0.700 } },
      { name:'中村 剛也', age:41, pos:'三塁手', hometown:'大阪', salary:20000, stats:{ AVG:0.240, HR:18, RBI:65, SB:0, BB:45, PA:420, OPS:0.780 } },
      { name:'外崎 修汰', age:32, pos:'二塁手', hometown:'鳥取', salary:15000, stats:{ AVG:0.258, HR:14, RBI:55, SB:10, BB:38, PA:480, OPS:0.770 } },
      { name:'松原 聖弥', age:30, pos:'右翼手', hometown:'東京', salary:5000, stats:{ AVG:0.260, HR:6, RBI:32, SB:8, BB:22, PA:380, OPS:0.680 } },
      { name:'アギラー', age:29, pos:'一塁手', hometown:'ベネズエラ', isForeign:true, salary:15000, stats:{ AVG:0.268, HR:20, RBI:72, SB:0, BB:38, PA:460, OPS:0.810 } },
      { name:'岸 潤一郎', age:27, pos:'中堅手', hometown:'兵庫', salary:4000, stats:{ AVG:0.255, HR:5, RBI:28, SB:12, BB:22, PA:360, OPS:0.670 } },
      { name:'柘植 世那', age:26, pos:'捕手', hometown:'広島', salary:3500, stats:{ AVG:0.238, HR:4, RBI:25, SB:2, BB:15, PA:300, OPS:0.620 } },
      { name:'渡部 健人', age:25, pos:'一塁手', hometown:'埼玉', salary:4000, stats:{ AVG:0.252, HR:12, RBI:48, SB:1, BB:28, PA:380, OPS:0.740 } },
      { name:'金子 侑司', age:34, pos:'左翼手', hometown:'和歌山', salary:6000, stats:{ AVG:0.255, HR:3, RBI:22, SB:20, BB:25, PA:340, OPS:0.660 } },
    ],
    pitchers: [
      { name:'高橋 光成', age:28, pos:'先発', hand:'right', hometown:'群馬', salary:20000, stats:{ ERA:3.05, W:12, L:9, IP:170, K:160, BB:45, WHIP:1.18 } },
      { name:'今井 達也', age:27, pos:'先発', hand:'right', hometown:'栃木', salary:10000, stats:{ ERA:3.25, W:11, L:9, IP:162, K:165, BB:48, WHIP:1.20 } },
      { name:'平良 海馬', age:25, pos:'先発', hand:'right', hometown:'沖縄', salary:8000, stats:{ ERA:3.40, W:9, L:9, IP:155, K:155, BB:45, WHIP:1.22 } },
      { name:'松本 航', age:27, pos:'先発', hand:'right', hometown:'兵庫', salary:6000, stats:{ ERA:3.80, W:7, L:10, IP:140, K:120, BB:42, WHIP:1.30 } },
      { name:'増田 達至', age:36, pos:'抑え', hand:'right', hometown:'富山', salary:12000, stats:{ ERA:2.50, W:2, L:3, SV:25, IP:58, K:55, BB:15, WHIP:1.05 } },
      { name:'ボー・タカハシ', age:24, pos:'中継ぎ', hand:'right', hometown:'アメリカ', isForeign:true, salary:8000, stats:{ ERA:2.70, W:4, L:2, IP:65, K:72, BB:18, WHIP:1.05 } },
      { name:'水上 由伸', age:27, pos:'中継ぎ', hand:'right', hometown:'群馬', salary:4000, stats:{ ERA:2.90, W:3, L:3, IP:62, K:65, BB:20, WHIP:1.12 } },
    ],
  },

  // 9: 千葉マリーンズ
  9: {
    batters: [
      { name:'中村 奨吾', age:31, pos:'二塁手', hometown:'兵庫', salary:14000, stats:{ AVG:0.260, HR:8, RBI:40, SB:10, BB:38, PA:480, OPS:0.700 } },
      { name:'荻野 貴司', age:38, pos:'右翼手', hometown:'大阪', salary:10000, stats:{ AVG:0.272, HR:3, RBI:25, SB:14, BB:30, PA:360, OPS:0.690 } },
      { name:'ポランコ', age:30, pos:'左翼手', hometown:'ベネズエラ', isForeign:true, salary:20000, stats:{ AVG:0.278, HR:22, RBI:82, SB:2, BB:50, PA:500, OPS:0.860 } },
      { name:'安田 尚憲', age:25, pos:'一塁手', hometown:'大阪', salary:5000, stats:{ AVG:0.258, HR:15, RBI:58, SB:1, BB:32, PA:440, OPS:0.760 } },
      { name:'藤原 恭大', age:24, pos:'中堅手', hometown:'大阪', salary:4000, stats:{ AVG:0.265, HR:8, RBI:42, SB:18, BB:28, PA:460, OPS:0.730 } },
      { name:'佐藤 都志也', age:26, pos:'捕手', hometown:'福島', salary:4000, stats:{ AVG:0.252, HR:5, RBI:32, SB:4, BB:20, PA:340, OPS:0.670 } },
      { name:'茶谷 健太', age:28, pos:'三塁手', hometown:'兵庫', salary:4000, stats:{ AVG:0.248, HR:4, RBI:28, SB:6, BB:22, PA:340, OPS:0.640 } },
      { name:'エチェバリア', age:35, pos:'遊撃手', hometown:'キューバ', isForeign:true, salary:8000, stats:{ AVG:0.245, HR:6, RBI:32, SB:3, BB:18, PA:350, OPS:0.640 } },
      { name:'髙部 瑛斗', age:26, pos:'中堅手', hometown:'東京', salary:4000, stats:{ AVG:0.272, HR:3, RBI:22, SB:20, BB:22, PA:380, OPS:0.680 } },
    ],
    pitchers: [
      { name:'佐々木 朗希', age:23, pos:'先発', hand:'right', hometown:'岩手', salary:30000, stats:{ ERA:2.35, W:12, L:5, IP:162, K:208, BB:35, WHIP:0.92 } },
      { name:'種市 篤暉', age:26, pos:'先発', hand:'right', hometown:'青森', salary:6000, stats:{ ERA:3.45, W:9, L:8, IP:150, K:135, BB:40, WHIP:1.20 } },
      { name:'メルセデス', age:30, pos:'先発', hand:'left', hometown:'ドミニカ', isForeign:true, salary:12000, stats:{ ERA:3.70, W:8, L:9, IP:148, K:118, BB:42, WHIP:1.28 } },
      { name:'小島 和哉', age:28, pos:'先発', hand:'left', hometown:'埼玉', salary:5000, stats:{ ERA:3.90, W:7, L:10, IP:140, K:110, BB:40, WHIP:1.30 } },
      { name:'益田 直也', age:35, pos:'抑え', hand:'right', hometown:'兵庫', salary:12000, stats:{ ERA:2.45, W:2, L:3, SV:28, IP:58, K:58, BB:16, WHIP:1.02 } },
      { name:'ゲレーロ', age:28, pos:'中継ぎ', hand:'right', hometown:'ドミニカ', isForeign:true, salary:10000, stats:{ ERA:2.75, W:4, L:2, IP:65, K:72, BB:18, WHIP:1.05 } },
      { name:'西野 勇士', age:34, pos:'中継ぎ', hand:'right', hometown:'兵庫', salary:8000, stats:{ ERA:2.95, W:3, L:2, IP:60, K:60, BB:15, WHIP:1.10 } },
    ],
  },

  // 10: 北海道ファイターズ
  10: {
    batters: [
      { name:'万波 中正', age:24, pos:'右翼手', hometown:'神奈川', salary:6000, stats:{ AVG:0.258, HR:22, RBI:72, SB:8, BB:38, PA:500, OPS:0.810 } },
      { name:'清宮 幸太郎', age:26, pos:'一塁手', hometown:'東京', salary:8000, stats:{ AVG:0.252, HR:18, RBI:65, SB:0, BB:40, PA:460, OPS:0.780 } },
      { name:'五十幡 亮汰', age:25, pos:'中堅手', hometown:'東京', salary:4000, stats:{ AVG:0.255, HR:2, RBI:22, SB:28, BB:20, PA:380, OPS:0.640 } },
      { name:'上川畑 大悟', age:28, pos:'遊撃手', hometown:'千葉', salary:3500, stats:{ AVG:0.248, HR:3, RBI:28, SB:10, BB:22, PA:400, OPS:0.630 } },
      { name:'水野 達稀', age:23, pos:'二塁手', hometown:'香川', salary:3000, stats:{ AVG:0.252, HR:2, RBI:20, SB:12, BB:18, PA:340, OPS:0.620 } },
      { name:'田宮 裕涼', age:23, pos:'捕手', hometown:'千葉', salary:3000, stats:{ AVG:0.252, HR:5, RBI:30, SB:3, BB:18, PA:320, OPS:0.670 } },
      { name:'レイエス', age:28, pos:'左翼手', hometown:'ドミニカ', isForeign:true, salary:15000, stats:{ AVG:0.262, HR:18, RBI:65, SB:5, BB:35, PA:460, OPS:0.800 } },
      { name:'郡 拓也', age:27, pos:'捕手', hometown:'熊本', salary:4000, stats:{ AVG:0.240, HR:4, RBI:25, SB:2, BB:15, PA:300, OPS:0.640 } },
      { name:'野村 佑希', age:25, pos:'三塁手', hometown:'大阪', salary:4000, stats:{ AVG:0.255, HR:12, RBI:48, SB:2, BB:25, PA:400, OPS:0.730 } },
    ],
    pitchers: [
      { name:'上沢 直之', age:30, pos:'先発', hand:'right', hometown:'千葉', salary:20000, stats:{ ERA:3.30, W:10, L:9, IP:162, K:148, BB:38, WHIP:1.20 } },
      { name:'伊藤 大海', age:26, pos:'先発', hand:'right', hometown:'北海道', salary:12000, stats:{ ERA:3.15, W:11, L:9, IP:165, K:165, BB:42, WHIP:1.18 } },
      { name:'加藤 貴之', age:31, pos:'先発', hand:'left', hometown:'北海道', salary:10000, stats:{ ERA:3.40, W:9, L:8, IP:155, K:128, BB:35, WHIP:1.22 } },
      { name:'北山 亘基', age:24, pos:'先発', hand:'right', hometown:'北海道', salary:3500, stats:{ ERA:3.65, W:7, L:9, IP:140, K:118, BB:42, WHIP:1.28 } },
      { name:'田中 正義', age:30, pos:'抑え', hand:'right', hometown:'北海道', salary:8000, stats:{ ERA:2.60, W:2, L:3, SV:22, IP:58, K:65, BB:18, WHIP:1.05 } },
      { name:'杉浦 稔大', age:32, pos:'中継ぎ', hand:'right', hometown:'愛知', salary:6000, stats:{ ERA:2.85, W:3, L:3, IP:65, K:65, BB:20, WHIP:1.10 } },
      { name:'河野 竜生', age:25, pos:'中継ぎ', hand:'left', hometown:'北海道', salary:3500, stats:{ ERA:3.10, W:3, L:3, IP:60, K:58, BB:22, WHIP:1.18 } },
    ],
  },

  // 11: 大阪バファローズ
  11: {
    batters: [
      { name:'吉田 正尚', age:31, pos:'左翼手', hometown:'福井', salary:55000, stats:{ AVG:0.310, HR:24, RBI:82, SB:2, BB:78, PA:520, OPS:0.960 } },
      { name:'頓宮 裕真', age:27, pos:'捕手', hometown:'岡山', salary:8000, stats:{ AVG:0.310, HR:18, RBI:72, SB:1, BB:42, PA:500, OPS:0.900 } },
      { name:'中川 圭太', age:28, pos:'二塁手', hometown:'大阪', salary:5000, stats:{ AVG:0.268, HR:6, RBI:38, SB:5, BB:28, PA:420, OPS:0.700 } },
      { name:'宗 佑磨', age:28, pos:'三塁手', hometown:'大阪', salary:8000, stats:{ AVG:0.265, HR:8, RBI:45, SB:8, BB:32, PA:460, OPS:0.730 } },
      { name:'紅林 弘太郎', age:22, pos:'遊撃手', hometown:'静岡', salary:5000, stats:{ AVG:0.258, HR:12, RBI:55, SB:4, BB:30, PA:480, OPS:0.740 } },
      { name:'西野 真弘', age:32, pos:'二塁手', hometown:'大阪', salary:6000, stats:{ AVG:0.258, HR:4, RBI:28, SB:6, BB:22, PA:360, OPS:0.660 } },
      { name:'T-岡田', age:36, pos:'右翼手', hometown:'大阪', salary:10000, stats:{ AVG:0.248, HR:12, RBI:48, SB:1, BB:28, PA:380, OPS:0.720 } },
      { name:'ゴンザレス', age:29, pos:'中堅手', hometown:'キューバ', isForeign:true, salary:15000, stats:{ AVG:0.262, HR:14, RBI:55, SB:10, BB:35, PA:460, OPS:0.780 } },
      { name:'来田 涼斗', age:22, pos:'中堅手', hometown:'兵庫', salary:3000, stats:{ AVG:0.248, HR:5, RBI:25, SB:15, BB:18, PA:300, OPS:0.660 } },
    ],
    pitchers: [
      { name:'山本 由伸', age:26, pos:'先発', hand:'right', hometown:'岡山', salary:68000, stats:{ ERA:1.80, W:16, L:6, IP:193, K:225, BB:32, WHIP:0.88 } },
      { name:'田嶋 大樹', age:27, pos:'先発', hand:'left', hometown:'埼玉', salary:10000, stats:{ ERA:3.20, W:11, L:8, IP:162, K:148, BB:40, WHIP:1.18 } },
      { name:'宮城 大弥', age:23, pos:'先発', hand:'left', hometown:'沖縄', salary:8000, stats:{ ERA:3.10, W:11, L:7, IP:158, K:142, BB:38, WHIP:1.15 } },
      { name:'山崎 颯一郎', age:26, pos:'先発', hand:'right', hometown:'静岡', salary:5000, stats:{ ERA:3.45, W:9, L:8, IP:148, K:140, BB:42, WHIP:1.22 } },
      { name:'平野 佳寿', age:41, pos:'抑え', hand:'right', hometown:'京都', salary:12000, stats:{ ERA:2.35, W:2, L:3, SV:28, IP:58, K:58, BB:14, WHIP:1.00 } },
      { name:'ワゲスパック', age:30, pos:'中継ぎ', hand:'right', hometown:'アメリカ', isForeign:true, salary:10000, stats:{ ERA:2.75, W:4, L:2, IP:65, K:70, BB:18, WHIP:1.05 } },
      { name:'比嘉 幹貴', age:38, pos:'中継ぎ', hand:'right', hometown:'沖縄', salary:5000, stats:{ ERA:3.05, W:2, L:2, IP:55, K:48, BB:14, WHIP:1.10 } },
    ],
  },
};
