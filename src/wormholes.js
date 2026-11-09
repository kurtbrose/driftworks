(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('../experiments/types').WormholeLink} Link */
    /** @typedef {import('../experiments/types').RenderPlacement} Placement */
    /** @param {number[]} a @param {number[]} b */
    function dot(a,b){return a.reduce(function(n,v,k){return n+v*b[k];},0);}
    /** Antipodal thin-shell gluing. All positions/radii use the caller's scene units.
     * @param {number[]} v @param {number[]} normal */
    function transport(v,normal){var d=dot(v,normal);return v.map(function(x,k){return 2*d*normal[k]-x;});}
    /** Validate links at the boundary; these are two equally sized spherical mouths.
     * @param {Link} link */
    function define(link){
        if(link.mouths.length!==2||link.mouths[0].space===link.mouths[1].space)throw Error('A wormhole must connect two distinct spaces');
        link.mouths.forEach(function(m){if(!Number.isInteger(m.space)||m.position.length!==3||!m.position.every(Number.isFinite)||!Number.isFinite(m.radius)||m.radius<=0||!m.sky)throw Error('Invalid wormhole mouth');});
        if(link.mouths[0].radius!==link.mouths[1].radius)throw Error('Thin-shell mouth radii must agree');
        return link;
    }
    /** Swept entry, including overshoot; never depends on a mission name or storage offset.
     * @param {Link} link @param {number[]} before @param {number[]} after @param {number} space */
    function cross(link,before,after,space){
        define(link);
        var side=link.mouths.findIndex(function(m){return m.space===space;});if(side<0)return null;
        var from=link.mouths[side],to=link.mouths[1-side],o=before.map(function(v,k){return v-from.position[k];}),d=after.map(function(v,k){return v-before[k];});
        var a=dot(d,d),b=dot(o,d),c=dot(o,o)-from.radius*from.radius,disc=b*b-a*c;
        if(a<1e-20||b>=0||disc<0)return null;
        var t=(-b-Math.sqrt(disc))/a;if(t< -1e-8||t>1)return null;t=Math.max(0,t);
        var normal=o.map(function(v,k){return (v+d[k]*t)/from.radius;});
        var remaining=transport(d.map(function(v){return v*(1-t);}),normal);
        return {region:to.space,eye:to.position.map(function(v,k){return v-normal[k]*to.radius+remaining[k];}),normal:normal,sky:to.sky};
    }
    /** One transient owner is shared by all material and attached-effect batches.
     * @param {import('../experiments/types').Batch[]} batches @param {Placement} placement */
    function own(batches,placement){batches.forEach(function(batch){batch.placement=placement;});return batches;}
    /** @param {import('../experiments/types').Batch} batch @returns {Placement} */
    function resolve(batch){return batch.placement||batch;}
    /** @param {Placement} placement */
    function clear(placement){placement.portalClip=undefined;placement.clipPlane=undefined;return placement;}
    /** @param {import('../experiments/types').AegisFlightRig} rig @param {Placement} placement */
    function bindRig(rig,placement){
        return Object.assign({},rig,{
            geometry:/** @param {import('../experiments/types').Pose=} camera */function(camera){return own(rig.geometry(camera),placement);},
            effects:/** @param {import('../experiments/types').Pose} pose @param {boolean=} shields */function(pose,shields){return own(rig.effects(pose,shields),placement);}
        });
    }
    /** Central mask construction; missions select a mouth and side, not shader planes.
     * @param {Placement} placement @param {number[]} position @param {number[]} normal @param {number} radius @param {'aperture'|'front'|'back'} mode */
    function mouth(placement,position,normal,radius,mode){
        placement.portalClip=mode==='aperture'?position.concat(radius):undefined;
        var sign=mode==='front'?1:-1;
        placement.clipPlane=mode==='aperture'?undefined:normal.map(function(v){return v*sign;}).concat(-sign*dot(normal,position));
        return placement;
    }
    DW.wormholes={define:define,cross:cross,transport:transport,own:own,resolve:resolve,clear:clear,bindRig:bindRig,mouth:mouth};
}());
