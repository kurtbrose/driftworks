"""Offline authoring: blender --background --python tools/build-refueling-depot.py.

Metres, Z up. Evaluated meshes retain named breakup modules and arm pivots.
The browser consumes the indexed GLB, with no Blender/runtime dependency.
"""
import bpy
import math
import runpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/depots/refueling-v1'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}
for name, color, metal in [('shell', (.58,.63,.65), .65), ('frame',(.19,.24,.27),.75),
                          ('gold',(.66,.36,.075),.6), ('dark',(.025,.04,.05),.2),
                          ('lamp',(.8,.72,.5),.1), ('red-light',(1,.035,.012),.1),
                          ('green-light',(.025,.85,.32),.1), ('white-light',(.8,.9,1),.1),
                          ('safety-yellow',(.95,.65,.025),.1), ('safety-orange',(.95,.17,.025),.1),
                          ('replacement',(.76,.78,.72),.35), ('wear',(.22,.26,.27),.4)]:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color,1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = .46
    if name == 'lamp' or name.endswith('-light'):
        bsdf.inputs['Emission Color'].default_value = (*color,1)
        bsdf.inputs['Emission Strength'].default_value = 3
    materials[name] = mat

# A small repeating paint texture, applied through the existing mesh UVs.
image=runpy.run_path(str(ROOT/'tools/build-caution-paint.py'))['build_image']()
paint=bpy.data.materials.new('caution-paint')
paint.diffuse_color=(1,1,1,1)
paint.use_nodes=True
node=paint.node_tree.nodes.new('ShaderNodeTexImage')
node.image=image
bsdf=paint.node_tree.nodes.get('Principled BSDF')
paint.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value=.8
materials['caution-paint']=paint

# Reuse the freighters' actual barrel/head artwork and service-cassette sheet.
# UVs address the original 4096 x 3072 atlas directly (no runtime canvas bake).
atlas_path=ROOT/'assets/ships/industrial-kit/panels.png'
for name in ['tank-paint','hardware-paint']:
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(1,1,1,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=bpy.data.images.load(str(atlas_path),check_existing=True)
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value=.22
    bsdf.inputs['Roughness'].default_value=.8
    materials[name]=mat

module = 'hub'
parts = []
pivots = {}
def finish(obj, name, material, bevel=0):
    if module.startswith('arm-112-') and material.endswith('-light'):material='dark'
    # Inactive fixtures stay fitted; the shell keeps the same paint as active hubs.
    if module=='hub-112':
        if material=='lamp' or material.endswith('-light'):material='dark'
    obj.name = module + '/' + name
    obj.data.materials.append(materials[material])
    if bevel:
        mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    parts.append(obj)
    return obj

def box(name, p, size, material='frame', bevel=.12):
    # Direct datablocks avoid a full scene/operator update for every rack bolt.
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(a*size[0]/2,b*size[1]/2,c*size[2]/2) for a,b,c in
                     [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]],[],
                    [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
    mesh.update();mesh.uv_layers.new()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.location=p
    return finish(obj,name,material,bevel)

def paint_uv(obj,around,along):
    # Match stripe scale to metres, rather than the size of the object UV island.
    for loop in obj.data.uv_layers.active.data:
        loop.uv.x*=around/(32*.8)
        loop.uv.y*=along/(4*.8)

def cylinder(name,p,r,h,material='shell',vertices=32,bevel=.10):
    mesh=bpy.data.meshes.new(name)
    coords=[(r*math.cos(i*math.tau/vertices),r*math.sin(i*math.tau/vertices),z) for z in [-h/2,h/2] for i in range(vertices)]
    faces=[(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    faces.extend([tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))])
    mesh.from_pydata(coords,[],faces);mesh.update();uv=mesh.uv_layers.new()
    for face in mesh.polygons:
        for j,loop in enumerate(face.loop_indices):
            co=mesh.vertices[mesh.loops[loop].vertex_index].co
            if face.index<vertices:
                uv.data[loop].uv=((face.index+(j in [1,2]))/vertices,(co.z+h/2)/h)
            else:uv.data[loop].uv=(.5+co.x/(2*r),.5+co.y/(2*r))
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.location=p
    if material=='caution-paint':paint_uv(obj,math.tau*r,h)
    # Smooth only the curved wall; planar end caps retain their hard boundary.
    if vertices>8:
        for polygon in obj.data.polygons:
            polygon.use_smooth=len(polygon.vertices)==4
    return finish(obj,name,material,bevel)

def beam(name,a,b,r=.32,material='frame',bevel=.10,vertices=8):
    a,b=Vector(a),Vector(b)
    obj=cylinder(name,(a+b)/2,r,(b-a).length,material,vertices,bevel)
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=(b-a).to_track_quat('Z','Y')
    return obj

def fuel_line(name,a,b,r=.4):
    return beam(name,a,b,r,'gold',0,16)

def ring(name,p,r,minor=.18,material='gold'):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=minor,
        major_segments=32,minor_segments=8,location=p)
    if material=='caution-paint':paint_uv(bpy.context.object,math.tau*r,math.tau*minor)
    for polygon in bpy.context.object.data.polygons:
        polygon.use_smooth=True
    return finish(bpy.context.object,name,material)

def band(name,x,y,z,r,height,material,start=0,arc=math.tau):
    vertices=[]
    for i in range(33):
        a=start+arc*i/32
        for dz in [-height/2,height/2]:vertices.append((x+r*math.cos(a),y+r*math.sin(a),z+dz))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],[(i*2,i*2+2,i*2+3,i*2+1) for i in range(32)])
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:polygon.use_smooth=True
    return finish(obj,name,material)

def light(name,p,color):
    cylinder(name+'-guard',p,.9,.55,'dark',16)
    cylinder(name+'-lens',(p[0],p[1],p[2]+.35),.6,.28,color,16)

def vessel(x,y,serial):
    # Continuous shell: the existing 32 m barrel and 3.41 m domed heads.
    # Head artwork is projected, never pinched into a barrel UV pole.
    stations=[]
    for i in range(9):
        a=-math.pi/2+i*math.pi/16
        stations.append((-11+3.41*math.sin(a),6.2*math.cos(a),math.sin(a)/3.41,math.cos(a)/6.2,True))
    for z in [-11,-3,5,13,21]:stations.append((z,6.2,0,1/6.2,False))
    for i in range(9):
        a=i*math.pi/16
        stations.append((21+3.41*math.sin(a),6.2*math.cos(a),math.sin(a)/3.41,math.cos(a)/6.2,True))
    verts=[];faces=[];uvs=[];segments=48
    for z,r,nz,nr,head in stations:
        for j in range(segments+1):
            a=j*math.tau/segments
            verts.append((x+r*math.cos(a),y+r*math.sin(a),z))
            if head:
                u=(3072+r*math.cos(a)/6.2*940)/4096
                v=1-(1024+r*math.sin(a)/6.2*940)/3072
            else:
                u=(16+(z+11)/32*2016)/4096
                v=1-(2056+j/segments*1008)/3072
            uvs.append((u,v))
    for i in range(len(stations)-1):
        if abs(stations[i+1][0]-stations[i][0])<1e-8:continue
        for j in range(segments):
            a=i*(segments+1)+j;b=a+segments+1
            if i>0:faces.append((a,a+1,b))
            if i<len(stations)-2:faces.append((b,a+1,b+1))
    mesh=bpy.data.meshes.new('continuous tank shell')
    mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new()
    for face in mesh.polygons:
        face.use_smooth=True
        for loop in face.loop_indices:uv.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
    # Keep exact ellipsoid normals at the UV split rings.
    normals=[]
    for i,(z,r,nz,nr,head) in enumerate(stations):
        for j in range(segments+1):
            a=j*math.tau/segments
            normals.append(Vector((nr*math.cos(a),nr*math.sin(a),nz)).normalized())
    mesh.normals_split_custom_set_from_vertices(normals)
    obj=bpy.data.objects.new('tank',mesh);bpy.context.collection.objects.link(obj)
    return finish(obj,'tank-%02d'%serial,'tank-paint')

def equipment(name,p,size):
    obj=box(name,p,size,'hardware-paint',.16)
    # The same service tile as the freighter's replaceable machinery housings.
    uv=obj.data.uv_layers.active
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda k:abs(face.normal[k]))
        axes=[k for k in range(3) if k!=axis]
        for loop in face.loop_indices:
            co=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            u=.5+co[axes[0]]/size[axes[0]];v=.5+co[axes[1]]/size[axes[1]]
            uv.data[loop].uv=((1032+u*496)/4096,1-(520+(1-v)*496)/3072)
    return obj

def tank(x,y,index,serial,missing=False):
    # An absent tank leaves an open structural cell, not free-standing cage rods.
    if missing:
        beam('isolated-branch',(x,y,-18),(x,y,-16.5),.45,'gold')
        cylinder('isolated-feed',(x,y,-16.4),.65,.35,'caution-paint')
        return
    for dx in [-4,4]:
        beam('tank-foot',(x+dx,y,-18),(x+dx,y,-12.8),.35)
    for z in [-9,16]:ring('tank-saddle',(x,y,z),6.4,.28,'frame')
    z=5
    vessel(x,y,serial)
    for dz in [-14,-9,0,9,14]:ring('tank-band',(x,y,z+dz),6.24,.16,'gold' if abs(dz)==14 else 'frame')
    band('hazard-band',x,y,17,6.32,2.3,'safety-orange')
    # Uneven coating loss and repair patches follow the curved skin, not a box.
    for j in range(3):
        angle=(serial*1.71+j*2.3)%math.tau
        band('coating-loss',x,y,-8+j*7+(serial%3),6.34,.35+j*.23,'wear',angle,.13+.09*j)
    if serial%4==0:
        band('replacement-panel',x,y,3,6.35,5,'replacement',-2.3,.38)
    # Large stencilled tank number, tangent to the service-facing wall.
    bpy.ops.object.text_add(location=(x,y-6.38,6))
    label=bpy.context.object
    label.data.body='F-%02d'%serial
    label.data.align_x='CENTER'
    label.data.size=1.6
    label.rotation_euler.x=math.pi/2
    bpy.ops.object.convert(target='MESH')
    finish(bpy.context.object,'tank-id','dark')
    cylinder('inspection-neck',(x,y,24.6),.8,.65,'frame',16)
    cylinder('inspection-cap',(x,y,25),1.1,.18,'gold',16)
    beam('feed',(x,y,-14),(x,y,-18),.45,'gold')
    cylinder('transfer-isolation-valve',(x,y,-16.2),.85,1,'frame',16)
    beam('valve-actuator',(x,y,-16.2),(x+1.3,y,-16.2),.22,'gold')
    box('valve-lock',(x+1.3,y,-16.2),(.5,.65,.65),'gold',.08)
    # Two short EVA grips on the service-facing skin, seated into the vessel.
    side=1 if y>0 else -1
    for h in [-5,-2]:
        for dx in [-.65,.65]:beam('EVA-grip-foot',(x+dx,y-side*6.12,h),(x+dx,y-side*6.5,h),.08,'frame',0)
        beam('EVA-grip',(x-.65,y-side*6.5,h),(x+.65,y-side*6.5,h),.10,'gold',0,12)

# Three service towers along a generous open spine.
for x in [-112,0,112]:
    module='hub-%s'%x
    cylinder('pressure-core',(x,0,0),8,37)
    cylinder('control-deck',(x,0,17),11,8)
    for z in [-20,-12,12,22]:
        cylinder('collar',(x,0,z),10,1.2,'caution-paint' if z==-12 and x!=112 else 'frame')
        ring('safety-stripe',(x,0,z+.8),10,.24)
    for i in range(12):
        a=i*math.tau/12
        obj=box('window',(x+11.05*math.cos(a),11.05*math.sin(a),18),(1.7,.22,1),'lamp',.05)
        obj.rotation_euler.z=a-math.pi/2
    cylinder('service-stem',(x,0,-27),4,13)
    # Low protected fixtures at the roof edge, rather than decorative masts.
    light('port', (x-8,-6,23),'red-light')
    light('starboard', (x+8,6,23),'green-light')

module='spine'
for i in range(28):
    a=-168+i*12
    for y in [-5,5]:
        for z in [-5,5]:beam('longeron',(a,y,z),(a+12,y,z),.4)
        beam('diagonal',(a,y,-5),(a+12,y,5),.24)
        beam('diagonal',(a,y,5),(a+12,y,-5),.24)
    for z in [-5,5]:
        beam('deck-brace',(a,-5,z),(a+12,5,z),.24)
    for y in [-5,5]:beam('rib',(a,y,-5),(a,y,5),.3)
    if i%2==0:
        for y in [-5,5]:
            for z in [-5,5]:
                box('truss-splice-plate',(a,y,z),(1.5,1.3,1.3),'shell',.08)
                for dx in [-.48,.48]:
                    cylinder('splice-bolt',(a+dx,y,z+.72),.18,.18,'dark',8)
beam('fuel-main',(-168,0,-2),(168,0,-2),.85,'gold')
for x in [-168,168]:
    for y in [-5,5]:
        light('spine-end-clearance',(x,y,5.3),'red-light' if y<0 else 'green-light')

serial=0
missing_slots={3,10,23,28}
for x in [-150,-70,70,150]:
    for side in [-1,1]:
        module='tank-bank-%s-%s'%(x,side)
        for dx in [-7.5,7.5]:
            for dy in [22,37]:
                serial+=1
                tank(x+dx,side*dy,'%s-%s'%(dx,dy),serial,serial in missing_slots)
        for dx in [-15,15]:
            beam('outrigger',(x+dx,0,-5),(x+dx,side*46,-18),.6)
            beam('rack',(x+dx,side*13,-18),(x+dx,side*38,-18),.5)
            beam('rack-edge',(x+dx,side*38,-18),(x+dx,side*46,-18),.5,'caution-paint')
        for y in [14,22,37,45]:beam('rack-cross',(x-15,side*y,-18),(x+15,side*y,-18),.5)
        for dx in [-15,15]:
            light('rack-corner-clearance',(x+dx,side*45,-17.3),'red-light' if side<0 else 'green-light')
        # Connected rack plumbing, including the capped branches in empty bays.
        fuel_line('bank-transfer-manifold',(x-10,side*14,-18),(x+10,side*14,-18),.55)
        for dx in [-7.5,7.5]:
            fuel_line('tank-row-collector',(x+dx,side*14,-18),(x+dx,side*37,-18),.4)
        fuel_line('bank-main-connection',(x,side*14,-18),(x,side*7,-18),.55)
        fuel_line('bank-main-riser',(x,side*7,-18),(x,side*7,-2),.55)
        fuel_line('bank-main-junction',(x,side*7,-2),(x,0,-2),.55)
        # Machinery packages sit on the existing rack crossmember, with a
        # removable impact shield and visible feed connections below it.
        for dx in [-2,2]:
            equipment('transfer-pump-cassette',(x+dx,side*14,-15.8),(3.4,4,3.6))
            fuel_line('pump-inlet',(x+dx,side*14,-18),(x+dx,side*14,-17.5),.26)
            for oy in [-1.5,1.5]:
                beam('pump-mount',(x+dx,side*14+oy,-18),(x+dx,side*14+oy,-17.5),.2,'frame',0)
        equipment('pump-impact-shield',(x,side*14,-13.2),(8.5,5.2,.35))
        for dx in [-3.7,3.7]:
            for oy in [-2,2]:beam('shield-standoff',(x+dx,side*14+oy,-14),(x+dx,side*14+oy,-13.35),.16,'frame',0)

for x,side in [(-112,-1),(0,-1),(112,1)]:
    for section,length in [('upper',32),('forearm',32),('wrist',6)]:
        module='arm-%s-%s'%(x,section)
        pivots[module]=[0,0,0]
        # Independently posed rigid links, authored along local +Y.
        beam('sealed-fuel-boom',(0,0,0),(0,length,0),1.15,'shell')
        for dx in [-1.3,1.3]:
            beam('protected-feed',(dx,2,0),(dx,length-2,0),.22,'gold')
        cylinder('joint',(0,0,0),2.4,3,'frame')
        ring('joint-ring',(0,0,0),2.4,.3,'caution-paint')
        if section=='wrist':
            obj=cylinder('coupler',(0,length,0),2.4,2,'gold')
            obj.rotation_euler.x=math.pi/2
            for dx in [-2.5,2.5]:light('coupler-clearance',(dx,length,0),'white-light')

# Save editable authoring scene; bake the exact evaluated geometry used below.
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'depot.blend'))
deps=bpy.context.evaluated_depsgraph_get()
batches={}
for obj in parts:
    evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    group=obj.name.split('/')[0]
    material=obj.data.materials[0].name
    key=(group,material)
    batch=batches.setdefault(key,dict(group=group,material=material,positions=[],normals=[]))
    if material in ['caution-paint','tank-paint','hardware-paint'] and 'uvs' not in batch:batch['uvs']=[]
    matrix=obj.matrix_world
    normal_matrix=matrix.to_3x3().inverted().transposed()
    for tri in mesh.loop_triangles:
        for index,loop in zip(tri.vertices,tri.loops):
            # Corner normals preserve smooth walls and discontinuous hard caps.
            normal=(normal_matrix @ mesh.corner_normals[loop].vector).normalized()
            batch['positions'].extend(round(v,5) for v in matrix @ mesh.vertices[index].co)
            batch['normals'].extend(round(v,5) for v in normal)
            if 'uvs' in batch:
                batch['uvs'].extend(round(v,6) for v in mesh.uv_layers.active.data[loop].uv)
    evaluated.to_mesh_clear()
data=dict(version=1,units='metres',up='Z',pivots=pivots,
          inactiveModules=['hub-112'],parkedArms=[112],
          textures={'caution-paint':'caution-paint.png','tank-paint':'../../ships/industrial-kit/panels.png','hardware-paint':'../../ships/industrial-kit/panels.png'},
          sourceParts=[obj.name for obj in parts],tankSlots=32,installedTanks=28,
          materials={name:list(mat.diffuse_color[:3]) for name,mat in materials.items()},batches=list(batches.values()))
runpy.run_path(str(ROOT/'tools/depot-glb.py'))['write_depot_glb'](data, OUT/'depot.glb')
print('DEPOT BAKE:',len(parts),'source objects;',sum(len(b['positions'])//9 for b in batches.values()),'triangles;',len(batches),'batches')
runpy.run_path(str(ROOT/'tools/pose-refueling-depot.py'),init_globals={'depot_loaded':True})
