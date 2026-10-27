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
        return data.length?[{vertices:new Float32Array(data),color:[.035,.3,1],shieldGlow:true,shieldWaves:hits.length,region:craft.pose.region||0,lensCenter:craft.pose.eye,lensRadius:radius*U}]:[];
    }
    /** @param {import('./types').ShieldEnvelope} envelope @param {number[]} point */
    function anchor(envelope,point){var best=0,distance=Infinity;envelope.anchors.forEach(function(a,i){var offset=a.vertex*6,d=0;for(var k=0;k<3;k++)d+=(envelope.vertices[offset+k]-point[k])**2;if(d<distance){distance=d;best=i;}});return best;}
    /** @typedef {{anchor:number;time:number;heavy:boolean}} CapitalHit */
    /** @typedef {{points:number[][];min:number;max:number}} Face */
    /** @type {WeakMap<import('./types').ShieldEnvelope,Map<string,Face[]>>} */var patchCache=new WeakMap();
    /** Shared local distances are immutable and bounded to 128 recent patches.
     * @param {import('./types').ShieldEnvelope} envelope @param {CapitalHit} hit */
    function patch(envelope,hit){var cache=patchCache.get(envelope);if(!cache){cache=new Map();patchCache.set(envelope,cache);}var key=hit.anchor+':'+hit.heavy,found=cache.get(key);if(found){cache.delete(key);cache.set(key,found);return found;}
        /** @type {Face[]} */var faces=[];var a=envelope.anchors[hit.anchor],v=envelope.vertices,center=a.vertex*6,ids=a.patches[hit.heavy?1:0];
        for(var i=0;i<ids.length;i+=3){var points=ids.slice(i,i+3).map(function(id){var j=id*6;return [v[j],v[j+1],v[j+2],Math.hypot(v[j]-v[center],v[j+1]-v[center+1],v[j+2]-v[center+2])];});faces.push({points:points,min:Math.min(points[0][3],points[1][3],points[2][3]),max:Math.max(points[0][3],points[1][3],points[2][3])});}cache.set(key,faces);if(cache.size>128)cache.delete(/** @type {string} */(cache.keys().next().value));return faces;
    }
    /** @param {import('./types').ShieldEnvelope} envelope @param {CapitalHit[]} hits @param {number} now @param {number[]} origin @param {number} heading @param {number} region @returns {import('./types').Batch[]} */
    function capital(envelope,hits,now,origin,heading,region){
        /** @type {number[]} */var data=[];var c=Math.cos(heading),s=Math.sin(heading);
        hits.forEach(function(hit){var life=hit.heavy?.65:.36,age=now-hit.time;if(age<0||age>=life)return;var radius=hit.heavy?80:36,width=hit.heavy?7:5,front=radius*age/life,fade=(1-age/life)**1.7*smooth(0,.025,age);if(fade<.005)return;
            /** @param {number[]} p */function emit(p){data.push(origin[0]+(c*p[0]-s*p[1])/U,origin[1]+(s*p[0]+c*p[1])/U,origin[2]+p[2]/U,(p[3]-front)/width,0,fade);}
            patch(envelope,hit).forEach(function(face){var lo=Math.max(0,front-width),hi=front+width;if(face.min>hi||face.max<lo)return;emit(face.points[0]);emit(face.points[1]);emit(face.points[2]);});
        });return data.length?[{vertices:new Float32Array(data),color:[.035,.3,1],shieldGlow:true,shieldWaves:hits.length,region:region,lensCenter:origin,lensRadius:750}]:[];
    }
    DW.combatShields={fighter:fighter,anchor:anchor,capital:capital};
}());
