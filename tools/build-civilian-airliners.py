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
    ground = -height*.65
    for i, (x,y,angle) in enumerate([(width*.59,length*.18,-.5),
                                    (width*.59+1.4,length*.18+1.2,1.1),
                                    (width*.39,length*.37,-.8)]):
        for j,data in enumerate(frozen):
            obj = bpy.data.objects.new('Scale astronaut %d part %d'%(i+1,j+1),data)
            collection.objects.link(obj)
            obj.location = (x,y,ground)
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
        ('scale',(width*1.25,length*.68,height*.10),
         (width*.35,length*.34,-height*.27),height*1.65)]:
        camera.location = loc
        camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        if view == 'top':
            camera.rotation_euler.z = math.pi/2
        camera.data.ortho_scale = scale
        scene.render.filepath = str(ROOT/(key+'-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
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

    patch('Continuous pressure hull', -length*.5, length*.5, 0, math.tau, 'ivory', 0, 128)
    for y, reverse in [(-length*.5, False), (length*.5, True)]:
        ring = [skin(y, i*math.tau/64, 0) for i in range(64)]
        mesh('Pressure hull end closure', ring,
             [tuple(reversed(range(64))) if reverse else tuple(range(64))], 'ivory')
    patch('Dorsal red ribbon', -length*.49, length*.478, 1.22, 1.92, 'red', .035, 64)
    patch('Graphite ventral keel', -length*.46, length*.43, 4.40, 5.02, 'metal', .035, 48)
    # Individual panels follow the same analytic surface as the hull.
    for j in range(28 if decks == 2 else 20):
        y = -length*.47 + j*length*.93/(28 if decks == 2 else 20)
        patch('Circumferential panel seam', y, y+.035, 0, math.tau, 'seam', .045, 48)
    for a in [.7, 1.05, 2.09, 2.44, 3.65, 5.77]:
        patch('Longitudinal panel seam', -length*.46, length*.465, a, a+.004, 'seam', .05, 48)

    angles = [.17] if decks == 1 else [-.13, .36]
    for side in [1, -1]:
        a = .62 if side == 1 else math.pi-.62
        patch('Sweeping red cabin shoulder stripe', -length*.43, length*.40,
              a-.028, a+.028, 'red', .09, 48)
        for deck, a in enumerate(angles):
            angle = a if side == 1 else math.pi-a
            patch('Recessed passenger deck belt', -length*.355, length*.30,
                  angle-.105, angle+.105, 'dark', .10, 48)
            count = 28 if decks == 2 else 18
            pitch = length*.64/count
            for i in range(count):
                y = -length*.348+i*pitch
                patch('Passenger glazing D%d %02d' % (deck+1, i+1), y, y+pitch*.72,
                      angle-.071, angle+.071, 'warm' if i % 7 != 3 else 'glass', .14, 2)
                # Narrow inner sill makes windows read as cabin openings, not dots.
                patch('Window sill', y, y+pitch*.72, angle-.074, angle-.059, 'metal', .16, 2)
                patch('Cabin ceiling shadow', y, y+pitch*.72, angle+.038, angle+.071, 'glass', .17, 2)
                patch('Seat back silhouette', y+pitch*.19, y+pitch*.34, angle-.063, angle+.004, 'dark', .19, 2)
                patch('Window central divider', y+pitch*.51, y+pitch*.54, angle-.071, angle+.071, 'metal', .19, 2)
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
        for y in [-length*.25, length*.19]:
            w,h = section(y)
            box('Flush boarding hatch', (side*(w+.08), y, -height*.18),
                (.12, length*.032, height*.24), 'metal', .06)
            box('Boarding hatch inset', (side*(w+.16), y, -height*.18),
                (.08, length*.026, height*.20), 'ivory', .04)

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

    # A real forward-facing bridge volume replaces the old side-only decals.
    # Cut the pressure shell and all surface overlays with the same closed mesh,
    # so cockpit eye rays cannot encounter an invisible uncut nose underneath.
    bridge_width = 5.6 if decks == 1 else 7.4
    half = bridge_width/2
    front = length*.473
    rear = front-(8 if decks == 1 else 11)
    low = height*.17
    high = low+2.3
    rake = 1.15 if decks == 1 else 1.6
    corners = [(-half*1.15,rear,low), (half*1.15,rear,low), (half*.82,front,low), (-half*.82,front,low),
               (-half*1.15,rear,high+.55), (half*1.15,rear,high+.55),
               (half*.82,front-rake,high), (-half*.82,front-rake,high)]
    faces = [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    cutter = mesh('Bridge pressure cavity cutter', corners, faces, 'dark')
    for obj in list(parts):
        if obj == cutter:
            continue
        if obj.name.startswith(('Continuous pressure hull', 'Dorsal red ribbon',
                                'Circumferential panel seam', 'Longitudinal panel seam',
                                'Sweeping red cabin shoulder stripe')):
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new('Actual flight deck opening', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # Roof and lower sill form a shallow brow; glazing wraps around both corners.
    mesh('Bridge red roof', corners, [(4,5,6,7)], 'red')
    mesh('Bridge floor', corners, [(3,2,1,0)], 'dark')
    mesh('Bridge aft pressure bulkhead', corners, [(0,1,5,4)], 'ivory')
    glazing = mesh('Forward and quarter windshield', corners,
                   [(1,2,6,5),(2,3,7,6),(3,0,4,7)], 'glass')
    for a,b in [(2,3),(6,7),(2,6),(3,7),(4,7),(5,6)]:
        p,q = Vector(corners[a]),Vector(corners[b])
        frame = box('Windshield perimeter frame', (p+q)/2, (.09,.09,(q-p).length), 'metal', .025)
        frame.rotation_euler = (q-p).to_track_quat('Z','Y').to_euler()
    # Narrow center post lies between pilots, rather than across either eye line.
    p = Vector((0,front,low))
    q = Vector((0,front-rake,high))
    post = box('Windshield center post', (p+q)/2, (.085,.085,(q-p).length), 'ivory', .02)
    post.rotation_euler = (q-p).to_track_quat('Z','Y').to_euler()
    eye_y = front-rake-1.4
    eye_z = low+1.25
    for side in [-1,1]:
        x = side*.72
        box('Pilot seat cushion', (x,eye_y,eye_z-.76), (.53,.58,.12), 'dark')
        box('Pilot seat back', (x,eye_y-.30,eye_z-.45), (.53,.12,.64), 'dark')
        box('Low instrument console', (x,eye_y+.65,eye_z-.64), (.9,.48,.24), 'metal')
    # Check actual evaluated geometry, including the cut hull and cockpit frames.
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    visibility = []
    glazing.hide_set(True)
    glazing.hide_render = True
    for side in [-1,1]:
        origin = Vector((side*.72,eye_y,eye_z))
        for yaw in [-30,-15,0,15,30]:
            for pitch in [-10,0,15]:
                a,b = math.radians(yaw), math.radians(pitch)
                direction = Vector((math.sin(a)*math.cos(b),math.cos(a)*math.cos(b),math.sin(b)))
                # Object-level ray casts deliberately exclude only transparent glazing.
                blocked = []
                for obj in parts:
                    if obj == glazing:
                        continue
                    evaluated = obj.evaluated_get(deps)
                    inverse = evaluated.matrix_world.inverted()
                    hit, point, _, _ = evaluated.ray_cast(inverse@origin, inverse.to_3x3()@direction, distance=length*2)
                    if hit:
                        blocked.append(obj.name)
                visibility.append(dict(pilot=side,yaw=yaw,pitch=pitch,blocked=blocked))
    glazing.hide_set(False)
    glazing.hide_render = False
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
    bpy.ops.mesh.primitive_plane_add(size=length*200, location=(0,0,-height*.65))
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
    for view, loc, ortho in [('hero', (length*.85,length*.94,length*.64), length*1.12),
                              ('side', (length,0,length*.10), length*1.16),
                              ('top', (0,0,length), length*1.14),
                              ('bridge', (width*.7,front+width*.7,high+width*.32), width*.9),
                              ('rear', (length*.33,-length,length*.30), length*.90)]:
        camera.location = loc
        target = Vector((0,front-2,low+1)) if view == 'bridge' else Vector((0,0,0))
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
        if view == 'top':
            camera.rotation_euler.z = math.pi/2
        camera.data.ortho_scale = ortho
        scene.render.filepath = str(ROOT/(key+'-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
    camera.location = (length*.85,length*.94,length*.64)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = length*1.12
    add_scale_crew(length, width, height)
    render_crew_views(length, width, height)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(key+'.blend')))


if '--refresh-crew' in sys.argv:
    for key, length, width, height in [('commuter',72,22,16),('double-decker',180,43,29)]:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/(key+'.blend')))
        add_scale_crew(length,width,height)
        render_crew_views(length,width,height)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(key+'.blend')))
elif '--refresh-views' in sys.argv or '--refresh-bridge' in sys.argv:
    for key, length, width, height in [('commuter', 72, 22, 16), ('double-decker', 180, 43, 29)]:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/(key+'.blend')))
        scene = bpy.context.scene
        camera = scene.camera
        views = [('top', (0,0,length), length*1.14),
                 ('rear', (length*.33,-length,length*.30), length*.90)]
        if '--refresh-bridge' in sys.argv:
            views = [('bridge', (width*.7,length*.473+width*.7,height*.17+2.3+width*.32),width*.9)]
        for view, loc, scale in views:
            camera.location = loc
            target = Vector((0,length*.473-2,height*.17+1)) if view == 'bridge' else Vector((0,0,0))
            camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
            if view == 'top':
                camera.rotation_euler.z = math.pi/2
            camera.data.ortho_scale = scale
            scene.render.filepath = str(ROOT/(key+'-'+view+'.png'))
            bpy.ops.render.render(write_still=True)
else:
    build('commuter', 72, 22, 16, 1)
    build('double-decker', 180, 43, 29, 2)
