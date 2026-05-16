export const DEFERRED_SCREEN_IDS = [
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
];

export function isDeferredScreen(screen) {
  return DEFERRED_SCREEN_IDS.includes(screen);
}
