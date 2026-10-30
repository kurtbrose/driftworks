(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** Forecast held inputs at the real movement tick; retain fine samples for curved paint.
     * @param {import('../experiments/types').Craft} craft @param {import('../experiments/types').Demand} demand
     * @param {number} horizon @returns {import('../experiments/types').FlightPathSample[]} */
    function predictFlightPath(craft,demand,horizon) {
        if(craft.hp<=0)return [];
        var p=craft.pose,state=Object.assign({},p,{eye:p.eye.slice(),right:p.right.slice(),up:p.up.slice(),back:p.back.slice(),
            velocity:p.velocity.slice(),rates:p.rates.slice(),ramp:p.ramp.slice()});
        var copy=Object.assign({},craft,{pose:state}),dt=1/120,distance=0,units=DW.sim.METERS_PER_UNIT;
        horizon=Math.max(1,Math.min(8,horizon));
        /** @type {import('../experiments/types').FlightPathSample[]} */var path=[];
        /** @param {number} seconds */function sample(seconds){
            path.push({seconds:seconds,distance:distance,pose:{curvature:state.curvature,spaceFrame:state.spaceFrame,eye:state.eye.slice(),right:state.right.slice(),up:state.up.slice(),back:state.back.slice()}});
        }
        sample(0);
        for(var tick=1;tick<=Math.ceil(horizon/dt);tick++) {
            var before=state.eye;
            DW.flightSim.stepInput(copy,demand,dt);
            distance+=(state.curvature?DW.flightHyperbolic.path(before,state.eye,state.curvature).distance:Math.hypot(state.eye[0]-before[0],state.eye[1]-before[1],state.eye[2]-before[2]))*units;
            sample(tick*dt);
        }
        return path;
    }
    DW.flightPrediction={predictPath:predictFlightPath};
}());
