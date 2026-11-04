# Posting qualification evidence / bonus-pool exemption

Base main `3f6a665dcf163b119ab0a3aa9fe04a34a064995f` (#546 merged).
This is the next independent prerequisite identified by #546, not a market
implementation or a new financial/acceptance policy.

## Scope and choices

Provide a pure, versioned evidence normalizer and bonus-pool exemption assessor,
plus a read-only opening-master lookup by `realPlayerId`. Keep this separate
from game `age`, `serviceYears`, FA, nationality/quota and performance summaries.
Do not change players, requests, receipts, finances, public gate or storage.

Alternatives: counting entry-year differences or history rows would misclassify
missing/foreign/development seasons; importing a complete recognition dataset
requires additional documented facts. Use explicit source-backed evidence and
return unknown when it cannot establish the conditions. This is an implementation
choice within the approved evidence-first direction, not a new price decision.

MLB's [posting glossary](https://www.mlb.com/glossary/transactions/japanese-posting-system)
and [bonus-pool glossary](https://www.mlb.com/glossary/transactions/international-amateur-free-agency-bonus-pool-money)
were checked 2026-11-04: the exemption requires age 25 and six recognized pro
seasons. These are exemption conditions, not a posting-request minimum or full
MLB signing eligibility. Registration windows, birthplace/draft classification,
contract forms and bonus-pool capacity remain future market prerequisites.
RuleVersion1 freezes the reviewed conditions; it is not an automatic future
rule-update service or a claim that every foreign professional is in this class.

## Interfaces and facts

`normalizePostingQualificationEvidence(input)` accepts exactly:

```
{version:1, playerId, sourcePlayerId:null|id,
 birthDate:null|{date,sourceIds:[nonempty strings]},
 professionalSeasons:null|{asOfDate,coverage:'partial'|'complete',
   seasons:[{season,sourceIds:[nonempty strings]}]}}
```

Dates use the existing strict civil calendar. IDs include numeric 0. Reject
unknown fields/versions, malformed dates, missing provenance, duplicate season
years (including different teams/leagues), future seasons and impossible
pre-birth records. Sparse season/source arrays are invalid, not implicit facts.
Sort cloned evidence to make JSON/repeat results stable.
Null means unrecorded, not zero. Complete with an empty season set is known zero;
partial empty evidence proves no upper bound. Evidence completeness is a supplied
documented fact, never inferred by the normalizer or from a source URL alone.

`assessPostingBonusPoolExemption(evidence, signingDate)` returns the normalized
evidence, player/date, exact age or null, known recognized-season count or null,
and `exemption:'exempt'|'restricted'|'unknown'` with reasons and ruleVersion1.
One known failed condition establishes restricted. Both proven conditions
establish exempt. Otherwise unknown. A lower bound of six documented seasons
remains sufficient later; fewer than six establishes failure only for complete
evidence current on that exact signing date. Reject future-asOf evidence. Do not
promote a partial/stale list to complete or fill years between entries. The result
does not grant permission to any existing command.

`createOpeningPostingQualificationLookup(master=release) -> (player) -> evidence`
validates/indexes the opening data once and snapshots just the required facts.
Match stable `realPlayerId`, never names. For a documented birthDate, require its
matching official NPB player-profile source to be present in both row and master.
Return professionalSeasons:null for every current opening row: no complete MLB
recognition evidence exists there. Historical G/entryYear are not converted.
Unmatched/fictional players return explicit unknowns. Malformed identified source
facts reject rather than falling back to gameAge. No new live-player birth field.

## Ownership and limits

All 1059 bundled rows contain birthdays/profile references; 706 contain some
performance history, and none contain an explicit recognized-season collection.
The generated player retains realPlayerId but drops birthDate. A scoped lookup
uses the existing master owner without duplicating it in engine/save state.
This stage produces inspectable facts/results only; future market producer must
bind the evidence snapshot to its own player/save/epoch and validate provenance.
Schema validation is not source authentication. No new data import/publication.

Keep pending/approved requests blocked at the existing boundary. Full historical
and generated-season evidence production, pricing/acceptance, scoped RNG, market
outcomes, UI/CPU/rollover/Worker, receipt persistence and activation are later work.
Public gate OFF, schemaVersion1/DB5, legacy and #543–546 behavior unchanged.

## Acceptance

RED→GREEN: exact birthday/leap-day boundaries; 5/6 seasons; partial, complete-zero,
stale and missing evidence; duplicate/future/pre-birth facts; source/ID errors;
no mutation, stable sorted JSON and repeated calls. Real generated young player
gives a justified restricted result, older player with unknown pro history does
not receive an exemption; changed age/serviceYears/name/quota do not change this.
Unknown legacy/generated player stays unknown. Do not fabricate a real six-season
certificate to obtain a positive exempt case. Verify existing application,
posting money, save and player-master regressions; independent review and exact
submitted HEAD CI. No merge, auto-merge or main push.
