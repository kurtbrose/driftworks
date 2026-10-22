"""Offline Blender authoring: two civilian transports, +Y bow, +Z dorsal.

Run blender --background --python tools/build-civilian-airliners.py.
Produces editable blends, portable GLBs and inspection renders; no runtime deps.
"""
import math
import sys
import json
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1] / 'assets/ships/civilian-airliners'
ROOT.mkdir(parents=True, exist_ok=True)


def add_scale_crew(length, width, height):
    """Freeze the existing Quaternius neutral pose at exactly 1.80 m tall."""
    for collection in list(bpy.data.collections):
        if collection.name.startswith('Scale crew — Quaternius'):
            for obj in list(collection.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(collection)
    source = ROOT.parents[1]/'characters/quaternius-astronaut/original/Astronaut by Quaternius - 3hC2i0CTuO.glb'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = set(bpy.data.objects)-before
    neutral_tracks = 0
    for obj in imported:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = 'Idle_Neutral' not in track.name
                neutral_tracks += not track.mute
    if not neutral_tracks:
        raise RuntimeError('Astronaut neutral animation not found')
    bpy.context.scene.frame_set(6)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    frozen = []
    for obj in imported:
        if obj.type == 'MESH' and obj.name.startswith('SpaceSuit_'):
            data = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
            data.transform(obj.matrix_world)
            frozen.append(data)
    if len(frozen) != 4:
        raise RuntimeError('Expected four SpaceSuit meshes for scale crew')
    points = [v.co for data in frozen for v in data.vertices]
    lo = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    scale = 1.8/(hi.z-lo.z)
    center = Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    for data in frozen:
        for v in data.vertices:
            v.co = (v.co-center)*scale
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    collection = bpy.data.collections.new('Scale crew — Quaternius — 1.80 m (studio only)')
    bpy.context.scene.collection.children.link(collection)
    ground = -height/2-.8
    door_floor = -1.9 if length == 72 else -2.8
    for i, (x,y,z,angle) in enumerate([(width/2+1.0,length*.19,door_floor,-.5),
                                      (width/2+3.8,length*.19+1.0,ground,1.1),
                                      (width/2+4.5,length*.19-1.5,ground,-.8)]):
        for j,data in enumerate(frozen):
            obj = bpy.data.objects.new('Scale astronaut %d part %d'%(i+1,j+1),data)
            collection.objects.link(obj)
            obj.location = (x,y,z)
            obj.rotation_euler.z = angle
    return ground


def render_crew_views(length, width, height):
    scene = bpy.context.scene
    camera = scene.camera
    key = 'commuter' if length == 72 else 'double-decker'
    old_matrix, old_scale = camera.matrix_world.copy(), camera.data.ortho_scale
    for view, loc, target, scale in [
        ('hero',(length*.85,length*.94,length*.64),(0,0,0),length*1.12),
        ('side',(length,0,length*.10),(0,0,0),length*1.16),
        ('top',(0,0,length),(0,0,0),length*1.14),
        ('rear',(length*.33,-length,length*.30),(0,0,0),length*.90),
        ('scale',(width/2+22,length*.19+7,4),
         (width/2,length*.19,-1.0 if length == 72 else -.8),14)]:
        if '--refresh-scale' in sys.argv and view != 'scale':
            continue
        ground_crew = [obj for obj in bpy.data.objects if obj.name.startswith(('Scale astronaut 2 part','Scale astronaut 3 part'))]
        for obj in ground_crew:
            obj.hide_render = view == 'scale'
        camera.location = loc
        camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        if view == 'top':
            camera.rotation_euler.z = math.pi/2
        camera.data.ortho_scale = scale
        scene.render.filepath = str(ROOT/(key+'-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
        for obj in ground_crew:
            obj.hide_render = False
    camera.matrix_world, camera.data.ortho_scale = old_matrix, old_scale


def material(name, color, metal=.25, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .36
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = glow
    return m


def build(key, length, width, height, decks):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    mats = {
        'ivory': material('Porcelain alloy', (.72, .73, .69)),
        'red': material('Oxide red livery', (.34, .045, .028), .42),
        'dark': material('Recessed graphite', (.018, .027, .035)),
        'seam': material('Panel joints', (.19, .22, .23)),
        'metal': material('Titanium', (.20, .24, .27), .8),
        'glass': material('Smoked cockpit', (.025, .075, .105), .65),
        'warm': material('Occupied cabin', (.95, .55, .18), .1, .8),
        'cool': material('Drive ion blue', (.12, .5, 1), .25, 3),
        'nav': material('Navigation red', (1, .025, .01), .1, 3),
    }
    parts = []

    def mesh(name, verts, faces, mat, smooth=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        data.materials.append(mats[mat])
        for p in data.polygons:
            p.use_smooth = smooth
        parts.append(obj)
        return obj

    def box(name, loc, size, mat, bevel=.05):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        obj = bpy.context.object
        obj.name = name
        obj.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(mats[mat])
        if bevel:
            mod = obj.modifiers.new('Machined radii', 'BEVEL')
            mod.width = bevel
            mod.segments = 3
            obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        parts.append(obj)
        return obj

    def cylinder(name, loc, radius, depth, mat, axis='Y'):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=loc)
        obj = bpy.context.object
        obj.name = name
        if axis == 'Y':
            obj.rotation_euler.x = math.pi / 2
        obj.data.materials.append(mats[mat])
        for p in obj.data.polygons:
            p.use_smooth = len(p.vertices) == 4
        parts.append(obj)
        return obj

    # Long parallel cabin, rounded stern shoulders, tapered airliner bow.
    stations = [(-.50, .70, .73), (-.46, .92, .95), (-.36, 1, 1),
                (.12, 1, 1), (.28, .90, .93), (.39, .67, .74),
                (.46, .36, .43), (.50, .025, .07)]

    def section(y):
        t = y / length
        for idx, ((a, wa, ha), (b, wb, hb)) in enumerate(zip(stations, stations[1:])):
            if t <= b:
                f = max(0, min(1, (t-a)/(b-a)))
                before = stations[max(0, idx-1)]
                after = stations[min(len(stations)-1, idx+2)]
                values = []
                for k in [1, 2]:
                    m0 = (stations[idx+1][k]-before[k])/(b-before[0])*(b-a)
                    m1 = (after[k]-stations[idx][k])/(after[0]-a)*(b-a)
                    values.append((2*f**3-3*f*f+1)*stations[idx][k]+(f**3-2*f*f+f)*m0+(-2*f**3+3*f*f)*stations[idx+1][k]+(f**3-f*f)*m1)
                return width*values[0]/2, height*values[1]/2
        return width*.0125, height*.035

    def skin(y, a, offset=.02):
        w, h = section(y)
        return ((w+offset)*math.cos(a), y, (h+offset)*math.sin(a))

    def patch(name, y0, y1, a0, a1, mat, offset=.025, steps=4):
        verts = [skin(y0+(y1-y0)*j/steps, a0+(a1-a0)*i/steps, offset)
                 for j in range(steps+1) for i in range(steps+1)]
        faces = []
        for j in range(steps):
            for i in range(steps):
                k = j*(steps+1)+i
                faces.append((k+steps+1, k+steps+2, k+1, k))
        return mesh(name, verts, faces, mat, True)

    # Paint belongs to the pressure hull itself. Independent curved overlays
    # can intersect its triangles and compete for depth in the game renderer.
    angles = sorted(set([i*math.tau/128 for i in range(128)] + [1.22,1.92,4.40,5.02]))
    ys = sorted(set([-length*.5+i*length/128 for i in range(129)] +
                    [-length*.49,length*.43,-length*.46]))
    count = len(angles)
    verts = [skin(y,a,0) for y in ys for a in angles]
    faces, finishes = [], []
    for j in range(len(ys)-1):
        for i,a in enumerate(angles):
            k=(i+1)%count
            faces.append(((j+1)*count+i,(j+1)*count+k,j*count+k,j*count+i))
            mid_a=(a+(angles[i+1] if i+1<count else math.tau))/2
            mid_y=(ys[j]+ys[j+1])/2
            finishes.append(1 if 1.22<mid_a<1.92 and -length*.49<mid_y<length*.43
                            else 2 if 4.40<mid_a<5.02 and -length*.46<mid_y<length*.43 else 0)
    hull=mesh('Continuous pressure hull',verts,faces,'ivory',True)
    hull.data.materials.append(mats['red'])
    hull.data.materials.append(mats['metal'])
    for face,finish in zip(hull.data.polygons,finishes):
        face.material_index=finish
    for y, reverse in [(-length*.5, False), (length*.5, True)]:
        ring = [skin(y, i*math.tau/64, 0) for i in range(64)]
        mesh('Pressure hull end closure', ring,
             [tuple(reversed(range(64))) if reverse else tuple(range(64))], 'ivory')
    # Individual panels follow the same analytic surface as the hull.
    for j in range(28 if decks == 2 else 20):
        y = -length*.47 + j*length*.93/(28 if decks == 2 else 20)
        patch('Circumferential panel seam', y, y+.035, 0, math.tau, 'seam', .045, 48)
    for a in [.7, 1.05, 2.09, 2.44, 3.65, 5.77]:
        patch('Longitudinal panel seam', -length*.46, length*.465, a, a+.004, 'seam', .05, 48)

    # All cabin details are authored in metres, not fractions of ship size.
    deck_floors = [-1.9] if decks == 1 else [-2.8, .3]
    door_width, door_height = 1.05, 2.10
    window_width, window_height, window_pitch = .65, .80, 1.0
    window_records, door_records = [], []

    def side_panel(name, side, y0, y1, z0, z1, mat, offset=.018, steps=4):
        verts = []
        for j in range(steps+1):
            y = y0+(y1-y0)*j/steps
            w,h = section(y)
            for i in range(steps+1):
                z = z0+(z1-z0)*i/steps
                verts.append((side*(w*math.sqrt(max(0,1-(z/h)**2))+offset),y,z))
        faces = []
        for j in range(steps):
            for i in range(steps):
                k=j*(steps+1)+i
                f=(k,k+steps+1,k+steps+2,k+1)
                faces.append(f if side == 1 else tuple(reversed(f)))
        return mesh(name,verts,faces,mat,True)

    for side in [1, -1]:
        a = .62 if side == 1 else math.pi-.62
        patch('Sweeping red cabin shoulder stripe', -length*.43, length*.40,
              a-.012, a+.012, 'red', .025, 80)
        for deck, floor_z in enumerate(deck_floors):
            window_z = floor_z+1.35
            y_start,y_end = -length*.35,length*.30
            side_panel('Recessed passenger deck belt',side,y_start,y_end,
                       window_z-.46,window_z+.46,'dark',.012,100)
            count = int((y_end-y_start)/window_pitch)
            door_ys = [-length*.25,length*.19]
            if decks == 2:
                door_ys += [-length*.02]
            for i in range(count):
                y = y_start+.5+i*window_pitch
                if any(abs(y-d)<1.0 for d in door_ys):
                    continue
                side_panel('Passenger glazing D%d %03d'%(deck+1,i+1),side,
                           y-window_width/2,y+window_width/2,
                           window_z-window_height/2,window_z+window_height/2,
                           'warm' if i%9 != 3 else 'glass',.025)
                side_panel('Cabin upper shadow',side,y-.325,y+.325,
                           window_z+.21,window_z+.40,'glass',.032)
                side_panel('Seat silhouette',side,y-.12,y+.10,
                           window_z-.40,window_z-.09,'dark',.036)
                window_records.append(dict(deck=deck+1,side=side,width=window_width,
                                           height=window_height,center=[y,window_z]))
            for y in door_ys:
                side_panel('Door surround',side,y-.60,y+.60,floor_z-.05,floor_z+2.18,'metal',.04)
                door = side_panel('Passenger door 1.05 x 2.10 m',side,
                           y-door_width/2,y+door_width/2,floor_z,floor_z+door_height,'ivory',.052,8)
                door['clearWidthMeters']=door_width
                door['clearHeightMeters']=door_height
                side_panel('Door observation window',side,y-.16,y+.16,
                           floor_z+1.43,floor_z+1.79,'glass',.065)
                side_panel('Door handle',side,y+.30,y+.43,floor_z+.93,floor_z+.98,'dark',.07)
                door_records.append(dict(deck=deck+1,side=side,width=door_width,
                                         height=door_height,floor=floor_z,y=y))
        for j in range(4):
            y = length*(.445+j*.008)
            patch('Forward approach light', y, y+length*.004,
                  (.06 if side == 1 else math.pi-.10),
                  (.10 if side == 1 else math.pi-.06), 'warm', .17, 2)

        # Swept, short stabilizer shoulders, with a thick root and fine tip.
        x = side*width*.39
        wing = [(x, -length*.12, height*.04), (side*width*.91, -length*.35, -height*.01),
                (side*width*.96, -length*.45, -height*.03), (x, -length*.43, -height*.10)]
        verts = wing + [(a,b,c-height*.075) for a,b,c in wing]
        mesh('Swept red engine shoulder', verts, [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)], 'red')
        box('Wingtip navigation', (side*width*.93, -length*.413, 0), (width*.025, length*.014, height*.045), 'nav')
        # Raised streamlined dorsal service fairing.
        box('Aft service fairing', (side*width*.22, -length*.31, height*.44),
            (width*.14, length*.19, height*.065), 'ivory', height*.03)
        # Layered shoulder plating and service vents break up the dorsal surfaces.
        for j in range(9):
            y = -length*.36+j*length*.062
            a = .95 if side == 1 else math.pi-.95
            patch('Raised access panel', y, y+length*.033, a-.10, a+.10, 'ivory', .13, 3)
            patch('Service panel latch', y+length*.012, y+length*.019, a-.025, a+.025, 'metal', .16, 2)
        for j in range(12):
            y = -length*.34+j*length*.013
            a = 1.12 if side == 1 else math.pi-1.12
            patch('Dorsal heat exchanger', y, y+length*.007, a-.045, a+.045, 'dark', .12, 2)
    engines = [-.28, .28] if decks == 1 else [-.30, 0, .30]
    for i, x in enumerate(engines):
        r = width*(.145 if decks == 1 else .14)
        z = -height*.03 if i != 1 or decks == 1 else height*.12
        cylinder('Red drive nacelle', (x*width, -length*.455, z), r*1.17, length*.13, 'red')
        cylinder('Titanium drive collar', (x*width, -length*.515, z), r*1.05, length*.025, 'metal')
        cylinder('Dark exhaust well', (x*width, -length*.529, z), r*.90, .15, 'dark')
        cylinder('Luminous drive throat', (x*width, -length*.531-.09, z), r*.66, .06, 'cool')
        cylinder('Exhaust hub', (x*width, -length*.532-.13, z), r*.27, .06, 'metal')
        for k in range(12):
            a = k*math.tau/12
            box('Nozzle radial fin', (x*width+math.cos(a)*r, -length*.516, z+math.sin(a)*r),
                (r*.10, length*.027, r*.12), 'dark', .02)
    for y in [-length*.26, length*.13]:
        _, h = section(y)
        cylinder('Dorsal docking collar', (0,y,h+.12), width*.048, .25, 'metal', 'Z')
        cylinder('Docking recess', (0,y,h+.27), width*.031, .08, 'dark', 'Z')
    box('Communication blade', (0,-length*.29,height*.64), (.15,length*.018,height*.24), 'red')
    box('Beacon', (0,-length*.29,height*.77), (.22,.22,.2), 'nav')

    # Flush flight-deck glazing is sampled on the original nose surface.
    # Each pane cuts a real opening; there is no added bridge roof or housing.
    eye_z = 1.65 if decks == 1 else 2.6
    low,high = eye_z-.58,eye_z+.65

    def nose_y(x,z):
        lo,hi = length*.28,length*.5
        for _ in range(45):
            mid=(lo+hi)/2
            w,h=section(mid)
            if (x/w)**2+(z/h)**2 < 1:
                lo=mid
            else:
                hi=mid
        return (lo+hi)/2

    def nose_pane(name, outline, mat, offset=.008):
        # Bilinear subpatch, projected onto the same continuous pressure hull.
        verts=[]
        steps=10
        for j in range(steps+1):
            v=j/steps
            for i in range(steps+1):
                u=i/steps
                left=Vector(outline[0]).lerp(Vector(outline[3]),v)
                right=Vector(outline[1]).lerp(Vector(outline[2]),v)
                x,z=left.lerp(right,u)
                verts.append((x,nose_y(x,z)+offset,z))
        faces=[]
        for j in range(steps):
            for i in range(steps):
                k=j*(steps+1)+i
                faces.append((k,k+steps+1,k+steps+2,k+1))
        return mesh(name,verts,faces,mat,True)

    pane_outlines = []
    for side in [-1,1]:
        for x0,x1,z0,z1 in [(.055,1.62,low,high),(1.72,2.75,low+.10,high-.13)]:
            outline=[(side*x0,z0),(side*x1,z0+.07),
                     (side*(x1-.12),z1),(side*x0,z1)]
            if side < 0:
                outline=list(reversed(outline))
            pane_outlines.append(outline)
    glazings=[]
    for i,outline in enumerate(pane_outlines):
        # Extruded projected silhouette removes only the corresponding pane.
        y_back=min(nose_y(x,z) for x,z in outline)-4
        y_front=length*.5+1
        verts=[(x,y,z) for y in [y_back,y_front] for x,z in outline]
        faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        faces=[tuple(reversed(face)) for face in faces]
        cutter=mesh('Temporary flush windshield opening',verts,faces,'dark')
        for obj in list(parts):
            if obj == cutter:
                continue
            if obj.name.startswith(('Continuous pressure hull','Dorsal red ribbon',
                                    'Circumferential panel seam','Longitudinal panel seam',
                                    'Sweeping red cabin shoulder stripe')):
                bpy.context.view_layer.objects.active=obj
                mod=obj.modifiers.new('Flush windshield opening','BOOLEAN')
                mod.operation='DIFFERENCE'
                mod.object=cutter
                bpy.ops.object.modifier_apply(modifier=mod.name)
        parts.remove(cutter)
        bpy.data.objects.remove(cutter,do_unlink=True)
        glazings.append(nose_pane('Flush airline windshield %d'%(i+1),outline,'glass'))
    front=nose_y(0,eye_z)
    eye_y=nose_y(.72,eye_z)-.35
    for side in [-1,1]:
        x=side*.72
        box('Pilot seat cushion',(x,eye_y,eye_z-.76),(.53,.58,.12),'dark')
        box('Pilot seat back',(x,eye_y-.30,eye_z-.45),(.53,.12,.64),'dark')
        box('Low instrument console',(x,eye_y+.10,eye_z-.67),(.9,.28,.20),'metal')
    dimensions=dict(length=length,beam=width,height=height,
                    doorWidth=door_width,doorHeight=door_height,
                    windowWidth=window_width,windowHeight=window_height,
                    windowPitch=window_pitch,deckFloors=deck_floors,
                    windows=window_records,doors=door_records)
    (ROOT/(key+'-dimensions.json')).write_text(json.dumps(dimensions,indent=2)+'\n',
                                              encoding='utf-8',newline='\n')
    # Check actual evaluated geometry, including the cut hull and cockpit frames.
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    visibility = []
    for side in [-1,1]:
        origin = Vector((side*.72,eye_y,eye_z))
        for yaw in [-30,-15,0,15,30]:
            for pitch in [-10,0,15]:
                a,b = math.radians(yaw), math.radians(pitch)
                direction = Vector((math.sin(a)*math.cos(b),math.cos(a)*math.cos(b),math.sin(b)))
                # Object-level ray casts deliberately exclude only transparent glazing.
                blocked = []
                for obj in parts:
                    if obj in glazings:
                        continue
                    evaluated = obj.evaluated_get(deps)
                    inverse = evaluated.matrix_world.inverted()
                    hit, point, _, _ = evaluated.ray_cast(inverse@origin, inverse.to_3x3()@direction, distance=length*2)
                    if hit:
                        blocked.append(obj.name)
                visibility.append(dict(pilot=side,yaw=yaw,pitch=pitch,blocked=blocked))
    failures = [ray for ray in visibility if ray['blocked']]
    (ROOT/(key+'-visibility.json')).write_text(json.dumps(dict(
        eyePositions=[[-.72,eye_y,eye_z],[.72,eye_y,eye_z]],
        note='Geometric design probe, not a certified field-of-view assessment. Glass excluded; all ship geometry included.',
        rays=visibility),indent=2)+'\n',encoding='utf-8',newline='\n')
    if failures:
        raise RuntimeError('Blocked pilot sightlines: '+str(failures))

    # Editable geometry only in the portable export.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/(key+'.glb')), export_format='GLB', use_selection=True)
    if '--geometry-only' in sys.argv:
        return

    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.world.color = (.18,.18,.18)
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.mesh.primitive_plane_add(size=length*200, location=(0,0,-height/2-.8))
    floor = bpy.context.object
    floor.name = 'Studio floor (render only)'
    floor.data.materials.append(material('Studio slate', (.09,.115,.14), .05))
    for loc, power, size in [((length*.4,length*.3,length*.8), 1700, length*.8),
                             ((-length*.5,0,length*.4), 1100, length*.7),
                             ((0,-length*.7,length*.5), 2000, length*.6)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.data.energy = power*(length/20)**2
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    scene.camera = camera
    camera.data.type = 'ORTHO'
    add_scale_crew(length, width, height)
    # Small apron platform places a crew member directly beside a door.
    floor_z=deck_floors[0]
    box('Studio boarding platform',(width/2+1.1,length*.19,floor_z-.10),
        (2.2,3.0,.20),'metal')
    for y in [length*.19-1.3,length*.19+1.3]:
        box('Studio platform support',(width/2+1.7,y,(floor_z-height/2-.8)/2),
            (.10,.10,floor_z+height/2+.8),'metal')
    render_crew_views(length,width,height)
    target=Vector((0,front-1,eye_z))
    camera.location=(9,front+12,eye_z+5)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=12
    scene.render.filepath=str(ROOT/(key+'-bridge.png'))
    bpy.ops.render.render(write_still=True)
    camera.location=(length*.85,length*.94,length*.64)
    camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=length*1.12
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(key+'.blend')))


if '--refresh-scale' in sys.argv:
    for key,length,width,height in [('commuter',72,18,11),('double-decker',180,30,16.5)]:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/(key+'.blend')))
        render_crew_views(length,width,height)
elif '--refresh-crew' in sys.argv:
    for key, length, width, height in [('commuter',72,18,11),('double-decker',180,30,16.5)]:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/(key+'.blend')))
        add_scale_crew(length,width,height)
        render_crew_views(length,width,height)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(key+'.blend')))
else:
    if '--only-liner' not in sys.argv:
        build('commuter', 72, 18, 11, 1)
    build('double-decker', 180, 30, 16.5, 2)
