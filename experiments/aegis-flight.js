(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** Compose gameplay with an observer of its numeric state.
     * @param {import('./types').AegisRigOptions} [options] @returns {import('./types').AegisFlightRig} */
    function create(options){
        var simulation=DW.aegisSim.create(options),visual=DW.aegisVisual.create(simulation,options);
        return {
            setMountAim:simulation.setMountAim,setSurfaceDetail:visual.setSurfaceDetail,
            step:simulation.step,geometry:visual.geometry,effects:visual.effects,
            readout:simulation.readout,hit:simulation.hit,components:simulation.components,telemetry:simulation.telemetry,
            /** @param {import('./types').Combat} [combat] */
            reset:function(combat){simulation.reset(combat);visual.sync();},
            /** @param {import('./types').Vector} point @param {number} amount @param {import('./types').Combat} combat */
            damage:function(point,amount,combat){var applied=simulation.damage(point,amount,combat);visual.sync();return applied;}
        };
    }
    DW.aegisFlight={create:create,createBattle:DW.aegisBattle.createBattle,createEllisPatrol:DW.aegisBattle.createEllisPatrol,load:DW.aegisVisual.load};
}());
