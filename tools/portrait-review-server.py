"""Optional local still capture: python tools/portrait-review-server.py.

Serves the unchanged static site on localhost:8011 and captures labeled runtime
contact sheets with atlas/compositor hashes. Captures are evidence, not approval.
"""
import base64
import hashlib
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ReviewHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/__portrait_review__':
            self.send_error(404)
            return
        if self.headers.get('Origin') not in ('http://localhost:8011','http://127.0.0.1:8011'):
            self.send_error(403)
            return
        try:
            size = int(self.headers.get('Content-Length','0'))
            if not 0 < size < 8*1024*1024:
                raise ValueError('Invalid capture size')
            request = json.loads(self.rfile.read(size))
            pool = request['pool']
            if pool not in ('dogfight','ohio','civilian-shuttle','runway-workers'):
                raise ValueError('Unknown cast')
            slot = int(request['slot'])
            if not 0 <= slot < (17 if pool in ('dogfight','ohio') else 6):
                raise ValueError('Unknown portrait slot')
            mode = 'raw' if request['raw'] else 'composite'
            png = base64.b64decode(request['image'].split(',',1)[1],validate=True)
            if png[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError('Expected PNG')
            folder = ROOT/'docs/portrait-reviews'
            folder.mkdir(exist_ok=True)
            stem = f'{pool}-{slot}-{mode}'
            (folder/f'{stem}.png').write_bytes(png)
            atlas = ROOT/f'assets/portraits/{pool}/runtime/portrait-{slot}.png'
            record = dict(status='visual-review-pending',cast=pool,slot=slot,mode=mode,
                atlasSha256=hashlib.sha256(atlas.read_bytes()).hexdigest(),
                compositorSha256=hashlib.sha256((ROOT/'experiments/face-blend.js').read_bytes()).hexdigest(),
                sheetSha256=hashlib.sha256(png).hexdigest(),combinations=16)
            (folder/f'{stem}.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8',newline='\n')
            body=json.dumps({'path':f'../docs/portrait-reviews/{stem}.png'}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError,KeyError,TypeError):
            self.send_error(400,'Invalid portrait capture')

if __name__ == '__main__':
    print('Portrait capture: http://127.0.0.1:8011/experiments/portrait-review.html?capture=1',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8011),partial(ReviewHandler,directory=str(ROOT))).serve_forever()
