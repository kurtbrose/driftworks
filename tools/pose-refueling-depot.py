"""Arrange the editable Blender source in the browser study's default pose."""
import bpy
import math
from pathlib import Path
from mathutils import Matrix, Vector

asset = Path(__file__).resolve().parents[1] / 'assets/depots/refueling-v1/depot.blend'
if not globals().get('depot_loaded', False):
    bpy.ops.wm.open_mainfile(filepath=str(asset))
shoulder = math.atan2(-20,48) + math.acos(math.hypot(48,20)/64)
for x,side in [(-112,-1),(0,-1),(112,1)]:
    reach,height,tilt=(24,-8,-1.2) if x==112 else (48,-20,math.radians(-35))
    shoulder=math.atan2(height,reach)+math.acos(math.hypot(reach,height)/64)
    origin=Vector((x,side*10,-9))
    elbow=origin+Vector((0,side*32*math.cos(shoulder),32*math.sin(shoulder)))
    wrist=origin+Vector((0,side*reach,height))
    tip=wrist+Vector((0,side*6*math.cos(tilt),6*math.sin(tilt)))
    for section,start,end in [('upper',origin,elbow),('forearm',elbow,wrist),('wrist',wrist,tip)]:
        transform=Matrix.Translation(start) @ Vector((0,1,0)).rotation_difference((end-start).normalized()).to_matrix().to_4x4()
        for obj in bpy.context.scene.objects:
            if obj.name.split('/')[0]=='arm-%s-%s'%(x,section):
                obj.matrix_world=transform @ obj.matrix_world
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(asset))
