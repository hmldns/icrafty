# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Fetch the pinned STEP sample and license, verifying both before replacement."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


def main() -> None:
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / "sample.json").read_text())
    files = [
        (manifest["url"], manifest["file"], manifest["sha256"]),
        (manifest["licenseUrl"], manifest["licenseFile"], manifest["licenseSha256"]),
    ]
    verified = []
    for url, name, digest in files:
        with urlopen(url, timeout=30) as response:
            data = response.read(2_000_001)
        if len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Digest/size mismatch for {name}; keeping existing files")
        verified.append((name, digest, data))
    for name, digest, data in verified:
        destination = root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".download")
        temporary.write_bytes(data)
        temporary.replace(destination)
        print(f"Verified {name}: {len(data)} bytes, SHA-256 {digest}")


if __name__ == "__main__":
    main()
