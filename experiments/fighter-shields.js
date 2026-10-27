(function () {
    'use strict';
    /** @param {string} id */
    const el = id => /** @type {HTMLInputElement} */ (document.getElementById(id));
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
    const context = canvas.getContext('webgl', {antialias:true, alpha:false});
    if (!context) { el('status').textContent='WebGL unavailable'; return; }
    const gl = context;
    /** @param {string} vertex @param {string} fragment */
    function program(vertex, fragment) {
        const p=gl.createProgram(); if(!p) throw new Error('Program allocation failed');
        for (const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
            const s=gl.createShader(/** @type {number} */(kind)); if(!s) throw new Error('Shader allocation failed');
            gl.shaderSource(s,/** @type {string} */(source));gl.compileShader(s);
            if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');gl.attachShader(p,s);
        }
        gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Link failed');return p;
    }
    const quadVertex='attribute vec2 p;uniform vec4 box;varying vec2 q;void main(){q=p;gl_Position=vec4(box.xy+p*box.zw,0.,1.);}';
    const background=program(quadVertex,`precision highp float;uniform vec2 resolution;void main(){vec2 p=gl_FragCoord.xy;vec2 uv=p/resolution;float grid=step(.96,fract(p.x/32.))+step(.96,fract(p.y/32.));float star=step(.995,fract(sin(dot(floor(p/5.),vec2(12.9898,78.233)))*43758.5453))*pow(max(0.,1.-length(fract(p/5.)-.5)*2.),3.);gl_FragColor=vec4(vec3(.015,.025,.055)+vec3(.03,.05,.08)*grid+star+vec3(.03,.035,.08)*sin(uv.x*7.+uv.y*4.),1.);}`);
    const hull=program(`attribute vec3 p;attribute vec3 n;uniform vec4 box;varying vec3 normal;void main(){vec3 v=vec3(p.x,p.y*.58+p.z*.81,-p.y*.81+p.z*.58);normal=vec3(n.x,n.y*.58+n.z*.81,-n.y*.81+n.z*.58);gl_Position=vec4(box.xy+v.xy*box.zw*.085,v.z*.02,1.);}`,`precision highp float;varying vec3 normal;void main(){float light=.38+.62*abs(dot(normalize(normal),normalize(vec3(-.4,.5,1.))));gl_FragColor=vec4(vec3(.45,.58,.65)*light,1.);}`);
    const shield=program(quadVertex,`precision highp float;varying vec2 q;uniform sampler2D scene;uniform vec2 resolution;uniform float mode,bend,width;uniform vec4 hits[16];uniform int waveCount;
void main(){float r2=dot(q,q);if(r2>=1.)discard;vec3 n=vec3(q,sqrt(max(0.,1.-r2)));float wave=0.;vec2 slope=vec2(0.);
for(int i=0;i<16;i++){if(i>=waveCount)break;vec4 h=hits[i];float age=h.w;float c=cos(age*2.6);float d=dot(n,h.xyz)-c;float pulse=1.-smoothstep(0.,width,abs(d));float fade=(1.-smoothstep(.65,1.2,age))*smoothstep(0.,.08,age);wave+=pulse*fade;slope+=(h.xy-n.xy*dot(n,h.xyz))*pulse*fade;}
float rim=pow(r2,5.);float edge=1.-smoothstep(.975,1.,r2);vec3 glow=vec3(.025,.3,1.)*(rim*.23+min(wave,2.)*.4)*edge;
if(mode<1.5){gl_FragColor=vec4(glow,1.);return;}
vec2 displacement=slope/(1.+length(slope))*bend*edge;vec2 uv=clamp((gl_FragCoord.xy+displacement)/resolution,vec2(.5)/resolution,vec2(1.)-vec2(.5)/resolution);gl_FragColor=vec4(texture2D(scene,uv).rgb+glow,1.);}`);
    const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    const model=DW.shipPacks[0].models.find(m=>m.name==='Spitfire');if(!model)throw new Error('Missing Spitfire');
    const mesh=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(model.vertices),gl.STATIC_DRAW);
    const vertexCount=model.vertices.length/6, texture=gl.createTexture(), fbo=gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const depth=gl.createRenderbuffer();
    /** @type {{x:number,y:number,z:number,start:number}[]} */
    let impacts=[];let time=0,last=0,nextHit=0,busy=false;
    const hits=new Float32Array(64), readback=new Uint8Array(4);
    function complete(){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,readback);}
    /** @param {number} x @param {number} y */
    function hit(x,y){const r=Math.hypot(x,y);if(r>.98){x*=.98/r;y*=.98/r;}impacts.unshift({x,y,z:Math.sqrt(1-x*x-y*y),start:time});impacts=impacts.slice(0,16);}
    /** @param {number} count @param {number} size */
    function boxes(count,size){const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),aspect=canvas.height/canvas.width;return Array.from({length:count},(/** @type {unknown} */ _,i)=>[(i%cols+.5)*2/cols-1,(Math.floor(i/cols)+.5)*2/rows-1,size*Math.min(1/cols,1/rows*aspect),size*Math.min(1/cols/aspect,1/rows)]);}
    /** @param {WebGLProgram} p @param {number[]} box @param {boolean} isHull */
    function setup(p,box,isHull){gl.useProgram(p);gl.uniform4fv(gl.getUniformLocation(p,'box'),box);gl.bindBuffer(gl.ARRAY_BUFFER,isHull?mesh:quad);const a=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,isHull?3:2,gl.FLOAT,false,isHull?24:8,0);const n=gl.getAttribLocation(p,'n');if(n>=0){gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,24,12);}gl.uniform2f(gl.getUniformLocation(p,'resolution'),canvas.width,canvas.height);}
    function resize(){const scale=Number(el('scale').value),w=Math.max(1,Math.round(canvas.clientWidth*scale)),h=Math.max(1,Math.round(canvas.clientHeight*scale));if(w===canvas.width&&h===canvas.height)return;canvas.width=w;canvas.height=h;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Incomplete scene target');gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
    /** @param {number} mode */
    function render(mode){
        const count=Number(el('count').value),bs=boxes(count,Number(el('size').value));gl.viewport(0,0,canvas.width,canvas.height);
        /** @param {boolean} ships */
        function base(ships){gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);setup(background,[0,0,1,1],false);gl.drawArrays(gl.TRIANGLES,0,6);gl.clear(gl.DEPTH_BUFFER_BIT);if(ships)drawHulls();}
        function drawHulls(){gl.enable(gl.DEPTH_TEST);for(const b of bs){setup(hull,b,true);gl.drawArrays(gl.TRIANGLES,0,vertexCount);}gl.disable(gl.DEPTH_TEST);}
        if(mode>=2){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);base(mode===3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
        base(mode!==2);
        if(mode>0){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);if(mode===1){gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);}for(const b of bs){setup(shield,b,false);gl.uniform1f(gl.getUniformLocation(shield,'mode'),mode);gl.uniform1f(gl.getUniformLocation(shield,'bend'),Number(el('bend').value));gl.uniform1f(gl.getUniformLocation(shield,'width'),Number(el('width').value));gl.uniform1i(gl.getUniformLocation(shield,'waveCount'),Math.min(impacts.length,Number(el('waves').value)));gl.uniform4fv(gl.getUniformLocation(shield,'hits[0]'),hits);gl.drawArrays(gl.TRIANGLES,0,6);}gl.disable(gl.BLEND);}
        if(mode===2)drawHulls();
    }
    function updateHits(){hits.fill(0);impacts.forEach((h,i)=>{hits.set([h.x,h.y,h.z,time-h.start],i*4);});}
    el('hit').onclick=()=>hit(.6,0);
    canvas.onclick=e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*2-1,y=1-(e.clientY-rect.top)/rect.height*2;for(const b of boxes(Number(el('count').value),Number(el('size').value))){const qx=(x-b[0])/b[2],qy=(y-b[1])/b[3];if(qx*qx+qy*qy<=1){hit(qx,qy);break;}}};
    const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    el('bench').onclick=async()=>{
        if(busy)return;busy=true;el('bench').disabled=true;
        const saved=impacts;const controls=Array.from(document.querySelectorAll('input,select,button'));controls.forEach(c=>{if(c instanceof HTMLInputElement||c instanceof HTMLSelectElement||c instanceof HTMLButtonElement)c.disabled=true;});
        try {resize();const w=canvas.width,h=canvas.height;const selected=Number(el('mode').value)||1;
            // Fixed wave field and camera for every mode; each slot is populated.
            impacts=Array.from({length:16},(/** @type {unknown} */ _,i)=>{const a=i*2.39996,z=.2+(i%5)*.15,r=Math.sqrt(1-z*z);return {x:Math.cos(a)*r,y:Math.sin(a)*r,z,start:time-.15-(i%7)*.08};});updateHits();
            /** @type {number[][]} */const samples=[[],[]];
            /** @type {number[][]} */ const submissions=[[],[]];
            for(const group of [0,1,1,0]){await yieldFrame();if(document.hidden||Math.round(canvas.clientWidth*Number(el('scale').value))!==w||Math.round(canvas.clientHeight*Number(el('scale').value))!==h)throw new Error('Viewport changed or tab hidden; rerun');
                const mode=group?selected:0;for(let i=0;i<8;i++)render(mode);complete();
                for(let i=0;i<24;i++){const start=performance.now();render(mode);submissions[group].push(performance.now()-start);complete();samples[group].push(performance.now()-start);}
                el('results').textContent='Measuring matched '+(group?'effect':'baseline')+'…';
            }
            const submitStats=submissions.map(s=>{s.sort((a,b)=>a-b);return [s[Math.floor(s.length*.5)],s[Math.floor(s.length*.95)]];});
            const stats=samples.map(s=>{s.sort((a,b)=>a-b);return [s[Math.floor(s.length*.5)],s[Math.floor(s.length*.95)]];});
            el('results').textContent=`${w} × ${h}; ${el('count').value} fighters; ${el('waves').value} waves\nSize ${el('size').value}; backing scale ${el('scale').value}x\nMode ${selected}; bend ${el('bend').value}px; width ${el('width').value}\n48 samples/mode; 8 warmup/pass\n${String(gl.getParameter(gl.RENDERER))}\nCPU submission median/p95 (ms):\nOff ${submitStats[0].map(v=>v.toFixed(2)).join(' / ')}; on ${submitStats[1].map(v=>v.toFixed(2)).join(' / ')}\nReadback-synchronized render (ms):\nOff median/p95: ${stats[0].map(v=>v.toFixed(2)).join(' / ')}\nOn  median/p95: ${stats[1].map(v=>v.toFixed(2)).join(' / ')}\nMedian delta: ${(stats[1][0]-stats[0][0]).toFixed(2)} ms\nIncludes CPU, driver, GPU wait + readback. Not GPU-only or game FPS.`;
            }
        catch(error){el('results').textContent=String(error);}finally{impacts=saved;updateHits();busy=false;controls.forEach(c=>{if(c instanceof HTMLInputElement||c instanceof HTMLSelectElement||c instanceof HTMLButtonElement)c.disabled=false;});}
    };
    /** @param {number} stamp */
    function frame(stamp){requestAnimationFrame(frame);const cadence=(stamp-last)/1000||0,dt=Math.min(.05,cadence);last=stamp;if(busy)return;resize();if(!el('pause').checked)time+=dt;const n=Number(el('waves').value);if(el('auto').checked&&time>=nextHit){const a=time*2.39996;hit(Math.cos(a)*.8,Math.sin(a)*.8);nextHit=time+1.05/n;}impacts=impacts.filter(h=>time-h.start<1.2);updateHits();const mode=Number(el('mode').value);render(mode);const count=Number(el('count').value);el('status').textContent=`${canvas.width} × ${canvas.height} backing pixels\n${(cadence*1000).toFixed(1)} ms browser cadence\n${count} fighters · ${Math.min(n,impacts.length)} waves/shield\n${1+count+(mode?count:0)+(mode>=2?1+(mode===3?count:0):0)} draws/frame\n${(vertexCount/3*count*(mode===3?2:1)).toLocaleString()} hull triangles/frame`;
    }
    hit(.7,0);requestAnimationFrame(frame);
}());
