"""Rebuild the concept trio with Python's standard library. No runtime dependency."""
import base64
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'assets/ships/concept-trio'
ROOT.mkdir(parents=True, exist_ok=True)
COLORS = {'armor': [.70, .73, .74], 'dark': [.10, .14, .17],
          'glass': [.035, .12, .18], 'paint': [.65, .13, .12],
          'light': [.08, .65, 1.0], 'plate': [.61, .64, .64],
          'trim': [.39, .43, .45], 'machinery': [.20, .24, .25],
          'edge': [.81, .82, .79]}

RAPTOR_SECTIONS = [(-3.7,4.7),(-2.8,5.0),(0,25/7),(3,100/49),(5,50/49),(7,.015)]

def raptor_width(y):
    for (a,wa),(b,wb) in zip(RAPTOR_SECTIONS,RAPTOR_SECTIONS[1:]):
        if y<=b:return wa+(wb-wa)*max(0,(y-a)/(b-a))
    return RAPTOR_SECTIONS[-1][1]

def raptor_roof(x,y):
    # One continuous shallow roof from its center crease to the outer delta edge.
    edge=.02+.07*min(1,max(0,(7-y)/2))
    return edge+.18*max(0,raptor_width(y)-abs(x))

def texture():
    # Neutral tile: fine mottling, engraved panel joints and small fasteners.
    raw = bytearray()
    for y in range(256):
        raw.append(0)
        for x in range(256):
            value = 236 + ((x * 17 + y * 31 + x*y) % 9)
            if (x + (32 if y//32 % 2 else 0)) % 64 == 0 or y % 32 == 0:
                value = 174
            if x % 64 in (5, 58) and y % 32 in (5, 26):
                value = 155
            raw.extend([value]*3 + [255])
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))
    (ROOT/'panels.png').write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B',256,256,8,6,0,0,0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

class Mesh:
    def __init__(self):
        self.parts = []
        self.guns = []

    def tag(self,component,operation,*args,**kwargs):
        start=len(self.parts)
        operation(*args,**kwargs)
        for part in self.parts[start:]:
            part.setdefault('component',component)
            part['assembly']=component

    def face(self, material, points, stage=0):
        a,b,c = points[:3]
        u=[b[i]-a[i] for i in range(3)]; v=[c[i]-a[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(t*t for t in n))
        if length < 1e-9:
            return
        n=[t/length for t in n]
        axis=max(range(3),key=lambda i:abs(n[i])); axes=[i for i in range(3) if i!=axis]
        data=[]
        for i in range(1,len(points)-1):
            for p in (a,points[i],points[i+1]):
                # Keep the study UVs inside the tile: the shared WebGL viewer clamps.
                data.extend(p+n+[.5+p[axes[0]]*.06,.5+p[axes[1]]*.06])
        self.parts.append({'material':material,'stage':stage,'vertices':data})

    def hull(self, material, rings, stage=0):
        # Octagonal sections along +Y (nose), Z up.
        loops=[]
        for y,w,h,z in rings:
            loops.append([[w*x,y,z+h*t] for x,t in [(-.7,-1),(.7,-1),(1,-.55),(1,.55),(.7,1),(-.7,1),(-1,.55),(-1,-.55)]])
        self.face(material,loops[0],stage)
        for a,b in zip(loops,loops[1:]):
            for j in range(8):
                k=(j+1)%8
                self.face(material,[b[j],b[k],a[k],a[j]],stage)
        self.face(material,list(reversed(loops[-1])),stage)

    def box(self, material, x,y,z, w,l,h, stage=1):
        start=len(self.parts)
        self.hull(material,[(y-l/2,w/2,h/2,z),(y+l/2,w/2,h/2,z)],stage)
        for part in self.parts[start:]:
            for i in range(0,len(part['vertices']),8):part['vertices'][i]+=x

    def wing(self,material,outline,z,thickness,stage=0):
        if sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline))) < 0:
            outline=list(reversed(outline))
        top=[[x,y,z] for x,y in outline]; bottom=[[x,y,z-thickness] for x,y in outline]
        self.face(material,top,stage); self.face(material,list(reversed(bottom)),stage)
        for i in range(len(top)):
            j=(i+1)%len(top)
            self.face(material,[bottom[i],bottom[j],top[j],top[i]],stage)

    def pod(self,material,x,rings,stage=1):
        start=len(self.parts)
        self.hull(material,rings,stage)
        for part in self.parts[start:]:
            for i in range(0,len(part['vertices']),8):part['vertices'][i]+=x

    def gun(self,x,y,z,length=3):
        start=len(self.parts)
        component='gun-'+str(len(self.guns))
        self.guns.append({'position':[x,y,z],'length':length})
        self.pod('dark',x,[(y-length/2,.095,.095,z),(y+length/2,.095,.095,z)])
        for dy in (-length*.32,0,length*.29):
            self.pod('trim',x,[(y+dy-.09,.135,.135,z),(y+dy+.09,.135,.135,z)])
        self.pod('machinery',x,[(y-length/2-.25,.19,.19,z),(y-length/2+.2,.19,.19,z)])
        self.box('dark',x,y+length/2+.008,z,.12,.012,.12)
        for part in self.parts[start:]:part['component']=component

    def socket(self,x,y,z,w,h,depth,direction=1):
        shape=[(-.7,-1),(.7,-1),(1,-.55),(1,.55),(.7,1),(-.7,1),(-1,.55),(-1,-.55)]
        outer=[[x+u*w,y,z+v*h] for u,v in shape]
        inner=[[x+u*w*.73,y+direction*.008,z+v*h*.73] for u,v in shape]
        rear=[[p[0],y-direction*depth,p[2]] for p in inner]
        for j in range(8):
            k=(j+1)%8
            rim=[outer[j],outer[k],inner[k],inner[j]]
            if direction>0:rim.reverse()
            self.face('trim',rim,1)
            wall=[inner[j],inner[k],rear[k],rear[j]]
            if direction>0:wall.reverse()
            self.face('machinery',wall,1)
        self.face('dark',list(reversed(rear)) if direction>0 else rear,1)

    def fastener(self,x,y,z):
        self.face('trim',[[x+.035*math.cos(i*math.pi/3),y+.035*math.sin(i*math.pi/3),z] for i in range(6)],1)

    def canopy(self,rings):
        self.tag('canopy-shell',self.hull,'dark',rings,1)
        inner=[(y,w*.91,h*.94,z+.045) for y,w,h,z in rings]
        self.tag('canopy-glass',self.hull,'glass',inner,1)
        for y,w,h,z in rings[1:-1]:
            start=len(self.parts)
            self.hull('trim',[(y-.035,w*1.015,h*1.015,z+.045),(y+.035,w*1.015,h*1.015,z+.045)],1)
            # Frame bands wrap the glazing; filled end caps would block the pilot.
            del self.parts[-1]
            del self.parts[start]
            for part in self.parts[start:]:part['component']='canopy-frame'

    def fin(self,x):
        s=1 if x>0 else -1
        a=[[x,-3.8,.5],[x+s*.48,-4.35,2.8],[x+s*.48,-2.9,3],[x,-1.5,.5]]
        b=[[p[0]+s*.13,p[1],p[2]] for p in a]
        self.face('armor',a,1);self.face('armor',list(reversed(b)),1)
        for i in range(4):
            j=(i+1)%4
            self.face('armor',[a[i],b[i],b[j],a[j]],1)
        for side,offset in ((a,-s*.014),(b,s*.014)):
            # Inset contrasting armor and a narrow trailing red field.
            p=[[q[0]+offset,q[1],q[2]] for q in side]
            self.face('paint',[p[0],p[1],[(p[1][0]+p[2][0])/2,(p[1][1]+p[2][1])/2,(p[1][2]+p[2][2])/2],[(p[0][0]+p[3][0])/2,(p[0][1]+p[3][1])/2,(p[0][2]+p[3][2])/2]],2)

    def ring_segment(self, a,b,radius,width,z,depth,material='armor',stage=0):
        # Watertight horizontal annular wedge; width varies to taper the ends.
        poly=[(r*math.cos(t),r*math.sin(t)) for r,t in [(radius-width/2,a),(radius+width/2,a),(radius+width/2,b),(radius-width/2,b)]]
        self.wing(material,poly,z,depth,stage)

    def delta_body(self):
        start=len(self.parts)
        holes=[[[x+.32*math.cos(i*math.pi/12),2+.58*math.sin(i*math.pi/12)] for i in range(24)] for x in (-1.1,1.1)]
        def clip(poly,a,b,inside):
            def distance(p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
            out=[]
            for p,q in zip(poly,poly[1:]+poly[:1]):
                fp=distance(p)*(1 if inside else -1);fq=distance(q)*(1 if inside else -1)
                if fp>=-1e-10:out.append(p)
                if (fp>=-1e-10)!=(fq>=-1e-10):
                    t=fp/(fp-fq);out.append([p[k]+t*(q[k]-p[k]) for k in range(2)])
            return out
        def roof(poly):
            pieces=[poly]
            for hole in holes:
                result=[]
                for piece in pieces:
                    remainder=piece
                    for a,b in zip(hole,hole[1:]+hole[:1]):
                        if len(remainder)<3:break
                        outside=clip(remainder,a,b,False)
                        if len(outside)>=3:result.append(outside)
                        remainder=clip(remainder,a,b,True)
                pieces=result
            for piece in pieces:
                center=[sum(p[k] for p in piece)/len(piece) for k in range(2)]
                for p,q in zip(piece,piece[1:]+piece[:1]):
                    self.face('armor',[[*center,raptor_roof(*center)],[*p,raptor_roof(*p)],[*q,raptor_roof(*q)]])
        loops=[]
        for y,w in RAPTOR_SECTIONS:
            bottom=[[w*t,y,-.04-.135*w*(1-abs(t))] for t in (-1,-.5,0,.5,1)]
            top=[[w*t,y,raptor_roof(w*t,y)] for t in (1,.5,0,-.5,-1)]
            loops.append(bottom+top)
        for a,b in zip(loops,loops[1:]):
            for j in range(len(a)):
                k=(j+1)%len(a)
                points=[b[j],b[k],a[k],a[j]]
                if 5<=j<=8:roof([[p[0],p[1]] for p in points])
                else:self.face('armor',points)
        for loop,reverse in ((loops[0],False),(loops[-1],True)):
            center=[sum(p[k] for p in loop)/len(loop) for k in range(3)]
            for j in range(len(loop)):
                triangle=[center,loop[j],loop[(j+1)%len(loop)]]
                self.face('armor',list(reversed(triangle)) if reverse else triangle)
        for hole in holes:
            x=sum(p[0] for p in hole)/len(hole)
            outer=[[px,py,raptor_roof(px,py)] for px,py in hole]
            inner=[[x+.14*math.cos(i*math.pi/12),1.92+.28*math.sin(i*math.pi/12),
                    raptor_roof(x+.14*math.cos(i*math.pi/12),1.92+.28*math.sin(i*math.pi/12))-.30] for i in range(24)]
            for j in range(24):
                k=(j+1)%24;self.face('machinery',[outer[k],outer[j],inner[j],inner[k]])
                self.parts[-1]['component']='gun-port-funnel'
            center=[sum(p[k] for p in inner)/len(inner) for k in range(3)]
            for j in range(24):
                self.face('dark',[center,inner[j],inner[(j+1)%24]])
                self.parts[-1]['component']='gun-port-floor'
        # Conform clipped roof triangles and funnel edges to the same shared vertices.
        # This keeps the skin closed even where a circular port crosses a roof facet.
        original=self.parts[start:];self.parts=self.parts[:start]
        vertices={tuple(round(v,9) for v in part['vertices'][i:i+3]) for part in original for i in range(0,len(part['vertices']),8)}
        for part in original:
            v=part['vertices']
            for i in range(0,len(v),24):
                tri=[v[i+k:i+k+3] for k in (0,8,16)];boundary=[]
                for a,b in zip(tri,tri[1:]+tri[:1]):
                    delta=[b[k]-a[k] for k in range(3)];den=sum(t*t for t in delta)
                    if den<1e-16:continue
                    splits=[]
                    for p in vertices:
                        t=sum((p[k]-a[k])*delta[k] for k in range(3))/den
                        if 1e-7<t<1-1e-7 and sum((p[k]-a[k]-t*delta[k])**2 for k in range(3))<1e-15:splits.append((t,list(p)))
                    boundary.append(a);boundary.extend(p for t,p in sorted(splits))
                if len(boundary)<3:continue
                center=[sum(p[k] for p in tri)/3 for k in range(3)]
                for a,b in zip(boundary,boundary[1:]+boundary[:1]):
                    before=len(self.parts);self.face(part['material'],[center,a,b],part['stage'])
                    if len(self.parts)>before and 'component' in part:self.parts[-1]['component']=part['component']

    def recessed_gun_port(self,x):
        # Short barrel pitched through a flush opening in the sloping delta roof.
        pitch=math.atan(.6);c=math.cos(pitch);sn=math.sin(pitch)
        center=[x,1.91,-.024];length=.60;radius=.068;segments=24
        start=len(self.parts);index=len(self.guns)
        self.guns.append({'position':center,'length':length,'axis':[0,c,sn]})
        def ring(along,r):
            return [[x+r*math.cos(i*2*math.pi/segments),center[1]+along*c-r*math.sin(i*2*math.pi/segments)*sn,
                     center[2]+along*sn+r*math.sin(i*2*math.pi/segments)*c] for i in range(segments)]
        rear=ring(-length/2,radius);front=ring(length/2,radius)
        for j in range(segments):
            k=(j+1)%segments;self.face('dark',[front[j],front[k],rear[k],rear[j]],1)
        self.face('dark',rear,1)
        inner=ring(length/2+.002,radius*.72)
        for j in range(segments):
            k=(j+1)%segments;self.face('edge',[front[k],front[j],inner[j],inner[k]],1)
        dark=ring(length/2-.08,radius*.72)
        for j in range(segments):
            k=(j+1)%segments;self.face('dark',[inner[k],inner[j],dark[j],dark[k]],1)
        self.face('dark',list(reversed(dark)),1)
        for part in self.parts[start:]:part['component']='gun-'+str(index)

    def delta_patch(self,material,outline,stage=1,offset=.006):
        if sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))<0:
            outline=list(reversed(outline))
        def clip(poly,axis,bound,sign):
            result=[]
            for a,b in zip(poly,poly[1:]+poly[:1]):
                inside_a=sign*(a[axis]-bound)>=-1e-10
                inside_b=sign*(b[axis]-bound)>=-1e-10
                if inside_a:result.append(a)
                if inside_a!=inside_b:
                    t=(bound-a[axis])/(b[axis]-a[axis])
                    result.append([a[k]+t*(b[k]-a[k]) for k in range(2)])
            return result
        # Split at each shell station and the center crease so markings never
        # bridge a roof change and disappear underneath the primary surface.
        for (a,_),(b,_) in zip(RAPTOR_SECTIONS,RAPTOR_SECTIONS[1:]):
            for side in (-1,1):
                poly=clip(clip(clip(outline,1,a,1),1,b,-1),0,0,side)
                points=[[x,y,raptor_roof(x,y)+offset] for x,y in poly]
                for i in range(1,len(points)-1):self.face(material,[points[0],points[i],points[i+1]],stage)

    def arc_beam(self,a,b,radius,width,depth,center,vertical=False,material='armor',stage=0):
        # A swept octagonal beam: bevels belong to its cross-section, not a flat strip.
        section=[(-.7,-1),(.7,-1),(1,-.55),(1,.55),(.7,1),(-.7,1),(-1,.55),(-1,-.55)]
        loops=[]
        for t in (a,b):
            loop=[]
            for radial,cross in section:
                r=radius+radial*width/2
                loop.append([r*math.cos(t),center+cross*depth/2,r*math.sin(t)] if vertical else
                            [r*math.cos(t),r*math.sin(t),center+cross*depth/2])
            loops.append(loop)
        faces=[loops[0],loops[1]]
        for j in range(8):
            k=(j+1)%8
            faces.append([loops[0][j],loops[0][k],loops[1][k],loops[1][j]])
        midpoint=[sum(p[k] for loop in loops for p in loop)/16 for k in range(3)]
        for face in faces:
            a0,b0,c0=face[:3]
            u=[b0[k]-a0[k] for k in range(3)];v=[c0[k]-a0[k] for k in range(3)]
            n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            outward=[sum(p[k] for p in face)/len(face)-midpoint[k] for k in range(3)]
            if sum(n[k]*outward[k] for k in range(3))<0:face=list(reversed(face))
            self.face(material,face,stage)

def build(name):
    m=Mesh()
    if name=='raptor':
        # A single watertight delta shell replaces the separate fuselage and wings.
        m.tag('delta-body',m.delta_body)
        m.hull('plate',[(-3.8,.58,.22,.92),(-1.1,.63,.24,.91),(.1,.48,.12,.83)],1)
        for s in (-1,1):
            # Flush service panels and paint follow the same sloping roof as the shell.
            m.delta_patch('plate',[(s*1.96,.1),(s*2.35,.2),(s*3.8,-2.55),(s*1.96,-2.5)])
            m.delta_patch('armor',[(s*2.44,.15),(s*3.25,-.4),(s*4.80,-2.8),(s*3.90,-2.8)],1,.010)
            m.delta_patch('paint',[(s*1.55,-1.15),(s*4.75,-2.78),(s*4.58,-3.12),(s*1.55,-1.75)],2,.016)
            m.delta_patch('trim',[(s*3.05,-2.05),(s*3.55,-2.45),(s*3.40,-2.65),(s*2.91,-2.24)],1,.018)
            m.delta_patch('plate',[(s*1.0,-2.65),(s*4.45,-3.25),(s*4.40,-3.48),(s*1.0,-3.48)],1,.008)
            m.fin(s*1.38)
            m.pod('machinery',s*1.32,[(-4.8,.48,.43,.1),(-3.5,.58,.5,.1),(-1.5,.45,.38,.25)])
            m.pod('armor',s*1.32,[(-3.65,.56,.47,.13),(-1.8,.51,.44,.24),(-.7,.34,.27,.26)])
            m.pod('trim',s*1.32,[(-4.68,.5,.45,.1),(-4.52,.5,.45,.1)])
            m.socket(s*1.32,-4.86,.1,.46,.42,.32,-1)
            m.socket(s*1.32,-.66,.27,.30,.23,.35)
            m.recessed_gun_port(s*1.1)
            for y in (-3,-2.6,-2.2):m.box('dark',s*.73,y,1.19,.20,.20,.035)
            for x,y in ((2.0,-.25),(3.8,-2.7),(1.05,-2.8),(2.8,-2.8)):
                m.fastener(s*x,y,raptor_roof(s*x,y)+.02)
            for y in (-3.1,-2.25,-1.4):
                m.box('dark',s*.60,y,1.06,.08,.40,.17)
                m.box('edge',s*.61,y-.24,1.07,.08,.04,.20)
            # Flush cheek louvers leave the uninterrupted arrowhead surface intact.
            for y in (-1.55,-1.25,-.95):
                m.delta_patch('dark',[(s*1.56,y),(s*1.91,y),(s*1.86,y+.12),(s*1.53,y+.12)],1,.02)
        m.canopy([(-.45,.59,.18,.97),(.55,.67,.53,.92),(2.1,.51,.52,.76),(3.4,.12,.08,.48)])
        m.delta_patch('paint',[(-.20,3.45),(.20,3.45),(.015,6.8),(-.015,6.8)],2,.008)
        for y in (3.9,4.7,5.5):
            w=raptor_width(y)*.45
            m.delta_patch('trim',[(-w,y),(w,y),(w,y+.022),(-w,y+.022)],2,.012)
    elif name=='bulldog':
        m.hull('armor',[(-4,1,.65,0),(-1,1.05,.8,0),(3,.65,.55,0),(5,.25,.25,-.1)])
        m.hull('plate',[(-3.7,.67,.2,.78),(-1.3,.7,.28,.85),(-.5,.61,.12,.88)],1)
        m.tag('cockpit',m.canopy,[(.05,.46,.18,.84),(.8,.48,.47,.77),(2.0,.36,.47,.66),(3.05,.15,.08,.52)])
        # An opaque armored brow extends forward from the spine over the rear glazing.
        m.tag('cockpit-shroud',m.hull,'armor',[(-1.15,.65,.27,1.00),(.25,.63,.26,1.04),(.85,.51,.17,1.18)],1)
        m.box('plate',0,-.30,1.322,.75,.65,.035)
        for s in (-1,1):
            x=s*3.0
            m.tag('pod-attachment',m.box,'dark',s*1.75,-1,0,2.7,4,.55,0)
            # Main mechanical core, separately armored front and rear modules.
            m.tag('pod-core',m.pod,'dark',x,[(-5,.85,.74,0),(-3.6,1,.86,0),(-1,.72,.65,0),(1.8,.9,.79,0),(3.3,.83,.7,0)],0)
            m.pod('armor',x,[(-4.95,.85,.76,0),(-4.65,1.02,.92,0),(-2,1.02,.92,0),(-1.8,.82,.73,0)])
            m.pod('armor',x,[(-.35,.86,.77,0),(-.1,1.02,.92,0),(2.9,1.02,.92,0),(3.3,.83,.73,0)])
            for y in (-4.5,-3.5,-2.5,.15,1.15,2.15):
                m.box('plate',x,y,.944,1.36,.84,.055)
                m.box('plate',x+s*1.035,y,.08,.07,.84,.93)
            # Open front socket with thick bevels and an inset, louvered lamp panel.
            m.box('dark',x,3.33,0,1.39,.08,1.13)
            m.socket(x,3.48,0,.77,.64,.16)
            for z in (-.29,.29):m.box('light',x,3.395,z,.58,.025,.17,2)
            for z in (-.48,0,.48):m.box('trim',x,3.40,z,1.1,.1,.055)
            for dx in (-.54,.54):m.box('machinery',x+dx,3.40,0,.055,.1,.95)
            for y in (-4.0,2.2):
                m.box('paint',x,y,.979,1.36,.45,.02,2)
                m.box('paint',x+s*1.08,y,.20,.025,.45,.64,2)
            for y in (-1.6,-1.3,-1,-.7):
                m.box('machinery',x,y,.69,1.37,.16,.16)
                m.box('trim',x+s*.73,y,0,.10,.12,1.14)
            for dx in (-.48,.48):
                m.pod('trim',x+dx,[(-1.85,.06,.06,.72),(-.28,.06,.06,.72)])
            m.pod('dark',x,[(-5.1,.65,.58,0),(-4.98,.65,.58,0)])
            m.socket(x,-5.14,0,.75,.65,.22,-1)
            # Guns run forward from the inboard attachment housings, clear of the lamps.
            m.tag('gun-attachment',m.pod,'machinery',s*1.58,[(-1.55,.28,.30,-.22),(.9,.28,.30,-.22),(1.65,.21,.24,-.22)])
            m.gun(s*1.58,3.45,-.22,4.0)
            m.box('machinery',s*1.65,-1.3,.3,.43,2.15,.37)
            for y in (-2,-1.6,-1.2):m.box('trim',s*1.65,y,.52,.44,.12,.09)
            m.box('paint',s*.67,-2.7,1.065,.22,.75,.028,2)
            for y in (-4.5,-3.5,-2.5,.15,1.15,2.15):
                for dx in (-.54,.54):m.fastener(x+dx,y+.29,.981)
            m.box('dark',s*.52,-1.90,1.10,.19,.55,.06)
            for y in (-3.3,-2.8,-2.3):m.box('trim',s*.84,y,.86,.10,.30,.25)
        m.box('dark',0,4.75,-.13,.38,.08,.25)
        m.box('paint',0,-.2,1.35,.20,.90,.025,2)
        for s in (-1,1):
            m.pod('trim',s*1.85,[(-1.8,.06,.06,.29),(1.30,.06,.06,.29)])
            m.box('dark',s*.50,3.05,.32,.13,.34,.09)
    else:
        m.tag('central-body',m.hull,'armor',[(-3.6,.8,.5,0),(-1,1.05,.67,0),(1.3,.72,.48,0),(3.3,.14,.19,0)])
        m.canopy([(-.7,.55,.15,.7),(.05,.61,.65,.60),(1.0,.5,.7,.5),(2.25,.1,.1,.4)])
        m.hull('plate',[(-3.4,.5,.18,.57),(-1,.64,.23,.7),(-.6,.46,.13,.7)],1)
        # Two open lateral crescents and a standing rear arch.
        for s in (-1,1):
            for j in range(16):
                # Tapered end plates; each has a dark structural joint under it.
                a=math.radians(-75+j*150/16);b=math.radians(-75+(j+1)*150/16)
                if s<0:a,b=math.pi-b,math.pi-a
                width=.65+.55*math.sin((j+.5)*math.pi/16)
                m.tag('horizontal-ring',m.arc_beam,a,b,5.25,width*.96,.86,-.24,False,'dark',0)
                m.tag('horizontal-ring',m.arc_beam,a+.005,b-.005,5.25,width,.91,-.24,False,'armor',1)
                m.ring_segment(a+.012,b-.012,5.25,width*.58,.231,.035,'plate',1)
                if j in (10,11,12,13):
                    # Narrow light inset across the outward-facing rim.
                    radius=5.25+(width+.035)/2+.006
                    q=[[radius*math.cos(t),radius*math.sin(t),z] for t,z in [(a+.007,-.20),(b-.007,-.20),(b-.007,-.34),(a+.007,-.34)]]
                    m.face('light',list(reversed(q)),2)
                for t in (a+.035,b-.035):m.fastener(5.25*math.cos(t),5.25*math.sin(t),.237)
            m.wing('dark',[(s*.8,.4),(s*4.25,-.7),(s*4.35,-1.65),(s*.9,-1.8)],-.02,.25)
            m.wing('armor',[(s*.9,.32),(s*3.8,-.7),(s*4.16,-1.5),(s*.95,-1.63)],.065,.14,1)
            m.wing('plate',[(s*1.6,-.10),(s*3.55,-.8),(s*3.75,-1.30),(s*1.6,-1.27)],.092,.035,1)
            m.box('machinery',s*4.65,-3,-.05,2.0,.86,.76)
            m.box('armor',s*5.1,-3,.25,.68,1.0,.42)
            m.box('dark',s*5.1,-2.484,.12,.45,.025,.55)
            m.box('light',s*5.1,-2.46,.12,.12,.014,.35,2)
            m.pod('machinery',s*.87,[(-4.1,.30,.30,.17),(-2.4,.37,.35,.17)])
            m.pod('armor',s*.87,[(-3.8,.32,.32,.19),(-2.6,.35,.34,.19)])
            m.pod('dark',s*.87,[(-4.12,.21,.21,.17),(-4,.21,.21,.17)])
            m.socket(s*.87,-4.14,.17,.27,.27,.20,-1)
            for y in (-2.2,-1.6,-1.0):m.box('dark',s*.73,y,.78,.20,.36,.12)
            m.wing('paint',[(s*2,-.25),(s*3.4,-.76),(s*3.55,-1),(s*2,-.58)],.113,.012,2)
            m.box('dark',s*.50,-2.0,.91,.16,.55,.10)
            for y in (-3.2,-2.8):m.box('trim',s*1.10,y,.25,.1,.16,.43)
            for x,y in ((1.65,-.85),(3.4,-1.1)):m.fastener(s*x,y,.13)
        for j in range(24):
            a=j*math.pi/24;b=(j+1)*math.pi/24
            # Dark continuous inner chassis, then independently fitted armor tiles.
            m.tag('vertical-ring',m.arc_beam,a,b,5.25,.96,.84,-3.26,True,'dark',0)
            m.tag('vertical-ring',m.arc_beam,a+.004,b-.004,5.25,1.0,.88,-3.26,True,'armor',1)
            m.tag('vertical-ring',m.arc_beam,a+.012,b-.012,5.25,.63,.035,-2.805,True,'plate',1)
            if j in (3,4,5,18,19,20):
                front=[[r*math.cos(t),-2.775,r*math.sin(t)] for r,t in [(5.15,a+.006),(5.35,a+.006),(5.35,b-.006),(5.15,b-.006)]]
                m.face('dark',[[r*math.cos(t),-2.782,r*math.sin(t)] for r,t in [(5.10,b-.015),(5.40,b-.015),(5.40,a+.015),(5.10,a+.015)]],1)
                m.face('light',list(reversed(front)),2)
        for s in (-1,1):
            m.box('paint',s*.6,-2.1,.958,.22,.75,.025,2)
        m.gun(0,4.25,-.16,3.5)
        # Raised shoulders and small blue dorsal panels around the twin rear nacelles.
        for s in (-1,1):
            m.pod('armor',s*.92,[(-2.7,.28,.22,.49),(-1.2,.32,.23,.55),(-.6,.22,.12,.58)])
            m.box('paint',s*.92,-1.7,.80,.22,.62,.022,2)
            m.box('dark',s*1.01,-1.0,.70,.22,.32,.10)
    m.seat={'raptor':[0,1.0,.30],'bulldog':[0,1.12,.08],'halo':[0,.35,.16]}[name]
    return m

def export(name,m):
    colors=dict(COLORS)
    if name=='bulldog':colors['paint']=[.92,.58,.12];colors['light']=[1,.70,.22]
    if name=='halo':colors['paint']=[.18,.35,.58]
    model={'name':name.title(),'parts':m.parts,'colors':colors,'gunMounts':m.guns,'pilotSeat':m.seat}
    (ROOT/(name+'.json')).write_text(json.dumps(model,separators=(',',':')))
    blob=bytearray();views=[];accessors=[];primitives=[]
    def accessor(values,width,kind):
        offset=len(blob);blob.extend(struct.pack('<%sf'%len(values),*values))
        views.append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4,'target':34962})
        entry={'bufferView':len(views)-1,'componentType':5126,'count':len(values)//width,'type':kind}
        if kind=='VEC3':
            entry['min']=[min(values[i::width]) for i in range(width)]
            entry['max']=[max(values[i::width]) for i in range(width)]
        accessors.append(entry);return len(accessors)-1
    for material in colors:
        v=[n for p in m.parts if p['material']==material for n in p['vertices']]
        if not v:continue
        attrs={}
        for key,start,width,kind in [('POSITION',0,3,'VEC3'),('NORMAL',3,3,'VEC3'),('TEXCOORD_0',6,2,'VEC2')]:
            attrs[key]=accessor([v[i+k] for i in range(0,len(v),8) for k in range(start,start+width)],width,kind)
        primitives.append({'attributes':attrs,'material':list(colors).index(material)})
    materials=[]
    for key,color in colors.items():
        pbr={'baseColorFactor':color+[1],'metallicFactor':.25,'roughnessFactor':.7}
        if key in ('armor','paint','plate','edge'):pbr['baseColorTexture']={'index':0}
        mat={'name':key,'pbrMetallicRoughness':pbr,'doubleSided':True}
        if key=='light':mat['emissiveFactor']=color
        materials.append(mat)
    doc={'asset':{'version':'2.0','generator':'Driftworks concept trio'},'scene':0,'scenes':[{'nodes':[0]}],
         'nodes':[{'mesh':0,'rotation':[-math.sqrt(.5),0,0,math.sqrt(.5)]}],
         'meshes':[{'name':name,'primitives':primitives}],'materials':materials,
         'buffers':[{'uri':'data:application/octet-stream;base64,'+base64.b64encode(blob).decode(),'byteLength':len(blob)}],
         'bufferViews':views,'accessors':accessors,'images':[{'uri':'panels.png'}],
         'textures':[{'source':0,'sampler':0}],'samplers':[{'wrapS':10497,'wrapT':10497}]}
    (ROOT/(name+'.gltf')).write_text(json.dumps(doc,separators=(',',':')))

def flight_pack():
    """Bake material colors into atlases for the shared single-texture flight path."""
    models=[]
    engines={'raptor':[[-1.32,-4.86,.1,.36],[1.32,-4.86,.1,.36]],
             'bulldog':[[-3,-5.14,0,.60],[3,-5.14,0,.60]],
             'halo':[[-.87,-4.14,.17,.21],[.87,-4.14,.17,.21]]}
    for name in ('raptor','bulldog','halo'):
        source=json.loads((ROOT/(name+'.json')).read_text(encoding='utf-8'))
        colors=source['colors'];slots=list(colors);raw=bytearray()
        for y in range(512):
            raw.append(0)
            for x in range(512):
                slot=(y//128)*4+x//128
                key=slots[slot] if slot<len(slots) else 'armor';color=colors[key]
                tx=x%128;ty=y%128;shade=1.0
                if key in ('armor','plate','paint','edge'):
                    shade=(236+(tx*17+ty*31+tx*ty)%9)/255
                    if (tx+(16 if ty//16%2 else 0))%32==0 or ty%16==0:shade=174/255
                    if tx%32 in (3,28) and ty%16 in (3,12):shade=155/255
                raw.extend([round(255*c*shade) for c in color]+[255])
        def chunk(kind,data):
            return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
        (ROOT/(name+'-flight.png')).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',512,512,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
        points=[p['vertices'][i:i+3] for p in source['parts'] for i in range(0,len(p['vertices']),8)]
        center=[(min(p[a] for p in points)+max(p[a] for p in points))/2 for a in range(3)]
        scale=8.5/max(math.dist(p,center) for p in points)
        def position(p):return [round((p[a]-center[a])*scale,6) for a in range(3)]
        vertices=[];textured=[]
        for part in source['parts']:
            slot=slots.index(part['material']);col=slot%4;row=slot//4;v=part['vertices']
            for i in range(0,len(v),8):
                point=position(v[i:i+3])+v[i+3:i+6]
                vertices.extend(point)
                # Half-texel inset prevents atlas neighbors bleeding into small facets.
                uv=[(col*128+.5+max(0,min(1,v[i+6]))*127)/512,(row*128+.5+max(0,min(1,v[i+7]))*127)/512]
                textured.extend(point+[round(n,7) for n in uv])
        mounts=[position([g['position'][a]+g.get('axis',[0,1,0])[a]*g['length']/2 for a in range(3)]) for g in source['gunMounts']]
        models.append({'id':'concept-trio:'+name,'name':{'raptor':'V-1 Raptor','bulldog':'B-2 Bulldog','halo':'C-3 Halo'}[name],
                       'triangles':len(vertices)//18,'vertices':vertices,'texturedVertices':textured,'texture':name+'-flight.png',
                       'gunMounts':mounts,'engineMounts':[position(e[:3])+[round(e[3]*scale,6)] for e in engines[name]]})
    pack={'id':'concept-trio','author':'Driftworks','license':'Project concept studies (see provenance)',
          'url':'../assets/ships/concept-trio/README.md','models':models}
    (ROOT/'meshes.js').write_text('// Generated by tools/generate-concept-ships.py; authored concept-study meshes.\n'
        'window.Driftworks.shipPacks=window.Driftworks.shipPacks||[];\nwindow.Driftworks.shipPacks.push('+json.dumps(pack,separators=(',',':'))+');\n',encoding='utf-8')

if __name__=='__main__':
    texture()
    for name in ('raptor','bulldog','halo'):export(name,build(name))
    flight_pack()
