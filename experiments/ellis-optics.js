(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var size=512,extent=12,angleRange=32;
    /** @type {Uint8Array|null} */var cached=null;
    // Ellis radial integral, reduced by spherical symmetry. The substitutions
    // l=sqrt(1-b*b)*sinh(u) (transmitted) and l=sqrt(b*b-1)*cosh(u)
    // (turning) remove the radial square-root singularity. See docs/ellis-bridge.md.
    // Compact optical metric: retain Ellis inside 1.5a, smoothly flatten
    // by 2a. dr^2/(1-q/r^2) joins Euclidean space with two derivatives.
    /** @param {number} r2 */
    function radialScale(r2){
        var t=Math.max(0,Math.min(1,(Math.sqrt(r2)-1.5)*2));
        var q=1-t*t*t*(10+t*(-15+6*t));
        return r2<=2.25?1:Math.sqrt((r2-1)/(r2-q));
    }
    /** @param {number} b @param {number} u @param {boolean} transmitted */
    function integrand(b,u,transmitted){
        var v=transmitted?Math.sinh(u):Math.cosh(u);
        var r2=1+Math.abs(1-b*b)*v*v;
        return b/Math.sqrt(r2)*radialScale(r2);
    }
    /** @param {number} b @param {number} u @param {number} [steps] */
    function integral(b,u,steps){
        var count=steps||2048,h=u/count,sum=0;
        for(var i=0;i<count;i++)sum+=integrand(b,(i+.5)*h,b<1)*h;
        return sum;
    }
    function table(){
        if(cached)return cached;
        var data=new Uint8Array(size*size*4),h=extent/(size-1);
        for(var x=0;x<size;x++){
            var delta=Math.exp(-extent*x/(size-1)),near=1-delta,far=1+delta,a=0,b=0;
            for(var y=0;y<size;y++){
                if(y){a+=integrand(near,(y-.5)*h,true)*h;b+=integrand(far,(y-.5)*h,false)*h;}
                var ai=Math.round(a/angleRange*65535),bi=Math.round(b/angleRange*65535),i=(y*size+x)*4;
                data[i]=ai>>8;data[i+1]=ai&255;data[i+2]=bi>>8;data[i+3]=bi&255;
            }
        }
        cached=data;return data;
    }

    /** Same packed/bilinear radial integral used by the GPU. @param {number} b @param {number} u */
    function packedLookup(b,u){
        var data=table(),x=Math.max(0,Math.min(511,-Math.log(Math.max(Math.exp(-12),Math.abs(1-b)))/12*511)),y=Math.max(0,Math.min(511,u/12*511));
        var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,channel=b<1?0:2;
        /** @param {number} dx @param {number} dy */function at(dx,dy){var i=(Math.min(511,iy+dy)*512+Math.min(511,ix+dx))*4+channel;return (data[i]*256+data[i+1])*32/65535;}
        return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
    }
    /** Flat exterior tail is analytic: no quantized phase jump at 2a.
     * @param {number} b @param {number} u */
    function lookup(b,u){
        var root=Math.sqrt(Math.max(.0000001,Math.abs(1-b*b)));
        var edge=b<1?Math.asinh(Math.sqrt(3)/root):Math.acosh(Math.max(1,Math.sqrt(3)/root));
        if(u<=edge)return packedLookup(b,u);
        var l=root*(b<1?Math.sinh(u):Math.cosh(u)),r=Math.sqrt(1+l*l);
        return packedLookup(b,edge)+Math.asin(Math.min(1,b/2))-Math.asin(Math.min(1,b/r));
    }
    /** Primary finite-source optical path, restricted to the existing 2a entry sphere.
     * Coordinates are metres; chart translation has no physical distance.
     * @param {number[]} eye @param {number[]} target @param {number} region @param {number} destination */
    function primary(eye,target,region,destination){
        var a=300,O=eye.map(function(v,i){return (v-[region*12000,-2000,1550][i])/a;}),T=target.map(function(v,i){return (v-[destination*12000,-2000,1550][i])/a;});
        var R=Math.max(1.000000000001,Math.hypot.apply(null,O)),S=Math.hypot.apply(null,T);
        if(S<1){T=T.map(function(v){return -v*(2-S)/Math.max(.000001,S);});S=2-S;destination=1-destination;}
        S=Math.max(1.000000000001,S);
        var n=O.map(function(v){return v/R;}),m=T.map(function(v){return v/S;}),other=region!==destination;
        var delta=T.map(function(v,i){return v-O[i];}),distance=Math.hypot.apply(null,delta);
        var straight=delta.map(function(v){return v/Math.max(.000001,distance);}),along=-O.reduce(function(sum,v,i){return sum+v*straight[i];},0),impact2=R*R-along*along;
        // Finite-source paths stay on the same metric as projectiles, including nearby ships.
        if(!other&&R>=2&&(along<=0||impact2>=4||distance<along-Math.sqrt(Math.max(0,4-impact2))))return {direction:straight,sourceDirection:straight,length:distance*a,impact:Math.sqrt(Math.max(0,impact2)),direct:true,turning:false};
        var cosine=Math.max(-1,Math.min(1,n.reduce(function(sum,v,i){return sum+v*m[i]*(other?-1:1);},0))),angle=Math.acos(cosine);
        var tangent=m.map(function(v,i){return v*(other?-1:1)-n[i]*cosine;}),tn=Math.hypot.apply(null,tangent);
        if(tn<.000001&&angle>.1)return null; // Axial caustic has no unique primary image.
        tangent=tn>.000001?tangent.map(function(v){return v/tn;}):[0,0,0];
        var E=Math.min(R,2),turning=false,outward=!other&&R<2&&S>R;
        /** @param {number} b @param {number} r */function u(b,r){var root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b))),l=Math.sqrt(Math.max(0,r*r-1));return b<1?Math.asinh(l/root):Math.acosh(Math.max(1,l/root));}
        /** @param {number} b */function entry(b){return R>2?Math.asin(Math.min(1,b/2))-Math.asin(Math.min(1,b/R)):0;}
        // Subtracting two large, quantized integrals near b=1 creates branch jumps.
        // Integrate the finite segment directly; its u span remains well behaved.
        /** @param {number} b @param {boolean} arcLength */function segment(b,arcLength){
            var first=u(b,E),last=u(b,S),h=(last-first)/24,total=0,root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b)));
            for(var j=0;j<24;j++){var t=first+(j+.5)*h,l=root*(b<1?Math.sinh(t):Math.cosh(t)),r2=1+l*l;total+=(arcLength?Math.sqrt(r2):b/Math.sqrt(r2))*radialScale(r2);}
            return Math.abs(total*h);
        }
        /** @param {number} b @param {boolean} sum */function phase(b,sum){return entry(b)+(sum?lookup(b,u(b,E))+lookup(b,u(b,S)):segment(b,false));}
        var low=0,high=.999999,decreasing=false;
        if(!other){
            high=Math.min(E,S);
            var directLimit=R>=2&&S>=2?-1:phase(high,false);
            if(angle>directLimit){turning=true;low=1.000001;decreasing=true;if(high<=low||angle<phase(high,true))return null;}
        }
        for(var i=0;i<24;i++){var mid=(low+high)*.5,value=phase(mid,other||turning);if((value<angle)!==decreasing)low=mid;else high=mid;}
        var b=(low+high)*.5,sine=b/R,radial=(outward&&!turning?1:-1)*Math.sqrt(Math.max(0,1-sine*sine));
        var direction=n.map(function(v,i){return v*radial+tangent[i]*sine;}),root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b)));
        /** Accurate arc time: integrate the compact core, use its analytic flat tail.
         * @param {number} end */function arc(end){
            var edge=u(b,2),join=u(b,1.5),stop=Math.min(end,edge),total=0,first=0;
            for(var part=0;part<2;part++){
                var last=part===0?Math.min(stop,join):stop,h=(last-first)/32;
                for(var j=0;j<=32;j++){var t=first+j*h,l=root*(b<1?Math.sinh(t):Math.cosh(t)),r2=1+l*l;total+=Math.sqrt(r2)*radialScale(r2)*h*(j===0||j===32?1:j%2?4:2)/3;}
                first=last;
            }
            if(end>edge){var l=root*(b<1?Math.sinh(end):Math.cosh(end));total+=Math.sqrt(Math.max(0,1+l*l-b*b))-Math.sqrt(Math.max(0,4-b*b));}
            return total;
        }
        var targetTangent=m.map(function(v,i){return (cosine*v-n[i]*(other?-1:1))/Math.max(.000001,tn);});
        var sourceDirection=m.map(function(v,i){return v*(other||turning||outward?1:-1)*Math.sqrt(Math.max(0,1-b*b/(S*S)))+targetTangent[i]*b/S;});
        var length=other||turning?arc(u(b,E))+arc(u(b,S)):segment(b,true);
        if(R>2)length+=Math.sqrt(Math.max(0,R*R-b*b))-Math.sqrt(Math.max(0,4-b*b));
        var sourceNorm=Math.hypot.apply(null,sourceDirection);sourceDirection=sourceDirection.map(function(v){return v/Math.max(.000001,sourceNorm);});
        return {direction:direction,sourceDirection:sourceDirection,length:Math.max(.001,length*a),impact:b,direct:false,turning:turning};
    }
    /** @typedef {import('./types').OpticalRay} OpticalRay */
    /** Start an unguided optical-metric projectile. All positions/distances are metres.
     * @param {number[]} eye @param {number[]} direction @param {number} region @returns {OpticalRay} */
    function ray(eye,direction,region){
        var n=Math.hypot.apply(null,direction);
        return {eye:eye.slice(),direction:direction.map(function(v){return v/n;}),region:region,originRegion:region,active:false,l:0,p:0,b:0,phase:0,radial:[0,0,0],tangent:[0,0,0]};
    }
    /** Integrate the optical Hamiltonian with RK4. p is local radial velocity;
     * p^2+b^2/(1+l^2)=1, dphi/ds=b/(1+l^2). The compact radial scale is shared
     * with the image integrals. No target information enters projectile motion.
     * @param {OpticalRay} r @param {number} h */
    function rayStep(r,h){
        /** @param {number} l @param {number} p */function derivative(l,p){var r2=1+l*l,A=radialScale(r2);return [p/A,r.b*r.b*l/(A*r2*r2),r.b/r2];}
        var a=derivative(r.l,r.p),b=derivative(r.l+a[0]*h*.5,r.p+a[1]*h*.5),c=derivative(r.l+b[0]*h*.5,r.p+b[1]*h*.5),d=derivative(r.l+c[0]*h,r.p+c[1]*h);
        return {l:r.l+h*(a[0]+2*b[0]+2*c[0]+d[0])/6,p:r.p+h*(a[1]+2*b[1]+2*c[1]+d[1])/6,phase:r.phase+h*(a[2]+2*b[2]+2*c[2]+d[2])/6};
    }
    /** @param {OpticalRay} r @param {number} distance
     * @returns {{start:number[];end:number[];region:number;direction:number[]}[]} */
    function advanceRay(r,distance){
        var segments=/** @type {{start:number[];end:number[];region:number;direction:number[]}[]} */([]),remaining=Math.max(0,distance);
        /** @param {number[]} end @param {number} side @param {number[]} direction */function append(end,side,direction){segments.push({start:r.eye,end:end,region:side,direction:direction});r.eye=end;r.region=side;r.direction=direction;}
        while(remaining>1e-8){
            if(!r.active){
                var O=r.eye.map(function(v,i){return v-[r.region*12000,-2000,1550][i];}),R=Math.hypot.apply(null,O),along=O.reduce(function(sum,v,i){return sum+v*r.direction[i];},0),disc=along*along-R*R+360000;
                if(R>=600-1e-6){
                    var entry=along<0&&disc>0?Math.max(0,-along-Math.sqrt(disc)):Infinity;
                    if(entry>=remaining||!Number.isFinite(entry)){append(r.eye.map(function(v,i){return v+r.direction[i]*remaining;}),r.region,r.direction);break;}
                    if(entry>1e-8){append(r.eye.map(function(v,i){return v+r.direction[i]*entry;}),r.region,r.direction);remaining-=entry;O=r.eye.map(function(v,i){return v-[r.region*12000,-2000,1550][i];});R=600;}
                }
                r.originRegion=r.region;r.radial=O.map(function(v){return v/Math.max(1e-10,R);});
                r.p=Math.max(-1,Math.min(1,r.direction.reduce(function(sum,v,i){return sum+v*r.radial[i];},0)));r.b=R/300*Math.sqrt(Math.max(0,1-r.p*r.p));
                var t=r.direction.map(function(v,i){return v-r.radial[i]*r.p;}),tn=Math.hypot.apply(null,t);r.tangent=t.map(function(v){return v/Math.max(1e-12,tn);});
                r.l=Math.sqrt(Math.max(1e-12,R*R/90000-1));r.phase=0;r.active=true;
            }
            var h=Math.min(remaining,6)/300,next=rayStep(r,h),crossed=r.l*next.l<0;
            if(crossed){
                var lo=0,hi=h;for(var j=0;j<24;j++){var m=(lo+hi)*.5,state=rayStep(r,m);if(state.l*r.l>0)lo=m;else hi=m;}
                var edge=rayStep(r,(lo+hi)*.5),q=r.radial.map(function(v,i){return v*Math.cos(edge.phase)+r.tangent[i]*Math.sin(edge.phase);}),sign=r.l<0?-1:1;
                append(q.map(function(v,i){return [r.region*12000,-2000,1550][i]+sign*v*300;}),r.region,r.direction);
                // The throat's two chart positions are identified, never sweep the storage gap.
                r.region=1-r.region;r.eye=q.map(function(v,i){return [r.region*12000,-2000,1550][i]-sign*v*300;});
            }
            r.l=next.l;r.p=next.p;r.phase=next.phase;var radius=Math.sqrt(1+r.l*r.l),side=r.l<0?1-r.originRegion:r.originRegion,sign=r.l<0?-1:1,co=Math.cos(r.phase),si=Math.sin(r.phase);
            var q=r.radial.map(function(v,i){return v*co+r.tangent[i]*si;}),t=r.radial.map(function(v,i){return -v*si+r.tangent[i]*co;}),direction=q.map(function(v,i){return v*r.p+sign*t[i]*r.b/radius;}),norm=Math.hypot.apply(null,direction);direction=direction.map(function(v){return v/norm;});
            append(q.map(function(v,i){return [side*12000,-2000,1550][i]+sign*v*radius*300;}),side,direction);remaining-=h*300;
            if(radius>=2&&r.l*r.p>0)r.active=false;
        }
        return segments;
    }
    var shader=`
uniform sampler2D ellisTable;
uniform float ellisRegion;
struct EllisRay {vec3 radial;vec3 tangent;float b;float u0;float f0;float entry;float side;float hit;float inward;};
// Same local visual-frame policy as the CPU primary-image projection.
float ellisLocalWeight(vec3 eye,vec3 point,float side){
    vec3 mouth=vec3(ellisRegion*12000.,-2000.,1550.);
    // Fade back to the shared throat solution before a chart transition.
    return side==ellisRegion?(1.-smoothstep(100.,200.,length(point-eye)))*smoothstep(300.,330.,length(eye-mouth))*smoothstep(300.,330.,length(point-mouth)):0.;
}
float ellisAsinh(float x){return log(x+sqrt(x*x+1.));}
float ellisAcosh(float x){return log(x+sqrt(max(0.,x*x-1.)));}
float ellisPackedIntegral(float b,float u){
    float x=clamp(-log(max(.000006144,abs(1.-b)))/12.,0.,1.);
    vec2 uv=(vec2(x,clamp(u/12.,0.,1.))*511.+.5)/512.;
    vec4 encoded=texture2D(ellisTable,uv);
    return (b<1.?dot(encoded.rg,vec2(65280.,255.)):dot(encoded.ba,vec2(65280.,255.)))*32./65535.;
}
float ellisIntegral(float b,float u){
    float root=sqrt(max(.0000001,abs(1.-b*b)));
    float edge=b<1.?ellisAsinh(sqrt(3.)/root):ellisAcosh(max(1.,sqrt(3.)/root));
    float phase=ellisPackedIntegral(b,min(u,edge));
    if(u>edge){
        float l=root*(b<1.?ellisSinh(u):ellisCosh(u));
        float r=sqrt(1.+l*l);
        phase+=asin(min(1.,b/2.))-asin(min(1.,b/r));
    }
    return phase;
}
EllisRay ellisInit(vec3 eye,vec3 ray){
    float side=ellisRegion;
    vec3 offset=(eye-vec3(side*12000.,-2000.,1550.))/300.;
    float along=dot(offset,ray),impact2=max(0.,dot(offset,offset)-along*along);
    bool inside=dot(offset,offset)<4.;
    float hit=inside||(along<0.&&impact2<4.)?1.:0.;
    float entry=inside?0.:max(0.,-along-sqrt(max(0.,4.-impact2)));
    vec3 p=offset+ray*entry;
    float r=max(1.000001,length(p)),l=sqrt(max(0.,r*r-1.));
    vec3 radial=p/max(.000001,length(p));
    float cosine=dot(ray,radial),b=min(1.999999,r*sqrt(max(0.,1.-cosine*cosine)));
    // A deterministic perpendicular also keeps exactly radial rays finite.
    vec3 fallback=normalize(cross(radial,abs(radial.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.)));
    vec3 tangent=ray-radial*cosine;
    tangent=length(tangent)>.000001?normalize(tangent):fallback;
    float root=sqrt(max(.0000001,abs(1.-b*b)));
    float u=b<1.?ellisAsinh(l/root):ellisAcosh(max(1.,l/root));
    return EllisRay(radial,tangent,b,u,ellisIntegral(b,u),entry*300.,side,hit,cosine<0.?1.:0.);
}
vec3 ellisPointPhase(EllisRay e,float t,out float side,out float travel){
    float root=sqrt(max(.0000001,abs(1.-e.b*e.b)));
    float end=e.b<1.?ellisAsinh(24./root):ellisAcosh(max(1.,24./root));
    float start=e.inward>.5&&e.b>=1.?-e.u0:e.u0;
    float finish=e.inward>.5&&e.b<1.?-end:end;
    float u=mix(start,finish,t);
    float l=root*(e.b<1.?ellisSinh(u):ellisCosh(u));
    float phi=e.inward<.5?ellisIntegral(e.b,abs(u))-e.f0:e.f0+(e.b<1.?-sign(u):sign(u))*ellisIntegral(e.b,abs(u));
    travel=phi;
    vec3 radial=e.radial*cos(phi)+e.tangent*sin(phi);
    side=e.b<1.&&u<0.?1.-e.side:e.side;
    if(e.b<1.&&u<0.)radial=-radial;
    return vec3(side*12000.,-2000.,1550.)+radial*sqrt(1.+l*l)*300.;
}
vec3 ellisPoint(EllisRay e,float t,out float side){float travel;return ellisPointPhase(e,t,side,travel);}
vec3 ellisExit(EllisRay e){
    float side;vec3 point=ellisPoint(e,1.,side);
    vec3 radial=normalize(point-vec3(side*12000.,-2000.,1550.));
    vec3 tangent=cross(normalize(cross(e.radial,e.tangent)),radial);
    // Recover the asymptotic direction analytically from conserved impact b.
    // Differencing two quantized table positions magnifies lookup error into
    // visible stripes in the sky direction, especially at a planet silhouette.
    float r=sqrt(577.),s=e.b/r;
    return normalize(radial*sqrt(max(0.,1.-s*s))+tangent*s);
}
`;
    // WebGL 1 GLSL has no hyperbolic built-ins.
    shader=shader.replace('uniform sampler2D ellisTable;',`uniform sampler2D ellisTable;
float ellisSinh(float x){return (exp(x)-exp(-x))*.5;}
float ellisCosh(float x){return (exp(x)+exp(-x))*.5;}`);
    // A static spherical coordinate lattice. Intersect three radial shells
    // analytically in the ray's u coordinate, then sample their angular wires.
    // This shares the baked integral and does not march arbitrary geometry.
    var latticeShader=`
vec4 ellisLatticeWire(vec3 radial,float side,float radius,vec3 eye,float pixel,float phase){
    vec3 localEye=eye-vec3(ellisRegion*12000.,-2000.,1550.);
    // Chart translations are storage offsets, never optical distances.
    float span=side!=ellisRegion?max(30.,length(localEye)+radius*300.-600.):length(radial*radius*300.-localEye);
    float width=clamp(pixel*span/(radius*300.),.0007,.012);
    float spacing=.5235987756;
    float longitude=atan(radial.y,radial.x+1.e-8),latitude=asin(clamp(radial.z,-1.,1.));
    float meridian=abs(mod(longitude+spacing*.5,spacing)-spacing*.5)*max(.08,length(radial.xy));
    float parallel=abs(mod(latitude+spacing*.5,spacing)-spacing*.5);
    float wire=1.-smoothstep(width,width*2.,min(meridian,parallel));
    // Suppress highly wound copies: this is a navigation scaffold, not scenery.
    wire*=1.-smoothstep(2.7,3.14159265,abs(phase));
    wire*=smoothstep(.025,.12,length(radial.xy));
    vec3 color=side<.5?vec3(1.,.64,.20):vec3(.18,.82,1.);
    return vec4(color,wire*.38);
}
vec4 ellisLattice(EllisRay e,vec3 eye,float pixel){
    vec4 result=vec4(0.);
    float root=sqrt(max(.0000001,abs(1.-e.b*e.b)));
    for(int i=0;i<3;i++){
        float radius=1.0001+float(i)*.49995;
        float l=sqrt(max(0.,radius*radius-1.));
        float u=e.b<1.?ellisAsinh(l/root):ellisAcosh(max(1.,l/root));
        // Keep the lookup outside all per-surface visibility branches.
        float integral=ellisIntegral(e.b,u);
        float reachable=e.b<=radius?1.:0.;
        for(int j=0;j<2;j++){
            float side=e.side,phase=0.,visible=reachable;
            if(e.inward>.5){
                if(j==0){phase=e.f0-integral;visible*=u<=e.u0?1.:0.;}
                else{phase=e.f0+integral;if(e.b<1.)side=1.-side;}
            }else{
                phase=integral-e.f0;visible*=j==0&&u>=e.u0?1.:0.;
            }
            vec3 radial=e.radial*cos(phase)+e.tangent*sin(phase);
            if(side!=e.side)radial=-radial;
            vec4 wire=ellisLatticeWire(radial,side,radius,eye,pixel,phase);
            float alpha=wire.a*visible;
            result.rgb+=(1.-result.a)*wire.rgb*alpha;
            result.a+=(1.-result.a)*alpha;
        }
    }
    return result;
}`;
    DW.ellisOptics={ray:ray,advanceRay:advanceRay,primary:primary,lookup:lookup,table:table,integral:integral,shader:shader,latticeShader:latticeShader,size:size};
}());
