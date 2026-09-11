# Contributing

Thanks for considering a contribution to NPB Franchise Manager.

The project prioritizes simulation correctness, reproducible behavior, and decisions that remain understandable over many in-game seasons.

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

Run at least:

```bash
npm test
npm run build
```

For browser-flow changes, also run:

```bash
npx playwright install
npm run test:e2e
```

Simulation or progression changes should include a regression test where practical.

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
