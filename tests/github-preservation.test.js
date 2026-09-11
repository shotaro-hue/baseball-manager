import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

test('pitcher details retain GitHub batting fields alongside imported at-bats and sacrifice hits', async () => {
  const source = await readFile(new URL('../src/components/PlayerModal.jsx', import.meta.url), 'utf8');
  const pitcherSection = source.slice(source.indexOf('label="ホールド"'), source.indexOf(') : (', source.indexOf('label="ホールド"')));
  for (const label of ['打席', '打数', '打率', '安打', '打点', 'OPS', '犠打']) {
    assert.ok(pitcherSection.includes(`label="${label}"`), label);
  }
  assert.ok(source.includes('saberBatter(p.stats || {})'));
});

test('title screen retains the GitHub Pages base path', async () => {
  const source = await readFile(new URL('../src/components/TitleScreen.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('href="/baseball-manager/flow-diagram.html"'));
});
