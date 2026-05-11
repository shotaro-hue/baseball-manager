import { describe, expect, it } from 'vitest';
import { createPersistentDataStore } from './persistentDataStore';

describe('persistentDataStore selectors and deltas', () => {
  it('supports paging and id lookups for news and mailbox', () => {
    const store = createPersistentDataStore({
      news: [
        { id: 'n3', title: '3' },
        { id: 'n2', title: '2' },
        { id: 'n1', title: '1' },
      ],
      mailbox: [
        { id: 'm3', read: false, deliverOnDay: 3 },
        { id: 'm2', read: true, deliverOnDay: 2 },
        { id: 'm1', read: false, deliverOnDay: 1 },
      ],
    });

    expect(store.selectNewsPage({ limit: 2, offset: 1 }).map((item) => item.id)).toEqual(['n2', 'n1']);
    expect(store.selectMailboxPage({ limit: 2, offset: 1 }).map((item) => item.id)).toEqual(['m2', 'm1']);
    expect(store.getNewsById('n2')).toMatchObject({ id: 'n2' });
    expect(store.getMailboxById('m1')).toMatchObject({ id: 'm1' });
  });

  it('updates summaries incrementally via delta helpers', () => {
    const store = createPersistentDataStore({
      news: [{ id: 'n1', answered: false }],
      mailbox: [{ id: 'm1', read: false, deliverOnDay: 1 }],
    });

    const newsSummary = store.applyNewsDelta({ type: 'prepend', items: [{ id: 'n2', answered: true }] });
    const mailboxSummary = store.applyMailboxDelta({ type: 'merge', item: { id: 'm1', read: true, deliverOnDay: 1 } });

    expect(newsSummary).toEqual(expect.objectContaining({ count: 2, latestId: 'n2' }));
    expect(mailboxSummary).toEqual(expect.objectContaining({ count: 1, unreadCount: 0 }));
    expect(store.getNewsById('n2')).toMatchObject({ id: 'n2' });
    expect(store.getMailboxById('m1')).toMatchObject({ id: 'm1', read: true });
  });

  it('builds seasonHistory summary metadata', () => {
    const store = createPersistentDataStore({
      seasonHistory: {
        awards: [{ year: 2026 }],
        championships: [{ year: 2027 }],
        standingsHistory: [{ year: 2026 }, { year: 2027 }],
        transfers: [{ year: 2028 }],
      },
    });

    expect(store.getSummaries().seasonHistory).toEqual({
      awardCount: 1,
      championshipCount: 1,
      standingsYears: 2,
      transferCount: 1,
      latestYear: 2028,
    });
    expect(store.setSeasonHistory({ awards: [], championships: [], standingsHistory: [], transfers: [] })).toEqual({
      awardCount: 0,
      championshipCount: 0,
      standingsYears: 0,
      transferCount: 0,
      latestYear: 0,
    });
  });
});
