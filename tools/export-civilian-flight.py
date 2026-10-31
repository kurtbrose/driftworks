"""Derive immutable material batches from the approved local GLBs; no Blender required."""
import json
import hashlib
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1] / 'assets/ships/civilian-airliners'


def export(name):
    source = (ROOT / (name + '.glb')).read_bytes()
    length = struct.unpack_from('<I', source, 12)[0]
    gltf = json.loads(source[20:20 + length])
    binary = source[28 + length:]

    def accessor(index):
        a = gltf['accessors'][index]
        view = gltf['bufferViews'][a['bufferView']]
        width = {'VEC3': 3, 'SCALAR': 1}[a['type']]
        code = {5126: 'f', 5123: 'H', 5125: 'I'}[a['componentType']]
        size = struct.calcsize(code)
        start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = view.get('byteStride', width * size)
        return [struct.unpack_from('<' + code * width, binary, start + i * stride)
                for i in range(a['count'])]

    def rotate(p, q):
        x, y, z, w = q
        u = [2 * (y * p[2] - z * p[1]), 2 * (z * p[0] - x * p[2]), 2 * (x * p[1] - y * p[0])]
        return [p[0] + w*u[0] + y*u[2] - z*u[1],
                p[1] + w*u[1] + z*u[0] - x*u[2],
                p[2] + w*u[2] + x*u[1] - y*u[0]]

    groups = {}
    for node in gltf['nodes']:
        assert not node.get('children') and not node.get('matrix'), 'Unexpected hierarchy: extend exporter'
        if 'mesh' not in node:
            continue
        scale = node.get('scale', [1, 1, 1])
        assert all(abs(v - scale[0]) < 1e-6 for v in scale), 'Nonuniform scale needs inverse transpose normals'
        rotation = node.get('rotation', [0, 0, 0, 1])
        translation = node.get('translation', [0, 0, 0])
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            positions = accessor(primitive['attributes']['POSITION'])
            normals = accessor(primitive['attributes']['NORMAL'])
            out = groups.setdefault(primitive['material'], [])
            for (index,) in accessor(primitive['indices']):
                p = rotate([v*scale[k] for k, v in enumerate(positions[index])], rotation)
                p = [v + translation[k] for k, v in enumerate(p)]
                n = rotate(normals[index], rotation)
                # Undo glTF Y-up conversion: preserve authored +Y bow / +Z dorsal metres.
                out.extend([p[0], -p[2], p[1], n[0], -n[2], n[1]])
    data = bytearray()
    batches = []
    for index, values in groups.items():
        material = gltf['materials'][index]
        pbr = material.get('pbrMetallicRoughness', {})
        color = pbr.get('baseColorFactor', [1, 1, 1, 1])
        emissive = material.get('emissiveFactor', [0, 0, 0])
        # Flight finish 7 draws the supplied glow color directly. A pure emitter
        # has a black reflective base; retain its light instead of exporting black.
        visible_color = emissive if max(color[:3]) == 0 and max(emissive) > 0 else color[:3]
        batches.append(dict(offset=len(data), count=len(values), color=visible_color,
                            opacity=color[3], material=material['name'],
                            roughness=pbr.get('roughnessFactor', 1),
                            metallic=pbr.get('metallicFactor', 1),
                            emissive=emissive))
        data.extend(struct.pack('<' + 'f'*len(values), *values))
    # Ray from below at authored x=2, y=0, matching the study's ventral contact.
    contacts = []
    port_x = 2 if name == 'commuter' else 4
    for values in groups.values():
        for i in range(0, len(values), 18):
            a, b, c = [values[i+k:i+k+3] for k in [0, 6, 12]]
            det = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(det) < 1e-9:
                continue
            u = ((b[1]-c[1])*(port_x-c[0])+(c[0]-b[0])*(-c[1]))/det
            v = ((c[1]-a[1])*(port_x-c[0])+(a[0]-c[0])*(-c[1]))/det
            if u >= 0 and v >= 0 and u+v <= 1:
                contacts.append(u*a[2]+v*b[2]+(1-u-v)*c[2])
    assert contacts
    manifest = dict(version=1, source=name+'.glb', units='metres', forward='+Y', up='+Z',
                    refuel=[port_x, 0, min(contacts)], sourceSha256=hashlib.sha256(source).hexdigest(), batches=batches)
    (ROOT / (name+'-flight.bin')).write_bytes(data)
    (ROOT / (name+'-flight.json')).write_text(json.dumps(manifest, separators=(',', ':'))+'\n', encoding='utf-8', newline='\n')
    print(name, len(groups), 'material batches,', len(data), 'bytes, port', manifest['refuel'])


if __name__ == '__main__':
    for model in ['commuter', 'double-decker']:
        export(model)
