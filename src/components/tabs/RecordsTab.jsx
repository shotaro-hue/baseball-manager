import React, { useState } from 'react';
import { DataTableFrame, Section } from '../design-system/primitives';
import { ReadingFilters } from '../reading/ReadingParts';
export function awardWinners(award) {
  return Array.isArray(award?.winners) ? award.winners : award?.name ? [award] : [];
}
export function leagueAward(award, league) {
  if (!award) return null;
  if ('central' in award || 'pacific' in award) return award[league === 'セ' ? 'central' : 'pacific'];
  return league === 'セ' ? award : null;
}
const rate = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value) ? digits === 3 ? value.toFixed(digits).replace(/^0\./, '.') : value.toFixed(digits) : '—';
const count = (value, unit = '') => value != null ? `${value}${unit}` : '—';
const tabs = [['awards', '最新の表彰'], ['titles', 'タイトル歴代'], ['career', '通算記録'], ['standings', '年度別順位'], ['hof', '殿堂']];
const titleRows = t => [['首位打者', t.avg, v => rate(v)], ['最高出塁率', t.obp, v => rate(v)], ['本塁打王', t.hr, v => count(v, '本')], ['打点王', t.rbi, v => count(v, '打点')], ['盗塁王', t.sb, v => count(v, '盗塁')], ['防御率王', t.era, v => rate(v, 2)], ['最多勝', t.win, v => count(v, '勝')], ['最高勝率', t.winPct, v => rate(v)], ['最多奪三振', t.so, v => count(v, 'K')], [t.version >= 2 ? '最多セーブ' : 'セーブ＋ホールド（旧集計）', t.sv, v => count(v, t.version >= 2 ? 'S' : '')], ['最多ホールド', t.hld, v => count(v, 'H')]];
export function RecordsTab({
  history
}) {
  const [tab, setTab] = useState('awards'),
    [year, setYear] = useState('');
  const {
    awards = [],
    records = {},
    hallOfFame = [],
    championships = [],
    standingsHistory = []
  } = history ?? {};
  const years = [...standingsHistory].filter(s => tab !== 'titles' || s.titles).sort((a, b) => b.year - a.year);
  const selectedYear = years.some(s => String(s.year) === year) ? year : String(years[0]?.year ?? '');
  const season = years.find(s => String(s.year) === selectedYear);
  const latest = [...awards].sort((a, b) => b.year - a.year)[0];
  const seasonRecords = [['シーズン本塁打', records.singleSeasonHR, v => count(v, '本')], ['シーズン打率', records.singleSeasonAVG, v => rate(v)], ['シーズン奪三振', records.singleSeasonK, v => count(v, 'K')]].filter(([, r]) => r);
  const career = (field, title, unit) => {
    const rows = Object.values(records[field] ?? {}).sort((a, b) => b.value - a.value).slice(0, 5);
    return rows.length > 0 && <Section title={title}><ol>{rows.map((r, i) => <li key={i} className="reading-data-row"><span>{i + 1}位 {r.playerName}</span><strong>{count(r.value, unit)}</strong></li>)}</ol></Section>;
  };
  return <main className="club-reading" data-ds="records"><h1>記録・球団史</h1><p className="reading-muted">保存されている年度の表彰・成績・歴史を確認します。</p>
  <ReadingFilters label="記録の種類" options={tabs} value={tab} onChange={setTab} />
  {['titles', 'standings'].includes(tab) && years.length > 0 && <label className="reading-year">年度<select aria-label="記録の年度" value={selectedYear} onChange={e => setYear(e.target.value)}>{years.map(s => <option key={s.year} value={String(s.year)}>{s.year}年</option>)}</select></label>}
  {tab === 'awards' && <>
   {latest ? <Section title={`${latest.year}年 シーズン表彰`}>
    {['セ', 'パ'].map(lg => {
          const m = leagueAward(latest.mvp, lg);
          return m && <div className="reading-data-row" key={lg}><strong>{lg}MVP · {m.name}</strong><span>{m.teamName} · {m.pos === '投手' ? `防御率 ${rate(m.ERA, 2)}` : `OPS ${typeof m.OPS === 'number' ? m.OPS.toFixed(3) : '—'}`}</span></div>;
        })}
    {latest.sawamura ? <div className="reading-data-row"><strong>沢村賞 · {latest.sawamura.name}</strong><span>{latest.sawamura.teamName} · {count(latest.sawamura.W, '勝')} ERA {latest.sawamura.ERA ?? '—'}</span></div> : latest.version >= 2 && <p>沢村賞：該当者なし</p>}
    {['セ', 'パ'].map(lg => {
          const r = leagueAward(latest.rookie, lg);
          return r && <div key={lg} className="reading-data-row"><strong>{latest.version >= 2 ? `${lg}新人王` : '新人王（旧集計）'} · {r.name}</strong><span>{r.teamName}</span></div>;
        })}
    <details><summary>表彰の選出基準</summary><p className="reading-muted">MVP・新人王・ベストナインはゲーム独自の成績評価です。MVPは野手80打席／投手40回以上の貢献スコアとチーム勝利数で選出します。新人王は27歳以下、過去の通算が投手30回未満／野手60打席未満で、今季出場した選手が対象です。沢村賞は130回・10勝・防御率3.50以下を満たす投手からFIPで選出します。最高勝率は13勝以上。最多ホールドはホールド数のみで、NPBのホールドポイントとは異なります。旧年度の記録は当時の集計を保持しています。首位打者・最高出塁率の規定打席はリーグ最多試合数（最低80）×3.1を四捨五入、防御率の規定投球回は同試合数です。</p></details>
   </Section> : <p className="reading-empty">シーズン未完了。表彰はシーズン終了後に記録されます。</p>}
   {championships.length > 0 && <Section title="優勝履歴">{[...championships].reverse().map((c, i) => <div key={i} className="reading-data-row"><strong>{c.year}年 日本シリーズ制覇</strong><span>{c.championName} vs {c.opponent}（{c.seriesResult}）</span></div>)}</Section>}
  </>}
  {tab === 'titles' && (season ? <Section title={`${season.year}年 タイトル`}>{['セ', 'パ'].map(lg => {
        const t = lg === 'セ' ? season.titles?.central : season.titles?.pacific;
        return t && <section key={lg}><h3>{lg}リーグ</h3><DataTableFrame stickyColumn={2} label={`${lg}リーグの歴代タイトル`}><table><thead><tr><th>タイトル</th><th>選手・球団</th><th>記録</th></tr></thead><tbody>{titleRows(t).flatMap(([name, award, fmt]) => awardWinners(award).map((r, i) => <tr key={name + i}><th scope="row">{name}</th><td>{r.name} · {r.teamName ?? '—'}</td><td>{fmt(r.value)}</td></tr>))}</tbody></table></DataTableFrame></section>;
      })}</Section> : <p className="reading-empty">タイトルデータはシーズン終了後に記録されます</p>)}
  {tab === 'career' && <><Section title="歴代シーズン記録">{seasonRecords.length ? seasonRecords.map(([name, r, fmt]) => <div className="reading-data-row" key={name}><span>{name}</span><strong>{fmt(r.value)} {r.playerName}</strong></div>) : <p className="reading-empty">記録なし</p>}</Section>{career('careerHR', '通算本塁打', '本')}{career('careerW', '通算勝利', '勝')}</>}
  {tab === 'standings' && (season ? <Section title={`${season.year}年 最終順位`}>{season.playerAwards?.mvpCentral && <p>セMVP · {season.playerAwards.mvpCentral.name}</p>}{[['セ', season.central], ['パ', season.pacific]].map(([lg, ranking]) => <section key={lg}><h3>{lg}リーグ</h3><DataTableFrame stickyColumn={2} label={`${lg}リーグ年度別順位`}><table><thead><tr><th>順位</th><th>球団</th><th>勝敗</th></tr></thead><tbody>{(ranking ?? []).map((t, i) => <tr key={t.id}><th scope="row">{i + 1}位</th><td>{t.emoji} {t.name}</td><td>{t.wins}勝{t.losses}敗</td></tr>)}</tbody></table></DataTableFrame>{!ranking?.length && <p className="reading-empty">このリーグの記録はありません。</p>}</section>)}</Section> : <p className="reading-empty">シーズン未完了</p>)}
  {tab === 'hof' && <Section title="球団殿堂">{hallOfFame.length ? hallOfFame.map((h, i) => <div className="reading-data-row" key={i}><strong>{h.playerName}</strong><span>{h.inductYear}年度殿堂入り{h.careerHR > 0 && ` · 通算${h.careerHR}本塁打`}{h.careerW > 0 && ` · 通算${h.careerW}勝`}{h.careerPA > 0 && ` · ${h.careerPA}打席`}</span></div>) : <p className="reading-empty">殿堂入り選手なし</p>}</Section>}
 </main>;
}
