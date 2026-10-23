# SAVE-01B-0 — portable backup technical probes

Date: 2026-10-23. Base main: `7dc29c0809526ce937e9948b9a0940c7287dc38d`.

## Follow-up after #495 merge

The statements below describe the isolated #495 evidence at its recorded head. The subsequent [SAVE-01B-0A](../archive-lock/README.md) integrates updated production mutations with `baseball-manager-archive`. This is a different name from the isolated probe lock; existing `withProbeSnapshot` results still do not certify production snapshot safety. Old tabs/raw writers, same-ID replacement and root/archive correspondence remain unresolved. The historical save-lock-only bypass characterization is retained because that observation is still true.

## Decision

Keep design PR [#494](https://github.com/shotaro-hue/baseball-manager/pull/494) open. These executable experiments inform that design; they do not freeze the package format or complete SAVE-01B-0's real-device gate. The game import graph, production save code, DB schema and existing saves are unchanged.

The next implementation decisions must address **archive/root commit correspondence** and **source decoding memory**, before calling any ZIP a complete portable backup.

## Latest P2/P3 follow-up validation (2026-10-23)

- Focused permanent Vitest **21/21**; explicit historical characterization **2/2**; Ubuntu mirror regression **2/2**. Earlier focused total was 21 including 2 unsafe observations; this change relocates those 2 and adds 2 permanent oracle cases. No assertion is removed or weakened and no skip is added.
- Final separate browser runs: permanent probes **Chromium 13/13, mobile WebKit 13/13**, historical writer observation **1/1 per browser**. Total coverage remains **14 per browser**, split by responsibility. All use **1 worker / retry 0**. The first combined run also passed 28/28 before final collection exclusions were corrected; it is not the separate-suite evidence.
- Production build passed with only the existing large-chunk warning. Product storage code and schema are unchanged.
- RED→GREEN: a structurally valid ZIP with self-consistent CRC/manifest hashes but incorrect expected source initially passed the Python oracle. It now fails `probe_source_mismatch`; correct multi-entry input and partial tail pass, wrong size fails. Missing/unlisted/duplicate ZIP entries, duplicate manifest rows and changed content/hash are rejected.
- Local full Vitest on Node 20.20.2 / 1 worker stopped making progress at existing `src/App.deleteLoad.integration.test.js`; interrupted (exit 130), **not passed**. That unchanged file separately passed **10/10** in 4.94 s. Cause is not established. The prior successful configuration (maxWorkers=2/minWorkers=1) and exact-head GitHub CI are separate completion gates; their final outcomes/SHA are recorded in [PR #495](https://github.com/shotaro-hue/baseball-manager/pull/495). Earlier counts below must not stand in for these results.

### Characterization ownership and retirement

| Responsibility | Files | CI result policy |
|---|---|---|
| Permanent correctness (legacy isolation/strict reads, journal, lock order/release/recovery, ZIP/handoff) | `tests/save-01b0-*.test.js`, `e2e/save-01b0.spec.js` | Required regression gate; failure/cancellation/nonexecution is not success |
| Known root/archive mismatch and same-ID mutable archive | `tests/characterization/save-01b0-storage.test.js` | Explicit advisory step on every PR, all assertions retained, separate JSON report |
| Known writer bypassing save lock across tabs | `e2e/characterization/save-01b0.spec.js` | Explicit advisory step in both browsers on every PR, separate JSON/trace report |

The default Vitest and Playwright configs exclude only the historical characterization directory. Dedicated configs include it explicitly. CI reuses the existing probe matrix job/browser install and uploads both reports. Only the two characterization steps use `continue-on-error`; their **raw `outcome`** (not the rewritten conclusion) is displayed in the job summary, and any failure/skipped/cancelled outcome emits a visible warning. A changed observation is **not** a successful reproduction or proof of a fix. All ordinary regression/build steps and the aggregate gate retain hard failures. At this head the unsafe behavior still reproduces successfully; no existing defect is claimed fixed or hidden.

When an immutable archive or participating writer corrects these behaviors, inspect the report, add positive regression coverage for committed root/archive correspondence, same-ID immutability or actual cross-tab exclusion, then retire/update the obsolete characterization in the **same reviewed fix**. Do not make the old bug a required product behavior, change its expectation just for green checks, or skip its execution. Infrastructure failures also require inspection of the advisory report; green job status alone cannot prove successful reproduction.

### Actual 16/64 MiB ZIP readback

Both browsers now download the **actual generated File** via a Blob URL. Python `zipfile` reads 64 KiB blocks and verifies every manifest path, exact set/count (including duplicate/missing/unlisted detection), uncompressed size, CRC and SHA-256, then independently reconstructs the deterministic xorshift32 source and compares **every restored byte**. A self-consistent but wrong ZIP is therefore rejected. Neither the browser nor Python expands the entire ZIP. The source generator retains state across all 256 KiB entries.

For each browser, 64 MiB input produced **67,177,540 bytes, 256 data entries + manifest**, and every source/hash check passed; 16 MiB produced **16,794,445 bytes, 64 data entries + manifest**. Final 64 MiB cases including generation/download/Python took about **27.9 s Chromium / 31.7 s WebKit** on this host. Measurements are observations under concurrent host workload, not performance thresholds or RAM measurements. The normal probe CI runs both sizes/readbacks in both browsers; there is no manual-only integrity gap. Successfully verified deterministic capacity ZIPs are removed after JSON evidence is attached, avoiding 160 MiB of redundant incompressible artifacts per CI run; failures retain downloaded files. The 1 MiB handoff ZIP evidence is retained.

`browser-evidence.json` separates the latest regression and characterization results and retains the previous head's environment failures under `previousEvidence`. Local WebKit uses the existing official binary plus the previously extracted Ubuntu library lookup wrapper, as before. This is **not real iPhone evidence**, Files persistence, complete save export/import, peak-memory measurement or a 20-year real simulation. No new design fact requires changing #494; it remains the design authority.

## Prior review results (`56abedad`, historical)

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
- ZIP generation uses <=256 KiB source entries, SHA-256 manifests and Blob parts. A separate later click performs share/download. At the prior head, browser-downloaded 1 MiB files were checked by Python `zipfile`/`hashlib`, independently of fflate. Forced unsupported sharing, simulated native cancellation, preparation cancellation and retry are covered. Actual iOS sharing and Files persistence remain untested.
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
npx vitest run tests/save-01b0-storage.test.js tests/save-01b0-journal.test.js tests/save-01b0-zip.test.js --maxWorkers=1 --minWorkers=1
npx vitest run --config scripts/save-01b0/vitest.characterization.config.js
npx playwright test --config scripts/save-01b0/playwright.config.js --workers=1 --retries=0
npx playwright test --config scripts/save-01b0/playwright.characterization.config.js --workers=1 --retries=0
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
