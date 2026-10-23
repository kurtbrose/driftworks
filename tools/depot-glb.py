"""Dependency-free indexed glTF bake of evaluated depot batches (metres).

Mesh buffers retain Z-up local arm coordinates; the scene root rotates to glTF
Y-up. Full position/normal/UV tuples are shared, preserving hard edges and seams.
"""
import json
import math
import struct
from pathlib import Path


def write_depot_glb(data, output):
    binary = bytearray()
    doc = dict(asset=dict(version='2.0', generator='Driftworks depot bake'),
               scene=0, scenes=[dict(nodes=[0])],
               nodes=[dict(name='depot', rotation=[-math.sqrt(.5), 0, 0, math.sqrt(.5)], children=[])],
               meshes=[], materials=[], accessors=[], bufferViews=[],
               extras={k: v for k, v in data.items() if k != 'batches'},
               images=[dict(uri='caution-paint.png')],
               samplers=[dict(wrapS=10497, wrapT=10497)],
               textures=[dict(source=0, sampler=0)])

    def accessor(values, width, kind=5126):
        while len(binary) % 4:
            binary.append(0)
        raw = struct.pack('<%s%s' % (len(values), {5126: 'f', 5123: 'H', 5125: 'I'}[kind]), *values)
        view = len(doc['bufferViews'])
        doc['bufferViews'].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(raw)))
        binary.extend(raw)
        item = dict(bufferView=view, componentType=kind, count=len(values)//width,
                    type={1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[width])
        if width == 3:
            item.update(min=[min(values[a::3]) for a in range(3)], max=[max(values[a::3]) for a in range(3)])
        doc['accessors'].append(item)
        return len(doc['accessors'])-1

    material_ids = {}
    for name, color in data['materials'].items():
        paint = name.startswith('safety-') or name == 'wear'
        pbr = dict(baseColorFactor=color+[1], metallicFactor=.12 if paint else .1 if name == 'dark' else .65,
                   roughnessFactor=.78 if paint else .46)
        material = dict(name=name, pbrMetallicRoughness=pbr)
        if name == 'caution-paint':
            pbr.update(baseColorTexture=dict(index=0), metallicFactor=.1, roughnessFactor=.8)
        if name == 'lamp' or name.endswith('-light'):
            material['emissiveFactor'] = color
            material['extensions'] = {'KHR_materials_emissive_strength': dict(emissiveStrength=1 if name == 'lamp' else 2)}
        material_ids[name] = len(doc['materials'])
        doc['materials'].append(material)
    doc['extensionsUsed'] = ['KHR_materials_emissive_strength']
    modules = {}
    for batch in data['batches']:
        group = batch['group']
        if group not in modules:
            modules[group] = len(doc['nodes'])
            doc['nodes'][0]['children'].append(modules[group])
            doc['nodes'].append(dict(name=group, children=[]))
        positions, normals, uvs, indices, unique = [], [], [], [], {}
        for i in range(len(batch['positions'])//3):
            p = batch['positions'][i*3:i*3+3]
            n = batch['normals'][i*3:i*3+3]
            uv = batch.get('uvs', [])[i*2:i*2+2]
            key = tuple(p+n+uv)
            if key not in unique:
                unique[key] = len(unique)
                positions.extend(p)
                normals.extend(n)
                if uv:
                    uvs.extend([uv[0], 1-uv[1]])
            indices.append(unique[key])
        attributes = dict(POSITION=accessor(positions, 3), NORMAL=accessor(normals, 3))
        if uvs:
            attributes['TEXCOORD_0'] = accessor(uvs, 2)
        primitive = dict(attributes=attributes, indices=accessor(indices, 1, 5123 if len(unique) <= 65536 else 5125),
                         material=material_ids[batch['material']])
        doc['nodes'][modules[group]]['children'].append(len(doc['nodes']))
        doc['nodes'].append(dict(name=group+'/'+batch['material'], mesh=len(doc['meshes'])))
        doc['meshes'].append(dict(primitives=[primitive]))
    doc['buffers'] = [dict(byteLength=len(binary))]
    header = json.dumps(doc, separators=(',', ':')).encode()
    header += b' ' * (-len(header) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    Path(output).write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(header)+len(binary)) +
                             struct.pack('<II', len(header), 0x4e4f534a)+header +
                             struct.pack('<II', len(binary), 0x004e4942)+binary)


if __name__ == '__main__':
    import sys
    write_depot_glb(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2])
