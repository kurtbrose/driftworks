from pathlib import Path
import json,struct,zlib,hashlib
root=Path('assets/environments/ohio-roadside-v1');cat=json.loads((root/'catalog.json').read_text());raw=(root/'geometry.bin').read_bytes();values=struct.unpack('<'+'f'*(len(raw)//4),raw)
out=Path('assets/ships/ohio-vehicles');out.mkdir(exist_ok=True)
colors=[];models=[]
for key,name in [('Truck','Pickup'),('Tractor','Tractor')]:
 vertices=[];textured=[]
 for part in cat['models'][key]['parts']:
  c=part['color']
  if c not in colors:colors.append(c)
  ci=colors.index(c)
  for i in range(part['offset'],part['offset']+part['count'],6):
   x,y,z,nx,ny,nz=values[i:i+6]
   # Kenney vehicles face original +Z: turn into flight +Y, centered on hull.
   p=[-x*16,-y*16,z*16-4,-nx,-ny,nz]
   vertices+=p;textured+=p+[ci,0]
 models.append(dict(id='ohio-'+key.lower(),name=name,sha256=hashlib.sha256(Path('assets/environments/kenney-car-kit/'+('truck' if key=='Truck' else 'tractor')+'.glb').read_bytes()).hexdigest(),triangles=len(vertices)//18,vertices=vertices,texturedVertices=textured,texture='palette.png',gunMounts=([[-2.61,7.5,-.74],[2.61,7.5,-.74]] if key=='Truck' else [[-1.6,7.42,1.8],[1.6,7.42,1.8]]),engineMounts=[[-2,-8.05,-1,.7],[2,-8.05,-1,.7]]))
for m in models:
 for i in range(6,len(m['texturedVertices']),8):m['texturedVertices'][i]=(m['texturedVertices'][i]+.5)/len(colors);m['texturedVertices'][i+1]=.5
 def rnd(v):return round(v,5)
 m['vertices']=list(map(rnd,m['vertices']));m['texturedVertices']=list(map(rnd,m['texturedVertices']))
def srgb(c):return round(255*(12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055))
def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
pixels=bytes([0]+[srgb(c) for color in colors for c in color])
(out/'palette.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',len(colors),1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))
pack=dict(id='ohio-vehicles',author='Kenney',license='CC0-1.0',url='https://kenney.nl/assets/car-kit',missionOnly=True,models=models)
(out/'meshes.js').write_text('(function(){window.Driftworks.shipPacks.push('+json.dumps(pack,separators=(',',':'))+');}());\n')
(out/'README.md').write_text('# Ohio flying vehicles\n\nKenney Car Kit 3.1, CC0. Derived from the selected GLBs in ../../environments/kenney-car-kit, whose license and provenance apply. Built by tools/bake-ohio-flight-vehicles.py via the roadside catalog. Flight coordinates: +Y forward, +Z up, max dimension 16 metres; headlights carry two gun mounts, rear corners two engine mounts. Palette texture stores the baked material colors. Mission-only models are excluded from generic mixed fleets.\n')
