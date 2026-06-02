import { describe, expect, it } from 'vitest';
import { DEFERRED_SCREEN_IDS, isDeferredScreen } from './appScreenConfig';

describe('appScreenConfig', () => {
  it('keeps title and hub synchronous', () => {
    expect(isDeferredScreen('title')).toBe(false);
    expect(isDeferredScreen('hub')).toBe(false);
  });

  it('marks heavyweight screens as deferred', () => {
    expect(DEFERRED_SCREEN_IDS).toEqual(expect.arrayContaining([
      'mode_select',
      'batch_result',
      'result',
      'tactical_game',
      'allstar',
      'retire_phase',
      'contract_renewal_phase',
      'development_phase',
      'waiver_phase',
      'waiver_result',
      'playoff',
      'draft_preview',
      'draft_lottery',
      'draft',
      'draft_review',
      'spring_training',
      'new_season',
      'team_detail',
    ]));
  });
});
