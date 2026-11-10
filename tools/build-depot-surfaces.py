"""Offline fitted hub skin: unique faces, continuous metre-scale UVs, no equipment wallpaper."""
from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/depots/refueling-v1/hub-surfaces.png'
SIZE=2048
BASE=(190,191,179)

def paint(size,seed):
    rng=random.Random(seed)
    small=Image.new('RGB',(max(2,size[0]//24),max(2,size[1]//24)))
    small.putdata([tuple(max(0,min(255,c+rng.randint(-3,3))) for c in BASE) for _ in range(small.width*small.height)])
    return small.resize(size,Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(3))

def cover(draw,box):
    # Flush access outline/latch, drawn at its fitted size rather than stretching
    # a complete equipment illustration over a pressure-hull panel.
    x0,y0,x1,y1=box
    draw.rounded_rectangle(box,radius=3,fill=(184,186,175),outline=(126,134,129),width=1)
    draw.line((x0+2,y1-2,x1-2,y1-2),fill=(207,209,196),width=1)
    for x in [x0+4,x1-4]:
        for y in [y0+4,y1-4]:draw.ellipse((x-1,y-1,x+1,y+1),fill=(109,119,114))
    draw.rectangle((x1-8,(y0+y1)/2-5,x1-5,(y0+y1)/2+5),fill=(96,108,103))

def build():
    image=paint((SIZE,SIZE),3701)
    draw=ImageDraw.Draw(image)
    # Each of eight facets has its own strip. Vertical subdivisions sample one
    # continuous skin; they do not restart a graphic on each geometry section.
    for face in range(8):
        rng=random.Random(5100+face)
        x0=face*256+8;x1=face*256+248;y0=40;y1=730
        draw.rectangle((x0-8,0,x1+8,767),fill=tuple(c+rng.randint(-2,2) for c in BASE))
        patch=paint((240,690),6200+face);image.paste(patch,(x0,y0));draw=ImageDraw.Draw(image)
        for z in [-4,2]:
            y=y0+(9.5-z)/19.5*(y1-y0)
            draw.line((x0,y,x1,y),fill=(153,158,148),width=1)
            draw.line((x0,y+1,x1,y+1),fill=(203,205,193),width=1)
        # Sparse small coating rubs, not symbols or functional fittings.
        for _ in range(7):
            x=rng.randint(x0+10,x1-18);y=rng.randint(y0+15,y1-15)
            draw.line((x,y,x+rng.randint(3,12),y),fill=(177,181,169),width=1)
        scale=(x1-x0)/(2*8.2*math.tan(math.pi/8))
        if face==6:
            cy=y0+(9.5-3)/19.5*(y1-y0);cx=(x0+x1)/2
            cover(draw,(cx-1.4*scale,cy-1.6*scale,cx+1.4*scale,cy+1.6*scale))
        if face in [1,5]:
            cy=y0+(9.5-7)/19.5*(y1-y0);cx=(x0+x1)/2
            box=(cx-2.0*scale,cy-.48*scale,cx+2.0*scale,cy+.48*scale)
            draw.rectangle(box,fill=(110,119,113),outline=(141,148,139),width=1)
            for y in range(round(box[1])+3,round(box[3])-2,4):draw.line((box[0]+3,y,box[2]-3,y),fill=(67,79,74),width=1)
        # Smaller lower-pod skin, also a unique strip for each facet.
        py0,py1=792,1184
        image.paste(paint((240,392),7200+face),(x0,py0));draw=ImageDraw.Draw(image)
        if face==2:
            cx=(x0+x1)/2;cy=(py0+py1)/2
            cover(draw,(cx-43,cy-55,cx+43,cy+55))
    # Roof artwork is a single planar XY projection. Seams follow the actual
    # octagonal construction; there are no trapezoid-mapped equipment decals.
    origin=(384,1664);scale=42
    def point(x,y):return (origin[0]+x*scale,origin[1]-y*scale)
    outer=7.72/math.cos(math.pi/8);inner=2.8/math.cos(math.pi/8)
    for i in range(8):
        a=(i+.5)*math.tau/8
        draw.line((point(inner*math.cos(a),inner*math.sin(a)),point(outer*math.cos(a),outer*math.sin(a))),fill=(154,160,149),width=1)
    roof_edge=[point(outer*math.cos((i+.5)*math.tau/8),outer*math.sin((i+.5)*math.tau/8)) for i in range(8)]
    draw.line(roof_edge+[roof_edge[0]],fill=(159,164,153),width=1)
    hx,hy=point(2,0)
    cover(draw,(hx-1.55*scale,hy-1.55*scale,hx+1.55*scale,hy+1.55*scale))
    OUT.parent.mkdir(parents=True,exist_ok=True);image.save(OUT,optimize=True)
    print(OUT)

if __name__=='__main__':build()
