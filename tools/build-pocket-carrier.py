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
prism('Continuous ventral hull',outline,-7,-4,armor,.7)
box('Flight deck',(0,-15,-3.6),(51,98,.8),deck)
prism('Forward stores and command core',[(-28,33),(28,33),(8,73),(0,77),(-8,73)],-4,5,armor,.6)
for s in (-1,1):
    poly=[(s*26,-65),(s*45,-65),(s*53,-48),(s*46,-25),(s*29,32),(s*26,32)]
    if s<0: poly.reverse()
    prism('Port structure' if s<0 else 'Starboard structure',poly,-4,5,dark,.5)
    # Separate armor strips leave a dark recessed belt along each flank.
    prism('Shoulder armor',poly,3.8,7,armor,.55)
    box('Engine pod',(s*38,-59,0),(23,38,15),armor,1.2)
    box('Drive collar',(s*38,-76,0),(20,4,12),dark,.6)
    box('Recessed drive',(s*38,-78.1,0),(16,.25,8.6),glow,.6)
    for xoff in (-5,0,5):
        box('Drive vertical brace',(s*38+xoff,-78.4,0),(.65,.6,9.5),dark,.1)
    box('Drive cross brace',(s*38,-78.5,0),(17,.6,.7),dark)
    for y in (-51,-33,-15,3,21):
        box('Hangar frame',(s*25,y,.8),(1.0,1.0,8.8),armor)
        box('Work light',(s*24.3,y,4.5),(.25,6,.3),light,.05)
    box('Mouth jamb',(s*25.2,-64,.6),(1.6,3,10),armor)
    box('Approach stripe',(s*9,-15,-3.13),(.35,95,.04),stripe,0)

# Large removable roof plates make the interior legible in the cutaway render.
for y0,y1,w0,w1 in [(-65,-34,45,47),(-33,-2,47,39),(-1,32,39,28)]:
    roof.append(prism('Removable dorsal armor',[(-w0,y0),(w0,y0),(w1,y1),(-w1,y1)],5.5,8,armor,.5))
roof.append(box('Hangar mouth lintel',(0,-64,5.7),(50,3,2.4),dark))
roof.append(box('Low command blister',(0,33,9),(12,18,3),dark,.8))
roof.append(box('Bridge glazing',(0,41.9,9.3),(9,.3,.8),light,.08))
for s in (-1,1):
    roof.append(box('Recessed dorsal service strip',(s*19,-12,8.1),(2,65,.3),dark))
    for y in (-30,0,22):
        roof.append(box('Service cover',(s*19,y,8.5),(3,5,.5),armor))

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
box('Forward hangar bulkhead',(0,33,.7),(52,1,9),dark)
box('Personnel door',(8,32.4,-1.5),(1.3,.2,2.2),stripe,.06)

bpy.ops.object.select_all(action='SELECT')
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
    cam.location=loc
    cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
for o in roof: o.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'pocket-carrier.blend'))
