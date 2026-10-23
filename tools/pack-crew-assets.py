from pathlib import Path
from PIL import Image
import json,struct,io,os,time
def save_webp(image,destination):
 buffer=io.BytesIO();image.save(buffer,format="WEBP",quality=90,method=6)
 temporary=destination.with_suffix(".webp.tmp");temporary.write_bytes(buffer.getvalue())
 for attempt in range(5):
  try:os.replace(temporary,destination);return
  except OSError:
   if attempt==4:raise
   time.sleep(.1)
root=Path('assets/characters/quaternius-universal-base-characters')
# Texture conversion is a derived delivery format; editable PNGs remain intact.
out=root/'runtime/packed';out.mkdir(exist_ok=True)
sources={
 'female-skin':root/'original/Base Characters/Godot - UE/T_Superhero_Female_Dark_BaseColor.png',
 'male-skin':root/'original/Base Characters/Godot - UE/T_Superhero_Male_Dark.png',
 'hair-1':root/'original/Base Characters/Godot - UE/T_Hair_1_BaseColor.png',
 'hair-2':root/'original/Base Characters/Godot - UE/T_Hair_2_BaseColor.png',
 'eyes':root/'original/Base Characters/Godot - UE/T_Eye_Brown.png',
 'jo-skin-v1':root/'runtime/jo-skin-v1.png',
 'luis-skin-v1':root/'runtime/luis-skin-v1.png',
 'asha-skin-v1':root/'runtime/asha-skin-v1.png'}
for name,path in sources.items():
 im=Image.open(path);im.thumbnail((1024,1024));save_webp(im,out/(name+'.webp'))
 print(name,path.stat().st_size,'->',(out/(name+'.webp')).stat().st_size)
for kind in ['female','male']:
 source=json.loads((root/f'runtime/{kind}-head.json').read_text());chunks=[];groups=[];offset=0
 for part in source['groups']:
  verts=[];indices=[];seen={}
  for i in range(len(part['positions'])//3):
   vertex=tuple(part['positions'][i*3:i*3+3]+part['normals'][i*3:i*3+3]+part['uvs'][i*2:i*2+2])
   if vertex not in seen:seen[vertex]=len(seen);verts.extend(vertex)
   indices.append(seen[vertex])
  vb=struct.pack('<'+'f'*len(verts),*verts);ib=struct.pack('<'+'H'*len(indices),*indices)
  groups.append({'material':part['material'],'vertexOffset':offset,'vertexCount':len(seen),'indexOffset':offset+len(vb),'indexCount':len(indices)})
  block=vb+ib;block+=b'\0'*((-len(block))%4);chunks.append(block);offset+=len(block)
 (out/f'{kind}-head.bin').write_bytes(b''.join(chunks));(out/f'{kind}-head.json').write_text(json.dumps({'version':1,'stride':8,'sourceHeadPivot':source['sourceHeadPivot'],'groups':groups},indent=2)+'\n',encoding='utf-8',newline='\n')
 print(kind,'geometry', (root/f'runtime/{kind}-head.json').stat().st_size,'->',offset)

portrait_out=Path('assets/characters/crew-cast/portraits');portrait_out.mkdir(exist_ok=True)
for index in range(6):
 src=Path(f'assets/portraits/runway-workers/runtime/portrait-{index}.png');dst=portrait_out/f'portrait-{index}.webp'
 portrait=Image.open(src)
 if portrait.size!=(1792,256):raise ValueError('Expected 7 by 256px comms atlas: '+str(src))
 save_webp(portrait,dst)
 print('portrait',index,src.stat().st_size,'->',dst.stat().st_size)
