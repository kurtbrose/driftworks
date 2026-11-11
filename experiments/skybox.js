(function () {
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var options = ['Milky Way  / original', 'A  / Open void', 'B  / Galactic horizon', 'C  / Dark dust', 'D  / Distant sun', 'E  / Cold veil', 'F  / Island universes', 'G / Hero galaxy', 'H / Hero nebula', 'I / Hero sun', 'J / River of stars', 'K / Woven starlight', 'L / Orbital impact experiment'];
    /** @typedef {{asset:string,yaw:number,pitch:number,roll:number,widthDeg:number,gain:number}} HeroFeature */
    /** @param {HeroFeature} feature @param {number} aspect */
    function featureFrame(feature, aspect) {
        var yaw = feature.yaw * Math.PI / 180, pitch = feature.pitch * Math.PI / 180, roll = feature.roll * Math.PI / 180;
        var center = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
        var east = [-Math.sin(yaw), Math.cos(yaw), 0];
        var north = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];
        var right = east.map(function (v, i) { return v * Math.cos(roll) + north[i] * Math.sin(roll); });
        var up = north.map(function (v, i) { return v * Math.cos(roll) - east[i] * Math.sin(roll); });
        var extent = Math.tan(feature.widthDeg * Math.PI / 360), vertices = /** @type {number[]} */ ([]);
        [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]].forEach(function (corner) {
            for (var i = 0; i < 3; i++)
                vertices.push(center[i] + right[i] * corner[0] * extent + up[i] * corner[1] * extent / aspect);
            vertices.push((corner[0] + 1) / 2, (1 - corner[1]) / 2);
        });
        return new Float32Array(vertices);
    }
    function stars() {
        var data = /** @type {number[]} */ ([]), seed = 58319;
        function random() {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }
        for (var i = 0; i < 3200; i++) {
            var z = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
            data.push(r * Math.cos(angle), r * Math.sin(angle), z, .4 + Math.pow(random(), 3) * .6);
        }
        return new Float32Array(data);
    }
    /** @param {Vector} direction @param {Pose} pose @param {number} aspect */
    function project(direction, pose, aspect) {
        /** @param {Vector} a @param {Vector} b */
        function dot(a, b) {
            return a.reduce(function (sum, x, i) {
                return sum + x * b[i];
            }, 0);
        }
        var depth = -dot(direction, pose.back);
        return depth > 0 ? { x: dot(direction, pose.right) * focal / aspect / depth, y: dot(direction, pose.up) * focal / depth } : null;
    }
    var focal = 1 / Math.tan(Math.PI / 8);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @typedef {{version:number,size:number,styles:string[],missions:Record<string,string>,spaces:Record<string,string>,impact:string[],environments:Record<string,{faces:string[],manifest:string,cameraSources?:import('../src/types').SkyCameraSource[],animation?:{frames:string[],keys:{time:number,frame:number,amount:number}[],duration:number}}>}} Catalog */
    var base = "../assets/backgrounds/flight-environments-v1/";
    /** @type {Promise<Catalog>|null} */ var catalogPromise = null;
    /** @type {Map<string,Promise<HTMLImageElement>>} */ var images = new Map();
    function catalog() { if (!catalogPromise)
        catalogPromise = window.fetch(assetUrl(base + "catalog.json")).then(function (r) { if (!r.ok)
            throw Error("Baked sky catalog unavailable"); return r.json(); }); return catalogPromise; }
    /** @param {string} path */ function image(path) { var url = assetUrl(base + path), pending = images.get(url); if (!pending) {
        pending = new Promise(function (resolve, reject) { var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = function () { reject(Error("Baked sky face unavailable: " + path)); }; img.src = assetUrl(base + path); });
        images.set(url, pending);
    } return pending; }
    /** @param {HTMLElement} host @param {Parameters<Required<DriftworksNamespace>["flightSkybox"]["create"]>[1]} [config] */
    function create(host, config) {
        var mission = DW.flightMissions.current(), external = !!(config && config.context), canvas = document.createElement("canvas");
        canvas.className = "flight-skybox";
        canvas.setAttribute("aria-hidden", "true");
        if (!external)
            host.prepend(canvas);
        var gl = /** @type {WebGLRenderingContext|WebGL2RenderingContext} */ (config && config.context || canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: !!(config && config.preserveDrawingBuffer) }));
        if (!gl)
            throw Error("Flight skybox requires WebGL");
        var style = config && config.style !== undefined ? config.style : 7, exposure = 1, fov = config && config.fov || 45, lightingEnabled = true, frameExposure = 1;
        /** @type {import("../src/types").SkyEnvironmentLighting|null} */ var lightingOverride = null;
        /** @type {Record<string,import("../src/types").SkyEnvironmentLighting>} */ var lighting = {};
        /** @type {Catalog|null} */ var definitions = null;
        /** @type {Map<string,{texture:WebGLTexture|null,ready:boolean,promise:Promise<void>}>} */ var maps = new Map();
        /** @type {import("./flight-vr-types").SkyEye|null} */ var eyeFrame = null;
        var cues = DW.impactCues.create(), impactTime = -1, cueMode = true, gasTime = 0, impactMotion = 0;
        /** @type {import("./types").ImpactCueSnapshot|null} */ var sharedCue = null;
        var stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
        var selector = /** @type {HTMLSelectElement|null} */ (config && !config.styleControls ? null : document.getElementById("skybox-style"));
        if (selector) {
            const control = selector;
            try {
                var saved = window.localStorage.getItem("driftworks-flight-skybox-v1");
                if (saved !== null && Number.isInteger(Number(saved)) && Number(saved) >= 0 && Number(saved) < options.length)
                    style = Number(saved);
            }
            catch (_) { }
            options.forEach(function (label, i) { var option = document.createElement("option"); option.value = String(i); option.textContent = label; control.appendChild(option); });
            selector.value = String(style);
            selector.addEventListener("change", function () { setStyle(Number(control.value)); try {
                window.localStorage.setItem("driftworks-flight-skybox-v1", String(style));
            }
            catch (_) { } });
        }
        var brightness = /** @type {HTMLInputElement|null} */ (document.getElementById("skybox-brightness"));
        if (brightness) {
            const control = brightness;
            control.addEventListener("input", function () { exposure = Number(control.value) || 1; });
        }
        var quality = /** @type {HTMLSelectElement|null} */ (document.getElementById("skybox-quality"));
        var effects = !external && DW.skyEffects ? DW.skyEffects.create(host) : null, opticsEnabled = !(config && config.optics === false);
        /** @type {import("../src/types").SkyCameraSource[]|null} */ var cameraSources = config && config.sources || null;
        var effectsStyle="";
        var opticsControl = /** @type {HTMLInputElement|null} */ (document.getElementById("skybox-optics"));
        if (opticsControl) {
            const control = opticsControl;
            opticsEnabled = control.checked;
            control.addEventListener("change", function () { opticsEnabled = control.checked; });
        }
        if (effects) {
            effects.setEnabled(opticsEnabled);

        }
        function getLighting() { return lightingEnabled ? (lightingOverride || (mission.sky.kind !== "landmarks" ? lighting[["galaxy", "nebula", "sun", "river", "woven"][style - 7]] : null) || null) : null; }
        if(mission.sky.kind !== "landmarks") DW.skyLighting.load().then(function (data) { lighting = data; }).catch(function () { lighting = {}; });
        /** @param {number} type @param {string} source */ function shader(type, source) {
            if (external) {
                source = source.replace(/\bvarying\b/g, type === gl.FRAGMENT_SHADER ? "in" : "out").replace(/\battribute\b/g, "in").replace(/\btexture(?:2D|Cube)\b/g, "texture");
                if (type === gl.FRAGMENT_SHADER)
                    source = "out highp vec4 outputColor;\n" + source.replace(/gl_FragColor/g, "outputColor");
                source = "#version 300 es\n" + source;
            }
            var result = gl.createShader(type);
            if (!result)
                throw Error("Sky shader allocation failed");
            gl.shaderSource(result, source);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
                throw Error(gl.getShaderInfoLog(result) || "Sky shader compile failed");
            return result;
        }
        var program = gl.createProgram();
        if (!program)
            throw Error("Sky program allocation failed");
        var optics = DW.ellisOptics;
        var vertex = shader(gl.VERTEX_SHADER, "attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}");
        var fragment = shader(gl.FRAGMENT_SHADER, `precision highp float;
 varying vec2 screen;uniform vec3 right,up,back,eye;uniform vec2 projection;uniform float aspect,focal,exposure,blend,contact,grid,pixel,outline;
 uniform samplerCube environmentA,environmentB,environmentC,environmentNext,environmentContact,environmentDefault;
 uniform vec4 mouths[2];uniform vec2 destinations;
 ${optics ? optics.shader : "uniform sampler2D ellisTable;uniform float ellisRegion;"}
 ${optics ? optics.latticeShader : ""}
 vec3 environment(vec3 ray,float source,float bent){if(source<.5){vec3 color=mix(textureCube(environmentA,ray).rgb,textureCube(environmentNext,ray).rgb,blend);if(bent>.5)color=textureCube(environmentDefault,ray).rgb;if(bent<.5&&contact>0.)color=mix(color,textureCube(environmentContact,ray).rgb,contact);return color;}if(source<1.5)return textureCube(environmentB,ray).rgb;return textureCube(environmentC,ray).rgb;}
 void main(){vec3 ray=normalize(-back+right*(screen.x+projection.x)*aspect/focal+up*(screen.y+projection.y)/focal),outgoing=ray;float source=0.,nearest=1.e30;vec4 lattice=vec4(0.);float rim=0.;
 ${optics ? `for(int i=0;i<2;i++){vec4 mouth=mouths[i];if(mouth.w<=0.)continue;
 vec3 normalizedEye=vec3(0.,-2000.,1550.)+(eye-mouth.xyz)*300./mouth.w;
 EllisRay optical=ellisInit(normalizedEye,ray);if(optical.hit<.5)continue;
 float distance=optical.entry*mouth.w/300.+length(eye-mouth.xyz)*.000001;if(distance>=nearest)continue;nearest=distance;
 outgoing=ellisExit(optical);float side;ellisPoint(optical,1.,side);source=side>.5?(i==0?destinations.x:destinations.y):0.;
 if(grid>.5)lattice=ellisLattice(optical,normalizedEye,pixel);
 vec3 offset=(eye-mouth.xyz)/mouth.w;float R=length(offset);float cone=asin(2./max(2.000001,R));float angle=acos(clamp(-dot(offset,ray)/max(.000001,R),-1.,1.));rim=(1.-smoothstep(pixel*.77,pixel*1.4,abs(angle-cone)))*smoothstep(2.,2.05,R);
 }` : ""}
 vec3 color=environment(outgoing,source,nearest<1.e29?1.:0.)*exposure;color=color*(1.-lattice.a*.65)+lattice.rgb;if(outline>.5)color=mix(color,vec3(1.,.48,.10),rim*.9);gl_FragColor=vec4(color,1.);
 }`);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw Error(gl.getProgramInfoLog(program) || "Sky link failed");
        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        var table = gl.createTexture();
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, table);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, optics ? 512 : 1, optics ? 512 : 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, optics ? optics.table() : new Uint8Array(4));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        // Guidance dots are foreground navigation optics, not background stars.
        // They reuse the established Ellis motion shader after the complete sky draw.
        /** @type {WebGLProgram|null} */ var motionProgram=null;
        /** @type {WebGLTexture|null} */ var motionLengths=null;
        if(mission.sky.wormhole && optics) {
            motionProgram=gl.createProgram();
            if(!motionProgram)throw Error("Motion program allocation failed");
            gl.attachShader(motionProgram,shader(gl.VERTEX_SHADER,"attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}"));
            gl.attachShader(motionProgram,shader(gl.FRAGMENT_SHADER,"precision highp float;varying vec2 screen;uniform vec3 right,up,back,bridgeEye;uniform float aspect,focal;"+optics.shader+optics.motionShader+"\nvoid main(){vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);gl_FragColor=motionDots(bridgeEye,ray);}"));
            gl.linkProgram(motionProgram);
            if(!gl.getProgramParameter(motionProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(motionProgram)||"Motion shader link failed");
            motionLengths=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,motionLengths);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,optics.motionTable());
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.activeTexture(gl.TEXTURE0);
        }
        /** @param {string} id */ function load(id) { var previous = maps.get(id); if (previous)
            return previous.promise; if (!definitions || !definitions.environments[id])
            return Promise.reject(Error("Unknown baked environment: " + id)); var entry = { texture: gl.createTexture(), ready: false, promise: Promise.resolve() }; maps.set(id, entry); entry.promise = Promise.all(definitions.environments[id].faces.map(image)).then(function (faces) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, entry.texture); faces.forEach(function (face, i) { if (face.width !== face.height || face.width !== definitions?.size)
            throw Error("Sky face must be square"); gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, face); }); gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); entry.ready = true; }); return entry.promise; }
        /** @param {string} sky */
        function spaceId(sky) {
            if (!definitions) return "";
            if (sky === "asteroid" && mission.sky.sourceEnvironment) return mission.sky.sourceEnvironment;
            var id = definitions.spaces[sky] || (definitions.environments[sky] ? sky : null);
            if (!id) throw Error("Unknown space environment: " + sky);
            return id;
        }
        function rootId() {
            if (!definitions) return "";
            var source = mission.sky.connection && mission.sky.connection.mouths.find(function (m) { return m.space === 0; });
            return mission.sky.wormhole && source ? spaceId(source.sky) : mission.sky.environment || definitions.missions[mission.id] || definitions.styles[style];
        }
        function required() {
            if (!definitions) return [];
            var ids = [rootId()];
            if (mission.sky.wormhole && mission.sky.connection) mission.sky.connection.mouths.forEach(function(m) { ids.push(spaceId(m.sky)); });
            if (mission.sky.linkedEnvironments) ids.push.apply(ids,mission.sky.linkedEnvironments.map(spaceId));
            if (mission.sky.bakedImpact) ids.push.apply(ids, definitions.impact);
            ids.slice().forEach(function(id){var animation=definitions?.environments[id].animation;if(animation)ids.push.apply(ids,animation.frames);});
            return [...new Set(ids)];
        }
        /** @param {number} value */ function setStyle(value) { style = Number.isInteger(value) && value >= 0 && value < options.length ? value : 7; if (definitions)
            load(rootId()).catch(function (/** @type {unknown} */ error) { canvas.dataset.environment = String(error); }); }
        var ready = catalog().then(function (data) { if (data.version !== 1)
            throw Error("Unsupported baked environment catalog"); definitions = data; return Promise.all(required().map(load)); }).then(function () { canvas.dataset.environment = "ready"; canvas.dataset.cube = "ready"; canvas.dataset.linkedSky = "ready"; canvas.dataset.bridgeSky = "ellis"; return true; }).catch(function (/** @type {unknown} */ error) { canvas.dataset.environment = "error"; throw error; });
        var params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
        var controls = /** @type {HTMLDivElement|null} */ (null);
        if (mission.sky.bakedImpact && (!config || config.cueControls !== false) && !external) {
            controls = document.createElement("div");
            controls.className = "sky-cue-controls";
            var status = document.getElementById("skybox-status");
            if (status && status.parentElement)
                status.parentElement.appendChild(controls);
            DW.impactCues.stages.forEach(function (stage) { var button = document.createElement("button"); button.textContent = stage.label; button.onclick = function () { cues.trigger(stage.id, 8); }; if (controls)
                controls.appendChild(button); });
        }
        /** @type {ReturnType<Required<DriftworksNamespace>["flightSkybox"]["create"]>} */
        var api = { ready: ready, getStyle: function () { return style; }, setStyle: setStyle, setExposure: function (value) { exposure = Math.max(.25, Math.min(3, value)); }, setFov: function (degrees) { fov = Math.max(25, Math.min(150, degrees)); }, getLighting: getLighting, setLightingEnabled: function (enabled) { lightingEnabled = enabled; }, setEnvironment: function (value) { lightingOverride = value; }, setPlanetImage: function () { throw Error("Runtime skies are static assets; edit the offline sky recipe and rebake."); }, setOpticsEnabled: function (enabled) { opticsEnabled = enabled; if (effects)
                effects.setEnabled(enabled); }, setCameraSources: function (sources) { cameraSources = sources; effectsStyle = ""; }, setOccluders: function (occluders) { if (effects)
                effects.setOccluders(occluders); }, getRenderStats: function () { return stats; }, cueImpact: function (stage, seconds) { cueMode = true; return cues.trigger(stage, seconds); }, resetImpact: function () { cues.reset(); impactTime = -1; }, getImpactState: cues.snapshot, setImpactTime: function (time) { impactTime = time; cueMode = false; }, getFrameState: function () { return { style: style, exposure: frameExposure, impactTime: impactTime, impactMotion: impactMotion, gasTime: gasTime, cueMode: cueMode, cue: sharedCue || cues.snapshot() }; }, setFrameState: function (state) { setStyle(state.style); exposure = state.exposure; impactTime = state.impactTime; impactMotion = state.impactMotion; gasTime = state.gasTime; cueMode = state.cueMode; sharedCue = state.cue; }, renderEye: function (pose, eye, empty, elapsed, motionOpacity, arrival) { eyeFrame = eye; try {
                api.render(pose, 1, empty, elapsed, motionOpacity, arrival);
            }
            finally {
                eyeFrame = null;
            } }, render: function (pose, renderScale, empty, elapsed, motionOpacity, arrival) {
                var dpr = external ? 1 : Math.min(3, (window.devicePixelRatio || 1) * (quality ? Number(quality.value) || 1 : 1)), width = eyeFrame ? eyeFrame.viewport.width : Math.round(host.clientWidth * dpr), height = eyeFrame ? eyeFrame.viewport.height : Math.round(host.clientHeight * dpr);
                if (!width || !height)
                    return;
                if (!external && (canvas.width !== width || canvas.height !== height)) {
                    canvas.width = width;
                    canvas.height = height;
                }
                gl.viewport(eyeFrame ? eyeFrame.viewport.x : 0, eyeFrame ? eyeFrame.viewport.y : 0, width, height);
                stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
                if (empty || !definitions) {
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    return;
                }
                var units = DW.sim ? DW.sim.METERS_PER_UNIT : 20, local = rootId(), dest1 = local, dest2 = local, next = local, blend = 0, contact = 0;
                var packed = new Float32Array(8), eye = pose.eye || [0, 0, 0];
                if (mission.sky.wormhole && mission.sky.connection) {
                var side = pose.region || 0, connection = mission.sky.connection;
                var mouth = connection.mouths.find(function(m) { return m.space === side; });
                var opposite = connection.mouths.find(function(m) { return m.space !== side; });
                if (!mouth || !opposite) throw Error("Missing wormhole environment endpoint");
                local = spaceId(mouth.sky); dest1 = spaceId(opposite.sky);
                packed.set(mouth.position.concat(mouth.radius));
            }
            else if (arrival) {
                    var roles = [rootId(), definitions.spaces.reception, definitions.spaces.hostile];
                    /** @param {number|string|undefined} value */
                    function environmentId(value) {
                        return typeof value === "string" ? (value === "local" ? rootId() : spaceId(value)) : roles[value || 0];
                    }
                    local = environmentId(arrival.localSky);
                    dest1 = environmentId(arrival.sky);
                    dest2 = environmentId(arrival.other && arrival.other.sky);
                    packed.set(arrival.position.map(function (v) { return v * units; }).concat(arrival.radius));
                    if (arrival.other)
                        packed.set(arrival.other.position.map(function (v) { return v * units; }).concat(arrival.other.radius), 4);
                }
                next = local;
                var defaultLocal=local;
                if (mission.sky.bakedImpact) {
                    var cue = sharedCue || cues.update(elapsed || 0, definitions.impact.every(function (id) { return !!maps.get(id)?.ready; }));
                    if (!cueMode) {
                        var times=[0,2,30,60,120,300,600],from=0;
                        for(var index=1;index<times.length;index++)if(impactTime>=times[index])from=index;
                        var to=Math.min(times.length-1,from+1),amount=from===to?0:Math.max(0,Math.min(1,(impactTime-times[from])/(times[to]-times[from])));
                        cue=Object.assign({},cue,{from:from,to:to,blend:amount*amount*(3-2*amount),flashAge:impactTime});
                        impactTime+=elapsed||0;
                    }
                    local = definitions.impact[cue.from===1?0:cue.from];
                    next = definitions.impact[cue.to===1?0:cue.to];
                    blend = cue.blend;
                    var pulse=cue.flashAge;
                    if(pulse>=0 && pulse<.8)contact=Math.min(1,Math.exp(-pulse/.12)*(1-Math.exp(-pulse/.008))/(Math.exp(-.05/.12)*(1-Math.exp(-.05/.008))));

                }
                // Main-view weather blends completed offline plates. Optical rays
                // keep the constant default environment even for local returns.
                var animation=definitions.environments[local].animation;
                if(animation){
                    if(!sharedCue)gasTime+=Math.max(0,elapsed||0);
                    var time=gasTime%animation.duration,index=0;
                    while(index+1<animation.keys.length && animation.keys[index+1].time<=time)index++;
                    var fromKey=animation.keys[index],toKey=animation.keys[Math.min(index+1,animation.keys.length-1)];
                    var phase=toKey.time===fromKey.time?0:(time-fromKey.time)/(toKey.time-fromKey.time);
                    blend=fromKey.amount+(toKey.amount-fromKey.amount)*phase;
                    var flashFrame=fromKey.frame===toKey.frame?fromKey.frame:toKey.frame;
                    next=animation.frames[flashFrame];
                }
                var ids = [local, dest1, dest2, next, mission.sky.bakedImpact?definitions.impact[1]:local,defaultLocal];
                if (ids.some(function (id) { var entry = maps.get(id); if (!entry) {
                    load(id).catch(function (/** @type {unknown} */ error) { canvas.dataset.environment = String(error); });
                    return true;
                } return !entry.ready; })) {
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    return;
                }
                var optical = packed[3] > 0 || packed[7] > 0;
                if (effects) {
                    if (effectsStyle !== local) {
                        effects.setSources(cameraSources || definitions.environments[local].cameraSources || []);
                        effectsStyle = local;
                    }
                    effects.setEnabled(opticsEnabled && !optical);
                }
                var cameraExposure = effects ? effects.render(pose, 1 / Math.tan(fov * Math.PI / 360), performance.now() / 1000, false) : 1;
                frameExposure = exposure * cameraExposure;
                if (!external && typeof host.dispatchEvent === "function" && typeof CustomEvent === "function")
                    host.dispatchEvent(new CustomEvent("sky-environment", { detail: { lighting: getLighting(), pose: pose, exposure: cameraExposure } }));
                gl.disable(gl.BLEND);
                gl.disable(gl.DEPTH_TEST);
                gl.disable(gl.CULL_FACE);
                gl.disable(gl.SCISSOR_TEST);
                gl.depthMask(false);
                gl.useProgram(program);
                var locationOf = function (/** @type {string} */ name) { return gl.getUniformLocation(program, name); };
                ( /** @type {("right"|"up"|"back")[]} */(["right", "up", "back"])).forEach(function (key) { gl.uniform3fv(locationOf(key), pose[key]); });
                gl.uniform3fv(locationOf("eye"), eye.map(function (v) { return v * units; }));
                gl.uniform2f(locationOf("projection"), eyeFrame ? eyeFrame.projection[8] : 0, eyeFrame ? eyeFrame.projection[9] : 0);
                gl.uniform1f(locationOf("aspect"), eyeFrame ? eyeFrame.projection[5] / eyeFrame.projection[0] : width / height);
                gl.uniform1f(locationOf("focal"), eyeFrame ? eyeFrame.projection[5] : 1 / Math.tan(fov * Math.PI / 360));
                gl.uniform1f(locationOf("exposure"), frameExposure);
                gl.uniform1f(locationOf("blend"), blend);
                gl.uniform1f(locationOf("contact"), contact);
                gl.uniform1f(locationOf("ellisRegion"), 0);
                gl.uniform4fv(locationOf("mouths[0]"), packed);
                gl.uniform2f(locationOf("destinations"), 1, 2);
                gl.uniform1f(locationOf("pixel"), 2.2 * dpr / (height * (eyeFrame ? eyeFrame.projection[5] : 1 / Math.tan(fov * Math.PI / 360))));
                var gridControl = /** @type {HTMLInputElement|null} */ (document.getElementById("bridge-grid"));
                gl.uniform1f(locationOf("grid"), mission.sky.wormhole && (gridControl ? gridControl.checked : params.get("bridgeGrid") !== "0") ? 1 : 0);
                gl.uniform1f(locationOf("outline"), mission.sky.wormhole && params.get("bridgeOutline") !== "0" ? 1 : 0);
                ids.forEach(function (id, i) { gl.activeTexture(gl.TEXTURE0 + (i>=4?i+1:i)); gl.bindTexture(gl.TEXTURE_CUBE_MAP, maps.get(id)?.texture || null); gl.uniform1i(locationOf(["environmentA", "environmentB", "environmentC", "environmentNext", "environmentContact", "environmentDefault"][i]), i>=4?i+1:i); });
                gl.activeTexture(gl.TEXTURE4);
                gl.bindTexture(gl.TEXTURE_2D, table);
                gl.uniform1i(locationOf("ellisTable"), 4);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindBuffer(gl.ARRAY_BUFFER, quad);
                var position = gl.getAttribLocation(program, "position");
                gl.enableVertexAttribArray(position);
                gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                gl.disableVertexAttribArray(position);
                stats = { drawCalls: 1, triangles: 2, points: 0, meshes: 1, materials: 1 };
                if(motionProgram && motionOpacity && !external) {
                    const activeMotion=motionProgram;gl.useProgram(activeMotion);
                    var motionLocation=function(/** @type {string} */ name){return gl.getUniformLocation(activeMotion,name);};
                    (["right","up","back"]).forEach(function(key){gl.uniform3fv(motionLocation(key),pose[/** @type {"right"|"up"|"back"} */(key)]);});
                    var motionEye=eye.map(function(v){return v*units;}),radius=Math.hypot(motionEye[0]-(pose.region||0)*12000,motionEye[1]+2000,motionEye[2]-1550);
                    gl.uniform3fv(motionLocation("bridgeEye"),motionEye);gl.uniform1f(motionLocation("ellisRegion"),pose.region||0);
                    gl.uniform1f(motionLocation("aspect"),width/height);gl.uniform1f(motionLocation("focal"),1/Math.tan(fov*Math.PI/360));
                    gl.uniform1f(motionLocation("motionOpacity"),motionOpacity);gl.uniform1f(motionLocation("motionPixel"),2/(host.clientHeight/Math.tan(fov*Math.PI/360)));
                    gl.uniform1f(motionLocation("motionBorder"),48*dpr);gl.uniform2f(motionLocation("motionViewport"),width,height);
                    gl.uniform1f(motionLocation("motionObserverL"),Math.sqrt(Math.max(0,(radius-300)*(radius+300))));
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,table);gl.uniform1i(motionLocation("ellisTable"),0);
                    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,motionLengths);gl.uniform1i(motionLocation("motionTable"),1);gl.activeTexture(gl.TEXTURE0);
                    var motionPosition=gl.getAttribLocation(motionProgram,"position");gl.enableVertexAttribArray(motionPosition);gl.vertexAttribPointer(motionPosition,2,gl.FLOAT,false,0,0);
                    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.BLEND);gl.disableVertexAttribArray(motionPosition);
                    stats.drawCalls++;stats.triangles+=2;stats.meshes++;stats.materials++;
                }

            } };
        return api;
    }
    DW.flightSkybox = { create: create, options: options, featureFrame: featureFrame, stars: stars, project: project, createImpactCues: DW.impactCues.create, impactStages: DW.impactCues.stages };
}());
