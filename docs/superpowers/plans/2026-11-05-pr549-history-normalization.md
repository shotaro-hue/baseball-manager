# PR #549 FA history normalization

Spec: user's additional P2 review request. Start HEAD e63b622c; main 377987a8. Existing PR only; no merge, main push, force push, new PR, weakened checks or re-estimation of initialized eligibility.

- [x] Inspect latest refs/diff/CI/comments and real history producers. HEAD unchanged; initial CI #689 passes all 14 jobs, no review comments.
- [x] Capture deterministic pre-fix 1,059-player complete world, eligibility/progress and RNG count. Baseline: domestic 79 / overseas 51 / RNG 18,400 calls.
- [x] RED: empty/partial history, recent-only, mixed flat/nested rows, duplicates, split teams, invalid values, no-history fallback, preserved initialized state, post-exercise history and migration callers.
- [x] Normalize per source into year/team observations. Use trusted registration input, raw history, full career, recent tail in that order; same source corrections use the last valid row. Normalize known current club aliases and prefer names to converted historical teamId. Merge identifiable missing stints; do not add an anonymous season view to another source's view. Preserve anonymous split rows within their selected source. Keep explicit G=0 and reject invalid year/count data.
- [x] Apply the same normalized history selection before filtering post-exercise seasons. Remove the migration's premature Map merge that discards anonymous split observations.
- [x] GREEN and actual legacy load/save/cold-load/resave tests; frozen v1/v2 certificate/receipt, identity, finances, RNG and initialized-state regression tests.
- [x] Independently review changed function/callers and compare the full deterministic roster audit. Investigate every difference; do not repin existing expectations.
- [ ] Build, ordinary push to existing branch, exact-HEAD full CI, final PR update and YES/NO report without merging.

Audit: raw history is flat G/PA/W; persisted career rows use stats.G/PA/W. Imported careerLog rows all carry the current club's gameId even in transfer years, so that ID must not override their teamName. Full and recent arrays overlap. Existing archive/recent correction semantics use the last row of the same year/team. Already initialized eligibility remains authoritative.

Additional caller fix: reuse readonly legacy fixed-archive input for missing eligibility in save formats 3–5; keep optional-storage fallback. v6 remains selected-generation scoped. Baseline copy final tests: 18 failed / 15 passed; fixed files: 33 passed. Full 1059-player world and eligibility/progress unchanged, including all RNG, budgets and identity fields. Independent final reviewer: no confirmed outstanding issues.

Initial CI of d4952954: build/all 4,317 unit/integration tests pass. Eligibility display preset inherited actual earlier career years despite defining a single synthetic season; six exact browser assertions failed. Set that preset's career/tail inputs explicitly empty, retaining all exact assertions/timeouts. Local Chromium 3 and WebKit 3 cases pass. Latest-HEAD full CI is the remaining gate.
