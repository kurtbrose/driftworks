"""Offline pocket-carrier concept. Blender --background --python this-file.

Metres; +Y bow, +Z dorsal. Review blockout, not a gameplay-ready asset.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'assets/ships/pocket-carrier'
OUT = ROOT / 'output/pocket-carrier'
ASSET.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, metal=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .42
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

armor = mat('Warm ceramic armor', (.53,.56,.55), .45)
dark = mat('Graphite structure', (.065,.085,.10), .6)
deck = mat('Hangar deck', (.16,.20,.22), .4)
stripe = mat('Flight safety ochre', (.92,.48,.065), .2)
glow = mat('Drive amber', (1,.25,.035), .2, 3)
light = mat('Hangar light', (.5,.85,1), .1, 2)
fighter = mat('Scale fighter blue', (.12,.32,.42), .35)
roof = []

def prism(name, poly, z0, z1, material, bevel=.25):
    n=len(poly)
    verts=[(x,y,z) for z in (z0,z1) for x,y in poly]
    faces=[tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        mod=obj.modifiers.new('Edge catches','BEVEL')
        mod.width=bevel
        mod.segments=1
        obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return obj

def box(name, pos, size, material, bevel=.2):
    x,y,z=pos
    w,l,h=size
    return prism(name,[(x-w/2,y-l/2),(x+w/2,y-l/2),(x+w/2,y+l/2),(x-w/2,y+l/2)],z-h/2,z+h/2,material,bevel)

outline=[(-46,-66),(46,-66),(54,-48),(47,-25),(29,30),(8,74),(0,78),(-8,74),(-29,30),(-47,-25),(-54,-48)]
def subtract(obj, cutter):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Interior volume','BOOLEAN')
    mod.operation='DIFFERENCE'
    mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

# One continuous shell: subtract the enclosed bay and its narrower aft throat.
hull=prism('Smooth continuous hull',outline,-16,14,armor,0)
subtract(hull,box('Hangar volume',(0,-13.5,2.9),(52,93,12.2),dark,0))
subtract(hull,box('Aft throat',(0,-65,1.5),(20,12,9),dark,0))
cutaway=bpy.data.objects.new('Roof-off inspection hull',hull.data.copy())
bpy.context.collection.objects.link(cutaway)
subtract(cutaway,box('Cutaway removal',(0,0,58),(200,200,100),dark,0))
for obj in (hull,cutaway):
    mod=obj.modifiers.new('Soft hull edges','BEVEL')
    mod.width=1.2
    mod.segments=3
    obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
roof.append(hull)
cutaway.hide_render=True
cutaway.hide_viewport=True
box('Flight deck',(0,-15,-3.6),(51,98,.8),deck)
for s in (-1,1):
    box('Engine pod',(s*38,-59,0),(23,38,25),armor,1.6)
    box('Drive collar',(s*38,-76,0),(20,4,21),dark,.6)
    box('Recessed drive',(s*38,-78.1,0),(16,.25,16),glow,.6)
    for y in (-51,-33,-15,3,21):
        box('Hangar frame',(s*25,y,3),(1.5,1.5,12),dark)
        box('Work light',(s*24,y,7.8),(.25,6,.3),light,.05)
        box('Service access door',(s*25.9,y+4,-1.8),(.12,1.3,2.2),dark,.04)
    box('Portal jamb',(s*10.2,-66,1.5),(1.0,1.5,9),dark)
    box('Approach stripe',(s*9,-15,-3.13),(.35,95,.04),stripe,0)

roof.append(box('Portal upper frame',(0,-66,6),(20,1.5,1),dark))
box('Portal sill',(0,-66,-3.4),(21,2,1),dark)
for y in (-48,-30,-12,6,24):
    roof.append(box('Transverse hangar roof beam',(0,y,8.5),(51,1.5,1),dark))

# Exact training-fighter envelope from src/ship-catalog.js, translated to berths.
# These are scale proxies, not a claim that all catalog fighters share this fit.
for s in (-1,1):
    for row,y in enumerate((-49,-31,-13,5,23)):
        x=s*16
        prism('Fighter berth %s%d'%('P' if s<0 else 'S',row+1),
              [(x-7,y-8.5),(x+7,y-8.5),(x,y+8.5)],-2.6,-1.6,fighter,.12)
        box('Fighter canopy',(x,y,-.9),(2,5,1.4),dark,.3)
        for dx in (-7.6,7.6):
            box('Berth boundary',(x+dx,y,-3.13),(.18,17,.04),stripe,0)
box('Forward hangar bulkhead',(0,33,3),(52,1,12),dark)
box('Personnel door',(8,32.4,-1.5),(1.3,.2,2.2),stripe,.06)

bpy.ops.object.select_all(action='SELECT')
cutaway.select_set(False)
bpy.ops.export_scene.gltf(filepath=str(ASSET/'pocket-carrier.glb'),export_format='GLB',use_selection=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1200
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.world.color=(.15,.15,.15)
for loc,power,size in [((80,50,140),1800000,120),((-100,0,70),1200000,100),((0,-120,60),1500000,80)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object
    o.data.energy=power*.22
    o.data.shape='DISK'
    o.data.size=size
    o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object
scene.camera=cam
cam.data.type='ORTHO'
for name,loc,scale in [('hero',(140,-190,150),205),('top',(0,0,220),190),('side',(220,0,25),190),('aft',(75,-210,42),155),('underside',(100,-160,-150),205),('cutaway',(80,-150,180),195)]:
    for o in roof: o.hide_render=name=='cutaway'
    cutaway.hide_render=name!='cutaway'
    cam.location=loc
    cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
for o in roof: o.hide_render=False
cutaway.hide_render=True
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'pocket-carrier.blend'))
