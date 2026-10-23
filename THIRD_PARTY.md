# Third-party data, names, and trademarks

This repository contains an open-source baseball simulation and may reference real-world baseball concepts, player/team names, statistics, or data obtained from external sources.

## Scope of the MIT License

The MIT License in this repository applies to source code and project-authored documentation unless a file states otherwise.

It does **not** grant rights to third-party trademarks, logos, names, copyrighted datasets, statistics databases, or other material owned by external parties.

## External data

The isolated SAVE-01B-0 development probe directly declares `fflate` 0.8.2
(MIT, https://github.com/101arrowz/fflate) for streaming ZIP experiments.
This matches the version already present in the application's dependency lock;
the probe does not upgrade that runtime transitive dependency or import ZIP code
into the game. Package license files remain distributed with npm dependencies.

Some development utilities may obtain baseball data from external websites or endpoints. Users and contributors are responsible for confirming that their use of any external source complies with that source's terms, applicable licenses, and local law.

Data files derived from third-party sources should not be assumed to be covered by the project's MIT License merely because they are stored in this repository.

## Affiliation

NPB Franchise Manager is an unofficial fan-made project. It is not affiliated with, endorsed by, or sponsored by Nippon Professional Baseball, any NPB club, or any third-party data provider.

If you believe material in this repository should be attributed differently or removed, please open an issue with enough detail for the maintainer to review it.
