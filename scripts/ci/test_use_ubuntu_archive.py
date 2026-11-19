"""Regression coverage for hosted-runner Ubuntu mirror configuration."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


spec = importlib.util.spec_from_file_location(
    'use_ubuntu_archive', Path(__file__).with_name('use-ubuntu-archive.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UbuntuArchiveTest(unittest.TestCase):
    def test_ec2_and_azure_sources_use_signed_archive_without_changing_other_sources(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'sources.list.d').mkdir()
            sources = {
                'sources.list': 'deb http://us-east-2.ec2.archive.ubuntu.com/ubuntu noble main\n',
                'sources.list.d/ubuntu.sources': (
                    'URIs: https://eu-west-1.ec2.archive.ubuntu.com/ubuntu/\n'
                    'Suites: noble noble-updates\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'),
                'sources.list.d/azure.list': 'deb https://azure.archive.ubuntu.com/ubuntu noble main\n',
                'apt-mirrors.txt': (
                    'http://us-east-2.ec2.archive.ubuntu.com/ubuntu\tpriority:1\n'
                    'https://archive.ubuntu.com/ubuntu\tpriority:2\n'),
            }
            untouched = (
                'deb https://security.ubuntu.com/ubuntu noble-security main\n'
                'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n')
            (root / 'sources.list.d/other.list').write_text(untouched)
            for name, content in sources.items():
                (root / name).write_text(content)

            module.use_ubuntu_archive(root)

            for name, original in sources.items():
                with self.subTest(path=name):
                    expected = original
                    for host in ('http://us-east-2.ec2.archive.ubuntu.com',
                                 'https://eu-west-1.ec2.archive.ubuntu.com',
                                 'https://azure.archive.ubuntu.com'):
                        expected = expected.replace(host, 'https://archive.ubuntu.com')
                    self.assertEqual((root / name).read_text(), expected)
            self.assertEqual((root / 'sources.list.d/other.list').read_text(), untouched)
            snapshot = {name: (root / name).read_text() for name in sources}
            module.use_ubuntu_archive(root)
            self.assertEqual({name: (root / name).read_text() for name in sources}, snapshot)


if __name__ == '__main__':
    unittest.main()
