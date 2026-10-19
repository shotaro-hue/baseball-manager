// UI categories only: existing domain tab IDs and save data remain unchanged.
export const PRIMARY_SECTIONS = [
  { id: 'home', label: 'ホーム', defaultTab: 'dashboard', tabs: [['dashboard', 'ダッシュボード']] },
  { id: 'rosterOps', label: '編成', defaultTab: 'roster', tabs: [['roster', 'ロスター']] },
  { id: 'game', label: '日程', defaultTab: 'schedule', tabs: [['schedule', '日程']] },
  { id: 'analysis', label: '成績', defaultTab: 'stats', tabs: [['stats', '成績'], ['leaderboard', 'ランキング'], ['standings', '順位表'], ['records', '記録・球団史']] },
  { id: 'management', label: '経営', defaultTab: 'management', tabs: [['management', '概要'], ['reinforcement', '補強'], ['contract', '契約'], ['finance', '財務']] },
];
export const TAB_TO_SECTION = {
  ...Object.fromEntries(PRIMARY_SECTIONS.flatMap(s => s.tabs.map(([id]) => [id, s.id]))),
  fa: 'management', trade: 'management', scout: 'management', alumni: 'analysis',
};
export const AUXILIARY_TABS = ['mailbox', 'news', 'settings', 'balance'];
export const RECRUITMENT_TABS = [['reinforcement', '補強トップ'], ['fa', 'FA'], ['trade', 'トレード'], ['scout', 'スカウト']];
export function parentTab(tab) {
  return ['fa', 'trade', 'scout'].includes(tab) ? 'reinforcement' : tab === 'alumni' ? 'records' : tab;
}
export function secondaryTabs(tab) {
  return parentTab(tab) === 'reinforcement' ? RECRUITMENT_TABS
    : parentTab(tab) === 'records' ? [['records', '記録'], ['alumni', 'OB']] : [];
}
export const deliveredMailbox = (mailbox = [], gameDay) => mailbox.filter(m => m && Number(m.deliverOnDay ?? 0) <= gameDay);
export function notificationSummary({ mailbox = [], news = [], gameDay, unreadCount }) {
  const visible = deliveredMailbox(mailbox, gameDay);
  const trades = visible.filter(m => m.type === 'trade' && m.offer && !m.resolved);
  const posting = visible.filter(m => m.type === 'posting_request' && !m.resolved);
  const interviews = news.filter(n => n.type === 'interview' && !n.answered);
  return { unread: Number.isSafeInteger(unreadCount) && unreadCount >= 0 ? unreadCount : visible.filter(m => !m.read).length,
    trades: trades.length, posting: posting.length, interviews: interviews.length,
    management: trades.length + posting.length, actionable: trades.length + posting.length + interviews.length };
}
export function sectionBadge(sectionId, tabBadges, notifications) {
  return sectionId === 'management' && notifications.management > 0 ? { n: notifications.management, label: '要対応', color: '#855200' }
    : sectionId === 'rosterOps' ? tabBadges.roster : null;
}
