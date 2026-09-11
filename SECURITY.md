# Security Policy

## Supported version

Security fixes are applied to the current `main` branch. The project does not currently maintain multiple supported release branches.

## Reporting a vulnerability

Please do not publish sensitive exploit details in a public issue when doing so would put users at risk.

For lower-risk security or privacy concerns that can be discussed safely in public, open a GitHub issue with clear reproduction steps and expected impact.

For reports involving credentials, sensitive user data, or a practical exploit that should be coordinated before disclosure, contact the maintainer through the public GitHub profile and provide only the minimum detail needed to establish contact first.

## Scope

The project is primarily a browser-based simulation. Relevant reports may include:

- unsafe handling of imported or persisted game data
- cross-site scripting or HTML injection
- dependency vulnerabilities with practical impact
- accidental credential / token exposure
- unsafe external-data ingestion

General gameplay bugs are not security vulnerabilities and should use the normal bug-report process.
