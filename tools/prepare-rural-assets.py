"""Offline pack preparation. Run with Python and an installed Blender executable.

python tools/prepare-rural-assets.py "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
Original ZIPs are read only. City glTFs keep shared textures instead of duplicating
them into hundreds of GLBs. Blender runs with embedded-script execution disabled.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / 'assets/environments'
FARM = ENV / 'quaternius-farm-buildings'
CITY = ENV / 'quaternius-downtown-city'
URLS = ['https://quaternius.com/packs/farmbuildings.html',
        'https://quaternius.itch.io/downtown-city-megakit']


def record(path, base):
    raw = path.read_bytes()
    return {'url': path.relative_to(base).as_posix(), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def document(path):
    raw = path.read_bytes()
    if path.suffix == '.glb':
        assert struct.unpack_from('<I', raw, 8)[0] == len(raw)
        return json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    return json.loads(raw)


def catalog(base, source, archive):
    models = []
    for path in sorted((base / 'models').glob('*')):
        if path.suffix not in ('.glb', '.gltf'):
            continue
        doc = document(path)
        row = record(path, base)
        row.update(id=path.stem, triangles=sum(
            doc['accessors'][p.get('indices', p['attributes']['POSITION'])]['count'] // 3
            for m in doc.get('meshes', []) for p in m['primitives']),
            materials=len(doc.get('materials', [])), animations=len(doc.get('animations', [])))
        if base == CITY:
            original = 'Exports/glTF (Godot)/' + path.name
            with zipfile.ZipFile(archive) as source_zip:
                row.update(sourceArchivePath=original,
                           sourceSha256=hashlib.sha256(source_zip.read(original)).hexdigest())
        models.append(row)
    files = [record(p, base) for p in sorted(base.rglob('*'))
             if p.is_file() and p.name not in ('provenance.json', 'README.md')]
    result = dict(author='Quaternius', license='CC0-1.0', source=source,
                  archive=record(archive, ROOT), models=models, files=files)
    (base / 'provenance.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def export_farm():
    import bpy
    for path in sorted((FARM / 'source').glob('*.blend')):
        bpy.ops.wm.open_mainfile(filepath=str(path), use_scripts=False)
        # These 2018 files use legacy diffuse shaders, which the glTF exporter
        # otherwise emits without their viewport colors. Preserve those colors
        # explicitly in a supported matte Principled material.
        for material in bpy.data.materials:
            color = tuple(material.diffuse_color)
            material.use_nodes = True
            material.node_tree.nodes.clear()
            shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
            shader.inputs['Base Color'].default_value = color
            shader.inputs['Roughness'].default_value = .85
            output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
            material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        bpy.ops.object.select_all(action='DESELECT')
        for obj in bpy.context.scene.objects:
            if obj.type in ('MESH', 'EMPTY'):
                obj.hide_set(False)
                obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(FARM / 'models' / (path.stem + '.glb')),
                                  export_format='GLB', use_selection=True,
                                  export_animations=False, export_cameras=False,
                                  export_lights=False, export_yup=True,
                                  export_copyright='Quaternius / CC0-1.0')
    print('FARM_EXPORT_COMPLETE', bpy.app.version_string)


def prepare(blender):
    def archive_path(name):
        cached = ROOT / '.asset-imports' / name
        return cached if cached.exists() else ROOT / 'assets' / name
    farm_zip = archive_path('Blend-20261021T010719Z-1-001.zip')
    city_zip = archive_path('Downtown City MegaKit[Standard].zip')
    for base in (FARM, CITY):
        (base / 'models').mkdir(parents=True, exist_ok=True)
    (FARM / 'source').mkdir(exist_ok=True)
    with zipfile.ZipFile(farm_zip) as archive:
        for name in archive.namelist():
            if name.endswith('.blend'):
                (FARM / 'source' / PurePosixPath(name).name).write_bytes(archive.read(name))
    with zipfile.ZipFile(city_zip) as archive:
        prefix = 'Exports/glTF (Godot)/'
        models = [name for name in archive.namelist() if name.startswith(prefix) and name.endswith('.gltf')]
        needed = set(models)
        for name in models:
            doc = json.loads(archive.read(name))
            for entry in doc.get('buffers', []) + doc.get('images', []):
                uri = entry.get('uri')
                if uri and not uri.startswith('data:'):
                    assert PurePosixPath(uri).name == uri, 'Expected pack-local flat dependencies'
                    needed.add(prefix + uri)
        for name in sorted(needed):
            raw = archive.read(name)
            if name.endswith('.gltf'):
                doc = json.loads(raw)
                # Upstream COLOR_0 encodes shader wear masks, not visible paint.
                # Standard glTF multiplies it into the surface color (red roads).
                for mesh in doc.get('meshes', []):
                    for primitive in mesh['primitives']:
                        primitive['attributes'].pop('COLOR_0', None)
                raw = (json.dumps(doc, separators=(',', ':')) + '\n').encode()
            (CITY / 'models' / PurePosixPath(name).name).write_bytes(raw)
        (CITY / 'LICENSE.txt').write_bytes(archive.read('License_Standard.txt'))
    (FARM / 'LICENSE.txt').write_text(
        'Farm Buildings Pack by Quaternius\nCC0 1.0 Universal\n'
        'https://creativecommons.org/publicdomain/zero/1.0/\n'
        'License recorded from the original pack page: ' + URLS[0] + '\n'
        'No license document was included in the user-supplied farm archive.\n')
    with (FARM / 'conversion.log').open('w') as log:
        subprocess.run([str(Path(blender).resolve()), '--background', '--disable-autoexec',
                        '--threads', '2', '--python', str(Path(__file__).resolve()), '--',
                        '--blender-export'], check=True, stdout=log, stderr=subprocess.STDOUT)
    for base, url, archive in zip((FARM, CITY), URLS, (farm_zip, city_zip)):
        result = catalog(base, url, archive)
        print(base.name, len(result['models']), 'models;',
              sum(m['triangles'] for m in result['models']), 'triangles;',
              sum(f['bytes'] for f in result['files']), 'retained bytes')


if __name__ == '__main__':
    if '--blender-export' in sys.argv:
        export_farm()
    else:
        prepare(sys.argv[1])
