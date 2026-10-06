# Performance salary renewal (game model)

All salary amounts are in 万円. This model is for gameplay; it is neither an NPB salary estimator nor a simulation of real contract voting/negotiation. The real examples are calibration references rather than amounts copied into the engine.

## Demand calculation

1. Measure workload and performance for batters, starters and relievers separately. Batters use PA, OBP and SLG; pitchers use IP, ERA, K/9 and BB/9. Saves/holds can add at most 15% to relief contribution when both counters are measured. Recorded G/GS determines pitching role when available; otherwise the registered role is explicitly identified as a fallback in the explanation.
2. Target valuation = roster salary minimum + role base × contribution. Bases are 12,000 for batters and 9,000 for pitchers. Workload is PA / 500, starter IP / 150, relief IP / 60, capped at 1.2. Quality is capped between 0.25 and 1.8 for positive appearances.
3. Declines can be buffered by 25% of the previous two recorded seasons' average contribution. Same-year traded-team entries are combined; current/future entries are excluded. Previous low-appearance seasons cannot drag down a breakout. This reads existing recent career entries, not invented career/market data.
4. Version-2 awards for the current year are matched by player ID (including 0). MVP +15%, rookie +8%, Sawamura +12%, Best Nine +4%, each supported individual title +4%, combined ceiling +25%. Counting-title values must be positive for a bonus. An old record without IDs cannot be safely attributed by name, so it is not used for a bonus.
5. Unique league-first team by win percentage +3%, recorded current-year Japan Series champion +2%; team addition capped at 5% and scaled down for small workloads. Lower placement never subtracts from the player's valuation. League-first ties do not produce an inferred champion.
6. Money preference changes valuation by -5% through +5% with 50 as the neutral fallback; actual 0 is retained. Morale/trust remain negotiation factors rather than salary-price adjustments.
7. Move 40% of the difference between previous salary and target. No uniform percentage ceiling prevents low-paid breakout raises. For less than 40% workload, an increase is limited to a prorated 25% of previous salary, including after rounding. Productive full-workload incumbents are protected from a cut solely because this simplified target is lower.
8. Asking-price protection: previous salary × 75% up through 10,000, × 60% above 10,000, rounded upward to 100, never below the game's 420 / 240 roster minimums. This protects initial demands, not the offer input. Beyond-limit offers can now be evaluated for player consent. Missing essential performance data holds the previous salary; measured zero appearances is evaluated as zero workload.

The core contribution formulas are in `src/engine/salaryDemand.js`, with parameters grouped in `SALARY_MODEL`.

## Shared renewal acceptance

- `minOfferSalary` remains legacy demand metadata and a conservative CPU baseline; it is not an input constraint. `minAcceptSalary` is the minimum eligible for score-based agreement (75% of demand, at least the roster minimum, at most demand). Demand is the player's initial asking price, not the guaranteed final negotiated salary. The exact 25%/40% cut boundary is computed separately, and agreement beyond it represents player consent.
- Positive finite offers with a valid 1–7 year term are evaluated. Below the roster minimum no agreement is possible; otherwise offers at/above demand are accepted. Below demand, terms and preferences are evaluated using demand as the monetary reference, not previous salary. Personality defaults preserve measured zero weights. Pitcher playing-time scoring uses rotation/registered relief role rather than checking a batting lineup only. A rejected beyond-limit offer returns a distinct free-contract request, independently of FA service eligibility.
- Individual renewal and CPU renewal both call `evaluateRenewalOffer`. CPU offers begin at 85% of demand, close half the gap on round 2, and reach demand on round 3 if affordable. CPU never bypasses that evaluator with a forced minimum-salary agreement. Existing budget shortage/FA eligibility branches remain.
- Generic FA/trade offer evaluation keeps its existing monetary reference unless a renewal reference is explicitly supplied. Existing overseas-FA CPU branches are outside this change.
- Awards are calculated before asking prices at renewal entry; the saved current-year award snapshot is also passed to CPU renewal. Signed multiyear contracts are not re-priced by this model.
- The renewal screen provides the mobile flow, per-player drafts, completion accounting and optional batch offers. Individual and batch negotiation use the same one-round path. Numeric FA-declaration IDs are retained through the phase transition.

## Calibration and practical limits

The neutral-personality current-season comparison, without unavailable history, yields:

| Real example | Previous | Reported next salary | Game demand with supplied supported awards |
| --- | ---: | ---: | ---: |
| 岡林勇希, 2022 off-season | 740 | 4,000 | 4,500 |
| 村上頌樹, 2023 off-season | 700 | 6,700 | 8,400 |
| 桐敷拓馬, 2024 off-season | 3,300 | 8,800 | 9,900 |

Demands and negotiated reported salaries are different quantities. These three high-growth examples do not establish fit for the full NPB salary population, FA retention premiums, or player-specific preferences. 岡林's supported Best Nine is included; his real most-hits/Golden Glove are not modeled. 桐敷's game-most-holds stands in for a relief-title scenario, not a claim that NPB awards a most-holds title.

Sources:
- Official stats: https://npb.jp/bis/players/81585151.html, https://npb.jp/bis/players/13315153.html, https://npb.jp/bis/players/01705155.html
- Official awards: https://npb.jp/award/2022/cl.html, https://npb.jp/award/2023/cl.html
- Reported salaries: https://www.sponichi.co.jp/baseball/news/2022/11/27/kiji/20221127s00001173336000c.html, https://www.nikkansports.com/m/baseball/news/amp/202312100000425.html, https://www.nikkansports.com/baseball/news/202412040001099.html

Seed-42 initial teams, 100 simulated games per team, all 336 active players hypothetically renewed: total asking payroll 1,875,530 → 1,925,330 (+2.66%). Team ratios range 0.852–1.389. All requested payrolls fit within the respective observed team budgets. This is partial-season data, not final-season awards or actual negotiated payroll. Multiyear/expiring-player scope, farm payroll, injuries, aging, roster moves and multi-season cashflows have not been simulated here.

Fifteen repeated valuations with fixed stats/awards show diminishing changes; this is a convergence stress check, not fifteen playable seasons. Full-season and multi-year game balance remain to be verified. No pitching substitution or physics code is changed.

Reproduce the heavier seeded check separately (it is intentionally skipped in ordinary unit runs):

```sh
RUN_SALARY_BENCHMARK=1 npx vitest run scripts/salary-demand-benchmark.test.js --maxWorkers=1 --minWorkers=1
```

Optional `SALARY_BENCHMARK_REPORT=/absolute/path/report.json` exports its report. Visual review of the expandable explanation has not been performed; the user handles visual QA.
