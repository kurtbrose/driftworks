(function () {
    'use strict';
    /** @typedef {import('./types').Pacer} Pacer */
    /** @typedef {import('./types').Measurements} Measurements */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @returns {Pacer} */
    function pacer() {
        return { next: null };
    }
    /** @param {Pacer} clock @param {number} now @param {number} fps */
    function due(clock, now, fps) {
        if (!fps) {
            clock.next = null;
            return true;
        }
        var interval = 1000 / fps;
        if (clock.next === null)
            clock.next = now;
        if (now + .35 < clock.next)
            return false;
        if (now - clock.next > interval)
            clock.next = now;
        clock.next += interval;
        return true;
    }
    /** @returns {Measurements} */
    function create() {
        return { frames: [], cpu: [], worst: 0 };
    }
    /** @param {Measurements} stats @param {number} interval @param {number} cpu */
    function record(stats, interval, cpu) {
        if (interval > 0) {
            stats.frames.push(interval);
            if (stats.frames.length > 120)
                stats.frames.shift();
            stats.worst = Math.max(stats.worst, interval);
        }
        stats.cpu.push(cpu);
        if (stats.cpu.length > 120)
            stats.cpu.shift();
    }
    /** @param {Measurements} stats */
    function summary(stats) {
        /** @param {number[]} a */
        function average(a) {
            return a.length ? a.reduce(function (sum, x) {
                return sum + x;
            }, 0) / a.length : 0;
        }
        var sorted = stats.frames.slice().sort(function (a, b) {
            return a - b;
        }), frame = average(sorted);
        return { fps: frame ? 1000 / frame : 0, frame: frame, p95: sorted.length ? sorted[Math.floor((sorted.length - 1) * .95)] : 0, worst: stats.worst, cpu: average(stats.cpu) };
    }
    /** Asynchronous WebGL2 timings; never block with finish or a result read before ready.
     * @param {HTMLCanvasElement|null} canvas */
    function gpuTimer(canvas){
        var gl=canvas&&canvas.getContext('webgl2');
        var ext=/** @type {{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null} */(gl&&gl.getExtension('EXT_disjoint_timer_query_webgl2'));
        /** @type {{query:WebGLQuery;receive:(ms:number)=>void}[]} */var pending=[];
        /** @type {WebGLQuery|null} */var active=null;
        var invalid=false;
        function clear(){if(gl)pending.forEach(function(p){if(gl)gl.deleteQuery(p.query);});pending=[];}
        function poll(){
            if(!gl||!ext||invalid)return;
            if(gl.isContextLost()||gl.getParameter(ext.GPU_DISJOINT_EXT)){invalid=true;clear();return;}
            while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
                var p=pending.shift();if(!p)break;
                var ms=Number(gl.getQueryParameter(p.query,gl.QUERY_RESULT))/1e6;gl.deleteQuery(p.query);
                if(Number.isFinite(ms)&&ms>=0)p.receive(ms);else invalid=true;
            }
        }
        /** @param {(ms:number)=>void} receive */
        function begin(receive){
            poll();if(active)throw new Error('Overlapping GPU timer queries');
            if(!gl||!ext||invalid||pending.length>=8)return function(){};
            var query=gl.createQuery();if(!query)return function(){};
            gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active=query;
            return function(){if(gl&&ext&&active===query){gl.endQuery(ext.TIME_ELAPSED_EXT);active=null;pending.push({query:query,receive:receive});}};
        }
        var debug=/** @type {{UNMASKED_RENDERER_WEBGL:number}|null} */(gl&&gl.getExtension('WEBGL_debug_renderer_info'));
        var renderer=gl?String(gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER)):'unavailable';
        return {renderer:renderer,available:!!ext,begin:begin,poll:poll,pending:function(){return pending.length;},valid:function(){return !invalid;},dispose:function(){if(active&&gl&&ext){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null;}clear();}};
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightPerformance = { gpuTimer:gpuTimer, pacer: pacer, due: due, create: create, record: record, summary: summary };
}());
