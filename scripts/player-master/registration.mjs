/** Local evidence parser. Raw NPB pages and reconstructed rows are NOT release data. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TEAM_CODES = ['s','db','c','t','g','d','h','e','l','m','f','b'];
const text = html => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function date(value, season) {
  const parts = value.split('/').map(Number);
  if (parts.length === 2) parts.unshift(parts[0] >= 11 ? season - 1 : season);
  const [y,m,d] = parts, iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const timestamp = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== iso) throw new Error(`invalid registration date: ${value}`);
  return iso;
}

export function parseRegistrationPage(html, {teamId, registration, sourceUrl, season = 2026}) {
  if (!Number.isInteger(teamId) || teamId < 0 || teamId > 11 || !['controlled','development'].includes(registration)) throw new Error('invalid registration scope');
  const rows = [], removals = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = match[1], id = body.match(/href=["'](?:https?:\/\/npb\.jp)?\/bis\/players\/(\d+)\.html["']/)?.[1];
    if (!id) continue;
    const cells = [...body.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>text(m[1]));
    if (cells[0] === '▼') { removals.push({playerId:`npb:${id}`, date:date(cells[1],season)}); continue; }
    if (cells[0] === '△') { date(cells[1],season); continue; }
    if (cells.length !== 4 || !/^\d{1,2}\/\d{1,2}$/.test(cells[0])) throw new Error(`unrecognized registration row ${id}`);
    const position = cells[1].replace(/\s/g,'');
    if (!['投手','捕手','内野手','外野手'].includes(position)) throw new Error(`unknown registration position: ${position}`);
    rows.push({playerId:`npb:${id}`,name:cells[3],registeredOn:date(cells[0],season),number:cells[2],position,kind:position==='投手'?'pitcher':'batter'});
  }
  if (!rows.length) throw new Error('no registration rows: source layout may have changed');
  return {teamId,registration,sourceUrl,sha256:createHash('sha256').update(html).digest('hex'),rows,removals};
}

export function reconstructOpeningRoster(pages, asOf = '2026-03-27') {
  date(asOf.replaceAll('-','/'),2026);
  const players = [], seen = new Set();
  for (const page of pages) {
    for (const row of page.rows) {
      if (row.registeredOn > asOf || page.removals.some(m=>m.playerId===row.playerId && m.date>=row.registeredOn && m.date<=asOf)) continue;
      if (seen.has(row.playerId)) throw new Error(`duplicate opening registration: ${row.playerId}`);
      seen.add(row.playerId);
      players.push({...row,teamId:page.teamId,registration:page.registration,sourceUrl:page.sourceUrl});
    }
  }
  return {scope:'all',asOf,status:'reconstructed-not-independently-verified',redistribution:'unconfirmed',players,
    sources:pages.map(({teamId,registration,sourceUrl,sha256})=>({teamId,registration,sourceUrl,sha256}))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [directory, output] = process.argv.slice(2);
    if (!directory || !output) throw new Error('Usage: node scripts/player-master/registration.mjs <local-html-directory> <new-reference.json>');
    const pages = [];
    for (const [teamId, code] of TEAM_CODES.entries()) for (const [prefix,registration] of [['registered','controlled'],['registereddev','development']]) {
      const filename = `${prefix}_${code}.html`;
      pages.push(parseRegistrationPage(await readFile(resolve(directory,filename),'utf8'),{teamId,registration,sourceUrl:`https://npb.jp/announcement/2026/${filename}`}));
    }
    const reference = reconstructOpeningRoster(pages);
    await writeFile(resolve(output),JSON.stringify(reference,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({asOf:reference.asOf,count:reference.players.length,status:reference.status,teams:TEAM_CODES.map((code,teamId)=>({teamId,code,controlled:reference.players.filter(p=>p.teamId===teamId&&p.registration==='controlled').length,development:reference.players.filter(p=>p.teamId===teamId&&p.registration==='development').length}))},null,2));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
