#!/usr/bin/env python3
"""Extract factual fields from locally cached public pages; never fetch or publish.

Requires Python 3 + lxml. Output is a NEW staging file, not the release file.
Current team tables supply birth dates/hands only, NEVER opening membership.
"""
import argparse
import json
import re
import unicodedata
from pathlib import Path
from lxml import html

CODES = ['s', 'db', 'c', 't', 'g', 'd', 'h', 'e', 'l', 'm', 'f', 'b']
HANDS = {'右': 'right', '左': 'left', '両': 'switch', '左右': 'switch'}


def name_key(name):
    return re.sub(r'[\s・.．]', '', unicodedata.normalize('NFKC', name)).replace('廣', '広').replace('髙', '高').replace('﨑', '崎')


def cells(tr):
    return [' '.join(c.text_content().split()) for c in tr.xpath('./th|./td')]


def fielding_rows(tree, code):
    result = []
    for table in tree.xpath('//table'):
        heading = table.xpath('preceding-sibling::h5[1]/text()')
        if not heading:
            continue
        for tr in table.xpath('.//tbody/tr'):
            c = cells(tr)
            if len(c) > 1 and c[1].isdigit():
                result.append({'name': c[0], 'position': heading[0], 'games': int(c[1]), 'teamCode': code})
    return result


def profile(tree):
    bio = {c[0]: c[1] for tr in tree.xpath('//*[@id="pc_bio"]//tr') if len(c := cells(tr)) == 2}
    birthday = re.fullmatch(r'(\d+)年(\d+)月(\d+)日', bio.get('生年月日', ''))
    hand = re.fullmatch(r'([右左])投([右左両])打', bio.get('投打', ''))
    if not birthday or not hand:
        raise ValueError('Missing profile birth date/hands')
    return {'birthDate': '-'.join(f'{int(v):04d}' if i == 0 else f'{int(v):02d}' for i, v in enumerate(birthday.groups())),
            'throws': HANDS[hand[1]], 'bats': HANDS[hand[2]], 'draft': bio.get('ドラフト'), 'background': bio.get('経歴')}


def profile_history(tree, kind):
    keys = (['G','PA','AB','R','H','2B','3B','HR','TB','RBI','SB','CS','SH','SF','BB','HBP','SO','GDP','AVG','SLG','OBP'] if kind == 'batter'
            else ['G','W','L','SV','HLD','HP','CG','SHO','noBB','winRate','BF','innings','H','HR','BB','HBP','SO','WP','BK','R','ER','ERA'])
    suffix = 'b' if kind == 'batter' else 'p'
    result = []
    for tr in tree.xpath(f'//*[@id="tablefix_{suffix}"]/tbody/tr'):
        c = cells(tr)
        if not c or not re.fullmatch(r'\d{4}', c[0]) or int(c[0]) > 2025:
            continue
        if len(c) != len(keys)+2:
            raise ValueError(f'Unexpected profile history columns: {c[:2]}')
        if re.search(r'通算|合計|^\d+球団', c[1]):
            continue
        row = {'year': int(c[0]), 'teamName': c[1]}
        for key, raw in zip(keys, c[2:]):
            if key == 'innings':
                innings = re.fullmatch(r'(\d+)(?:\.([012]))?', re.sub(r'\s', '', raw))
                if not innings:
                    raise ValueError(f'Invalid profile innings: {raw}')
                row['outs'] = int(innings[1])*3 + int(innings[2] or 0)
            elif raw not in ['-', '--', '']:
                row[key] = float(raw) if '.' in raw else int(raw)
        result.append(row)
    return result


def statistics(tree, kind, year):
    """Historical team tables have separate whole/fractional innings cells."""
    result = []
    keys = (['G','PA','AB','R','H','2B','3B','HR','TB','RBI','SB','CS','SH','SF','BB','IBB','HBP','SO','GDP','AVG','SLG','OBP'] if kind == 'b'
            else ['G','W','L','SV','HLD','HP','CG','SHO','noBB','winRate','BF','wholeIP','fractionIP','H','HR','BB','IBB','HBP','SO','WP','BK','R','ER','ERA'])
    for tr in tree.xpath('//tr'):
        c = cells(tr)
        # 2025's redesigned table folds the throwing marker into the name and
        # the fractional innings into a single cell. Expand to the older shape.
        if kind == 'b' and len(c) == len(keys)+1:
            c = ['', c[0].lstrip('*+'), *c[1:]]
        elif kind == 'p' and len(c) == len(keys):
            innings = re.fullmatch(r'(\d+)(?:\.([12]))?', c[12])
            if innings:
                c = ['', c[0].lstrip('*+'), *c[1:12], innings[1], '.'+innings[2] if innings[2] else '', *c[13:]]
        if len(c) != len(keys)+2 or not c[2].isdigit():
            continue
        row = {'year': year}
        for key, raw in zip(keys, c[2:]):
            if key == 'fractionIP':
                if raw not in ['', '.1', '.2']:
                    raise ValueError(f'Invalid fractional innings: {raw}')
                row[key] = int(raw[-1]) if raw else 0
            elif raw not in ['-', '--', '']:
                row[key] = float(raw) if '.' in raw else int(raw)
        if kind == 'p':
            row['outs'] = row.pop('wholeIP')*3 + row.pop('fractionIP')
        result.append((c[1], row))
    if not result:
        raise ValueError(f'No {year} {kind} observations')
    return result


def extract(directory, reference):
    facts, observations, fielding = {}, [], []
    for code in CODES:
        tree = html.fromstring((directory/f'team_{code}.html').read_bytes())
        for tr in tree.xpath('//tr[@class="rosterPlayer"]'):
            links = tr.xpath('.//a[contains(@href,"/bis/players/")]/@href')
            c = cells(tr)
            if not links:
                continue
            pid = 'npb:'+links[0].split('/')[-1].split('.')[0]
            value = {'birthDate': c[2].replace('.', '-'), 'throws': HANDS[c[5]], 'bats': HANDS[c[6]],
                     'sourceUrl': f'https://npb.jp/bis/teams/rst_{code}.html'}
            if pid in facts and any(facts[pid][k] != value[k] for k in ['birthDate', 'throws', 'bats']):
                raise ValueError(f'Conflicting profile: {pid}')
            facts[pid] = value
        tree = html.fromstring((directory/f'fielding_{code}.html').read_bytes())
        fielding.extend(fielding_rows(tree, code))
    for p in reference['players']:
        pid = p['playerId']
        path = directory/f"profile-{pid.split(':')[1]}.html"
        if not path.exists():
            raise ValueError(f'Missing ID-addressed profile: {pid}')
        if path.exists():
            tree = html.fromstring(path.read_bytes())
            value = profile(tree)
            if pid in facts and facts[pid]['birthDate'] != value['birthDate']:
                raise ValueError(f'Conflicting birth date: {pid}')
            facts[pid] = {**facts.get(pid, {}), **value, 'sourceUrl': f"https://npb.jp/bis/players/{pid.split(':')[1]}.html"}
            for row in profile_history(tree, p['kind']):
                observations.append({'playerId': pid, **row})
        if pid not in facts:
            raise ValueError(f'Missing stable attributes: {pid}')
    return {'asOf': reference['asOf'], 'facts': {p['playerId']: facts[p['playerId']] for p in reference['players']},
            'observations': observations, 'fielding': fielding}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('reference', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists() or Path(__file__).resolve().parents[2] in args.output.resolve().parents:
        parser.error('Output must be a new file outside the repository')
    result = extract(args.directory, json.loads(args.reference.read_text()))
    with args.output.open('x') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({'profiles': len(result['facts']), 'observations': len(result['observations']), 'fielding': len(result['fielding'])}))
