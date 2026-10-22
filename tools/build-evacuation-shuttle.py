"""Blender offline transport study. Metres, +Y bow, +Z dorsal."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parents[1]/'assets/ships/evacuation-shuttle-v1'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
colors={'hull':(.48,.57,.59),'belly':(.20,.26,.29),'stripe':(.055,.23,.27),
        'glass':(.018,.045,.065),'metal':(.18,.22,.24),'nozzle':(.035,.045,.05),
        'port-light':(.9,.03,.015),'starboard-light':(.02,.8,.25),'cabin':(.65,.71,.63)}
materials={}
for name,color in colors.items():
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=.25
    bsdf.inputs['Roughness'].default_value=.5
    if name.endswith('-light'):
        bsdf.inputs['Emission Color'].default_value=(*color,1)
        bsdf.inputs['Emission Strength'].default_value=2
    materials[name]=mat
parts=[]
def finish(obj,name,material,bevel=0):
    obj.name=name
    obj.data.materials.append(materials[material])
    if bevel:
        mod=obj.modifiers.new('Soft manufactured edges','BEVEL')
        mod.width=bevel
        mod.segments=3
    parts.append(obj)
    return obj
def box(name,p,size,material='hull',bevel=.1):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    obj=bpy.context.object
    obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,material,bevel)
def cylinder(name,p,r,length,material='metal',axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=r,depth=length,location=p)
    obj=bpy.context.object
    for polygon in obj.data.polygons:polygon.use_smooth=len(polygon.vertices)==4
    if axis=='Y':obj.rotation_euler.x=math.pi/2
    if axis=='X':obj.rotation_euler.y=math.pi/2
    return finish(obj,name,material,.06)
def loft(name,stations,material='hull',livery=False):
    vertices=[]
    for y,rx,rz,z in stations:
        for i in range(48):
            a=i*math.tau/48
            vertices.append((rx*math.cos(a),y,z+rz*math.sin(a)))
    faces=[]
    for j in range(len(stations)-1):
        for i in range(48):faces.append((j*48+i,j*48+(i+1)%48,(j+1)*48+(i+1)%48,(j+1)*48+i))
    faces.extend([tuple(reversed(range(48))),tuple((len(stations)-1)*48+i for i in range(48))])
    mesh=bpy.data.meshes.new(name)
    # Reverse ring-strip winding: exterior normals face away from the hull.
    mesh.from_pydata(vertices,[],[tuple(reversed(face)) for face in faces])
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,name,material)
    if livery:
        obj.data.materials.append(materials['belly'])
        obj.data.materials.append(materials['stripe'])
        obj.data.materials.append(materials['glass'])
    for i,polygon in enumerate(mesh.polygons):
        polygon.use_smooth=i<len(faces)-2
        if livery and i<len(faces)-2:
            a=((i%48)+.5)*math.tau/48
            if math.sin(a)<-.35:polygon.material_index=1
            elif -.05<math.sin(a)<.23:polygon.material_index=2
            y=(stations[i//48][0]+stations[i//48+1][0])/2
            if 20<y<27 and .27<math.sin(a)<.55 and int((y-20)*2)%7!=0:polygon.material_index=3
    return obj

stations=[(-30,.1,.15,0),(-28,6,4,0),(-24,9.5,6,0),(-16,11.8,7.4,0),
          (0,12.5,8,0),(12,11.4,7.5,0),(20,9,6.4,-.5),(26,5.8,4.6,-1),
          (29,2.5,2.5,-1),(30,.08,.1,-1)]
def section(y):
    index=next((i for i in range(len(stations)-1) if y<=stations[i+1][0]),len(stations)-2)
    a,b=stations[index:index+2]
    t=max(0,min(1,(y-a[0])/(b[0]-a[0])))
    before=stations[max(0,index-1)]
    after=stations[min(len(stations)-1,index+2)]
    values=[y]
    for k in range(1,4):
        # Cubic Hermite with physical-length tangents: gentle continuous shoulders.
        m0=(b[k]-before[k])/(b[0]-before[0])*(b[0]-a[0])
        m1=(after[k]-a[k])/(after[0]-a[0])*(b[0]-a[0])
        v=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*m1
        values.append(max(.05,v) if k<3 else v)
    return values
dense=[section(-30+i*.5) for i in range(121)]
loft('Passenger pressure hull',dense,livery=True)
def skin(y,angle,offset=.035):
    _,rx,rz,z=section(y)
    return ((rx+offset)*math.cos(angle),y,z+(rz+offset)*math.sin(angle))
for side in [-1,1]:
    for i in range(12):
        center=-19+i*3.1
        # Rounded trapezoidal glazing, conforming to the broad pressure hull.
        outline=[(-1.15,.18),(-.98,.16),(.92,.16),(1.12,.19),(.92,.33),(.74,.35),(-.87,.35),(-1.05,.32)]
        coords=[skin(center+dy,angle if side==1 else math.pi-angle) for dy,angle in outline]
        coords.insert(0,skin(center,.255 if side==1 else math.pi-.255))
        mesh=bpy.data.meshes.new('Cabin glazing')
        faces=[(0,j+1,(j+1)%8+1) for j in range(8)]
        if side==-1:faces=[tuple(reversed(f)) for f in faces]
        mesh.from_pydata(coords,[],faces)
        mesh.update()
        obj=bpy.data.objects.new('Cabin window',mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj,'Cabin window','glass')
    # Propulsion housings merge into the broad stern shoulders.
    loft('Integrated drive housing',[(-29.2,2.2,2,-3),(-27,3.4,3,-3),(-19,3.6,3.2,-3),(-11,1,1,-3)],'belly').location.x=side*7.5
    cylinder('Drive exhaust',(side*7.5,-29.1,-3),2,.7,'nozzle')
    cylinder('Drive throat',(side*7.5,-29.5,-3),1.55,.08,'metal')
    cylinder('Shoulder navigation',(side*12.2,-8,1.2),.25,.18,'port-light' if side<0 else 'starboard-light',axis='Z')
    for y in [-18,14]:
        _,rx,_,_=section(y)
        cylinder('RCS recess',(side*rx,y,0),.35,.14,'nozzle',axis='X')
# Dorsal receptacle is accessible to the depot arm, away from exhaust and doors.
cylinder('Refueling socket collar',(0,1,8.04),.9,.24,'metal',axis='Z')
cylinder('Refueling socket recess',(0,1,8.18),.6,.08,'nozzle',axis='Z')

bpy.context.scene.unit_settings.system='METRIC'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'shuttle.blend'))
deps=bpy.context.evaluated_depsgraph_get()
batches={}
for obj in parts:
    evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    matrix=obj.matrix_world
    normal_matrix=matrix.to_3x3().inverted().transposed()
    for tri in mesh.loop_triangles:
        material=obj.data.materials[tri.material_index].name
        batch=batches.setdefault(material,dict(material=material,positions=[],normals=[]))
        for index,loop in zip(tri.vertices,tri.loops):
            batch['positions'].extend(round(v,5) for v in matrix@mesh.vertices[index].co)
            batch['normals'].extend(round(v,5) for v in (normal_matrix@mesh.corner_normals[loop].vector).normalized())
    evaluated.to_mesh_clear()
data=dict(version=1,units='metres',forward='+Y',up='+Z',lengthMeters=60,
    anchors={'refuel':[0,1,8.22],'refuelNormal':[0,0,1],'engines':[[-7.5,-29.54,-3],[7.5,-29.54,-3]]},
    materials=colors,batches=list(batches.values()),sourceParts=[obj.name for obj in parts])
(OUT/'shuttle.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
print('SHUTTLE:',len(parts),'parts;',sum(len(b['positions'])//9 for b in batches.values()),'triangles')
