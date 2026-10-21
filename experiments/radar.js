(function () {
    'use strict';
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').RadarContact} RadarContact */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    // Positions use scene units; range and displayed distances use meters.
    /** @param {Pose} state @param {Vector} point @param {number} units @param {number} range */
    function project(state, point, units, range) {
        var delta = point.map(function (v, i) {
            return (v - state.eye[i]) * units;
        });
        var distance = Math.hypot.apply(null, delta);
        if (distance > range)
            return null;
        /** @param {Vector} axis */
        function dot(axis) {
            return delta.reduce(function (sum, v, i) {
                return sum + v * axis[i];
            }, 0) / range;
        }
        return { x: dot(state.right), y: dot(state.back), altitude: dot(state.up), distance: distance };
    }
    // Shared by radar blips, ship markers and off-screen arrows; preserve team/target colors.
    /** @param {import('./gpu-ui-types').PaintContext} ctx @param {number} x @param {number} y @param {number} radius */
    function speakerHalo(ctx, x, y, radius) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
    /** @param {import('./gpu-ui-types').PaintContext} ctx @param {Pose} state @param {RadarContact[]} contacts @param {number} units @param {number} range @param {number} w @param {number} h @param {boolean} paused @param {string|boolean} [missionId] */
    function draw(ctx, state, contacts, units, range, w, h, paused, missionId) {
        var mission=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks).flightMissions.resolve(missionId);
        var radius = Math.min(w < 600 ? 60 : 76, w * .19, h * .17), cx = w / 2, cy = h - radius - (w < 600 ? 240 : 24);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.font = '10px ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(4,18,25,.88)';
        ctx.strokeStyle = '#477e78';
        ctx.beginPath();
        ctx.arc(0, 0, radius + 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(116,205,186,.25)';
        [.5, 1].forEach(function (r) {
            ctx.beginPath();
            ctx.arc(0, 0, radius * r, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, radius);
        ctx.stroke();
        ctx.fillStyle = '#91bdb5';
        ctx.fillText('FWD', 0, -radius + 12);
        ctx.fillText('AFT', 0, radius - 6);
        var count = 0;
        contacts.forEach(function (c) {
            var p = project(state, c.point, units, range);
            if (!p)
                return;
            count++;
            var x = p.x * radius, y = p.y * radius, tip = y - p.altitude * radius * .35;
            ctx.strokeStyle = c.selected ? '#ffe7a3' : c.color;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, tip);
            ctx.stroke();
            if (c.landmark) {
                ctx.strokeRect(x - 3, tip - 3, 6, 6);
            }
            else {
                ctx.beginPath();
                ctx.arc(x, tip, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            if (c.speaking)
                speakerHalo(ctx, x, tip, 10);
            if (c.selected) {
                ctx.beginPath();
                ctx.arc(x, tip, 7, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
        ctx.fillStyle = '#dcfff3';
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(-4, 4);
        ctx.lineTo(4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillText((mission.units.radarKilometers ? (range/1000)+' km' : Math.round(range*mission.units.distanceScale)+' '+mission.units.distanceLabel), 0, radius + 19);
        ctx.restore();
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightRadar = { project: project, draw: draw, speakerHalo: speakerHalo };
}());
