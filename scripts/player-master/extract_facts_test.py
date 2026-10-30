import importlib.util
from pathlib import Path
import unittest
from lxml import html

spec = importlib.util.spec_from_file_location('extract', Path(__file__).with_name('extract-facts.py'))
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

class ExtractFactsTest(unittest.TestCase):
    def test_id_addressed_history_retains_fractional_outs_and_excludes_future_rows(self):
        stats = ['5','1','1','0','0','0','0','0','0','.500','60','12 .2','10','1','4','1','12','0','0','5','4','2.84']
        rows = ''.join('<tr>'+''.join('<td>'+v+'</td>' for v in [str(year),'球団',*stats])+'</tr>' for year in [2022,2025,2026])
        tree = html.fromstring('<table id="tablefix_p"><tbody>'+rows+'</tbody></table>')
        records = extract.profile_history(tree, 'pitcher')
        self.assertEqual([h['year'] for h in records], [2022,2025])
        self.assertEqual([h['outs'] for h in records], [38,38])
        self.assertEqual(records[0]['teamName'], '球団')
    def test_sibling_tables_use_their_own_position_heading(self):
        tree = html.fromstring('<div><h5>一塁手</h5><table><tbody><tr><td>A</td><td>4</td></tr></tbody></table><h5>捕手</h5><table><tbody><tr><td>B</td><td>30</td></tr></tbody></table></div>')
        self.assertEqual([r['position'] for r in extract.fielding_rows(tree,'s')], ['一塁手','捕手'])
    def test_redesigned_pitching_table_retains_outs(self):
        row = ['*検証', '5','1','1','0','0','0','0','0','0','.500','60','12.2','10','1','4','0','1','12','0','0','5','4','2.84']
        table = html.fromstring('<table><tr>'+''.join('<td>'+x+'</td>' for x in row)+'</tr></table>')
        name, stats = extract.statistics(table, 'p', 2025)[0]
        self.assertEqual(name, '検証')
        self.assertEqual(stats['outs'], 38)
        self.assertEqual(stats['SO'], 12)
    def test_invalid_fraction_fails_closed(self):
        table = html.fromstring('<table><tr>'+''.join('<td>'+x+'</td>' for x in ['', '検証']+['1']*11+['12','.4']+['1']*11)+'</tr></table>')
        with self.assertRaises(ValueError): extract.statistics(table, 'p', 2024)

if __name__ == '__main__': unittest.main()
