# A1-2c posting income and next-season budget

## Approved direction

The user approved D (one GM decision, one internal market resolution) and then
changed the income policy: a posting completed in offseason Y funds Y+1
recruitment immediately after the completion candidate is published. The earlier
Y+2-only proposal is superseded. Initial policy allocates 100% of the converted
fee to Y+1; unused permission does not carry to Y+2. This is a game policy.

## This implementation

Base main `3b6192e32568ee14710f9842bc402afba166e698`; depends on unmerged #543
`ebee5f8d79b72902c3f51f4605fd11bab38ca56d`. Submit a dependent draft against main.
Implement the explicit completion boundary, not the entire posting feature.
`complete-posting` receives recorded final overseas monetary terms, reuses #543's
departure/end/agreement semantics, and commits income plus Y+1 permission together.
It is not a GM approval command or proof that a market/eligibility simulation ran.
Request generation, MLB eligibility evidence, offer pricing/player selection,
human UI/CPU and lifecycle/Worker producers remain later Task 7/9/10 work.
No randomness is needed in this boundary; callers retry the same recorded terms.

## Alternatives

- Y+2 ordinary review: rejected by the user in favor of immediate rebuilding.
- Recalculate the entire Y+1 budget: unnecessary; changes unrelated forecasts.
- Adopted: a source-backed Y+1 supplement, preserving the ordinary base policy.

## Interface

`complete-posting {id,teamId,playerId,contractId,settlement,terminationAgreementId?,
overseasContract}`. `settlement` and conditional explicit waiver follow #543.
`overseasContract` is exactly `{kind:'major',guaranteedUsdCents}` (positive safe
integer) or `{kind:'minor',signingBonusUsdCents}` (nonnegative safe integer).
Terms with options/incentives/major-linked minor terms are not accepted.
These inputs are explicit simulation facts; this boundary does not infer MLB
eligibility from serviceYears, age, nationality or NPB FA flags.

Major fee: 20% first USD25m, 17.5% next USD25m, 15% remainder; minor: 25% bonus.
Round aggregate fee to USD cents, half up. Policy v1 fixes JPY150/USD; convert
once to whole man-yen by floor using integer arithmetic. Record policy version,
rate and rounding. No live FX, tax or payment-installment simulation.

## Canonical records and invariants

- `budgetPolicies.approvedManYen` remains the ordinary base. Its smoothing,
  previous-year comparison and future forecasts do not include posting money.
- `incomeReceipts` owns the income and its `budgetAllocation` to exactly Y+1.
  Unique source is save/epoch/year/team/player/source-contract, not caller ID.
  The new receipt always has its allocation, including an actual zero amount.
- `spending.authorizations.approvedManYen` is base plus validated supplements
  for that club/year. Keep one authorization and policy per club/year.
- No negative one-off expense, separate wallet, or direct team.budget addition.
- Completion creates a deterministic child #543 departure command/receipt plus
  a parent completion receipt linking the income. Check both directions on load.
  Old #543 standalone departures remain valid and never gain income on load.
- The pure annual projection carries incomeReceipts transiently; only the
  existing envelope persists them. No duplicated engine income array.
- Validate source, monetary terms, fee, allocation and receipt signatures before
  trusting supplements. Ordinary spending may not change authorizations.
- In the unpublished completion candidate, add the proven Y+1 allowance before
  checking departure vacancy costs. Compare the complete outcome with the
  original rows so legitimate fee-funded vacancy costs work. Preserve all other
  years' admission checks, existing debt and closed-year history.
- Pending renewals, reservations, future contracts and retirement conflicts
  still reject without mutation. Natural expiry adds no redundant end/waiver.
- A lower whole-man-yen fee of zero is recorded, not treated as missing.
- Quote consumes no randomness; unchanged-ID replay is a no-op; altered terms,
  duplicate source under a different ID and typed-ID collisions reject.
- Income history is append-only at the existing save prefix barrier. Unpublished
  failure keeps world/root; published-but-not-adopted uses existing recovery.
- Y+1 allowance remains through the Y+1 spring. After Y+1, retain historical
  receipts and authorizations, but do not allocate them to Y+2. Never reprocess
  the receipt as ordinary income. A multi-year contract must pass every later
  year's unchanged normal budget.
- Budget quotes retain already proven supplements for their exact target years;
  they chain future baselines using ordinary base approvals only.

## Compatibility and scope

Keep public gate OFF and schemaVersion1/DB5; legacy behavior is unchanged.
Older annual states without new completion receipts have zero supplements.
Unknown/malformed new receipts are not treated as old missing data. No automatic
backfill of old posting income, no merge/main push. This does not complete A1.

## Acceptance

Hand-calculated fee tiers/cent rounding/FX, ID0, major/minor/natural expiry,
waive/retain, duplicate and forged evidence, all-year and minimum-roster budgets,
subsequent funded spending, future-year rejection, policy quotes without cascade,
spring retention/Y+2 non-carry, real generated roster positive/negative pair,
inline/external root publication failure/retry/cold load/recovery/prefix protection.
Task10 production annual rollover and long-play balance remain unverified here.
