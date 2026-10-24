(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var size=512,extent=12,angleRange=32;
    /** @type {Uint8Array|null} */var cached=null;
    // Ellis radial integral, reduced by spherical symmetry. The substitutions
    // l=sqrt(1-b*b)*sinh(u) (transmitted) and l=sqrt(b*b-1)*cosh(u)
    // (turning) remove the radial square-root singularity. See docs/ellis-bridge.md.
    /** @param {number} b @param {number} u @param {boolean} transmitted */
    function integrand(b,u,transmitted){
        var v=transmitted?Math.sinh(u):Math.cosh(u);
        return b/Math.sqrt(1+Math.abs(1-b*b)*v*v);
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
    function lookup(b,u){
        var data=table(),x=Math.max(0,Math.min(511,-Math.log(Math.max(Math.exp(-12),Math.abs(1-b)))/12*511)),y=Math.max(0,Math.min(511,u/12*511));
        var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,channel=b<1?0:2;
        /** @param {number} dx @param {number} dy */function at(dx,dy){var i=(Math.min(511,iy+dy)*512+Math.min(511,ix+dx))*4+channel;return (data[i]*256+data[i+1])*32/65535;}
        return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
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
        if(!other&&R>=2&&(along<=0||impact2>=4||distance<along-Math.sqrt(Math.max(0,4-impact2))))return {direction:straight,length:distance*a,impact:Math.sqrt(Math.max(0,impact2)),direct:true,turning:false};
        var cosine=Math.max(-1,Math.min(1,n.reduce(function(sum,v,i){return sum+v*m[i]*(other?-1:1);},0))),angle=Math.acos(cosine);
        var tangent=m.map(function(v,i){return v*(other?-1:1)-n[i]*cosine;}),tn=Math.hypot.apply(null,tangent);
        if(tn<.000001&&angle>.1)return null; // Axial caustic has no unique primary image.
        tangent=tn>.000001?tangent.map(function(v){return v/tn;}):[0,0,0];
        var E=Math.min(R,2),turning=false,outward=!other&&R<2&&S>R;
        /** @param {number} b @param {number} r */function u(b,r){var root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b))),l=Math.sqrt(Math.max(0,r*r-1));return b<1?Math.asinh(l/root):Math.acosh(Math.max(1,l/root));}
        /** @param {number} b */function entry(b){return R>2?Math.asin(Math.min(1,b/2))-Math.asin(Math.min(1,b/R)):0;}
        /** @param {number} b @param {boolean} sum */function phase(b,sum){var first=lookup(b,u(b,E)),last=lookup(b,u(b,S));return entry(b)+(sum?first+last:outward?last-first:first-last);}
        var low=0,high=.999999,decreasing=false;
        if(!other){
            high=Math.min(E,S)*(1-1e-7);
            var directLimit=R>=2&&S>=2?-1:phase(high,false);
            if(angle>directLimit){turning=true;low=1.000001;decreasing=true;if(high<=low||angle<phase(high,true))return null;}
        }
        for(var i=0;i<24;i++){var mid=(low+high)*.5,value=phase(mid,other||turning);if((value<angle)!==decreasing)low=mid;else high=mid;}
        var b=(low+high)*.5,sine=b/R,radial=(outward?1:-1)*Math.sqrt(Math.max(0,1-sine*sine));
        var direction=n.map(function(v,i){return v*radial+tangent[i]*sine;}),root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b)));
        /** @param {number} end */function arc(end){var total=0;for(var j=0;j<16;j++){var t=end*(j+.5)/16,l=root*(b<1?Math.sinh(t):Math.cosh(t));total+=Math.sqrt(1+l*l)*end/16;}return total;}
        var first=arc(u(b,E)),last=arc(u(b,S)),length=(other||turning?first+last:Math.abs(first-last));
        if(R>2)length+=Math.sqrt(Math.max(0,R*R-b*b))-Math.sqrt(Math.max(0,4-b*b));
        return {direction:direction,length:Math.max(.001,length*a),impact:b,direct:false,turning:turning};
    }
    var shader=`
uniform sampler2D ellisTable;
uniform float ellisRegion;
struct EllisRay {vec3 radial;vec3 tangent;float b;float u0;float f0;float entry;float side;float hit;float inward;};
float ellisAsinh(float x){return log(x+sqrt(x*x+1.));}
float ellisAcosh(float x){return log(x+sqrt(max(0.,x*x-1.)));}
float ellisIntegral(float b,float u){
    float x=clamp(-log(max(.000006144,abs(1.-b)))/12.,0.,1.);
    vec2 uv=(vec2(x,clamp(u/12.,0.,1.))*511.+.5)/512.;
    vec4 encoded=texture2D(ellisTable,uv);
    return (b<1.?dot(encoded.rg,vec2(65280.,255.)):dot(encoded.ba,vec2(65280.,255.)))*32./65535.;
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
    return normalize(radial*(24./r)*sqrt(max(0.,1.-s*s))+tangent*s);
}
`;
    // WebGL 1 GLSL has no hyperbolic built-ins.
    shader=shader.replace('uniform sampler2D ellisTable;',`uniform sampler2D ellisTable;
float ellisSinh(float x){return (exp(x)-exp(-x))*.5;}
float ellisCosh(float x){return (exp(x)+exp(-x))*.5;}`);
    DW.ellisOptics={primary:primary,lookup:lookup,table:table,integral:integral,shader:shader,size:size};
}());
