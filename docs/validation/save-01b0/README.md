# SAVE-01B-0 — portable backup technical probes

Date: 2026-10-23. Base main: `7dc29c0809526ce937e9948b9a0940c7287dc38d`.

## Decision

Keep design PR [#494](https://github.com/shotaro-hue/baseball-manager/pull/494) open. These executable experiments inform that design; they do not freeze the package format or complete SAVE-01B-0's real-device gate. The game import graph, production save code, DB schema and existing saves are unchanged.

The next implementation decisions must address **archive/root commit correspondence** and **source decoding memory**, before calling any ZIP a complete portable backup.

## Validation status

- Focused Vitest: **21/21 passed** across the three probe files; **23/23** including the two CI mirror regression cases. Before the barrier implementation, the new unit case failed (8 passed / 1 failed) and Chromium cold-recovery case failed waiting for the missing boundary. Both are GREEN after implementation.
- Browser: **Chromium 14/14, mobile WebKit 14/14**, one worker, no retries. The separate successful WebKit run followed an initial host-library launch failure; both attempts are retained in the machine-readable evidence.
- Production build: passed. Vite's existing large-chunk warnings remain; the probe is outside the production import graph.
- Earlier baseline full unit/integration suite: **224 files / 1,784 tests passed**, with two pre-existing opt-in benchmark skips (`fa-economy-benchmark` and `salary-demand-benchmark`). Command: `npm test -- --maxWorkers=2 --minWorkers=1`; duration 1,190.53 s, including three actual generated seasons for each of seeds 20261015/16/17. The later oracle duplicate-manifest case and strengthened collision/row checks were additionally verified in the final focused **20/20** run; the current full local rerun and exact-head CI are separate gates, whose final outcomes/SHA are recorded in [PR #495](https://github.com/shotaro-hue/baseball-manager/pull/495). The earlier 1,784 count is not the follow-up result.
- Independent source review: no remaining Critical/Important source defect. Destination collision coverage, forced unsupported-share coverage and unrelated probe-row preservation were added. The Python duplicate-manifest finding was verified RED→GREEN.

## Review follow-up: CI cancellation and completion boundary

Run [39878769180](https://github.com/shotaro-hue/baseball-manager/actions/runs/39878769180), head `1ce38b414b6b0a75516cd6a6a23bdc1dfc79c8ce`, completed as **cancelled**, not successful. Probe job `120170788575` started at 00:36:55 UTC; dependency installation started 00:37:11 and was cancelled at 01:07:07 while still downloading Ubuntu packages, at the 30-minute job limit. The test step was skipped. Several other suites were also cancelled; `progression-e2e` correctly failed because not every suite succeeded. No failing probe assertion was executed in that job. The timeout is established by the job limit and timestamps; the log reports cancellation rather than a product error.

The previous workaround rewrote only `.sources`/`.list`. Logs show `file:/etc/apt/apt-mirrors.txt` and continued `azure.archive.ubuntu.com` downloads. Running that original script against a mirror-list fixture reproduced the unchanged Azure endpoint. `scripts/ci/use-ubuntu-archive.py` now also rewrites `apt-mirrors*.txt`, retaining mirror indirection/priority, suites/components, Signed-By and vendor sources. Two fixture tests check legacy and mirror-list layouts plus idempotence. No job/test timeout, retry, assertion, matrix suite or aggregate gate was relaxed. Fixture success is not a claim of successful CI installation: require the exact latest-head checks in #495.

The current standard local browser run passed all 14 Chromium cases; WebKit could not launch because of missing host shared libraries (14 launch failures, not assertion failures). The subsequent **actual mobile WebKit 14/14** run uses the existing official Playwright binary and local Ubuntu library lookup wrapper, with one worker/retry 0. Both outcomes are retained in `browser-evidence.json`. This is an environment repair, not test retry masking, and not real iPhone evidence.

The isolated B-0 review fix can be accepted when these focused/full regressions and exact-head CI pass. The product backup, specification freeze and B-1 gates below remain open; this PR does not make their completion a condition for acknowledging the limited probe result.

## Verified behavior

- Current production `battedBallArchive` can replace the contents of the same batch ID from a second tab while `baseball-manager-save` is locked. ID count and event count remain unchanged. A save failure can also leave a future game's archive behind an older committed root. These are characterized risks, not regressions introduced here.
- Two pages both call the common `withProbeSnapshot` helper: the first holds save and archive, the second is observed pending on save, and executes after release. Synchronous throw permits later peer/same-page operations; asynchronous rejection releases an already waiting peer. A deliberately archive-first raw caller reproduces a lock cycle; aborting that raw save request releases archive and lets the common helper finish. All participants must acquire save→archive and never nest the helper inside either raw lock. There is no automatic deadlock prevention for outside callers. Production writers and pre-existing old-version tabs do not participate, so this result does not establish production snapshot consistency.
- The isolated journal survives closing the publishing page **while `publishProbeRestore()` is still pending**, held by a probe-only `afterPrimaryPublished` barrier immediately after primary setItem. The prototype has **no phase-update operation**; `verified` intentionally remains unchanged. A new page reads journal/staged bytes and actual primary, identifies publication, and explicitly restores the old primary without removing an unrelated row or a production-key sentinel. After another participating tab changes primary, cold-page rollback/publication/discard all reject conflict and leave journal/rows/primary unchanged. This proves page-lifecycle interruption and byte-level publication mechanics in the same browser context, not browser-process kill, full game semantic validation or power-loss durability.
- v3/v4/v5 career capture reads numeric player ID 0. After capture, destination numeric `0` and string `'0'` legacy rows are populated with conflicting histories. A new v6 generation retains the captured source history without modifying any destination legacy row. This is a focused career probe, not a full legacy save migration/roundtrip certification.
- ZIP generation uses <=256 KiB source entries, SHA-256 manifests and Blob parts. A separate later click performs share/download. Browser-downloaded 1 MiB files are checked by Python `zipfile`/`hashlib`, independently of fflate. Forced unsupported sharing, simulated native cancellation, preparation cancellation and retry are covered. Actual iOS sharing and Files persistence remain untested.
- A synchronous journal-write exception initially committed an unowned staged row. A failing retry test exposed it; explicitly aborting the transaction fixes it. A duplicate-manifest fixture similarly exposed a weakness in the independent oracle; it now rejects duplicate manifest paths.

The journal prototype uses only `baseball_manager_backup_probe_v1` and `baseball_manager_backup_probe_primary`. Browser characterization uses fresh Playwright profiles and generated fixtures, never a user's profile or supplied save. No probe is reachable from the game UI or production build.

## Capacity evidence and its limit

[Machine-readable browser evidence](./browser-evidence.json) records the final per-project outcomes, measurements and earlier environment failures. Timings are observations, not performance acceptance thresholds.

| Chromium measurement | Result |
|---|---:|
| 16 MiB incompressible synthetic source | 16,794,445-byte ZIP; 64 entries; about 3.91 s |
| 64 MiB incompressible synthetic source | 67,177,540-byte ZIP; 256 entries; about 12.15 s |
| Largest supplied source entry | 262,144 bytes |
| 2026 Hanshin day-106 fixture with 20 equivalent historical years: decoded root | 44,193,331 UTF-8 bytes |
| Same fixture: decoded career JSON | 16,100,157 UTF-8 bytes |
| Source read/decode/serialization observation | about 2.87 s |

Mobile WebKit created the same 16 MiB and 64 MiB ZIP byte sizes in about 2.54 s and 10.80 s; source read/decode/serialization took about 3.67 s. Runs had differing concurrent host workloads, so these timings are not a controlled comparison of browser performance.

The fixture is generated from one actual 2026 season, with equivalent history added by the existing `capacityScenario`; it is **not 20 simulated seasons**. ZIP capacity uses unrelated deterministic incompressible bytes and is not a full export of that game fixture. Peak JavaScript heap, browser/OS Blob backing memory, total device memory and Safari crash limits were **not measured**. A small source entry or successful 64 MiB File creation does not bound total memory usage.

The existing root/career codecs still decode whole rows before transport. Therefore splitting ZIP entries alone does not solve the measured 44 MB/16 MB source expansion. These UTF-8 sizes must not be reported as measured RAM consumption.

## ZIP library choice for this experiment

| Option | Experiment decision |
|---|---|
| fflate 0.8.2, `Zip`/`ZipDeflate` | Used in the probe, pinned as a direct dev dependency to the version already in the existing lock. No production transitive upgrade; no synchronous whole-ZIP browser unzip |
| zip.js | Viable alternative with stream and seekable Blob/File APIs. Its streaming writer alone does not establish an iOS file sink or bounded source decoding; no second dependency added merely to duplicate this experiment |
| Application-written ZIP implementation | Avoided; binary-format correctness would add work unrelated to the unresolved storage boundary |

Primary references: [fflate](https://github.com/101arrowz/fflate/tree/v0.8.2), [zip.js](https://gildas-lormeau.github.io/zip.js/), [Web Share specification](https://www.w3.org/TR/web-share/#share-method).

The probe format is deliberately marked `probeFormat: 1`; it is **not** the game backup `formatVersion: 1`. The Python oracle validates trusted experiment outputs and is not the production untrusted-file importer. The format's codec/budget/legacy rules are not frozen.

## Reproduce

```bash
npm ci
npx playwright install --with-deps chromium webkit
npx vitest run tests/save-01b0-storage.test.js tests/save-01b0-journal.test.js tests/save-01b0-zip.test.js
npx playwright test --config scripts/save-01b0/playwright.config.js --workers=1 --retries=0
npm run build
npm test -- --maxWorkers=2 --minWorkers=1
```

The focused browser config writes JSON evidence to `test-results/save-01b0/results.json`; normal CI has a separate `save-portable-backup-probe` matrix entry. Existing CI tests, assertions and retry settings are unchanged. Local WebKit used the downloaded official Playwright binary with task-local extracted Ubuntu libraries and a wrapper preserving their lookup path; no browser binary was modified. The first standard-launch WebKit attempt failed because host libraries were unavailable. Final results must come from the later actual browser run, not from suppressing those failures or treating an unavailable browser as skipped.

For the manual synthetic file page, start Vite and open `/baseball-manager/scripts/save-01b0/` on a test origin. This development-only page is not bundled or published with the game. It does not read/write game saves and cannot restore a game. Select a size → prepare → separately tap save/share or download. Confirm the file in Files and run the independent oracle against the actual exported file. Use a supported secure context for sharing.

## Gates still open before specification freeze/release

1. Integrate all real archive mutations, retries, backfills and delayed deletions with one cross-tab protocol; establish how old-version tabs are excluded or upgraded. The proposed probe lock cannot coordinate existing writers by itself.
2. Bind each committed root to immutable archive batch versions/identities. A latest archive snapshot cannot recreate a past overwritten batch or prove old-root correspondence. Dates/counts alone are insufficient. Preserve unknown historical source data without silently attaching it to active stats.
3. Design and measure source decoding/chunking, final File/Blob/OS handoff and any temporary origin quota together on a real iPhone. No numeric memory budget or broad size-support promise is approved by these results.
4. Implement strict full-package validation/normalization and isolated import of all dependencies; integrate journal ownership, pre-restore roots, GC and archive protection into real save/load/delete. The toy probe's one owned row is not that implementation.
5. Real iPhone Safari: generate → save to Files → independently inspect the file → select it in a fresh test environment → full restore → reload → advance games → save again. Do not erase the user's existing site data to conduct this experiment.

UI-04D and unrelated gameplay changes remain out of scope. #493's original actual-iPhone save/reload confirmation remains a separate pending acceptance condition.
