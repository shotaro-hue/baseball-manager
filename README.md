# NPB Franchise Manager

A browser-based, open-source baseball franchise simulation focused on **multi-season decision making, roster building, sabermetrics, and front-office strategy**.

> The project is an unofficial fan-made simulation. It is not affiliated with Nippon Professional Baseball (NPB), any NPB club, or any third-party data provider.

[![CI](https://github.com/shotaro-hue/baseball-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/shotaro-hue/baseball-manager/actions/workflows/ci.yml)

**Live demo:** https://shotaro-hue.github.io/baseball-manager/

## Why this project exists

Most baseball simulators either focus on a single game or hide the mechanics that drive long-term team building. NPB Franchise Manager is an experiment in making those mechanics inspectable and playable in the browser.

The project aims to be useful not only as a game, but also as an open reference implementation for topics such as:

- long-horizon franchise simulation
- sabermetric player evaluation
- roster, contract, draft, and trade logic
- CPU front-office decision making
- deterministic and Monte Carlo validation of baseball simulation rules
- browser-local persistence for a large simulation state

The long-term goal is simple: make the player care more about **what the club will look like five years from now** than about the result of a single game.

## Current status

The project has been under active development since March 2026 and is maintained continuously through pull requests, regression tests, and automated CI.

The core game loop is playable across multiple seasons:

**games → roster decisions → transactions → offseason → next season**

Current development priorities are reliability, explainable decision-making, mobile performance, and deeper CPU strategy. See [ROADMAP.md](./ROADMAP.md) for the maintained roadmap.

## Features

### Franchise management

- multi-season franchise progression
- active roster and depth management
- lineup, rotation, and bullpen decisions
- contracts and free agency
- trades and prospect valuation
- draft and player development
- retirement and long-term player careers
- team finance and ownership pressure

### NPB-style league rules

- domestic / foreign-player handling
- roster-registration logic
- FA-day progression
- developmental / controlled roster concepts
- posting-related progression
- playoff structure

### Simulation and analytics

- plate-appearance and game simulation
- tactical game mode and batch simulation
- sabermetric metrics including wOBA-style evaluation
- batted-ball analysis
- exit velocity / launch-angle based physics modeling
- Monte Carlo validation utilities
- CPU team evaluation and management-policy engine

### Reliability and testing

- unit and integration tests with Vitest
- browser-flow coverage with Playwright
- regression tests for simulation and save/load bugs
- GitHub Actions CI on pushes and pull requests
- automatic GitHub Pages deployment

## Tech stack

- React 18
- Vite
- JavaScript / ES modules
- Vitest
- Playwright
- Three.js / React Three Fiber
- Recharts
- IndexedDB / local browser storage

## Quick start

### Requirements

- Node.js 20 recommended
- npm

### Run locally

```bash
git clone https://github.com/shotaro-hue/baseball-manager.git
cd baseball-manager
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal, usually `http://localhost:5173/`.

### Run tests

```bash
npm test
npm run build
```

For browser-driven tests:

```bash
npx playwright install
npm run test:e2e
```

## Project structure

```text
src/
├── components/      UI and game screens
├── engine/          simulation, roster, contracts, trades, finance, draft
├── hooks/           application and season-flow state
├── data/            game data used by the simulator
└── workers/         batch / background simulation logic

scripts/             validation and data-maintenance utilities
e2e/                 Playwright scenarios
docs/                implementation and design notes
ROADMAP.md            product direction and planned work
SPEC.md               detailed game specification
CHANGELOG.md          development history
```

## Contributing

Contributions are welcome. Good starting points include:

- simulation correctness and statistical validation
- mobile performance
- accessibility and UX
- player-comparison tools
- game-speed controls
- data export
- documentation and reproducible bug reports

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

If you find a bug, open an issue with reproduction steps, expected behavior, and the environment where it occurred.

## Maintenance philosophy

Changes are prioritized in this order:

1. simulation correctness and progression blockers
2. decision quality and explainability
3. multi-season depth
4. presentation and visual polish

Pull requests should include tests when changing simulation or progression logic.

## Data, names, and trademarks

The source code in this repository is licensed under the MIT License unless otherwise noted.

Third-party facts, statistics, names, logos, trademarks, and externally sourced datasets are **not relicensed by this repository**. Their use may be subject to separate rights or terms from their respective owners/providers. See [THIRD_PARTY.md](./THIRD_PARTY.md).

## License

Source code: [MIT License](./LICENSE)
