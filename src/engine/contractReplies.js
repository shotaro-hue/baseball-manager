import { fmtSal } from '../utils';
import { ownedPlayers, mapOwnedPlayers, renewalEligible, validContractTerms, applyAgreedContract } from './renewalRules';

export const isPendingContractReply = mail => ['contract_decision_pending', 'contract_decision'].includes(mail.type) && !mail.resolved;
export const contractSnapshot = player => ({ salary: player.salary, contractYearsLeft: player.contractYearsLeft, contractSignedYear: player.contractSignedYear ?? null });
const offerYear = mail => mail.decision?.offeredYear ?? (mail.dateLabel?.match(/^(\d+)年/) ? Number(mail.dateLabel.match(/^(\d+)年/)[1]) : null);
export const contractReplyIsDue = (mail, gameDay, year) => isPendingContractReply(mail)
  && ((mail.deliverOnDay ?? 0) <= gameDay || (offerYear(mail) != null && offerYear(mail) !== year));

// Pure and replay-safe: accepted contracts are no longer eligible this year.
// Legacy mails without a snapshot remain readable and may apply only to an
// owned, expiring contract. Rejection never changes ownership or FA eligibility.
export function resolveContractReplies(team, mails, gameDay, year) {
  let updated = team;
  const replies = [];
  for (const mail of mails) {
    if (!contractReplyIsDue(mail, gameDay, year)) continue;
    const d = mail.decision || {};
    const offeredYear = offerYear(mail);
    const player = ownedPlayers(updated).find(p => d.playerId != null && p.id === d.playerId);
    let status = 'cancelled';
    let body = '契約回答の適用を取り消しました。選手の所属・契約が変更済み、または提示条件が無効です。現在の所属と契約を維持します。';
    const unchanged = !d.contractSnapshot || Object.entries(d.contractSnapshot).every(([key, value]) => (player?.[key] ?? null) === value);
    if (player && renewalEligible(player, year) && unchanged
      && (d.teamId == null || d.teamId === team.id) && (offeredYear == null || offeredYear === year)
      && typeof d.accepted === 'boolean') {
      if (!d.accepted) {
        status = 'rejected';
        body = `${player.name}より契約辞退の連絡が届きました。\n\n所属と現契約は維持します。条件を見直して再交渉できます。契約満了時の処理はシーズン終了後に行います。`;
      } else if (validContractTerms(player, d.salary, d.years)) {
        status = 'signed';
        updated = mapOwnedPlayers(updated, p => p.id === d.playerId
          ? applyAgreedContract(p, d.salary, d.years, year, { contractIncentives: d.incentives || null }) : p);
        body = `${player.name}より契約受諾の連絡が届きました。\n\n契約条件: ${d.years}年 / ${fmtSal(d.salary)}`;
        const i = d.incentives || {}, parts = [];
        if ((Number(i.performanceBonusRate) || 0) > 0) parts.push(`出来高+${i.performanceBonusRate}%`);
        if ((Number(i.titleBonus) || 0) > 0) parts.push(`タイトル${fmtSal(i.titleBonus)}`);
        if (i.optOut) parts.push('オプトアウト');
        if (parts.length) body += `\nインセンティブ: ${parts.join(' / ')}`;
      }
    }
    const name = player?.name || d.playerName || '選手';
    replies.push({ ...mail, type: 'contract_reply', read: false, resolved: true, resolution: status,
      title: `【契約回答】${name}`, from: `${name} / 代理人`, dateLabel: `${year}年 ${gameDay}日目`, body });
  }
  return { team: updated, replies };
}
