(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Elements} Elements */
    /** @typedef {import('./types').Frame} Frame */
    /** @typedef {import('./types').Comparison} Comparison */
    /** @typedef {import('./types').RenderStats} RenderStats */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {{document: Document; performance: Pick<Performance, "now">}} [environment] */
    function mount(environment) {
        environment = environment || globalThis;
        var document = environment.document, clock = environment.performance;
        var get = DW.experimentDom(document);
        var performanceTools = DW.flightPerformance, pace = performanceTools.pacer(), measurements = performanceTools.create(), lastStatsUpdate = 0, previous = 0;
        var simulationPrevious = /** @type {number | null} */ (null);
        function resetSimulationClock() { simulationPrevious = null; }
        function settings() {
            return { mode: get('render-mode').value, flat: get('flat-materials').checked, scale: Number(get('render-scale').value), mothership: get('draw-mothership').checked, actors: get('draw-enemies').checked };
        }
        function resetMeasurements() {
            measurements = performanceTools.create();
            pace.next = null;
            previous = 0;
            lastStatsUpdate = 0;
        }
        /** @type {(keyof Elements)[]} */ (['render-mode', 'flat-materials', 'render-scale', 'fps-cap', 'draw-mothership', 'draw-enemies']).forEach(function (id) {
            get(id).addEventListener('change', resetMeasurements);
        });
        get('perf-reset').onclick = resetMeasurements;
        /** @param {number} t @param {boolean} paused */
        function beginFrame(t, paused) {
            var cap = Number(get('fps-cap').value), limit = paused ? Math.min(cap || 60, 15) : cap;
            if (!performanceTools.due(pace, t, limit))
                return null;
            var started = clock.now();
            var actualElapsed = previous ? (t - previous) / 1000 : 0;
            var elapsed = paused || simulationPrevious === null ? 0 : Math.min(.1, (t - simulationPrevious) / 1000);
            simulationPrevious = paused ? null : t;
            previous = t;
            return { t: t, cap: cap, started: started, actualElapsed: actualElapsed, elapsed: elapsed };
        }
        /** @param {Frame} frame @param {boolean} paused @param {Comparison} comparison @param {() => RenderStats} readStats */
        function endFrame(frame, paused, comparison, readStats) {
            performanceTools.record(measurements, frame.actualElapsed * 1000, clock.now() - frame.started);
            var perfElement = get('perf-overlay');
            perfElement.hidden = !get('perf-enabled').checked;
            if (frame.t - lastStatsUpdate > 250) {
                lastStatsUpdate = frame.t;
                var summary = performanceTools.summary(measurements), stats = readStats(), render = stats.scene, skyStats = stats.sky;
                perfElement.textContent = (paused ? 'PAUSED / 15 FPS CAP' : 'FLIGHT / ' + (frame.cap ? frame.cap + ' FPS CAP' : 'UNCAPPED')) + ' · ' + comparison.mode + (comparison.flat ? ' / flat' : '') +
                    '\n' + summary.fps.toFixed(1) + ' FPS · ' + summary.frame.toFixed(1) + ' ms/frame' +
                    '\np95 ' + summary.p95.toFixed(1) + ' ms · worst ' + summary.worst.toFixed(1) + ' ms' +
                    '\nCPU ' + summary.cpu.toFixed(2) + ' ms · scene submit ' + render.cpuMs.toFixed(2) + ' ms' +
                    '\nDraw calls ' + (render.drawCalls + skyStats.drawCalls) + ' · triangles ' + Math.round(render.triangles + skyStats.triangles).toLocaleString() +
                    '\nMeshes ' + (render.meshes + skyStats.meshes) + ' · material variants ' + (render.materials + skyStats.materials) +
                    '\n' + render.width + ' × ' + render.height + ' · pixel ratio ' + render.pixelRatio.toFixed(2) +
                    '\nSky points ' + skyStats.points + ' · shadow passes 0' +
                    '\nCPU timing only; GPU time not measured';
            }
        }
        function toggleDiagnostics() {
            var show = document.body.classList.toggle('diagnostics');
            get('perf-enabled').checked = show;
        }
        function togglePerformance() {
            var toggle = get('perf-enabled');
            toggle.checked = !toggle.checked;
        }
        return { beginFrame: beginFrame, endFrame: endFrame, settings: settings, reset: resetMeasurements, resetSimulationClock: resetSimulationClock, toggleDiagnostics: toggleDiagnostics, togglePerformance: togglePerformance };
    }
    DW.flightDiagnostics = { mount: mount };
}());
