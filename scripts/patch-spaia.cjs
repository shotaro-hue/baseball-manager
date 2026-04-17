#!/usr/bin/env node
/**
 * patch-spaia.cjs
 * npb2025.js の選手名一覧を元に Wikipedia 日本語版 API から生年・守備位置を取得し、
 * src/data/playerProfiles.json を生成する。
 *
 * 使い方:
 *   node scripts/patch-spaia.cjs            # 全選手を取得
 *   node scripts/patch-spaia.cjs --dry-run  # ファイル書き込みなしで確認
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 350; // Wikipedia API レートリミット対策

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'baseball-manager-bot/1.0 (educational game; contact: github)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// npb2025.js から選手名を正規表現で抽出
function extractNames(content) {
  const names = new Set();
  const re = /name:'([^']+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    names.add(m[1].trim());
  }
  return [...names];
}

// 全角スペースを半角に正規化（Wikipedia 検索用）
function normalizeName(name) {
  return name.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

// Wikitext からデータ抽出
function parseWikitext(text) {
  let birthYear = null;
  let pos = null;

  // 生年パターン（優先順）
  const birthPatterns = [
    /\{\{生年月日と年齢\|(\d{4})\|/,
    /\{\{生年月日\|(\d{4})\|/,
    /\{\{birth\s*date[^}]*\|(\d{4})\|/i,
    /生年月日\s*=\s*(\d{4})年/,
    /誕生日\s*=\s*(\d{4})年/,
    /\|\s*birth_date\s*=\s*(\d{4})/,
    /(\d{4})年\d+月\d+日生/,
  ];
  for (const re of birthPatterns) {
    const m = text.match(re);
    if (m) {
      birthYear = parseInt(m[1], 10);
      // 明らかに不正な年を除外
      if (birthYear < 1960 || birthYear > 2010) { birthYear = null; continue; }
      break;
    }
  }

  // 守備位置パターン
  const posPatterns = [
    /守備位置\s*=\s*([^\n|}<\[]+)/,
    /position\s*=\s*([^\n|}<\[]+)/i,
  ];
  for (const re of posPatterns) {
    const m = text.match(re);
    if (m) {
      pos = m[1].trim().replace(/\[\[|\]\]/g, '').split(/[,、・\/]/)[0].trim();
      break;
    }
  }

  // 野球選手インフォボックスでなければ無効
  const isBaseballPlayer =
    /テンプレート:基礎情報\s*野球選手|Infobox\s*baseball|baseball\s*player|NPB|野球選手/.test(text);
  if (!isBaseballPlayer && !birthYear && !pos) return null;

  return (birthYear || pos) ? { birthYear, pos } : null;
}

// Wikipedia からページ内容を取得
async function fetchWikiPage(title) {
  const url = `https://ja.wikipedia.org/w/api.php?` +
    `action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content` +
    `&rvslots=main&format=json&formatversion=2`;
  const data = await fetchJSON(url);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page.revisions?.[0]?.slots?.main?.['*']
      ?? page.revisions?.[0]?.content
      ?? null;
}

// Wikipedia 検索 API（名前が完全一致しない場合）
async function searchWiki(name) {
  const query = `${name} 野球選手 NPB`;
  const url = `https://ja.wikipedia.org/w/api.php?` +
    `action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3` +
    `&format=json&formatversion=2`;
  const data = await fetchJSON(url);
  return (data?.query?.search ?? []).map(r => r.title);
}

// 1選手分のデータ取得（ページ直接取得 → 検索フォールバック）
async function fetchPlayerData(rawName) {
  const name = normalizeName(rawName);
  const tried = new Set();

  // 試行するタイトル候補
  const candidates = [name];
  // 姓のみ / 名前順の変形を追加
  const parts = name.split(' ');
  if (parts.length >= 2) candidates.push(parts.join('')); // スペースなし
  // 同名選手区別用の "(野球)" サフィックスも試す
  candidates.push(`${name} (野球選手)`);
  candidates.push(`${name}_(野球選手)`);

  for (const title of candidates) {
    if (tried.has(title)) continue;
    tried.add(title);
    await sleep(DELAY_MS);
    try {
      const text = await fetchWikiPage(title);
      if (!text) continue;
      const result = parseWikitext(text);
      if (result) return result;
    } catch (e) {
      // 404 等は無視して次へ
    }
  }

  // 検索 API にフォールバック
  await sleep(DELAY_MS);
  try {
    const titles = await searchWiki(name);
    for (const title of titles.slice(0, 2)) {
      if (tried.has(title)) continue;
      tried.add(title);
      await sleep(DELAY_MS);
      const text = await fetchWikiPage(title);
      if (!text) continue;
      const result = parseWikitext(text);
      if (result) return result;
    }
  } catch (e) {
    // 検索失敗は無視
  }

  return null;
}

// 守備位置の正規化（ゲーム内ポジション名に統一）
const POS_MAP = {
  投手: null, // 投手サブタイプは SPAIA 成績から推定するため上書きしない
  捕手: '捕手',
  '一塁手': '一塁手', '一塁': '一塁手', '1B': '一塁手',
  '二塁手': '二塁手', '二塁': '二塁手', '2B': '二塁手',
  '三塁手': '三塁手', '三塁': '三塁手', '3B': '三塁手',
  '遊撃手': '遊撃手', '遊撃': '遊撃手', 'SS': '遊撃手', '短眼': '遊撃手',
  '左翼手': '左翼手', '左翼': '左翼手', 'LF': '左翼手',
  '中堅手': '中堅手', '中堅': '中堅手', 'CF': '中堅手',
  '右翼手': '右翼手', '右翼': '右翼手', 'RF': '右翼手',
  '外野手': '中堅手', '外野': '中堅手', 'OF': '中堅手',
  '内野手': '三塁手', '内野': '三塁手', 'IF': '三塁手',
  '指名打者': '一塁手', 'DH': '一塁手',
};

function normalizePos(raw) {
  if (!raw) return undefined;
  const s = raw.trim();
  return POS_MAP[s] ?? undefined;
}

// メイン処理
(async () => {
  const npbPath     = path.join(__dirname, '..', 'src', 'data', 'npb2025.js');
  const profilePath = path.join(__dirname, '..', 'src', 'data', 'playerProfiles.json');

  const npbContent = fs.readFileSync(npbPath, 'utf8');
  const names = extractNames(npbContent);
  console.log(`\n対象選手数: ${names.length} 名\n`);

  // 既存データがあればマージ（再実行時に差分だけ取得）
  let existing = {};
  if (fs.existsSync(profilePath)) {
    existing = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const alreadyFound = Object.keys(existing).length;
    console.log(`既存プロファイル: ${alreadyFound} 件（スキップ）\n`);
  }

  const profiles = { ...existing };
  let found = 0, skipped = 0, notFound = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    // 既存データがある選手はスキップ
    if (profiles[name]) { skipped++; continue; }

    if ((i - skipped) % 20 === 0) {
      console.log(`進捗: ${i}/${names.length} (取得済み:${found} / 未発見:${notFound})`);
    }

    const data = await fetchPlayerData(name);

    if (data) {
      const entry = {};
      if (data.birthYear) entry.birthYear = data.birthYear;
      const normalizedPos = normalizePos(data.pos);
      if (normalizedPos) entry.pos = normalizedPos;
      if (Object.keys(entry).length > 0) {
        profiles[name] = entry;
        found++;
      } else {
        notFound++;
      }
    } else {
      notFound++;
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`新規取得: ${found} 名`);
  console.log(`スキップ: ${skipped} 名`);
  console.log(`未発見:   ${notFound} 名`);
  console.log(`合計登録: ${Object.keys(profiles).length} 名`);

  if (DRY_RUN) {
    console.log('\n[dry-run] 先頭10件:');
    Object.entries(profiles).slice(0, 10).forEach(([k, v]) => {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    });
  } else {
    fs.writeFileSync(profilePath, JSON.stringify(profiles, null, 2), 'utf8');
    console.log(`\n出力完了: ${profilePath}`);
  }
})().catch(e => {
  console.error('エラー:', e);
  process.exit(1);
});
