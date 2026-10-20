"""Explicit research setup, never called by conversion. Verify all downloads."""
import hashlib
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parent/'models'
FILES=[
 ('2d106det.onnx',
  'https://huggingface.co/ByteDance/InfiniteYou/resolve/3ce7c3ae31659832d1ea3cf9a1937b63352b1ed0/insightface/models/antelopev2/2d106det.onnx',
  'f001b856447c413801ef5c42091ed0cd516fcd21f2d6b79635b1e733a7109dbf'),
 ('face_paint_512_v2.pt',
  'https://raw.githubusercontent.com/bryandlee/animegan2-pytorch/main/weights/face_paint_512_v2.pt',
  '06b88a204eb230889444ad868ee5608f4fce5d4ff7b7738acaa4209c2b8fdca7')]

if __name__=='__main__':
    print('Research setup only. InsightFace and upstream AnimeGAN weights are not cleared for commercial game deployment; see STRUCTURAL_REPORT.md.')
    ROOT.mkdir(exist_ok=True)
    for name,url,digest in FILES:
        path=ROOT/name
        if path.exists():
            data=path.read_bytes()
        else:
            with urllib.request.urlopen(url,timeout=120) as response:
                data=response.read()
        if hashlib.sha256(data).hexdigest()!=digest:
            raise ValueError('Model checksum mismatch: '+name)
        if not path.exists():
            path.write_bytes(data)
        print('Verified',name)
