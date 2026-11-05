import { parseContractDate } from './contractCalendar';
import { isIkuseiPlayer } from './rosterCapacity';

export const FA_QUALIFIED_DAYS_PER_YEAR = 145;
export const FA_GAME_DAYS_PER_SEASON = 143;
const OPENING_DATE = '2026-03-27';
const nonnegative = n => Number.isFinite(n) && n >= 0;
const yearValue = n => Number.isSafeInteger(n) && n > 0 && n < 10000;
const fail = () => { throw new Error('選手資格の開始年・登録日数・根拠・版を確認してください。'); };
const basis = (kind, method, sourceIds = []) => ({ kind, method, sourceIds: [...sourceIds] });
const kinds = ['official', 'reference', 'game-estimate', 'game-history'];
const validBasis = b => {
  if (!b || !kinds.includes(b.kind) || typeof b.method !== 'string' || !b.method.trim()
    || !Array.isArray(b.sourceIds) || !b.sourceIds.every(s => typeof s === 'string' && s.trim())) return false;
  for (const key of ['knownBy', 'checkedOn']) if (b[key] !== undefined) parseContractDate(b[key]);
  return true;
};
const entryType = s => ['高卒', '高校生'].includes(s) ? '高卒' : ['大卒', '社会人', '外国人'].includes(s) ? s : 'その他';

export function faQualifiedThresholds(player) {
  const p = player.eligibility ? player : initializePlayerEligibility(player);
  const e = p.eligibility.entry;
  const repeat = p.eligibility.fa.exerciseCount > 0;
  const seven = ['大卒', '社会人'].includes(e.type) && e.draftYear >= 2007;
  return repeat ? { domestic: 580, overseas: 580 } : { domestic: (seven ? 7 : 8) * 145, overseas: 1305 };
}

// Opening balances are a model, not reconstructed official registration days.
// Count each pre-opening season once, including split-team performance rows.
function estimateDays(player, year, startYear) {
  const rows = player.history ?? player.recentCareerLog ?? player.careerLog ?? [];
  const seasons = new Map();
  for (const h of rows) {
    if (!yearValue(h.year) || h.year >= year) continue;
    const g = h.G ?? (player.isPitcher ? h.stats?.G ?? h.stats?.W : h.stats?.G ?? (h.stats?.PA != null ? h.stats.PA / 4 : null));
    if (nonnegative(g)) seasons.set(h.year, (seasons.get(h.year) ?? 0) + g);
  }
  if (seasons.size) return [...seasons.values()].reduce((n, g) => n + Math.min(145, Math.round(g * 145 / (player.isPitcher ? 45 : 125))), 0);
  return Math.max(0, year - startYear) * 100;
}

export function validatePlayerEligibility(player, { year } = {}) {
  const e = player.eligibility;
  if (e === undefined) return;
  if (!e || e.version !== 2 || !yearValue(e.initializedYear) || !yearValue(player.proStartYear)
    || !validBasis(e.proStart) || !validBasis(e.birth) || !validBasis(e.entry?.basis)
    || !['高卒', '大卒', '社会人', '外国人', 'その他'].includes(e.entry.type)
    || !(e.entry.draftYear === null || yearValue(e.entry.draftYear))) fail();
  parseContractDate(player.birthDate);
  if (Number(player.birthDate.slice(0, 4)) >= player.proStartYear) fail();
  const f = e.fa, s = f?.season;
  if (!f || !nonnegative(f.days) || !validBasis(f.basis) || !validBasis(f.qualificationBasis)
    || !validBasis(f.exerciseBasis) || !['partial', 'complete'].includes(f.exerciseBasis.coverage)
    || typeof f.grants?.domestic !== 'boolean' || typeof f.grants?.overseas !== 'boolean'
    || !Number.isSafeInteger(f.exerciseCount) || f.exerciseCount < 0
    || !Number.isSafeInteger(f.openingExerciseCount) || f.openingExerciseCount < 0 || f.exerciseCount < f.openingExerciseCount
    || !(f.lastExerciseYear === null || yearValue(f.lastExerciseYear))
    || !nonnegative(f.cycleStartDays) || f.cycleStartDays > f.days
    || !s || !yearValue(s.year) || !Number.isSafeInteger(s.creditedDays) || s.creditedDays < 0 || s.creditedDays > 145
    || !Array.isArray(s.processedDays) || new Set(s.processedDays).size !== s.processedDays.length
    || s.processedDays.some(d => !Number.isInteger(d) || d < 1 || d > 143)
    || s.creditedDays !== s.processedDays.reduce((n, d) => n + Math.floor(d * 145 / 143) - Math.floor((d - 1) * 145 / 143), 0)
    || (yearValue(year) && (s.year > year || f.lastExerciseYear > year))) fail();
}

/** One-time new-game initialization or explicit save migration. No RNG/network. */
export function initializePlayerEligibility(player, { year = 2026, opening = null, firstContractYear = null, registrationHistory } = {}) {
  if (player.eligibility !== undefined) { validatePlayerEligibility(player); return player; }
  if (!yearValue(year) || (opening?.knownBy && opening.knownBy > OPENING_DATE)) fail();
  const refs = opening?.sourceIds ?? [];
  const age = Number.isInteger(player.age) && player.age >= 0 ? player.age : 18;
  const draftYear = opening?.draftYear ?? player.draftYear ?? null;
  const entry = { type: entryType(opening?.entryType ?? player.entryType), draftYear,
    basis: basis(opening?.entryType ? 'official' : entryType(player.entryType) === 'その他' ? 'game-estimate' : 'game-history',
      opening?.entryType ? 'documented-entry-class' : 'preserved-entry-class-or-other', opening?.entrySourceIds ?? refs) };
  const years = Math.max(0, player.serviceYears ?? 0, age - (Number.isInteger(player.entryAge) && player.entryAge < age ? player.entryAge : 18));
  const explicitStart = firstContractYear ?? opening?.proStartYear ?? player.proStartYear ?? player.entryYear;
  const start = explicitStart ?? (draftYear !== null ? draftYear + 1 : Math.max(year - years, year - age + 1));
  if (entry.draftYear === null && ['大卒', '社会人'].includes(entry.type)) {
    entry.draftYear = Math.max(1, start - 1);
    entry.draftYearBasis = basis('game-estimate', 'first-pro-season-minus-one');
  }
  const proStart = basis(firstContractYear !== null ? 'game-history' : opening?.proStartYear ? opening.proStartKind ?? 'official'
    : player.proStartYear || player.entryYear ? 'game-history' : 'game-estimate',
  firstContractYear !== null ? 'first-pro-contract-season' : opening?.proStartMethod ?? (explicitStart ? 'preserved-entry-year' : draftYear !== null ? 'draft-following-season' : 'entry-history-age-estimate'), opening?.proStartSourceIds ?? refs);
  const birthDate = player.birthDate ?? `${String(year - age).padStart(4, '0')}-03-27`;
  const birth = basis(player.birthDate ? (opening?.birthSourceIds?.length ? 'official' : 'game-history') : 'game-estimate',
    player.birthDate ? 'preserved-birth-date' : 'age-on-initialization-march-27', opening?.birthSourceIds ?? refs);
  const measured = nonnegative(player.daysOnActiveRoster)
    && (player.dataQuality?.serviceTime !== 'game-baseline-unknown' || player.daysOnActiveRoster > 0);
  const historyPlayer = registrationHistory ? { ...player, history: registrationHistory } : player;
  let days = firstContractYear !== null ? 0 : measured ? player.daysOnActiveRoster * 145 / 120
    : nonnegative(player.serviceYears) && player.serviceYears > 0 ? player.serviceYears * 145 : estimateDays(historyPlayer, year, start);
  const exercises = opening?.exercises ?? [];
  if (exercises.some(y => !yearValue(y) || y > 2025)) fail();
  const exerciseCount = exercises.length, lastExerciseYear = exerciseCount ? Math.max(...exercises) : null;
  const qualified = opening?.qualified;
  const grants = { domestic: Boolean(qualified), overseas: qualified === 'overseas' };
  if (!opening && firstContractYear === null && (measured || nonnegative(player.serviceYears))) {
    const legacyDays = measured ? player.daysOnActiveRoster : player.serviceYears * 120;
    const oldDomestic = ['高卒', '高校生', '外国人'].includes(player.entryType) ? 960 : 840;
    grants.domestic ||= legacyDays >= oldDomestic;
    grants.overseas ||= legacyDays >= 1080;
  }
  const f = { days, basis: basis(measured || firstContractYear !== null ? 'game-history' : 'game-estimate', firstContractYear !== null ? 'new-pro-zero' : measured ? 'legacy-120-to-145'
    : 'opening-registration-model-v2', []), grants,
  qualificationBasis: basis(qualified ? 'official' : 'game-estimate', qualified ? 'npb-2025-qualified' : 'modeled-qualified-days', refs),
  exerciseCount, openingExerciseCount: exerciseCount, lastExerciseYear, cycleStartDays: 0,
  exerciseBasis: { ...basis(exerciseCount ? 'official' : player.realPlayerId ? 'game-estimate' : 'game-history',
    player.realPlayerId ? 'opening-prior-exercise-lower-bound' : 'fictional-game-origin', refs),
    coverage: player.realPlayerId ? 'partial' : 'complete' },
  season: { year, processedDays: [], creditedDays: 0 } };
  const result = { ...player, proStartYear: start, birthDate, eligibility: { version: 2, initializedYear: year, proStart, birth, entry, fa: f } };
  if (!qualified && (grants.domestic || grants.overseas)) f.qualificationBasis = basis('game-history', 'legacy-qualified-rights-preserved');
  // A filed-and-recontracted right is consumed. Approximate only its new balance.
  if (lastExerciseYear !== null) {
    const since = estimateDays({ ...historyPlayer, history: (historyPlayer.history ?? historyPlayer.recentCareerLog ?? []).filter(h => h.year > lastExerciseYear) }, year, lastExerciseYear + 1);
    f.cycleStartDays = Math.max(0, days - since);
  }
  // A complete dated qualified list bounds the opening estimate. It does not
  // supply an exact cumulative day count, including for players absent from it.
  if (opening?.listChecked && !qualified && !measured) {
    const limit = faQualifiedThresholds(result).domestic;
    f.days = f.cycleStartDays + Math.min(limit - 1, f.days - f.cycleStartDays);
  }
  if (opening?.listChecked && qualified === 'domestic' && !measured) f.days = Math.min(f.days, f.cycleStartDays + 1304);
  if (opening) {
    const dated = b => ({ ...b, knownBy: opening.knownBy ?? OPENING_DATE, checkedOn: opening.checkedOn ?? '2026-11-05' });
    result.eligibility.proStart = dated(result.eligibility.proStart);
    result.eligibility.birth = dated(result.eligibility.birth);
    result.eligibility.entry.basis = dated(result.eligibility.entry.basis);
    f.qualificationBasis = dated(f.qualificationBasis);
  }
  validatePlayerEligibility(result);
  return result;
}

export function getPlayerFaProgress(player) {
  const p = initializePlayerEligibility(player), f = p.eligibility.fa, thresholds = faQualifiedThresholds(p);
  const balance = f.days - f.cycleStartDays;
  const progress = (key, required) => {
    const remainingDays = f.grants[key] ? 0 : Math.max(0, Math.ceil(required - balance - 1e-9));
    return { remainingDays, years: Math.ceil(remainingDays / 145), eligible: remainingDays === 0 };
  };
  return { ruleVersion: 2, recorded: true, estimated: f.qualificationBasis.kind !== 'official'
    && (f.basis.kind === 'game-estimate' || p.dataQuality?.serviceTime === 'game-baseline-unknown'), days: balance,
    basis: structuredClone(f.qualificationBasis), domestic: progress('domestic', thresholds.domestic), overseas: progress('overseas', thresholds.overseas) };
}

export function assessGamePostingQualification(player, { signingDate, completedSeasonYear }) {
  const date = parseContractDate(signingDate), p = initializePlayerEligibility(player, { year: date.year });
  if (!Number.isInteger(completedSeasonYear) || completedSeasonYear < 0 || completedSeasonYear > date.year
    || (completedSeasonYear === date.year && signingDate.slice(5) < '11-01') || p.birthDate > signingDate) fail();
  const ageYears = date.year - Number(p.birthDate.slice(0, 4)) - Number(signingDate.slice(5) < p.birthDate.slice(5));
  const professionalYears = Math.max(0, completedSeasonYear - p.proStartYear + 1);
  return { ruleVersion: 2, playerId: p.id, signingDate, completedSeasonYear, proStartYear: p.proStartYear,
    professionalYears, ageYears, exemption: ageYears >= 25 && professionalYears >= 6 ? 'exempt' : 'restricted' };
}

export function accrueFaService(player, { year, gameDay }) {
  if (!yearValue(year)) fail();
  if (!Number.isInteger(gameDay) || gameDay < 1 || gameDay > 143 || isIkuseiPlayer(player)) return player;
  const p = initializePlayerEligibility(player, { year }), f = p.eligibility.fa;
  if (year < f.season.year || (year === f.season.year && f.season.processedDays.includes(gameDay))) return p;
  const s = year === f.season.year ? f.season : { year, processedDays: [], creditedDays: 0 };
  const delta = Math.min(145 - s.creditedDays, Math.floor(gameDay * 145 / 143) - Math.floor((gameDay - 1) * 145 / 143));
  return { ...p, eligibility: { ...p.eligibility, fa: { ...f, days: f.days + delta,
    season: { year, processedDays: [...s.processedDays, gameDay].sort((a, b) => a - b), creditedDays: s.creditedDays + delta } } } };
}

// Called once on a successful NPB re-contract, including declaration-and-stay.
// The market retains its pre-exercise certificate until then for compensation.
export function exerciseFaRights(player, year) {
  const p = initializePlayerEligibility(player, { year }), f = p.eligibility.fa;
  if (f.lastExerciseYear === year) return p;
  if (!yearValue(year) || (f.lastExerciseYear !== null && year < f.lastExerciseYear)) fail();
  return { ...p, eligibility: { ...p.eligibility, fa: { ...f, grants: { domestic: false, overseas: false },
    qualificationBasis: basis('game-history', 'fa-exercise-and-npb-recontract'),
    cycleStartDays: f.days, exerciseCount: f.exerciseCount + 1, lastExerciseYear: year } } };
}

export function completeFaRecontract(player, year) {
  const kind = player.marketEntry?.kind;
  const released = kind === 'released' || player.isWaiverReleased
    || ['自由契約', '自由契約（減額制限超過）'].includes(player.marketEntryReason)
    || ['ikusei_expiry', 'roster-renewal', 'release', 'salary_cut'].includes(player.departureReason);
  const rightsMarket = !released && (kind ? ['domestic-fa', 'overseas-fa'].includes(kind)
    : ['国内FA宣言', '海外FA宣言', 'FA宣言'].includes(player.marketEntryReason)
      || ['domestic-fa', 'overseas-fa'].includes(player.departureReason));
  return rightsMarket ? exerciseFaRights(player, player.faEnteredYear ?? year) : initializePlayerEligibility(player, { year });
}
