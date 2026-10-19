"""Offline conversion; requires the official FBX2glTF v0.9.7 executable.

python tools/convert-modular-scifi.py path/to/FBX2glTF.exe
No converter or Python dependency is needed to use the resulting GLBs.
"""
from pathlib import Path
import hashlib
import json
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'assets/environments/quaternius-ultimate-modular-scifi'
SOURCE_URL = 'https://quaternius.com/packs/ultimatemodularscifi.html'
LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convert(executable):
    executable = Path(executable).resolve()
    entries = []
    sources = sorted((PACK / 'source/FBX').rglob('*.fbx'))
    if not sources:
        raise ValueError('No source FBX files found')
    for source in sources:
        relative = source.relative_to(PACK / 'source/FBX')
        output = PACK / 'models' / relative.with_suffix('.glb')
        output.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run([
            str(executable), '--binary', '--input', str(source),
            '--output', str(output.with_suffix('')),
        ], capture_output=True, text=True, check=True)
        # Retain the converter's BIN chunk unchanged; add portable credit to glTF metadata.
        blob = output.read_bytes()
        magic, version, length = struct.unpack_from('<III', blob)
        if (magic, version, length) != (0x46546C67, 2, len(blob)):
            raise ValueError(f'Invalid GLB: {output}')
        json_length, kind = struct.unpack_from('<II', blob, 12)
        if kind != 0x4E4F534A:
            raise ValueError('Expected JSON chunk')
        doc = json.loads(blob[20:20 + json_length])
        doc['asset']['copyright'] = 'Quaternius — CC0 1.0 Universal'
        doc['asset']['extras'] = {'sourceURL': SOURCE_URL, 'license': 'CC0-1.0',
                                  'licenseURL': LICENSE_URL}
        encoded = json.dumps(doc, ensure_ascii=True, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        tail = blob[20 + json_length:]
        output.write_bytes(struct.pack('<IIIII', magic, version,
                           20 + len(encoded) + len(tail), len(encoded), kind) + encoded + tail)
        triangles = sum(doc['accessors'][p['indices']]['count'] // 3
                        for m in doc.get('meshes', []) for p in m['primitives'])
        entries.append({'id': relative.with_suffix('').as_posix(),
                        'name': source.stem, 'source': source.relative_to(PACK).as_posix(),
                        'sourceSha256': sha(source), 'sourceBytes': source.stat().st_size,
                        'url': output.relative_to(PACK).as_posix(),
                        'sha256': sha(output), 'bytes': output.stat().st_size,
                        'triangles': triangles, 'materials': len(doc.get('materials', [])),
                        'animations': len(doc.get('animations', []))})
        if 'warning' in result.stdout.lower() or result.stderr.strip():
            print(source.name, result.stdout, result.stderr)
    manifest = {'author': 'Quaternius', 'title': 'Ultimate Modular Sci-Fi Pack',
                'sourceURL': SOURCE_URL, 'license': 'CC0-1.0', 'licenseURL': LICENSE_URL,
                'licenseEvidence': 'Official pack listing links CC0 1.0 Universal; verified 2026-10-18. No license file accompanied the user-supplied FBX directory.',
                'acquisition': '91 FBX files supplied by the user in assets/FBX; moved unchanged into source/FBX. This is the supplied subset, not a claim of complete upstream contents.',
                'conversion': {'tool': 'FBX2glTF v0.9.7',
                               'sourceURL': 'https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7',
                               'executableSha256': sha(executable),
                               'options': ['--binary'],
                               'postprocess': 'Add creator, license and source URL to asset metadata; preserve binary chunk and all transforms.',
                               'script': 'tools/convert-modular-scifi.py'},
                'models': entries}
    (PACK / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Converted {len(entries)} models ({sum(e["bytes"] for e in entries):,} bytes)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    convert(sys.argv[1])
