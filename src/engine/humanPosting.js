import { reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { postingApplicationViews } from './annualPostingApplications';
import { fmtSal } from '../utils';

const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const validId = v => (typeof v === 'string' && v.trim().length > 0) || (Number.isSafeInteger(v) && v >= 0);
const fail = message => { throw Error(message); };
export const postingStatusText = { pending: '球団判断待ち', approved: '球団承認・市場結果待ち', rejected: '球団拒否',
  signed: '海外契約成立', 'no-offer': '提示なし・不成立', declined: '本人辞退・不成立' };

export function postingDecisionRequest(world, requestId, decision) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch, baseRevision: world.contractEconomy?.revision,
    season: world.year, date: world.contractEconomy?.clock.date, teamId: world.myId, requestId, decision };
}

export function postingMarketRequest(world, requestId) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch, baseRevision: world.contractEconomy?.revision,
    season: world.year, date: world.contractEconomy?.clock.date, teamId: world.myId, requestId };
}
export function reducePostingMarketRequest(world, r) {
  try {
    const fields = ['saveId', 'epoch', 'baseRevision', 'season', 'date', 'teamId', 'requestId'];
    if (!r || Object.keys(r).length !== fields.length || Object.keys(r).some(k => !fields.includes(k))
      || ![r.teamId, r.requestId].every(validId) || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0
      || !Number.isInteger(r.season) || r.season < 1) fail('海外交渉の申請を確認してください。');
    const state = toAnnualState(world), e = world.contractEconomy;
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.baseRevision > e.revision)
      fail('セーブ・球団が変更されています。申請を確認し直してください。');
    const command = { id: stable(['human-posting-market', r]), type: 'run-posting-market', requestId: r.requestId };
    const envelope = { saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision, transaction: command };
    if (state.transactions.some(t => t.id === command.id)) return reduceEconomyCommand(world, envelope);
    if (r.baseRevision !== e.revision || r.season !== world.year || r.date !== state.date)
      fail('状態が変更されています。申請と交渉内容を確認し直してください。');
    const application = postingApplicationViews(state).find(a => a.id === r.requestId);
    if (!application || application.teamId !== world.myId || application.season !== r.season || application.status !== 'approved')
      fail('自球団の承認済み申請を確認してください。');
    return reduceEconomyCommand(world, envelope);
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

// A displayed notification grants no authority. Re-read the saved application
// and enforce the human club, immutable confirmation and common transaction.
export function reducePostingDecisionRequest(world, request) {
  try {
    const r = request, e = world.contractEconomy;
    const fields = ['saveId', 'epoch', 'baseRevision', 'season', 'date', 'teamId', 'requestId', 'decision'];
    if (!r || Object.keys(r).length !== fields.length || Object.keys(r).some(k => !fields.includes(k))
      || ![r.teamId, r.requestId].every(validId) || !['approve', 'reject'].includes(r.decision)
      || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0 || !Number.isInteger(r.season) || r.season < 1)
      fail('ポスティングの申請と判断内容を確認してください。');
    const state = toAnnualState(world);
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.baseRevision > e.revision)
      fail('セーブ・球団が変更されています。申請を確認し直してください。');
    const command = { id: stable(['human-posting-decision', r]), type: 'decide-posting', requestId: r.requestId, decision: r.decision };
    const envelope = { saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision, transaction: command };
    if (state.transactions.some(t => t.id === command.id)) return reduceEconomyCommand(world, envelope);
    if (r.baseRevision !== e.revision || r.season !== world.year || r.date !== state.date)
      fail('状態が変更されています。申請と判断内容を確認し直してください。');
    const application = postingApplicationViews(state).find(a => a.id === r.requestId);
    if (!application || application.teamId !== world.myId || application.season !== r.season || application.status !== 'pending')
      fail('自球団の判断待ち申請を確認してください。');
    return reduceEconomyCommand(world, envelope);
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

// Read-only rows, derived from saved facts. No duplicate mailbox transaction or
// unread state: pending counts come from application status even after reload.
export function postingMailbox(world, mailbox = []) {
  if (world.contractEconomy?.mode !== 'annual') return mailbox;
  const e = world.contractEconomy, engine = e.engine;
  const results = new Map((engine.postingMarketResults ?? []).map(r => [r.requestId, r]));
  const generated = new Map(engine.transactions.filter(t => t.generatedPostingMarket).map(t => [t.generatedPostingMarket.resultId, t.generatedPostingMarket]));
  const departures = new Map((engine.postingDepartures ?? []).map(r => [r.id, r]));
  const incomes = new Map((e.incomeReceipts ?? []).filter(r => r.kind === 'posting').map(r => [r.transactionId, r]));
  const players = new Map([...(world.faPool ?? []), ...(world.teams ?? []).flatMap(t => [...t.players, ...t.farm, ...(t.history ?? [])])].map(p => [p.id, p]));
  const money = n => Number.isFinite(n) ? fmtSal(n) : '未記録';
  const rows = postingApplicationViews(engine).filter(r => r.teamId === world.myId).map(r => {
    const result = results.get(r.id), departure = result && departures.get(JSON.stringify([result.completionId, 'posting-departure']));
    const player = departure?.player ?? players.get(r.playerId), name = player?.name ?? `選手 ${r.playerId}`;
    let body = `${name} / ${r.season}年度\n${postingStatusText[r.status]}\n`;
    if (r.status === 'pending') body += '海外挑戦の申請です。球団として承認または拒否を判断してください。承認だけでは移籍・入金は確定しません。';
    if (r.status === 'approved') body += '球団は海外交渉を承認しました。市場結果待ちです。交渉を進めると提示条件と本人の判断が確定します。承認による退団・入金はありません。';
    if (r.status === 'rejected') body += '球団が申請を拒否しました。この判断による所属・契約・財務の変更はありません。';
    if (r.status === 'no-offer') body += '海外市場から契約提示がなく、不成立となりました。この結果による所属・契約・財務の変更はありません。通常の契約更改・満了処理の対象です。';
    if (r.status === 'declined') body += '選手本人が海外契約を辞退し、不成立となりました。この結果による所属・契約・財務の変更はありません。通常の契約更改・満了処理の対象です。';
    if (r.status === 'signed') {
      const income = incomes.get(result.completionId), c = result.overseasContract;
      const cents = c.kind === 'major' ? c.guaranteedUsdCents : c.signingBonusUsdCents;
      body += `${c.kind === 'major' ? 'メジャー契約・保証総額' : 'マイナー契約・契約金'} ${(cents / 100).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}米ドル\n`
        + `所属を離れました（退団通知日 ${departure?.notifiedDate ?? '未記録'}）。\n`
        + `元契約終了日 ${departure?.effectiveDate ?? '未記録'}。保証債務は${result.settlement === 'retain' ? '維持' : '明示合意により免除'}します。\n`
        + `球団受取譲渡金 ${money(income?.amountManYen)}\n${r.season + 1}年度限定の追加支出枠 ${money(income?.budgetAllocation?.amountManYen)}（通常予算とは別枠・翌々年度へ繰越なし）`;
    }
    const evaluation = result && generated.get(result.id)?.evaluation;
    if (evaluation) {
      const preference = evaluation.preference;
      body += '\n市場評価：能力・今季と直近2年の記録済み成績・年齢をもとに海外の需要を評価しました。';
      body += `\n市場からの関心：${evaluation.assessment.interestProbability >= .7 ? '高い' : evaluation.assessment.interestProbability >= .35 ? '一定の関心' : '限定的'}。`;
      if (result.outcome === 'no-offer') body += '今回は海外球団の需要と評価が合致せず、契約提示に至りませんでした。';
      if (result.outcome !== 'no-offer') {
        const offer = evaluation.offer, dollars = (offer.guaranteedUsdCents ?? offer.signingBonusUsdCents) / 100;
        body += `\n提示条件：${offer.kind === 'major' ? `${offer.years}年・メジャー保証総額` : 'マイナー契約金'} ${dollars.toLocaleString('ja-JP')}米ドル。`;
        body += `\n本人の海外志向：${preference.value >= 67 ? '高い' : preference.value >= 34 ? '中程度' : '低い'}${preference.source === 'game-estimate' ? '（未記録のためゲーム上の推定）' : ''}。海外収入、国内に残る場合の条件、出場機会の見込みと安定志向を比較し、${result.outcome === 'signed' ? '受諾' : '辞退'}しました。`;
        body += '\n元契約の残存債務は海外挑戦後も維持する条件です。将来の国内契約額・海外の出場機会は見込みであり、保証ではありません。';
      }
    }
    return { id: JSON.stringify(['annual-posting-notice', r.id]), type: 'posting_request', read: true,
      resolved: !['pending', 'approved'].includes(r.status), title: `【ポスティング申請】${name}（${r.season}年度）`,
      from: name, dateLabel: r.requestedDate, body, annualPosting: r };
  });
  return [...rows.reverse(), ...mailbox.map(m => m?.type === 'posting_request' ? { ...m, postingUnavailable: true } : m)];
}
