import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const format of ['legacy', 'mirror-list']) it(`CI Ubuntu archive replacement handles ${format} sources without changing trust`, () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-apt-'));
  try {
    mkdirSync(join(root, 'sources.list.d'));
    const source = format === 'legacy' ? 'sources.list' : 'sources.list.d/ubuntu.sources';
    const input = format === 'legacy'
      ? 'deb http://azure.archive.ubuntu.com/ubuntu noble main\n'
      : 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
    writeFileSync(join(root, source), input);
    writeFileSync(join(root, 'apt-mirrors.txt'), 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\n');
    writeFileSync(join(root, 'apt-mirrors-security.txt'), 'http://azure.archive.ubuntu.com/ubuntu\n');
    writeFileSync(join(root, 'sources.list.d/vendor.list'), 'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n');
    const run = () => spawnSync('python3', ['scripts/ci/use-ubuntu-archive.py', root], { encoding: 'utf8' });
    expect(run().status).toBe(0);
    expect(readFileSync(join(root, source), 'utf8')).toBe(format === 'legacy'
      ? input.replace('http://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu') : input);
    for (const file of ['apt-mirrors.txt', 'apt-mirrors-security.txt']) {
      const content = readFileSync(join(root, file), 'utf8');
      expect(content).not.toContain('azure.archive.ubuntu.com');
      expect(content).toContain('https://archive.ubuntu.com/ubuntu');
    }
    const mirrors = readFileSync(join(root, 'apt-mirrors.txt'), 'utf8');
    expect(mirrors).toContain('\tpriority:1'); expect(mirrors).toContain('\tpriority:2');
    expect(readFileSync(join(root, 'sources.list.d/vendor.list'), 'utf8')).toContain('https://packages.microsoft.com');
    expect(run().status).toBe(0);
    expect(readFileSync(join(root, 'apt-mirrors.txt'), 'utf8')).toBe(mirrors);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
