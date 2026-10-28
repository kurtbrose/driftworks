(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {number[]} a @param {number[]} b */
    function dot(a,b){return a.reduce(function(s,v,i){return s+v*b[i];},0);}
    /** @param {number[]} v */
    function unit(v){var r=Math.hypot.apply(null,v);return v.map(function(x){return x/Math.max(1e-12,r);});}
    /** @param {number} side */
    function center(side){return [side*12000,-2000,1550];}
    /** @param {number[]} v @param {number[]} n */
    function transport(v,n){var d=dot(v,n);return v.map(function(x,i){return 2*d*n[i]-x;});}
    /** Exact straight legs joined at the antipodal 300 m shell. Distances are metres.
     * @param {number[]} eye @param {number[]} target @param {number} region @param {number} destination */
    function primary(eye,target,region,destination){
        var O=eye.map(function(v,i){return v-center(region)[i];}),T=target.map(function(v,i){return v-center(destination)[i];});
        var R=Math.hypot.apply(null,O),S=Math.hypot.apply(null,T),a=300;
        if(S<a){T=T.map(function(v){return -v*(2*a-S)/Math.max(1e-12,S);});S=2*a-S;destination=1-destination;}
        if(R<a-1e-6||S<a-1e-6)return null;
        R=Math.max(a,R);S=Math.max(a,S);
        var n=unit(O),m=unit(T),delta=T.map(function(v,i){return v-O[i];}),length=Math.hypot.apply(null,delta),direction=unit(delta);
        if(region===destination){
            var along=-dot(O,direction),impact2=R*R-along*along;
            if(along>0&&impact2<a*a-1e-7&&along-Math.sqrt(Math.max(0,a*a-impact2))<length-1e-7)return null;
            return {direction:direction,sourceDirection:direction,length:length,impact:Math.sqrt(Math.max(0,impact2))/a,direct:true,turning:false};
        }
        var cosine=Math.max(-1,Math.min(1,-dot(n,m))),angle=Math.acos(cosine);
        // A flat exterior has no wound or returning images. Past the grazing
        // limit there is no connecting null ray, so HUD and guns must agree.
        var limit=Math.PI-Math.asin(a/R)-Math.asin(a/S);
        if(angle>limit+1e-10)return null;
        var tangent=unit(m.map(function(v,i){return -v-n[i]*cosine;})),low=0,high=a;
        for(var i=0;i<48;i++){
            var b=(low+high)*.5,phase=2*Math.asin(b/a)-Math.asin(b/R)-Math.asin(b/S);
            if(phase<angle)low=b;else high=b;
        }
        var impact=(low+high)*.5;
        direction=n.map(function(v,i){return -v*Math.sqrt(Math.max(0,1-impact*impact/(R*R)))+tangent[i]*impact/R;});
        var entryDistance=Math.sqrt(Math.max(0,R*R-impact*impact))-Math.sqrt(Math.max(0,a*a-impact*impact));
        var normal=unit(O.map(function(v,i){return v+direction[i]*entryDistance;}));
        var outgoing=transport(direction,normal);
        length=entryDistance+Math.sqrt(Math.max(0,S*S-impact*impact))-Math.sqrt(Math.max(0,a*a-impact*impact));
        return {direction:direction,sourceDirection:outgoing,length:length,impact:impact/a,direct:false,turning:false};
    }
    /** @param {import('./types').OpticalRay} r @param {number} distance */
    function advanceRay(r,distance){
        var remaining=Math.max(0,distance),O=r.eye.map(function(v,i){return v-center(r.region)[i];});
        var along=dot(O,r.direction),disc=along*along-dot(O,O)+90000;
        var entry=along<0&&disc>1e-9?-along-Math.sqrt(disc):Infinity;
        var segments=/** @type {{start:number[];end:number[];region:number;direction:number[]}[]} */([]);
        /** @param {number[]} end */function append(end){segments.push({start:r.eye.slice(),end:end,region:r.region,direction:r.direction.slice()});r.eye=end;}
        if(entry>=-1e-7&&entry<=remaining){
            entry=Math.max(0,entry);append(r.eye.map(function(v,i){return v+r.direction[i]*entry;}));
            var n=unit(r.eye.map(function(v,i){return v-center(r.region)[i];}));
            r.region=1-r.region;r.eye=n.map(function(v,i){return center(r.region)[i]-300*v;});r.direction=transport(r.direction,n);remaining-=entry;
        }
        if(remaining>0)append(r.eye.map(function(v,i){return v+r.direction[i]*remaining;}));
        return segments;
    }
    // Match the compositor's ray interface, but sample the exact outgoing line.
    var shader=`
uniform sampler2D ellisTable;
uniform float ellisRegion;
struct EllisRay {vec3 radial;vec3 tangent;float b;float u0;float f0;float entry;float side;float hit;float inward;};
float ellisLocalWeight(vec3 eye,vec3 point,float side){return 0.;}
EllisRay ellisInit(vec3 eye,vec3 ray){
 vec3 o=(eye-vec3(ellisRegion*12000.,-2000.,1550.))/300.;
 float along=dot(o,ray),impact2=max(0.,dot(o,o)-along*along);
 float hit=along<0.&&impact2<1.?1.:0.;
 float entry=max(0.,-along-sqrt(max(0.,1.-impact2)));
 vec3 n=normalize(o+ray*entry);
 return EllisRay(n,normalize(2.*dot(ray,n)*n-ray),sqrt(impact2),0.,0.,entry*300.,ellisRegion,hit,1.);
}
vec3 ellisPointPhase(EllisRay e,float t,out float side,out float travel){
 side=1.-e.side;travel=0.;
 return vec3(side*12000.,-2000.,1550.)-e.radial*300.+e.tangent*(t*7200.);
}
vec3 ellisPoint(EllisRay e,float t,out float side){float travel;return ellisPointPhase(e,t,side,travel);}
vec3 ellisExit(EllisRay e){return e.tangent;}
`;
    DW.thinShellOptics=Object.assign({},DW.ellisOptics,{primary:primary,advanceRay:advanceRay,shader:shader,latticeShader:'vec4 ellisLattice(EllisRay e,vec3 eye,float pixel){return vec4(0.);}'});
}());
