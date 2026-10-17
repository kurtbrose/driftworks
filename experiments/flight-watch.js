(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** Adapts the exact benchmark duel to the lab's presentation; no alternate physics.
     * @param {()=>import('./types').Snapshot} getScenery @param {import('./types').DuelOptions} options */
    function create(getScenery, options) {
        var duel = DW.flightDuel.create(options), units = DW.sim.METERS_PER_UNIT;
        /** @param {number} elapsed @param {number} speed */
        function advance(elapsed, speed) {
            if ([.25, .5, 1].indexOf(speed) < 0) throw new Error('Invalid watch speed');
            var before = duel.summary().seconds, summary = duel.advance(elapsed * speed);
            getScenery().world.elapsedSeconds += summary.seconds - before;
            return summary;
        }
        /** @param {boolean} chase @returns {import('./types').Snapshot} */
        function snapshot(chase) {
            var view = Object.assign({}, getScenery(), { state:duel.player, guns:duel.guns, combat:duel.combat, contact:false });
            if (chase) {
                var own = duel.player;
                view.camera = {eye:own.eye.map(function (v, i) { return v + (own.back[i] * 75 + own.up[i] * 18) / units; }),
                    right:own.right.slice(), up:own.up.slice(), back:own.back.slice()};
                view.observerCraft = {pose:own,index:0,team:'ally',hp:duel.combat.dead ? 0 : 100};
            }
            return view;
        }
        return {advance:advance,snapshot:snapshot,summary:duel.summary,replay:duel.replay};
    }
    DW.flightWatch = {create:create};
}());
