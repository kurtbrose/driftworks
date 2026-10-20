"""Explicit setup only: download checksum-pinned 2D detector/matte models."""
import hashlib
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parent/'models'
MODELS=[
 ('face_detection_yunet_2023mar.onnx',
  'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
  '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'),
 ('u2net_human_seg.onnx',
  'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx',
  '01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c')]

if __name__=='__main__':
    ROOT.mkdir(exist_ok=True)
    for name,url,digest in MODELS:
        path=ROOT/name
        if path.exists():
            if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
                raise ValueError('Existing model hash mismatch: '+name)
        else:
            with urllib.request.urlopen(url,timeout=120) as response:
                data=response.read()
            if hashlib.sha256(data).hexdigest()!=digest:
                raise ValueError('Downloaded model hash mismatch: '+name)
            path.write_bytes(data)
        print('Verified',name)
