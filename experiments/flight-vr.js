(function () {
    'use strict';
    /** @typedef {import('./flight-vr-types').Source} Source */
    /** @typedef {import('./flight-vr-types').Bridge} Bridge */
    /** @typedef {import('../src/three-types').Object3D} Object3D */
    /** @typedef {import('../src/three-types').Material} Material */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @type {WeakMap<HTMLElement,Bridge>} */ var bridges = new WeakMap();
    /** XR sources belong to the session, not navigator.getGamepads().
     * The two xr-standard controllers act as one standard flight gamepad.
     * @param {Source[]} sources */
    function read(sources) {
        /** @param {string} hand */ function pad(hand) { return sources.find(function (s) { return s.handedness === hand && s.gamepad && s.gamepad.mapping === 'xr-standard'; }); }
        var left = pad('left'), right = pad('right');
        /** @param {Source|undefined} source @param {number} index */
        function button(source,index) { var b=source&&source.gamepad&&source.gamepad.buttons[index];return !!(b&&(b.pressed||b.value>.5)); }
        /** @param {Source|undefined} source @param {number} index */
        function axis(source,index) { return DW.flightInput.deadzone(source&&source.gamepad ? source.gamepad.axes[index] : 0,.12); }
        var maneuver=button(left,1), x=axis(right,2), y=-axis(right,3), length=Math.max(1,Math.hypot(x,y));
        return {pitch:-axis(left,3),yaw:-axis(left,2),roll:maneuver?0:-x,side:maneuver?x/length:0,vertical:maneuver?y/length:0,
            throttle:null,throttleRate:maneuver?0:y,fire:button(right,0),boost:button(right,4),bank:button(left,5),lock:button(left,0),
            pause:button(right,5),target:button(right,1),recenter:button(left,4)};
    }
    /** @param {HTMLElement} host @param {import('../src/three-types').Renderer} renderer @param {import('../src/three-types').Scene} scene @param {Object3D} camera @returns {Bridge} */
    function create(host,renderer,scene,camera) {
        var T=window.THREE, rig=new T.Group(), hudScene=new T.Scene(), units=DW.sim.METERS_PER_UNIT;
        rig.matrixAutoUpdate=false;
        /** @type {import('./flight-vr-types').Space|null} */ var baseSpace=null;
        /** @type {import('./flight-vr-types').Transform|null} */ var head=null;
        /** @type {import('./types').ControlActions|null} */ var actions=null;
        var centerPending=true, wasTracking=false, entering=false;
        var identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
        /** @type {HTMLButtonElement|null} */ var button=null;
        /** @type {HTMLElement|null} */ var status=null;
        var right=[1,0,0],up=[0,1,0],back=[0,0,1];
        var rigDistance=1;
        /** @type {((context:WebGL2RenderingContext,eye:import('./flight-vr-types').SkyEye)=>void)|null} */var skyDraw=null;
        function active(){return renderer.xr.isPresenting;}
        function tracking(){var s=renderer.xr.getSession();return active()&&!!head&&!!s&&s.visibilityState==='visible';}
        /** Per-eye matrices also cover the engine's raw shaders, which bypass Three's projection.
         * @param {Object3D} object @param {Material} material */
        function bind(object,material) {
            var viewMatrix=new Float32Array(16),projectionMatrix=new Float32Array(16);
            object.onBeforeRender=function(_renderer,_scene,eye){
                if(!material.uniforms.uXRActive)return;
                material.uniforms.uXRActive.value=active()?1:0;
                viewMatrix.set(eye.matrixWorldInverse.elements);projectionMatrix.set(eye.projectionMatrix.elements);
                material.uniforms.uXRView.value=viewMatrix;
                material.uniforms.uXRProjection.value=projectionMatrix;
                material.uniformsNeedUpdate=true;
            };
        }
        /** @type {import('../src/three-types').Object3D|null} */var nativeHud=null;
        /** @type {import('../src/three-types').Material|null} */var nativeHudMaterial=null;
        /** @type {import('./gpu-ui-types').GpuUi|null} */var pauseUi=null;
        /** @param {import('./gpu-ui-types').NativeFrame} frame */
        function renderNativeHud(frame){
            if(!nativeHudMaterial){
                nativeHudMaterial=new T.RawShaderMaterial({glslVersion:T.GLSL3,side:T.DoubleSide,transparent:true,depthTest:false,depthWrite:false,blending:T.NormalBlending,defaultAttributeValues:{},
                    uniforms:{uXRActive:{value:1},uXRView:{value:new Float32Array(identity)},uXRProjection:{value:new Float32Array(identity)},right:{value:right},up:{value:up},back:{value:back},angularPixel:{value:1}},
                    vertexShader:'precision highp float;in vec2 position,local,bounds,uv;in vec4 params,tint;uniform vec2 viewport;uniform float angularPixel;uniform vec3 right,up,back;uniform mat4 uXRView,uXRProjection;out vec2 p,b,tex;out vec4 s,c;void main(){p=local;b=bounds;s=params;c=tint;tex=uv;vec2 q=(position-viewport*.5)*vec2(angularPixel,-angularPixel);float r2=dot(q,q);vec3 direction=(right*(2.*q.x)+up*(2.*q.y)-back*(1.-r2))/(1.+r2);gl_Position=uXRProjection*vec4(mat3(uXRView)*direction,0.);gl_Position.z=gl_Position.w*.999999;}',
                    fragmentShader:frame.fragmentShader.replace('float coverage = 1. / (16. * max(s.y, .01) * pixelRatio);','float coverage = max(fwidth(distance), 1. / 255.);')});
                nativeHud=new T.Mesh(frame.geometry,nativeHudMaterial);nativeHud.frustumCulled=false;bind(nativeHud,nativeHudMaterial);hudScene.add(nativeHud);
            }
            var material=nativeHudMaterial;
            Object.keys(frame.uniforms).forEach(function(key){material.uniforms[key]=frame.uniforms[key];});
            material.uniforms.right.value=right;material.uniforms.up.value=up;material.uniforms.back.value=back;material.uniforms.angularPixel.value=2*Math.tan(Math.PI/16)/frame.height;
            if(nativeHud){nativeHud.geometry=frame.geometry;nativeHud.visible=true;}
            renderer.render(hudScene,camera);
        }
        /** @param {number[]} local */
        function rotate(local){return local.map(function(_,k){return right[k]*local[0]+up[k]*local[1]+back[k]*local[2];});}
        var api={active:active,tracking:tracking,sources:function(){var session=renderer.xr.getSession();return tracking()&&session?Array.from(session.inputSources):[];},bind:bind,
            setSkyRenderer:/** @param {(context:WebGL2RenderingContext,eye:import('./flight-vr-types').SkyEye)=>void} draw */function(draw){skyDraw=draw;},
            resetRenderer:function(){if(!skyDraw)return;var target=renderer.getRenderTarget();renderer.resetState();renderer.setRenderTarget(target);},
            renderSky:function(){
                if(!active()||!skyDraw)return;
                renderer.xr.updateCamera(camera);
                var target=renderer.getRenderTarget();
                try{renderer.xr.getCamera().cameras.forEach(function(eye){
                    var m=eye.matrixWorld.elements,vp=eye.viewport;if(!vp||!skyDraw)return;
                    renderer.resetState();renderer.setRenderTarget(target);renderer.setViewport(vp.x,vp.y,vp.z,vp.w);
                    skyDraw(renderer.getContext(),{right:[m[0]*units,m[1]*units,m[2]*units],up:[m[4]*units,m[5]*units,m[6]*units],back:[m[8]*units,m[9]*units,m[10]*units],
                        offset:[m[12]-back[0]*rigDistance,m[13]-back[1]*rigDistance,m[14]-back[2]*rigDistance],projection:Array.from(eye.projectionMatrix.elements),viewport:{x:vp.x,y:vp.y,width:vp.z,height:vp.w}});
                });}finally{renderer.resetState();renderer.setRenderTarget(target);}
            },
            recenter:function(){centerPending=true;},
            frame:/** @param {import('./flight-vr-types').Frame} [frame] */function(frame){
                head=null;
                if(active()&&frame){
                    if(!baseSpace)baseSpace=renderer.xr.getReferenceSpace();
                    var initial=frame.getViewerPose(baseSpace);
                    if(centerPending&&initial){
                        var m=initial.transform.matrix,p=initial.transform.position,yaw=Math.atan2(m[8],m[10]);
                        var Rigid=/** @type {{XRRigidTransform:new(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number})=>unknown}} */ (/** @type {unknown} */ (window)).XRRigidTransform;
                        renderer.xr.setReferenceSpace(baseSpace.getOffsetReferenceSpace(new Rigid(p,{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)})));centerPending=false;
                    }
                    var pose=frame.getViewerPose(renderer.xr.getReferenceSpace());head=pose?pose.transform:null;
                }
                var tracked=tracking();if(wasTracking&&!tracked&&actions)actions.pause();wasTracking=tracked;
            },
            prepare:/** @param {number[]} r @param {number[]} u @param {number[]} b @param {number} distance */function(r,u,b,distance){
                right=r;up=u;back=b;
                rigDistance=distance;if(nativeHud)nativeHud.visible=active();
                if(active()){
                    rig.add(camera);var s=1/units;
                    // Cancel the tracked head centre, retaining each eye's physical offset.
                    // Physical walking/leaning never moves the flight viewpoint.
                    var offset=head?rotate([head.matrix[12],head.matrix[13],head.matrix[14]]):[0,0,0];
                    rig.matrix.fromArray([r[0]*s,r[1]*s,r[2]*s,0,u[0]*s,u[1]*s,u[2]*s,0,b[0]*s,b[1]*s,b[2]*s,0,b[0]*distance-offset[0]*s,b[1]*distance-offset[1]*s,b[2]*distance-offset[2]*s,1]);
                    camera.matrix.fromArray(identity);rig.updateMatrixWorld(true);
                    camera.near=.05;camera.far=30000*units;
                }else if(camera.parent===rig){rig.remove(camera);camera.updateMatrixWorld(true);}
            },
            skyPose:/** @param {import('./types').Pose} pose */function(pose){
                if(!active()||!head)return pose;
                right=pose.right;up=pose.up;back=pose.back;
                var m=head.matrix;
                return Object.assign({},pose,{right:rotate([m[0],m[1],m[2]]),up:rotate([m[4],m[5],m[6]]),back:rotate([m[8],m[9],m[10]])});
            },
            overlay:/** @param {HTMLCanvasElement} canvas */function(canvas){
                if(!active())return;
                var paused=actions&&actions.isPaused();
                var gpu=DW.gpuUi,frame=gpu&&gpu.frame(canvas);
                if(frame&&gpu){
                    if(paused){
                        if(!pauseUi)pauseUi=gpu.create(document.createElement('div'),{nativeOnly:true});
                        pauseUi.begin(960,600);var painter=pauseUi.painter;painter.textAlign='center';painter.fillStyle='#d2e8ee';painter.font='22px monospace';
                        ['VR PAUSED / P4',actions&&actions.isDead()?'B: restart flight':'B: resume flight','Left stick: steer | Right: roll / throttle','Right trigger: fire | A: boost','Left grip + right stick: strafe','Left trigger: lock | Right grip: next target','Y: weapon | X: recenter','Headset menu: leave VR'].forEach(function(line,i){painter.fillText(line,480,95+i*58);});
                        pauseUi.end(true);frame=pauseUi.nativeFrame();
                    }
                    renderNativeHud(frame);return;
                }
            },
            mount:/** @param {import('./types').ControlActions} value */function(value){
                actions=value;if(button)return;
                var xr=/** @type {{xr?:import('./flight-vr-types').XR}} */ (navigator).xr;
                button=document.createElement('button');button.type='button';button.textContent='Checking VR...';button.disabled=true;
                status=document.createElement('span');status.setAttribute('role','status');
                var row=document.createElement('div');row.className='flight-vr-controls';row.append(button,status);
                row.style.cssText='position:fixed;top:12px;right:12px;z-index:100;display:flex;flex-direction:column;gap:5px;max-width:280px;padding:8px;background:#07121fee;color:#d2e8ee;border:1px solid #578178;border-radius:5px;font:12px monospace';
                document.body.appendChild(row);
                if(!xr){button.textContent='VR unavailable';status.textContent=window.isSecureContext===false?'VR needs HTTPS. Open the temporary HTTPS link.':'WebXR is unavailable here. Open this link directly in Meta Quest Browser.';return;}
                xr.isSessionSupported('immersive-vr').then(function(supported){if(button){button.disabled=!supported;button.textContent=supported?'Enter VR':'VR unavailable';}if(status)status.textContent=supported?'Head tracking + hand controllers':'This browser reports immersive VR unavailable.';}).catch(/** @param {unknown} error */function(error){if(button)button.textContent='VR unavailable';if(status)status.textContent='VR support check failed: '+String(error);});
                button.onclick=async function(){
                    if(!xr||entering)return;if(active()){var existing=renderer.xr.getSession();if(existing)await existing.end();return;}
                    entering=true;if(button)button.disabled=true;
                    /** @type {import('./flight-vr-types').Session|null} */var session=null;
                    try{
                        if(actions&&actions.isDead())throw Error('Restart flight before entering VR.');
                        DW.audio.unlock();if(actions)actions.pause();
                        session=await xr.requestSession('immersive-vr',{optionalFeatures:[]});
                        renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');renderer.xr.setFoveation(0);
                        session.addEventListener('end',function(){baseSpace=null;head=null;centerPending=true;wasTracking=false;if(actions)actions.pause();if(button)button.textContent='Enter VR';if(status)status.textContent='';});
                        session.addEventListener('visibilitychange',function(){if(session&&session.visibilityState!=='visible'&&actions)actions.pause();});
                        session.addEventListener('inputsourceschange',function(){if(actions)actions.pause();});
                        await renderer.xr.setSession(session);baseSpace=null;centerPending=true;
                        if(button)button.textContent='Exit VR';if(status)status.textContent='B resumes / pauses. X recenters.';
                    }catch(error){if(session)await session.end().catch(function(){});if(status)status.textContent='VR could not start: '+String(error);}
                    finally{entering=false;if(button)button.disabled=false;}
                };
            }
        };
        bridges.set(host,api);return api;
    }
    DW.flightVr={create:create,forHost:function(host){return bridges.get(host);},read:read};
}());
