"""Independent oracle for trusted B-0 probe output; never extracts files."""
import argparse
import hashlib
import json
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('zip_path')
parser.add_argument('--synthetic-bytes', type=int, help='also compare every byte against the deterministic source')
args = parser.parse_args()
if args.synthetic_bytes is not None:
    assert 0 <= args.synthetic_bytes <= 4096 * 256 * 1024

# Independent implementation of the documented probe fixture, retaining only
# one 64 KiB read and expected block. No extraction or whole-ZIP/entry decoding.
seed = 20261023
def expected_block(size):
    global seed
    block = bytearray(size)
    for index in range(size):
        seed ^= (seed << 13) & 0xffffffff
        seed ^= seed >> 17
        seed ^= (seed << 5) & 0xffffffff
        block[index] = seed >> 24
    return block

with zipfile.ZipFile(args.zip_path) as archive:
    infos = archive.infolist()
    names = [info.filename for info in infos]
    assert len(names) == len(set(names)) and len(names) <= 4097
    manifest_info = archive.getinfo("manifest.json")
    assert manifest_info.file_size <= 2 * 1024 * 1024
    manifest = json.loads(archive.read(manifest_info))
    assert manifest["probeFormat"] == 1
    paths = [entry["path"] for entry in manifest["entries"]]
    assert len(paths) == len(set(paths))
    assert set(names) == {"manifest.json", *paths}
    if args.synthetic_bytes is not None:
        count = (args.synthetic_bytes + 256 * 1024 - 1) // (256 * 1024)
        assert paths == [f'archive/{index:06d}.bin' for index in range(count)]
    total = 0
    for index, entry in enumerate(manifest["entries"]):
        assert re.fullmatch(r"archive/[a-zA-Z0-9_-]+\.bin", entry["path"])
        info = archive.getinfo(entry["path"])
        assert info.file_size == entry["bytes"] <= 256 * 1024
        if args.synthetic_bytes is not None:
            assert info.file_size == min(256 * 1024, args.synthetic_bytes - index * 256 * 1024)
        hasher = hashlib.sha256()
        actual = 0
        with archive.open(info) as stream:
            while data := stream.read(64 * 1024):
                if args.synthetic_bytes is not None:
                    assert data == expected_block(len(data)), 'probe_source_mismatch'
                actual += len(data)
                hasher.update(data)
        assert actual == entry["bytes"] and hasher.hexdigest() == entry["sha256"]
        total += actual
    result = {"verified": True, "entries": len(manifest["entries"]), "inputBytes": total}
    if args.synthetic_bytes is not None:
        assert total == args.synthetic_bytes
        result['sourceVerified'] = True
    print(json.dumps(result))
