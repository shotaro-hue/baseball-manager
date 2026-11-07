## Problem

What problem does this pull request solve?

## Player experience / feature scope

<!-- For small bug fixes, display fixes, or docs-only changes, keep this brief and cover only relevant items. Mark unrelated sections Not applicable with a reason; do not add unnecessary integration work. -->

- PR type: 基盤 (foundation) / 統合 (integration) / 機能完成 (feature complete) / 修正 (fix)
- Parent player experience / feature goal:
- Scope completed in this PR:
- Normal-play entry (screen / action) and connection status (connected / partial / not connected):
- Observable player result and how feature completion will be verified:

## Change

What changed?

## Why this approach

Why is this the right tradeoff for the simulator and its maintenance?

## Validation

Use checks appropriate to the change. For docs-only changes, record minimal diff, consistency, and reference checks; the existing required CI still applies. Distinguish technical unit/save tests from actual gameplay verification. Never mark an unperformed check as successful.

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Relevant manual scenario tested
- [ ] E2E tests run when browser flow changed

Commands / scenarios:

```text

```

## Feature completion status / next priority

Record `Met`, `Not met`, or `Not applicable`, with evidence or an exclusion reason. A foundation PR may finish its scope while the parent feature remains incomplete. Complete the table when claiming feature completion; for small fixes or docs-only changes, describe only relevant criteria or explain why the table is not applicable.

| Feature completion criterion | Status / evidence / exclusion reason |
| --- | --- |
| Available through normal gameplay screens and actions | |
| Correct effects on players, contracts, budgets, stats, etc. | |
| Required CPU / annual Worker automation connected | |
| Results retained through save, reload, and year transition | |
| Normal and important failure scenarios verified | |
| Player can understand the result and its reasons | |
| Existing features and old-save compatibility preserved | |

- Remaining work to complete the parent feature, including normal-play connections:
- Next priority and why it advances feature completion (explain any urgent bug, save-integrity, or technical-dependency exception):

## Risk / regression areas

What behavior could be affected by this change?

## UI evidence (only when presentation or interaction changes)

For UI changes, use `docs/DESIGN_SYSTEM.md`. For docs-only or non-UI changes, write `Not applicable` and explain why. Do not check items that were not verified.

- [ ] Relevant design-system rules and existing components/styles reviewed
- [ ] Before/after screenshots captured with the same data at 390px, 360px, and desktop; dimensions and changed routes recorded
- [ ] Main action, return navigation, long names, empty/loading/error states, and recorded zero versus missing values checked where relevant
- [ ] Keyboard/focus, table-local scrolling, bottom-navigation overlap, and browser console checked where relevant

Evidence (screenshots or durable artifact paths), exceptions, and unverified items:

<!-- A build or E2E pass alone is not visual verification. Do not claim browser coverage that was not run. -->
