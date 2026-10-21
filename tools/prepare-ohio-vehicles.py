import bpy, pathlib, zipfile, tempfile
# Re-download assets/kenney-car-kit.zip from the provenance source to rebuild.
staging=tempfile.TemporaryDirectory()
with zipfile.ZipFile("assets/kenney-car-kit.zip") as archive:
 for entry in archive.namelist():
  if entry in ["Models/GLB format/"+n+".glb" for n in ["tractor","truck","truck-flat"]]+["Models/GLB format/Textures/colormap.png"]:
   archive.extract(entry, staging.name)
root=pathlib.Path('assets/environments/kenney-car-kit')
for name in ['tractor','truck','truck-flat']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(staging.name)/'Models/GLB format'/f'{name}.glb'))
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH': continue
  mesh=obj.data
  original=list(mesh.materials)
  palette={}
  for face in mesh.polygons:
   mat=original[face.material_index]
   tex=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None) if mat.use_nodes else None
   color=tuple(mat.diffuse_color)
   if tex and mesh.uv_layers.active:
    uv=mesh.uv_layers.active.data[face.loop_start].uv
    img=tex.image; w,h=img.size
    idx=4*(min(h-1,max(0,int(uv.y*h)))*w+min(w-1,max(0,int(uv.x*w))))
    rgb=img.pixels[idx:idx+3]
    color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)
   key=tuple(round(c,4) for c in color)
   if key not in palette:
    m=bpy.data.materials.new('palette');m.diffuse_color=color;m.use_nodes=True
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=color
    mesh.materials.append(m);palette[key]=len(mesh.materials)-1
   face.material_index=palette[key]
 bpy.ops.export_scene.gltf(filepath=str(root/f'{name}.glb'),export_format='GLB',export_materials='EXPORT')
