// 永続データ【＝長期保存する大容量データ】を React state から分離するための軽量ストア

function sanitizeArray(input) {
  return Array.isArray(input) ? input : [];
}
function sanitizePositiveInteger(input, fallback) {
  const value = Number(input);
  if (Number.isInteger(value) && value > 0) return value;
  return fallback;
}
function sanitizeNonNegativeInteger(input, fallback = 0) {
  const value = Number(input);
  if (Number.isInteger(value) && value >= 0) return value;
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

function sanitizeObject(input) {
  return input && typeof input === 'object' ? input : {};
}

function buildSeasonHistorySummary(seasonHistory) {
  const safeHistory = sanitizeObject(seasonHistory);
  const awards = sanitizeArray(safeHistory.awards);
  const championships = sanitizeArray(safeHistory.championships);
  const standingsHistory = sanitizeArray(safeHistory.standingsHistory);
  const transfers = sanitizeArray(safeHistory.transfers);
  const latestStandingsYear = standingsHistory.reduce((max, item) => {
    const year = Number(item?.year || 0);
    return year > max ? year : max;
  }, 0);
  const latestChampionshipYear = championships.reduce((max, item) => {
    const year = Number(item?.year || 0);
    return year > max ? year : max;
  }, 0);
  const latestTransferYear = transfers.reduce((max, item) => {
    const year = Number(item?.year || 0);
    return year > max ? year : max;
  }, 0);
  return {
    awardCount: awards.length,
    championshipCount: championships.length,
    standingsYears: standingsHistory.length,
    transferCount: transfers.length,
    latestYear: Math.max(latestStandingsYear, latestChampionshipYear, latestTransferYear, 0),
  };
}

function selectPage(list, options = {}) {
  const safeList = sanitizeArray(list);
  const safeOptions = options && typeof options === 'object' ? options : {};
  const limit = sanitizePositiveInteger(safeOptions.limit, safeList.length || 50);
  const offset = sanitizeNonNegativeInteger(safeOptions.offset, 0);
  return safeList.slice(offset, offset + limit);
}

function findById(list, id) {
  const safeId = toSafeId(id);
  if (!safeId) return null;
  return sanitizeArray(list).find((item) => toSafeId(item?.id) === safeId) ?? null;
}

function mergeItemById(list, item) {
  const safeList = sanitizeArray(list);
  if (!item || typeof item !== 'object') return safeList;
  const safeId = toSafeId(item.id);
  if (!safeId) return safeList;
  const index = safeList.findIndex((entry) => toSafeId(entry?.id) === safeId);
  if (index === -1) return [item, ...safeList];
  const next = safeList.slice();
  next[index] = { ...next[index], ...item };
  return next;
}

function applyDelta(list, delta) {
  const safeList = sanitizeArray(list);
  const safeDelta = delta && typeof delta === 'object' ? delta : {};
  switch (safeDelta.type) {
    case 'prepend':
      return [...sanitizeArray(safeDelta.items), ...safeList];
    case 'append':
      return [...safeList, ...sanitizeArray(safeDelta.items)];
    case 'replace':
      return sanitizeArray(safeDelta.items);
    case 'merge':
      return mergeItemById(safeList, safeDelta.item);
    case 'remove': {
      const removeId = toSafeId(safeDelta.id);
      if (!removeId) return safeList;
      return safeList.filter((item) => toSafeId(item?.id) !== removeId);
    }
    default:
      return safeList;
  }
}

export function createPersistentDataStore(initialData = {}) {
  const store = {
    seasonHistory: sanitizeObject(initialData.seasonHistory),
    news: sanitizeArray(initialData.news),
    mailbox: sanitizeArray(initialData.mailbox),
    scheduleArchive: sanitizeArray(initialData.scheduleArchive),
    gameResultsMap: sanitizeObject(initialData.gameResultsMap),
  };
  const listenersByScope = new Map();
  const revisions = {
    '*': 0,
    seasonHistory: 0,
    news: 0,
    mailbox: 0,
    scheduleArchive: 0,
    gameResultsMap: 0,
  };

  function emit(scope) {
    revisions['*'] += 1;
    if (scope && Object.prototype.hasOwnProperty.call(revisions, scope)) {
      revisions[scope] += 1;
    }
    const globalListeners = listenersByScope.get('*');
    if (globalListeners) {
      Array.from(globalListeners).forEach((listener) => listener());
    }
    if (!scope) return;
    const scopedListeners = listenersByScope.get(scope);
    if (scopedListeners) {
      Array.from(scopedListeners).forEach((listener) => listener());
    }
  }

  function subscribe(listener, scope = '*') {
    if (typeof listener !== 'function') return () => {};
    const safeScope = typeof scope === 'string' && scope ? scope : '*';
    const listeners = listenersByScope.get(safeScope) ?? new Set();
    listeners.add(listener);
    listenersByScope.set(safeScope, listeners);
    return () => {
      const currentListeners = listenersByScope.get(safeScope);
      if (!currentListeners) return;
      currentListeners.delete(listener);
      if (currentListeners.size === 0) {
        listenersByScope.delete(safeScope);
      }
    };
  }

  return {
    subscribe,
    getRevision(scope = '*') {
      const safeScope = typeof scope === 'string' && scope ? scope : '*';
      return revisions[safeScope] ?? revisions['*'];
    },
    selectNewsList(options = {}) {
      return selectPage(store.news, options);
    },
    selectMailboxList(options = {}) {
      return selectPage(store.mailbox, options);
    },
    selectNewsPage(options = {}) {
      return selectPage(store.news, options);
    },
    selectMailboxPage(options = {}) {
      return selectPage(store.mailbox, options);
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
    getNewsById(id) {
      return findById(store.news, id);
    },
    getMailboxById(id) {
      return findById(store.mailbox, id);
    },
    setSeasonHistory(nextValue) {
      store.seasonHistory = sanitizeObject(nextValue);
      emit('seasonHistory');
      return buildSeasonHistorySummary(store.seasonHistory);
    },
    getSeasonHistory() {
      return store.seasonHistory;
    },
    setNews(nextValue) {
      store.news = sanitizeArray(nextValue);
      emit('news');
      return buildSummary(store.news);
    },
    applyNewsDelta(delta) {
      store.news = applyDelta(store.news, delta);
      emit('news');
      return buildSummary(store.news);
    },
    getNews() {
      return store.news;
    },
    setMailbox(nextValue) {
      store.mailbox = sanitizeArray(nextValue);
      emit('mailbox');
      return buildSummary(store.mailbox);
    },
    applyMailboxDelta(delta) {
      store.mailbox = applyDelta(store.mailbox, delta);
      emit('mailbox');
      return buildSummary(store.mailbox);
    },
    getMailbox() {
      return store.mailbox;
    },
    setScheduleArchive(nextValue) {
      store.scheduleArchive = sanitizeArray(nextValue);
      emit('scheduleArchive');
      return { count: store.scheduleArchive.length };
    },
    getScheduleArchive() {
      return store.scheduleArchive;
    },
    setGameResultsMap(nextValue) {
      store.gameResultsMap = nextValue && typeof nextValue === 'object' ? nextValue : {};
      emit('gameResultsMap');
      return { count: Object.keys(store.gameResultsMap).length };
    },
    getGameResultsMap() {
      return store.gameResultsMap;
    },
    getSummaries() {
      return {
        seasonHistory: buildSeasonHistorySummary(store.seasonHistory),
        news: buildSummary(store.news),
        mailbox: buildSummary(store.mailbox),
        scheduleArchive: { count: store.scheduleArchive.length },
        gameResultsMap: { count: Object.keys(store.gameResultsMap).length },
      };
    },
  };
}
