# Optional offline 2D preprocessing models

The game does not load these files. `setup_painted_models.py` downloads required
weights and verifies the following SHA-256 values before conversion. Both inference
steps use OpenCV 4.11.0.86 on CPU with one thread. Neither generates a portrait or
uses 3D geometry. Pixel abstraction and palette mapping are explicit image algorithms.

| Model | Purpose | SHA-256 |
| --- | --- | --- |
| face_detection_yunet_2023mar.onnx | Box and five 2D landmarks | 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 |
| u2net_human_seg.onnx | Foreground probability mask | 01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c |

YuNet: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
The upstream directory states MIT; see LICENSE-YuNet.txt. Its Git LFS pointer is
retained in yunet-lfs.txt. Setup's content hash pins the exact model despite the
upstream URL using `main`.

Human mask distribution:
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx
Upstream architecture/project: https://github.com/xuebinqin/U-2-Net . The upstream
project's Apache 2.0 license is retained in LICENSE-U2Net.txt. The model is distributed
by rembg; see https://github.com/danielgatis/rembg for model documentation.

The compact u2netp model was tested and rejected for hair/cap loss. Its local file
is preserved, ignored, and not required for the final converter. Download:
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
SHA-256: 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8 .
Graph-cut segmentation is retained as a diagnostic function; final processing uses
the human mask model. No individual matte corrections were made.
