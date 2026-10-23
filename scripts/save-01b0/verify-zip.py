"""Independent oracle for trusted B-0 probe output; never extracts files."""
import hashlib
import json
import re
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
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
    total = 0
    for entry in manifest["entries"]:
        assert re.fullmatch(r"archive/[a-zA-Z0-9_-]+\.bin", entry["path"])
        info = archive.getinfo(entry["path"])
        assert info.file_size == entry["bytes"] <= 256 * 1024
        hasher = hashlib.sha256()
        actual = 0
        with archive.open(info) as stream:
            while data := stream.read(64 * 1024):
                actual += len(data)
                hasher.update(data)
        assert actual == entry["bytes"] and hasher.hexdigest() == entry["sha256"]
        total += actual
    print(json.dumps({"verified": True, "entries": len(manifest["entries"]), "inputBytes": total}))
