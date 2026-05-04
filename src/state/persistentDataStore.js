// 永続データ【＝長期保存する大容量データ】を React state から分離するための軽量ストア

function sanitizeArray(input) {
  return Array.isArray(input) ? input : [];
}
function sanitizePositiveInteger(input, fallback) {
  const value = Number(input);
  if (Number.isInteger(value) && value > 0) return value;
  return fallback;
}

function toSafeId(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function buildSummary(list) {
  const safeList = sanitizeArray(list);
  const latest = safeList[0];
  const latestId = latest && typeof latest === 'object' ? toSafeId(latest.id) : '';
  const unreadCount = safeList.reduce((count, item) => {
    if (!item || typeof item !== 'object') return count;
    return item.read === false ? count + 1 : count;
  }, 0);
  return {
    count: safeList.length,
    unreadCount,
    latestId,
  };
}

export function createPersistentDataStore(initialData = {}) {
  const store = {
    seasonHistory: initialData.seasonHistory && typeof initialData.seasonHistory === 'object' ? initialData.seasonHistory : {},
    news: sanitizeArray(initialData.news),
    mailbox: sanitizeArray(initialData.mailbox),
    scheduleArchive: sanitizeArray(initialData.scheduleArchive),
    gameResultsMap: initialData.gameResultsMap && typeof initialData.gameResultsMap === 'object' ? initialData.gameResultsMap : {},
  };

  return {
    selectNewsList(options = {}) {
      const safeNews = sanitizeArray(store.news);
      const safeOptions = options && typeof options === 'object' ? options : {};
      const limit = sanitizePositiveInteger(safeOptions.limit, safeNews.length || 50);
      return safeNews.slice(0, limit);
    },
    selectMailboxList(options = {}) {
      const safeMailbox = sanitizeArray(store.mailbox);
      const safeOptions = options && typeof options === 'object' ? options : {};
      const limit = sanitizePositiveInteger(safeOptions.limit, safeMailbox.length || 50);
      return safeMailbox.slice(0, limit);
    },
    selectUnreadMailboxCount(currentGameDay) {
      const safeMailbox = sanitizeArray(store.mailbox);
      const safeGameDay = Number.isFinite(Number(currentGameDay)) ? Number(currentGameDay) : 0;
      return safeMailbox.reduce((count, item) => {
        if (!item || typeof item !== 'object') return count;
        const deliverOnDay = Number(item.deliverOnDay ?? 0);
        if (item.read === false && deliverOnDay <= safeGameDay) return count + 1;
        return count;
      }, 0);
    },
    selectLatestNewsId() {
      const safeNews = sanitizeArray(store.news);
      if (safeNews.length === 0) return '';
      const latest = safeNews[0];
      if (!latest || typeof latest !== 'object') return '';
      return toSafeId(latest.id);
    },
    setSeasonHistory(nextValue) {
      store.seasonHistory = nextValue && typeof nextValue === 'object' ? nextValue : {};
      return store.seasonHistory;
    },
    getSeasonHistory() {
      return store.seasonHistory;
    },
    setNews(nextValue) {
      store.news = sanitizeArray(nextValue);
      return buildSummary(store.news);
    },
    getNews() {
      return store.news;
    },
    setMailbox(nextValue) {
      store.mailbox = sanitizeArray(nextValue);
      return buildSummary(store.mailbox);
    },
    getMailbox() {
      return store.mailbox;
    },
    setScheduleArchive(nextValue) {
      store.scheduleArchive = sanitizeArray(nextValue);
      return { count: store.scheduleArchive.length };
    },
    getScheduleArchive() {
      return store.scheduleArchive;
    },
    setGameResultsMap(nextValue) {
      store.gameResultsMap = nextValue && typeof nextValue === 'object' ? nextValue : {};
      return { count: Object.keys(store.gameResultsMap).length };
    },
    getGameResultsMap() {
      return store.gameResultsMap;
    },
    getSummaries() {
      return {
        news: buildSummary(store.news),
        mailbox: buildSummary(store.mailbox),
        scheduleArchive: { count: store.scheduleArchive.length },
        gameResultsMap: { count: Object.keys(store.gameResultsMap).length },
      };
    },
  };
}
