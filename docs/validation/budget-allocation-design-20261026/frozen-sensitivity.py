"""Budget sensitivity on #503's frozen CPU actions, not a new playthrough."""
import csv
import gzip
import hashlib
import json
import math
import re
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
BASELINE = ROOT / 'docs/validation/cpu-finance-long-20261025'
SEEDS = [20261015, 20261016, 20261017]
sources = {}
runs = []
for seed in SEEDS:
    path = BASELINE / f'seed-{seed}.json.gz'
    sources[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    run = json.loads(gzip.decompress(path.read_bytes()))['seeds'][0]
    assert run['status'] == 'passed' and len(run['seasons']) == 10
    runs.append(run)

constants = (ROOT / 'src/constants.js').read_text()
bases = {int(i): int(b) for i, b in re.findall(r'\{ id:\s*(\d+),[^\n]+budget:\s*(\d+)', constants)}
assert set(bases) == set(range(12))
sources['src/constants.js'] = hashlib.sha256(constants.encode()).hexdigest()
# JavaScript Math.round, including negative half values.
def rounded(value):
    return math.floor(value + .5)

def distribution(values):
    return {'min': min(values), 'median': statistics.median(values),
            'mean': statistics.mean(values), 'max': max(values)}

options = [('current', .6, 1), ('annual-only', .3, 1),
           ('season-half', .6, .5), ('season-quarter', .6, .25),
           ('combined-half', .3, .5), ('combined-quarter', .3, .25)]
summaries = []
annual_rows = []
for name, annual_rate, season_share in options:
    rows = []
    for run in runs:
        previous = None
        for season in run['seasons']:
            for opening in season['phases']['start']:
                tid = opening['id']
                if tid == 0:
                    continue
                financial = next(f for f in season['financial'] if f['teamId'] == tid)
                market = next(t for t in season['phases']['market'] if t['id'] == tid)
                if previous is None:
                    candidate_opening = opening['budget']
                else:
                    old = next(f for f in previous['financial'] if f['teamId'] == tid)
                    candidate_opening = max(rounded(bases[tid] * .5), rounded(
                        bases[tid] + rounded(old['operatingSurplus'] * annual_rate) - opening['payroll']))
                offset = candidate_opening - opening['budget']
                surplus = financial['operatingSurplus']
                projected = market['budget'] + offset + rounded(surplus * season_share) - surplus
                row = {'candidate': name, 'seed': run['seed'], 'year': season['year'], 'teamId': tid,
                       'marketBudget': projected, 'originalMarketBudget': market['budget'],
                       'currentPayroll': market['payroll'], 'operatingSurplus': surplus,
                       'openingBudget': candidate_opening}
                if name == 'current':
                    assert projected == market['budget']
                    assert candidate_opening == opening['budget']
                rows.append(row)
            previous = season
    assert len(rows) == 330
    annual_rows.extend(rows)
    summaries.append({'candidate': name, 'annualAllocationRate': annual_rate, 'seasonAllocationRate': season_share,
                      'cpuClubSeasons': len(rows), 'marketBudget': distribution([r['marketBudget'] for r in rows]),
                      'budgetToPayrollMedian': statistics.median(r['marketBudget'] / r['currentPayroll'] for r in rows),
                      'marketBelowZero': sum(r['marketBudget'] < 0 for r in rows),
                      'marketBelow10Oku': sum(r['marketBudget'] < 100000 for r in rows),
                      'marketBelow25Oku': sum(r['marketBudget'] < 250000 for r in rows),
                      'marketAtLeast50Oku': sum(r['marketBudget'] >= 500000 for r in rows)})

result = {'status': 'projection-only', 'date': '2026-10-26',
          'mainCommit': '677c14fb5f96723846d01d0f72c25ac6a0d651b7', 'units': '万円',
          'sourceSha256': sources, 'analysisSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'baselineReconciledRows': 330, 'candidates': summaries,
          'limitations': ['Frozen 2026-2035 CPU contracts, prices, roster, player growth and transfers; no new game simulation.',
                          'No dynamic CPU re-selection, budget-below-zero timing, playoffs, owner-trust variation, user investment or bank-capacity acceptance.',
                          'Only sampled market endpoints are projected; liquidity between them is unmeasured.',
                          'A payroll comparison describes spending capacity, not an amount of unpaid salary.']}
(HERE / 'sensitivity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
with (HERE / 'frozen-candidates.csv').open('w', newline='') as out:
    writer = csv.DictWriter(out, fieldnames=list(annual_rows[0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(annual_rows)
print(json.dumps({'status': result['status'], 'baselineReconciledRows': 330, 'candidates': summaries}, indent=2))
