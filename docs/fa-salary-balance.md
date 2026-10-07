# FA declaration and incumbent salaries — iteration 1

## Scope

Game-logic correction before the later offseason-planning UI work. No Sites changes,
pitching/physics changes, real career reconstruction, compensation, auctions, or
new overseas/posting policies. Existing fixed-price domestic market and upfront
salary × years cost remain; ordinary renewal cashflow is unchanged.

## Pre-renewal declaration

- At retirement/development completion, current-season awards are calculated
  using all completed-season players BEFORE departures. All clubs, including the
  user's club, run the same domestic declaration assessment before CPU renewal.
- `renewalEligible` is shared by CPU renewal, demand generation and renewal UI:
  finite remaining years <= 1, not retired, and not signed in this offseason.
  The offseason precedes next year's decrement. Multi-year contracts stay intact.
- Domestic declaration requires existing FA registration eligibility, expiring
  contract, non-foreign/non-ikusei status. Recorded registration zero overrides
  legacy service years. Missing data does not imply eligibility. Overseas
  hopefuls (overseas preference >= 70) retain their prior wait/leave policy.
- Interest starts at 6%, then adds money/future preferences, recorded lack of
  playing time, losing-team preference, low recorded trust, and prospective pay
  cuts. Loyalty/stability reduce interest. Final chance is bounded at 2–45%.
  Missing workload/trust/team records never become invented poor performance.
  Coefficients are GAME assumptions, not NPB declaration-frequency estimates.
- Draw derives deterministically from type-tagged player/team IDs and year. It
  neither consumes global RNG nor changes on reload. `faDeclarationDecision`
  stores year, draw, probability, result and reason labels on player data; normal
  spread/serialization preserves it. No schema reset or old-save data rewrite.
- Declaration moves players to the market even if the old club can afford the
  shared salary demand. Roster references are pruned and departure history kept.
  Market asking price uses the shared demand; previous pay remains separately
  available as `faPreviousSalary`. UI exposes reasons and declaration-and-stay.
- The user can re-sign an own declarer through the existing market. Same-club
  signing preserves this season's stats for normal year-end archival. Transfers
  still archive old-club stats and reset current stats. All new CPU/user signings
  receive `contractSignedYear`, preventing another renewal in the same offseason.
- Existing negotiation-failure FA/free-contract paths remain. The current
  market still gives the user the first acquisition opportunity and CPU clubs
  claim later; simultaneous bidding, declaration deadlines and shared planning
  navigation belong to iteration 2 or a separate market-design change.
- FA re-qualification after using rights is not newly modeled in this iteration;
  existing cumulative-day eligibility remains. No initial service-day guesses.

## Salary correction

See `salary-renewal.md` for the bounded previous-pay anchor. Quality protection
is relaxed from 1.0 to 0.75 with a recorded-decline exception. Low-paid breakout
valuation, missing-vs-zero behavior, cut-consent and title caps remain.

Regression fixture: 684 PA, 623 AB, 184 H, 45 BB, 8 HBP, 8 SF, 10 doubles,
0 triples and 27 HR yield rounded AVG .295 / OPS .788. Previous pay 21,000万円,
neutral personality, no recorded history/awards => demand 21,400万円. These are
synthetic components matching the screenshot's rounded totals, NOT recovered
real player records; the screenshot alone cannot establish the exact fair price.

## Verification

- Test expiry left=0/1 vs multi-year/current-year signings, including numeric ID 0.
- Test declaration eligibility, measured zero, missing stats, preference effects,
  deterministic reload behavior, both user/CPU affordable declarations and stay.
- Test regular .295/27HR/.788 OPS pay, starter/relief workload, recorded declines,
  low-paid breakouts, awards and bounded repeated identical-season salaries.
- Full unit/integration tests and production build; browser visual confirmation
  is left to the user. Existing large-chunk warnings are not addressed here.

The fixed-seed 100-game partial-season benchmark checks asking-price totals
(not negotiated payroll) and 100 identical-performance iterations. It separately
reports declarations, but partial-season playing time is NOT a prediction of
full-season FA frequency. In the tested seed, total first-iteration asking-price
payroll changes by +4.30%; all 12 teams converge within 100 stress iterations and
every player stays below the previous-pay/absolute-valuation ceiling. This is
not a full multi-year economy simulation.
