"""Shared offline painted-stripe texture; can refresh the existing .blend alone."""
import bpy
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'assets/depots/refueling-v1'
def build_image():
    image=bpy.data.images.get('Worn caution paint') or bpy.data.images.new('Worn caution paint',width=512,height=64,alpha=False)
    pixels=[]
    for y in range(64):
        for x in range(512):
            dark=(((x+y)//8)%2)==0
            color=(.035,.045,.045) if dark else (.9,.61,.045)
            chip=((x*73+y*191+x*y*7)%997)<24
            pixels.extend((*((.32,.35,.34) if chip else color),1))
    image.pixels=pixels
    image.filepath_raw=str(OUT/'caution-paint.png')
    image.file_format='PNG'
    image.save()
    return image

if __name__=='__main__':
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'depot.blend'))
    build_image()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'depot.blend'))
