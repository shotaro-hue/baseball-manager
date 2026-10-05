# Season awards, version 2

This change prepares reliable award records for future salary renewal work. It does not change salary demands, contract negotiations, pitching substitutions, or physics.

## Persisted records and compatibility

- New annual awards and league title objects have `version: 2`.
- Counting/rate titles retain the first winner's `name`, `teamName`, `value` and additionally store every tied winner in `winners`. Comparisons use unrounded rates (floating-point tolerance 1e-12).
- Player/team IDs are stored, including ID 0, so future salary adjustments need not match names.
- Rookie awards now have `central` and `pacific`, matching MVP's league structure.
- Old records are not recalculated. The records UI supports legacy single-winner records and the legacy all-league rookie. Old `sv` totals are explicitly labeled saves + holds; they must not be reinterpreted as saves.

## Title rules

- Saves use SV only; holds use HLD only. Holds are labeled 最多ホールド, not the NPB 最優秀中継ぎ投手賞: relief wins are not separately available in season statistics.
- OBP uses (H + BB + HBP) / (AB + BB + HBP + SF), among qualifying batters.
- Winning percentage uses W / (W + L), with at least 13 wins, independently of innings qualification.
- Existing game qualification remains: maximum league team games, at least 80, rounded games × 3.1 for PA, games × 1 for IP. Draws are now included in games. The below-qualifying-PA exception for rate titles is not implemented.
- Missing metric inputs are excluded instead of treated as measured zero. Measured zero remains a valid value.
- Farm batting average is H / AB, with the existing 50 PA eligibility. Farm titles also retain tied winners.

NPB references: https://npb.jp/award/2025/pl.html (13 wins), https://www.npb.or.jp/scoring/calculation.html (OBP and winning percentage), https://bis.npb.or.jp/npb/20050203stats.html (hold points = holds + relief wins).

## Game-specific selected awards

- MVP candidates: batters with 80 PA, pitchers with 40 IP. Batters use the existing batting WAR proxy, equivalent to estimated batting runs / 10. Pitchers use runs prevented against measured league ERA / 10. Both receive the same capped team-wins bonus. This is a game-specific contribution score, not NPB voting or full WAR. Fielding is not included.
- Rookie age and career limits remain unchanged (age <=27, previous career IP <30 or PA <60). An appearance this season is required. ERA 0 is retained in rookie scoring. NPB tenure/foreign experience rules and previous rookie award eligibility are outside this change.
- Sawamura retains the game's simplified 130 IP, 10 W, ERA <=3.50 conditions and lowest-FIP selection. Without an eligible pitcher the award is vacant. This is not the full NPB selection process.
- Best Nine's existing position quotas and scoring remain unchanged; IDs are added.

## Golden Glove scope

Not implemented in this PR. Season statistics lack individual fielding opportunities, putouts, assists, errors, and actual defensive innings by position. Ability ratings alone would reward potential rather than this season's defensive performance. Tracking and selection design should be a separate change.

## Verification

Unit and React rendering tests cover eligibility, ties, missing versus zero, player ID 0, pitcher MVP, league rookies, vacant Sawamura, farm batting average, old-record display, and perfect winning percentage. Visual review is left to the user and has not been performed.
