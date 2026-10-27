(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @param {number} a @param {number} b @param {number} x */
    function smooth(a,b,x){var t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
    /** @param {number[]} a @param {number[]} b */function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @param {import('./types').Craft} craft @param {{normal:number[];time:number}[]} hits @param {number} now @param {number} radius @returns {import('./types').Batch[]} */
    function fighter(craft,hits,now,radius){
        /** @type {number[]} */var data=[];
        hits.forEach(function(hit){var age=now-hit.time;if(age<0||age>=1.2)return;var n=hit.normal,length=Math.hypot(...n);if(length<.0001)return;n=n.map(function(v){return v/length;});var tangent=cross(n,Math.abs(n[2])<.9?[0,0,1]:[0,1,0]),size=Math.hypot(...tangent);tangent=tangent.map(function(v){return v/size;});var bitangent=cross(n,tangent),front=age*2.6,fade=(1-smooth(.65,1.2,age))*smooth(0,.08,age);if(fade<.005)return;
            /** @param {number} angle @param {number} edge */function vertex(angle,edge){var theta=Math.max(0,Math.min(Math.PI,front+edge*.12)),s=Math.sin(theta),c=Math.cos(theta),direction=n.map(function(v,i){return v*c+(tangent[i]*Math.cos(angle)+bitangent[i]*Math.sin(angle))*s;}),pose=craft.pose;for(var i=0;i<3;i++)data.push(pose.eye[i]+radius*(pose.right[i]*direction[0]+pose.up[i]*direction[1]+pose.back[i]*direction[2]));data.push(edge,0,fade);}
            for(var i=0;i<48;i++){var a=i*Math.PI/24,b=(i+1)*Math.PI/24;vertex(a,-1);vertex(b,-1);vertex(b,1);vertex(a,-1);vertex(b,1);vertex(a,1);}
        });
        return data.length?[{vertices:new Float32Array(data),color:[.035,.3,1],region:craft.pose.region||0,lensCenter:craft.pose.eye,lensRadius:radius*U}]:[];
    }
    /** @param {import('./types').ShieldEnvelope} envelope @param {number[]} point */
    function anchor(envelope,point){var best=0,distance=Infinity;envelope.anchors.forEach(function(a,i){var offset=a.vertex*6,d=0;for(var k=0;k<3;k++)d+=(envelope.vertices[offset+k]-point[k])**2;if(d<distance){distance=d;best=i;}});return best;}
    /** @typedef {{anchor:number;time:number;heavy:boolean}} CapitalHit */
    /** Clip one local triangle against a scalar distance slab.
     * @param {number[][]} poly @param {number} bound @param {boolean} lower */
    function clip(poly,bound,lower){/** @type {number[][]} */var out=[];for(var i=0;i<poly.length;i++){var a=poly[i],b=poly[(i+1)%poly.length],insideA=lower?a[3]>=bound:a[3]<=bound,insideB=lower?b[3]>=bound:b[3]<=bound;if(insideA)out.push(a);if(insideA!==insideB){var t=(bound-a[3])/(b[3]-a[3]);out.push(a.map(function(v,k){return v+(b[k]-v)*t;}));}}return out;}
    /** @param {import('./types').ShieldEnvelope} envelope @param {CapitalHit[]} hits @param {number} now @param {number[]} origin @param {number} heading @param {number} region @returns {import('./types').Batch[]} */
    function capital(envelope,hits,now,origin,heading,region){
        /** @type {number[]} */var data=[];var c=Math.cos(heading),s=Math.sin(heading),v=envelope.vertices;
        hits.forEach(function(hit){var life=hit.heavy?.65:.36,age=now-hit.time;if(age<0||age>=life)return;var radius=hit.heavy?80:36,width=hit.heavy?7:5,front=radius*age/life,fade=(1-age/life)**1.7*smooth(0,.025,age),a=envelope.anchors[hit.anchor],center=a.vertex*6,indices=a.patches[hit.heavy?1:0];if(fade<.005)return;
            /** @param {number[]} p */function emit(p){data.push(origin[0]+(c*p[0]-s*p[1])/U,origin[1]+(s*p[0]+c*p[1])/U,origin[2]+p[2]/U,(p[3]-front)/width,0,fade);}
            for(var i=0;i<indices.length;i+=3){var triangle=indices.slice(i,i+3).map(function(id){var j=id*6;return [v[j],v[j+1],v[j+2],Math.hypot(v[j]-v[center],v[j+1]-v[center+1],v[j+2]-v[center+2])];}),poly=clip(clip(triangle,Math.max(0,front-width),true),front+width,false);for(var j=1;j+1<poly.length;j++){emit(poly[0]);emit(poly[j]);emit(poly[j+1]);}}
        });return data.length?[{vertices:new Float32Array(data),color:[.035,.3,1],region:region,lensCenter:origin,lensRadius:750}]:[];
    }
    DW.combatShields={fighter:fighter,anchor:anchor,capital:capital};
}());
