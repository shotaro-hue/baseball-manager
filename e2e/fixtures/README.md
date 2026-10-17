# Progression save fixtures

`injury-rosters-122d02b-seed1.json.gz` fixes the E4/E5 emergency fielding
scenarios to the rosters generated at main `122d02b7a76ed0af90b17cecb1f8a6ff488c40d8`.
It contains only `createInitialTeams()` output using the tests' existing LCG seed 1
(1664525, 1013904223, unsigned 32 bit). It was generated from that checkout,
not an uploaded archive. These tests retain their exact lineup, promotion,
position, real Worker and save/reload assertions. The separate initialization
tests verify the current 65 players per club rather than changing this fixture.

`new-game.json.gz` is one fixed, real 2026 new-game save, produced by selecting
Yomiuri in the UI, saving, and reading with `loadGame`. IDs and roster data stay
fixed across runs; the file is gzip-compressed JSON, not a different save schema.

The test-only `loadFixture` builder produces these states from it:

- `late`: 142 scheduled rounds, one draw (round 20), next round 143.
- `draw-complete`: 143 scheduled rounds, one draw, round 144, encoded postseason.
- `invalid-lineup`: round 1, only the user's three lineup arrays emptied.

Each historical result is a fixed summary-only outcome. All scheduled clubs'
wins/losses/draws and runs are derived from the same results; player historical
play logs are absent, not fabricated. Schedule is regenerated through the app's
normal deterministic year/team-ID schedule function, as it is on real reload.

The two end-of-season fixtures use age 25 and three-year continuing contracts
to avoid unrelated retirement/negotiation randomness. Their required postseason,
offseason confirmation, real draft, spring training, next-year save and initial
game still run through the actual UI and engines. The invalid-lineup fixture
preserves every player and contract.

Fixtures are written by `saveGame`, loaded via the title's `続きから` button,
and use fresh browser contexts/IndexedDB/localStorage in every test. No
production state injection entry point or Worker/storage stub is installed.
