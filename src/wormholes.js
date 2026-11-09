(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('../experiments/types').WormholeLink} Link */
    /** @typedef {import('../experiments/types').RenderPlacement} Placement */
    /** @param {number[]} a @param {number[]} b */
    function dot(a,b){return a.reduce(function(n,v,k){return n+v*b[k];},0);}
    /** Shared, deterministic formation envelope. closesAt is the fully closed time.
     * @param {number} time @param {import('../experiments/types').WormholeLife=} life */
    function phase(time,life){
        /** @param {number} x */function ease(x){x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);}
        var amount=1,state='open';
        if(life){
            var opening=Math.max(.001,life.openSeconds===undefined?3:life.openSeconds),closing=Math.max(.001,life.closeSeconds===undefined?2:life.closeSeconds);
            if(life.transition){var tr=life.transition,t=(time-tr.at)/tr.duration;amount=tr.from+(tr.to-tr.from)*ease(t);state=tr.from===tr.to||t>=1?(tr.to?'open':'closed'):(tr.to?'opening':'closing');}
            else{
                var start=life.opensAt===undefined?(life.initialOpen===false?Infinity:-Infinity):life.opensAt,end=life.closesAt===undefined?Infinity:life.closesAt,closeStart=Math.max(start,end-closing);
                if(time<start){amount=0;state='closed';}
                else if(time>=end){amount=0;state='closed';}
                else if(time>=closeStart){var peak=start===-Infinity?1:ease((closeStart-start)/opening);amount=peak*(1-ease((time-closeStart)/Math.max(.001,end-closeStart)));state='closing';}
                else{amount=start===-Infinity?1:ease((time-start)/opening);state=amount>=1?'open':'opening';}
            }
        }
        return {amount:amount,visible:amount>0,traversable:state==='open',state:state};
    }
    /** Reversals start at the current value, rather than restarting or popping.
     * @param {import('../experiments/types').WormholeLife} life @param {boolean} open @param {number} time */
    function request(life,open,time){var from=phase(time,life).amount,to=open?1:0,duration=(open?(life.openSeconds||3):(life.closeSeconds||2))*Math.abs(to-from);life.transition={at:time,from:from,to:to,duration:Math.max(.001,duration)};}
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
        if(radius<=0){if(mode==='aperture')placement.visible=false;return clear(placement);}
        placement.portalClip=position.concat(radius);
        var sign=mode==='front'?1:-1;
        placement.clipPlane=mode==='aperture'?undefined:normal.map(function(v){return v*sign;}).concat(-sign*dot(normal,position));
        return placement;
    }
    DW.wormholes={phase:phase,request:request,define:define,cross:cross,transport:transport,own:own,resolve:resolve,clear:clear,bindRig:bindRig,mouth:mouth};
}());
