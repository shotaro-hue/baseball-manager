"""Keep signed Ubuntu sources, replacing cloud mirrors behind apt mirror lists."""
from pathlib import Path
import re
import sys


def use_ubuntu_archive(apt_root):
    paths = [apt_root / 'sources.list',
             *(apt_root / 'sources.list.d').glob('*.sources'),
             *(apt_root / 'sources.list.d').glob('*.list'),
             *apt_root.glob('apt-mirrors*.txt')]
    for path in paths:
        if not path.is_file():
            continue
        original = path.read_text()
        updated = re.sub(
            r'https?://(?:azure|[a-z0-9-]+\.ec2)\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)',
            'https://archive.ubuntu.com/ubuntu', original)
        if updated != original:
            path.write_text(updated)
            print(f'Updated Ubuntu archive: {path}')


if __name__ == '__main__':
    use_ubuntu_archive(Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/etc/apt'))
