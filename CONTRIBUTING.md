# Contributing

Thanks for considering a contribution to NPB Franchise Manager.

The project prioritizes simulation correctness, reproducible behavior, and decisions that remain understandable over many in-game seasons.

For AI-assisted work, read [AGENTS.md](./AGENTS.md) before making changes.

## Good contribution areas

- reproducible simulation bugs
- statistical / sabermetric correctness
- roster, trade, contract, draft, and progression logic
- mobile performance and browser memory usage
- accessibility and decision-oriented UI improvements
- tests, validation tools, documentation, and data-export features

## Before opening a pull request

1. Search existing issues and pull requests to avoid duplicate work.
2. For a bug, describe the smallest reproducible scenario first.
3. For a feature, explain the player decision or maintenance problem it solves.
4. Keep unrelated changes out of the same pull request.

## Local development

```bash
git clone https://github.com/shotaro-hue/baseball-manager.git
cd baseball-manager
npm ci
npm run dev
```

## Validation

Use the [tiered test strategy](./docs/testing/EXECUTION_STRATEGY.md) and the [test inventory](./docs/testing/TEST_INVENTORY_2026-10-10.md). During development run the narrowest relevant tests; do not rerun the entire suite for every edit.

Before requesting a merge, ensure the **latest PR commit** has a successful build and complete Vitest check, either locally or in GitHub CI:

```bash
npm run build
npm test
```

For browser-flow changes, run the relevant Playwright scenario(s); for save-format, season-progression, or match-engine changes, consider the final complete E2E suite:

```bash
npx playwright install chromium webkit
npm run test:e2e -- --workers=1 --retries=0
```

The smoke suite is a subset of the full suite; do not run both against the same unchanged commit unless there is a specific diagnostic reason. Ordinary pull requests run the critical E2E gate in CI, and the complete E2E suite runs separately on a weekly/manual workflow.

Simulation or progression changes should include a regression test where practical. Record the tested commit, commands, results, and any untested scenarios in the PR.

## Pull request description

Please include:

- **Problem** — what is wrong or missing?
- **Change** — what does this PR do?
- **Why** — why is this approach appropriate?
- **Validation** — exact commands / scenarios tested
- **Risk** — what could regress?

## Project principles

Changes are generally prioritized in this order:

1. correctness and progression blockers
2. decision quality and explainability
3. long-term franchise depth
4. visual polish

Large features that add complexity without improving player decisions may be declined or deferred.

## Data and third-party material

Do not submit proprietary datasets, copyrighted assets, credentials, or data that you are not allowed to redistribute.

See [THIRD_PARTY.md](./THIRD_PARTY.md) for the repository's policy on external data, names, and trademarks.
