import pathlib,urllib.request,hashlib,json
root=pathlib.Path(__file__).resolve().parents[1]/'vendor/three'; root.mkdir(exist_ok=True)
files=['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/controls/OrbitControls.js','examples/jsm/utils/BufferGeometryUtils.js','LICENSE']
records=[]
for name in files:
 url='https://raw.githubusercontent.com/mrdoob/three.js/r180/'+name
 data=urllib.request.urlopen(url).read(); dest=root/name; dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 records.append(dict(path=name,sourceURL=url,sha256=hashlib.sha256(data).hexdigest()))
(root/'provenance.json').write_text(json.dumps(dict(version='r180',license='MIT',files=records),indent=2)+'\n')
