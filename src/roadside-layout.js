(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** Shared physical placement, in asteroid-local scene units. No renderer resources.
     * @param {import('./types').Asteroid} asteroid
     * @param {import('../experiments/types').MissionScenery} definition
     * @param {(asteroid:import('./types').Asteroid,direction:[number,number,number])=>{point:number[]}} surfaceFrame */
    function describe(asteroid,definition,surfaceFrame){
        var units=DW.sim.METERS_PER_UNIT,r=asteroid.radius*units;
        var scale=definition.scale===undefined?1:definition.scale,anchor=definition.anchor||[0,0],offset=definition.offset||[0,0];
        /** @param {number} x @param {number} y */
        function position(x,y){return [anchor[0]+(x-anchor[0])*scale+offset[0],anchor[1]+(y-anchor[1])*scale+offset[1]];}
        var supportHeight=0;
        [-1000,-25,950].forEach(function(x){[-1000,-450,100].forEach(function(y){
            var p=position(x,y),px=p[0],py=p[1];
            supportHeight=Math.max(supportHeight,surfaceFrame(asteroid,[px,py,Math.sqrt(Math.max(r*r*.05,r*r-px*px-py*py))]).point[2]*asteroid.radius);
        });});
        var deckHeight=supportHeight+1/units;
        return {scale:scale,deckHeight:deckHeight,
            /** @param {number} x @param {number} y */
            ground:function(x,y){var p=position(x,y);return {point:[p[0]/r,p[1]/r,deckHeight/asteroid.radius],normal:[0,0,1]};},
            /** @param {NonNullable<import('../experiments/types').MissionScenery['placements']>[number]} building */
            launchOrigin:function(building){var p=position(building.x,building.y),front=building.size*scale*.3;
                return [(p[0]+Math.sin(building.yaw)*front)/units,(p[1]-Math.cos(building.yaw)*front)/units,supportHeight+9/units];}
        };
    }
    DW.roadsideLayout={describe:describe};
}());
