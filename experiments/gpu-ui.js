(function () {
    'use strict';
    /** @typedef {import('./gpu-ui-types').Painter} Painter */
    /** @typedef {import('./gpu-ui-types').State} State */
    /** @typedef {import('./gpu-ui-types').Path} Path */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    var THREE = /** @type {import('../src/three-types').Three} */ (/** @type {unknown} */ (window.THREE));
    var vertex = `
precision highp float;
in vec2 position, local, bounds, uv;
in vec4 params, tint;
uniform vec2 viewport;
out vec2 p, b, tex;
out vec4 s, c;
void main() {
    p = local; b = bounds; s = params; c = tint; tex = uv;
    gl_Position = vec4(position.x / viewport.x * 2. - 1., 1. - position.y / viewport.y * 2., 0., 1.);
}`;
    // params = (kind, radius, stroke width, image slot). Shapes carry signed
    // distances in CSS pixels; glyphs sample the immutable distance atlas.
    var fragment = `
precision highp float;
uniform sampler2D atlas, monitor, portrait;
uniform float pixelRatio;
in vec2 p, b, tex;
in vec4 s, c;
out vec4 outColor;
void main() {
    float alpha = 1.;
    vec4 color = c;
    if (s.x < 1.5) {
        float distance;
        if (s.x > .5) distance = length(p) - s.y;
        else {
            vec2 q = abs(p) - b + vec2(s.y);
            distance = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - s.y;
        }
        if (s.z > 0.) distance = abs(distance) - s.z * .5;
        float coverage = max(fwidth(distance), .65);
        alpha = 1. - smoothstep(-coverage * .5, coverage * .5, distance);
    } else if (s.x < 2.5) {
        float distance = textureLod(atlas, tex, 0.).a;
        // Atlas distances span sixteen source pixels. Derive glyph coverage
        // from its known scale, independent of adjacent primitives in the batch.
        float coverage = 1. / (16. * max(s.y, .01) * pixelRatio);
        alpha = smoothstep(.5 - coverage * .5, .5 + coverage * .5, distance);
    } else if (s.x < 3.5) {
        color *= s.w < .5 ? texture(monitor, tex) : texture(portrait, tex);
    }
    if (color.a * alpha < .001) discard;
    outColor = vec4(color.rgb, color.a * alpha);
}`;

    // One immutable signed-distance atlas. Canvas is used only to acquire glyph
    // outlines; every visible label is shaded and blended in the GPU batch.
    function fontAtlas() {
        var canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
        var ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Glyph atlas unavailable');
        ctx.font = '28px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        for (var ch = 32; ch < 127; ch++) {
            var cell = ch - 32; ctx.fillText(String.fromCharCode(ch), cell % 16 * 48 + 24, Math.floor(cell / 16) * 48 + 35);
        }
        var pixels = ctx.getImageData(0, 0, 1024, 512).data, inside = new Float32Array(1024 * 512), outside = new Float32Array(inside.length);
        for (var i = 0; i < inside.length; i++) { var on = pixels[i * 4 + 3] > 127; inside[i] = on ? 0 : 10000; outside[i] = on ? 10000 : 0; }
        /** @param {Float32Array} field */
        function distance(field) {
            for (var y = 0; y < 512; y++) for (var x = 0; x < 1024; x++) {
                var n = y * 1024 + x, d = field[n];
                if (x) d = Math.min(d, field[n - 1] + 1);
                if (y) { d = Math.min(d, field[n - 1024] + 1); if (x) d = Math.min(d, field[n - 1025] + Math.SQRT2); if (x < 1023) d = Math.min(d, field[n - 1023] + Math.SQRT2); }
                field[n] = d;
            }
            for (var y = 511; y >= 0; y--) for (var x = 1023; x >= 0; x--) {
                var n = y * 1024 + x, d = field[n];
                if (x < 1023) d = Math.min(d, field[n + 1] + 1);
                if (y < 511) { d = Math.min(d, field[n + 1024] + 1); if (x) d = Math.min(d, field[n + 1023] + Math.SQRT2); if (x < 1023) d = Math.min(d, field[n + 1025] + Math.SQRT2); }
                field[n] = d;
            }
        }
        distance(inside); distance(outside);
        var data = new Uint8Array(pixels.length);
        for (var i = 0; i < inside.length; i++) { data[i*4] = data[i*4+1] = data[i*4+2] = 255; data[i*4+3] = Math.round(Math.max(0, Math.min(1, .5 + (outside[i] - inside[i] + pixels[i*4+3]/255 - .5) / 16)) * 255); }
        var texture = new THREE.DataTexture(data, 1024, 512); texture.flipY = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
        return texture;
    }
    /** @param {string | CanvasGradient | CanvasPattern} value @returns {number[]} */
    function color(value) {
        if (typeof value !== 'string') return [1, 1, 1, 1];
        if (value[0] === '#') {
            var hex = value.slice(1); if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(function (c) { return c+c; }).join('');
            return [parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255,hex.length===8?parseInt(hex.slice(6,8),16)/255:1];
        }
        var parts = value.match(/[\d.]+/g); return parts ? [Number(parts[0])/255, Number(parts[1])/255, Number(parts[2])/255, parts[3] === undefined ? 1 : Number(parts[3])] : [0,0,0,1];
    }
    /** @returns {State} */
    function initial() { return {fillStyle:'#fff',strokeStyle:'#fff',globalAlpha:1,lineWidth:1,font:'12px monospace',textAlign:'left',shadowBlur:0,shadowColor:'#000',matrix:[1,0,0,1,0,0],dash:[]}; }
    /** @param {HTMLElement} host */
    function create(host) {
        var canvas = document.createElement('canvas'); canvas.className = 'gpu-flight-hud'; canvas.setAttribute('aria-hidden','true'); host.appendChild(canvas);
        var renderer = new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,premultipliedAlpha:false}); renderer.setClearColor(0,0); renderer.sortObjects = false;
        var atlas = fontAtlas(), blank = new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1); blank.needsUpdate = true;
        var material = new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,uniforms:{viewport:{value:[1,1]},pixelRatio:{value:1},atlas:{value:atlas},monitor:{value:blank},portrait:{value:blank}},side:THREE.DoubleSide,transparent:true,depthTest:false,depthWrite:false,forceSinglePass:true,blending:THREE.NormalBlending,defaultAttributeValues:{}});
        var geometry = new THREE.BufferGeometry(), scene = new THREE.Scene(), camera = new THREE.Camera(), mesh = new THREE.Mesh(geometry,material); mesh.frustumCulled = false; scene.add(mesh);
        // Reuse a bounded vertex buffer, growing only when a new high-water mark is reached.
        var buffer = new Float32Array(16 * 32768), count = 0, width = 1, height = 1, disposed = false;
        var interleaved = new THREE.InterleavedBuffer(buffer,16);
        function attributes() { [['position',2,0],['local',2,2],['bounds',2,4],['params',4,6],['tint',4,10],['uv',2,14]].forEach(function (a) { geometry.setAttribute(String(a[0]),new THREE.InterleavedBufferAttribute(interleaved,Number(a[1]),Number(a[2]))); }); }
        attributes();
        var state = initial();
        /** @type {State[]} */
        var stack = [];
        /** @type {Path[]} */
        var paths = [];
        /** @type {Map<HTMLCanvasElement, import('../src/three-types').Texture>} */ var textures = new Map();
        /** @param {number} x @param {number} y */ function point(x,y) { var m=state.matrix;return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]; }
        /** @param {number[]} position @param {number[]} local @param {number[]} bounds @param {number[]} params @param {number[]} tint @param {number[]} uv */
        function vertexAt(position,local,bounds,params,tint,uv) {
            if ((count+1)*16>buffer.length) { var grown=new Float32Array(buffer.length*2);grown.set(buffer);geometry.dispose();buffer=grown;interleaved=new THREE.InterleavedBuffer(buffer,16);attributes(); }
            buffer.set(position.concat(local,bounds,params,tint,uv),count++*16);
        }
        /** @param {number} x @param {number} y @param {number} hw @param {number} hh @param {number[]} params @param {number[]} tint @param {number[]} [uv] @param {number} [angle] */
        function quad(x,y,hw,hh,params,tint,uv,angle) {
            uv=uv||[0,0,1,1]; var pad=params[0]<2?1+params[2]*.5:0,co=Math.cos(angle||0),si=Math.sin(angle||0);
            [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]].forEach(function(c){var lx=c[0]*(hw+pad),ly=c[1]*(hh+pad);vertexAt(point(x+co*lx-si*ly,y+si*lx+co*ly),[lx,ly],[hw,hh],params,tint,[uv[0]+(c[0]+1)*.5*(uv[2]-uv[0]),uv[1]+(c[1]+1)*.5*(uv[3]-uv[1])]);});
        }
        /** @param {string | CanvasGradient | CanvasPattern} style */ function tint(style) { var c=color(style);c[3]*=state.globalAlpha;return c; }
        /** @param {number[]} a @param {number[]} b */ function line(a,b) {var dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);quad((a[0]+b[0])*.5,(a[1]+b[1])*.5,(length+state.lineWidth)*.5,state.lineWidth*.5,[0,state.lineWidth*.5,0,0],tint(state.strokeStyle),undefined,Math.atan2(dy,dx));}
        /** @param {boolean} stroke */ function paint(stroke) {
            paths.forEach(function(path){
                if(path.circle){var c=path.circle;
                    if(stroke&&state.dash.length>=2&&state.dash[0]>0&&state.dash[1]>0){
                        for(var start=0;start<Math.PI*2*c[2];start+=state.dash[0]+state.dash[1]){
                            var end=Math.min(start+state.dash[0],Math.PI*2*c[2]),steps=Math.max(1,Math.ceil((end-start)/2));
                            for(var j=0;j<steps;j++){var a=(start+(end-start)*j/steps)/c[2],b=(start+(end-start)*(j+1)/steps)/c[2];line([c[0]+Math.cos(a)*c[2],c[1]+Math.sin(a)*c[2]],[c[0]+Math.cos(b)*c[2],c[1]+Math.sin(b)*c[2]]);}
                        }
                    }else quad(c[0],c[1],c[2],c[2],[1,c[2],stroke?state.lineWidth:0,0],tint(stroke?state.strokeStyle:state.fillStyle));}
                else if(stroke){for(var i=1;i<path.points.length;i++)line(path.points[i-1],path.points[i]);if(path.closed&&path.points.length>1)line(path.points[path.points.length-1],path.points[0]);}
                else {for(var i=1;i<path.points.length-1;i++)[path.points[0],path.points[i],path.points[i+1]].forEach(function(p){vertexAt(point(p[0],p[1]),[0,0],[0,0],[4,0,0,0],tint(state.fillStyle),[0,0]);});}
            });
        }
        /** @type {Painter} */ var ctx = {
            get fillStyle(){return state.fillStyle;},set fillStyle(v){state.fillStyle=v;},get strokeStyle(){return state.strokeStyle;},set strokeStyle(v){state.strokeStyle=v;},get globalAlpha(){return state.globalAlpha;},set globalAlpha(v){state.globalAlpha=v;},get lineWidth(){return state.lineWidth;},set lineWidth(v){state.lineWidth=v;},get font(){return state.font;},set font(v){state.font=v;},get textAlign(){return state.textAlign;},set textAlign(v){state.textAlign=v;},get shadowBlur(){return state.shadowBlur;},set shadowBlur(v){state.shadowBlur=v;},get shadowColor(){return state.shadowColor;},set shadowColor(v){state.shadowColor=v;},
            save:function(){stack.push(Object.assign({},state,{matrix:state.matrix.slice(),dash:state.dash.slice()}));},restore:function(){state=stack.pop()||state;},
            translate:function(x,y){var p=point(x,y);state.matrix[4]=p[0];state.matrix[5]=p[1];},rotate:function(a){var m=state.matrix,co=Math.cos(a),si=Math.sin(a);state.matrix=[m[0]*co+m[2]*si,m[1]*co+m[3]*si,m[2]*co-m[0]*si,m[3]*co-m[1]*si,m[4],m[5]];},
            beginPath:function(){paths=[];},moveTo:function(x,y){paths.push({points:[[x,y]],closed:false});},lineTo:function(x,y){if(!paths.length)paths.push({points:[],closed:false});paths[paths.length-1].points.push([x,y]);},closePath:function(){if(paths.length)paths[paths.length-1].closed=true;},
            arc:function(x,y,r,start,end){if(end-start>=Math.PI*2-.001){paths.push({points:[],closed:true,circle:[x,y,r]});}else{var steps=Math.max(8,Math.ceil((end-start)*r/3));for(var i=0;i<=steps;i++){var a=start+(end-start)*i/steps;if(!i)ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);else ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}}},
            stroke:function(){paint(true);},fill:function(){paint(false);},setLineDash:function(v){state.dash=v;},
            fillRect:function(x,y,w,h){quad(x+w*.5,y+h*.5,w*.5,h*.5,[0,0,0,0],tint(state.fillStyle));},strokeRect:function(x,y,w,h){quad(x+w*.5,y+h*.5,w*.5,h*.5,[0,0,state.lineWidth,0],tint(state.strokeStyle));},
            fillText:function(value,x,y){var size=Number((state.font.match(/([\d.]+)px/)||[])[1])||12,scale=size/28,text=value.replace(/[–—]/g,'-').replace(/·/g,'.'),advance=16.86*scale; if(state.textAlign==='center')x-=text.length*advance*.5;else if(state.textAlign==='right'||state.textAlign==='end')x-=text.length*advance;for(var i=0;i<text.length;i++){var code=text.charCodeAt(i);if(code<32||code>126)code=63;var col=(code-32)%16,row=Math.floor((code-32)/16);quad(x+i*advance+advance*.5,y-11*scale,24*scale,24*scale,[2,scale,0,0],tint(state.fillStyle),[col*48/1024,row*48/512,(col+1)*48/1024,(row+1)*48/512]);}},
            panel:function(x,y,w,h,r){quad(x+w*.5,y+h*.5,w*.5,h*.5,[0,r,0,0],tint(state.fillStyle));quad(x+w*.5,y+h*.5,w*.5,h*.5,[0,r,state.lineWidth,0],tint(state.strokeStyle));},
            image:function(source,x,y,w,h,slot,refresh){var texture=textures.get(source);if(!texture){texture=new THREE.Texture(source);texture.flipY=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;textures.set(source,texture);texture.needsUpdate=true;}if(refresh!==false)texture.needsUpdate=true;material.uniforms[slot===0?'monitor':'portrait'].value=texture;quad(x+w*.5,y+h*.5,w*.5,h*.5,[3,0,0,slot],[1,1,1,state.globalAlpha]);}
        };
        function dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();atlas.dispose();blank.dispose();textures.forEach(function(t){t.dispose();});textures.clear();renderer.dispose();canvas.remove();}
        window.addEventListener('pagehide',function(event){if(!event.persisted)dispose();});
        return { painter:ctx, canvas:canvas, begin:/** @param {number} w @param {number} h */ function(w,h){width=Math.max(1,w);height=Math.max(1,h);var dpr=window.devicePixelRatio||1,pw=Math.round(width*dpr),ph=Math.round(height*dpr);if(canvas.width!==pw||canvas.height!==ph)renderer.setSize(pw,ph,false);material.uniforms.viewport.value=[width,height];material.uniforms.pixelRatio.value=dpr;count=0;state=initial();stack=[];paths=[];},end:function(){if(disposed)return;interleaved.needsUpdate=true;geometry.setDrawRange(0,count);renderer.render(scene,camera);},dispose:dispose,stats:function(){return{vertices:count,capacity:buffer.length/16,textures:textures.size+2,drawCalls:count?1:0};}};
    }
    DW.gpuUi = {create:create,color:color};
}());
