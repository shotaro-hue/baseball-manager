# Mobile Calm Dugout — detail screens, second implementation pass

final result: blocked

Approved targets: mobile home, roster, player detail and batch-result mocks from the 2026-09-30 conversation (390 × 844 CSS target). Source files: exec-4a511f8f-3e45-4bf2-9736-a693691ff520.png, exec-aa023279-1043-4de5-8194-96eabef36665.png, exec-577ff1b9-35c0-499b-b223-aadb641f3663.png, exec-c6270fb9-128f-4623-ae05-4c81f5f17dca.png under /workspace/scratch/66c5379939ed/generated_images/.

## Blocker
The preceding pass could not start managed preview (`sh: 1: vite: not found`). For this continuation the user's explicit instruction to perform visual review themselves remains in effect. No new browser screenshots, browser interactions, console check or visual comparison were performed. Typography, spacing, responsive overflow and visual fidelity remain unverified. Automated build/component checks are not visual QA. Handoff remains a draft for user review.

## Scope
Continues merged PR #391 (base 7d990f0). This pass unifies the expanded roster/pitching/development controls, own-team statistics, player batted-ball analysis and career statistics using the approved white/pale-blue/navy palette. Controls have 44px minimum height; existing 7–12px local text is raised to 14px and selects to 16px. Dense tables have a bounded scroll region, sticky headings and an identity column (player/year). Filters, sorting, comparison entry points and roster handlers are retained. Shared badges/chart styles use scoped variables with legacy fallbacks.

Recorded zero OPS/wOBA, career ERA/WHIP/OPS and condition are no longer rendered as missing/100. Career lookup also preserves player ID zero. No simulation, roster-selection algorithm or data-retention changes.

## Intentional differences and remaining work
Detailed roster controls remain expandable; this pass refreshes their presentation without redesigning every operation. Schedule, individual results, league leaderboards/standings/records, comparison dialogs and management screens still need visual unification. The existing data-driven spray chart and career chart are retained; no new imagery or invented data. No Sites changes or merge.

## Manual review before merge
- Check 390px and 360px layouts, long names, safe areas and no page-wide horizontal overflow.
- Open simulation settings, choose count/automation, run and verify progress/results.
- Reorder/replace players, confirm assigned defense and validate lineup before play.
- Open/close player detail from a scrolled roster; confirm focus/scroll restoration and access to advanced analysis.
- Open batch game details; return to roster/home.
- Check every old tab under the five navigation groups and desktop regressions.

Additional manual review for this pass:
- Expand roster settings; switch fielders/pitchers/farm/conversations at 360px and 390px. Check long names, rotation controls, selects and wrapping.
- Scroll the roster and season/career tables in both directions; check player/year and header visibility, tooltips and keyboard focus.
- Switch major/detail metrics, sort, compare and open/close a player; ensure state is retained.
- Inspect batted-ball filters, empty/loading/partial-archive states, league comparison and chart labels on white.
- Inspect career regular/postseason toggle and rate zero versus no recorded appearances.

This remains a partial UI refresh; visual acceptance is pending user review.
