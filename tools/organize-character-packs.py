"""Verify extracted character sources and rebuild the offline catalog; ZIPs are not required."""
import hashlib,json,pathlib,struct
ROOT=pathlib.Path(__file__).resolve().parents[1]/'assets/characters'
def sha(data): return hashlib.sha256(data).hexdigest()
catalog=[]
for pack in sorted(ROOT.iterdir()):
 manifest=pack/'provenance.json'
 if not pack.is_dir() or not manifest.exists(): continue
 provenance=json.loads(manifest.read_text(encoding='utf-8')); models=[]
 for record in provenance['files']:
  target=pack/record['path']; data=target.read_bytes()
  if sha(data)!=record['sha256']: raise ValueError('Source hash mismatch: '+str(target))
  if len(data)!=record['bytes']: raise ValueError('Source size mismatch: '+str(target))
  if target.suffix.lower() not in ('.glb','.gltf'): continue
  doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]) if target.suffix=='.glb' else json.loads(data)
  name=target.stem if 'archive' in provenance else provenance['title']
  models.append(dict(name=name,path=record['path'],sha256=sha(data),animations=[a.get('name','Animation '+str(i+1)) for i,a in enumerate(doc.get('animations',[]))],meshes=len(doc.get('meshes',[])),skins=len(doc.get('skins',[]))))
 catalog.append(dict(id=pack.name,title=provenance['title'],author=provenance['author'],license=provenance['license'],sourceURL=provenance['sourceURL'],models=models))
(ROOT/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
print([(p['id'],len(p['models']),sum(len(m['animations']) for m in p['models'])) for p in catalog])
