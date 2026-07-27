import { describe, expect, it } from 'vitest';
import { resolveIndexedDbChunkScopes } from '../saveload';

describe('resolveIndexedDbChunkScopes', () => {
  it('writes every chunk when no explicit scope list is supplied', () => {
    expect(resolveIndexedDbChunkScopes()).toEqual(['seasonHistory', 'news', 'mailbox']);
  });

  it('skips unchanged chunks for an explicit empty scope list', () => {
    expect(resolveIndexedDbChunkScopes([])).toEqual([]);
  });

  it('keeps only supported, changed chunks', () => {
    expect(resolveIndexedDbChunkScopes(['mailbox', 'unknown', 'mailbox'])).toEqual(['mailbox']);
  });
});
