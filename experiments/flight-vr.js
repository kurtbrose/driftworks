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
        var right=[1,0,0],up=[0,1,0],back=[0,0,1],eyeCenter=[0,0,1];
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
        /** @param {boolean} sky */
        function panel(sky) {
            var geometry=new T.BufferGeometry();
            geometry.setAttribute('aPosition',new T.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
            geometry.setDrawRange(0,6);
            var texture=new T.Texture(document.createElement('canvas'));texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
            var uniforms={uXRActive:{value:1},uXRView:{value:new Float32Array(identity)},uXRProjection:{value:new Float32Array(identity)},
                image:{value:texture},right:{value:right},up:{value:up},back:{value:back},extent:{value:[1,1]},center:{value:[0,0,0]}};
            var material=new T.RawShaderMaterial({uniforms:uniforms,side:T.DoubleSide,transparent:!sky,depthTest:false,depthWrite:false,
                blending:sky?T.NoBlending:T.NormalBlending,defaultAttributeValues:{},
                vertexShader:'precision highp float;attribute vec2 aPosition;uniform mat4 uXRView,uXRProjection;uniform vec3 right,up,back,center;uniform vec2 extent;varying vec2 uv;void main(){uv=aPosition*.5+.5;vec3 p=right*aPosition.x*extent.x+up*aPosition.y*extent.y-back;'+
                    (sky?'gl_Position=uXRProjection*vec4(mat3(uXRView)*p,0.);gl_Position.z=gl_Position.w*.999999;':'gl_Position=uXRProjection*uXRView*vec4(center+p,1.);')+'}',
                fragmentShader:'precision mediump float;uniform sampler2D image;varying vec2 uv;void main(){gl_FragColor=texture2D(image,uv);}'});
            var mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;bind(mesh,material);
            return {mesh:mesh,material:material,texture:texture};
        }
        var sky=panel(true),hud=panel(false);scene.add(sky.mesh);hudScene.add(hud.mesh);
        var help=document.createElement('canvas');help.width=1024;help.height=768;
        /** @param {HTMLCanvasElement} canvas @param {{mesh:Object3D;material:Material;texture:import('../src/three-types').Texture}} item */
        function image(canvas,item){
            if(item.texture.image!==canvas){item.texture.dispose();item.texture=new T.Texture(canvas);item.texture.generateMipmaps=false;item.texture.minFilter=T.LinearFilter;item.texture.magFilter=T.LinearFilter;item.material.uniforms.image.value=item.texture;}
            item.texture.needsUpdate=true;
        }
        /** @param {number[]} local */
        function rotate(local){return local.map(function(_,k){return right[k]*local[0]+up[k]*local[1]+back[k]*local[2];});}
        var api={active:active,tracking:tracking,sources:function(){var session=renderer.xr.getSession();return tracking()&&session?Array.from(session.inputSources):[];},bind:bind,
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
                right=r;up=u;back=b;eyeCenter=b.map(function(x){return x*distance;});
                sky.mesh.visible=active();hud.mesh.visible=active();
                if(active()){
                    rig.add(camera);var s=1/units;
                    rig.matrix.fromArray([r[0]*s,r[1]*s,r[2]*s,0,u[0]*s,u[1]*s,u[2]*s,0,b[0]*s,b[1]*s,b[2]*s,0,b[0]*distance,b[1]*distance,b[2]*distance,1]);
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
            background:/** @param {HTMLCanvasElement} canvas @param {number} focal @param {number} aspect */function(canvas,focal,aspect){
                if(!active())return;image(canvas,sky);
                var m=head?head.matrix:new Float32Array(identity),u=sky.material.uniforms;
                u.right.value=rotate([m[0],m[1],m[2]]);u.up.value=rotate([m[4],m[5],m[6]]);u.back.value=rotate([m[8],m[9],m[10]]);u.extent.value=[aspect/focal,1/focal];
            },
            overlay:/** @param {HTMLCanvasElement} canvas */function(canvas){
                if(!active())return;
                var paused=actions&&actions.isPaused(),source=canvas;
                if(paused){
                    var ctx=help.getContext('2d');if(ctx){ctx.fillStyle='#07121f';ctx.fillRect(0,0,1024,768);ctx.fillStyle='#d2e8ee';ctx.font='32px monospace';ctx.textAlign='center';
                        ['DRIFTWORKS / VR PAUSED',actions&&actions.isDead()?'B: restart flight':'B: resume flight','Left stick: steer | Right stick: roll / throttle','Right trigger: fire | A: boost','Left grip + right stick: strafe','Left trigger: target lock | Right grip: next target','Y: next weapon | X: recenter','Use the headset menu to leave VR'].forEach(function(line,i){if(ctx)ctx.fillText(line,512,110+i*75,980);});}source=help;
                }
                image(source,hud);var u=hud.material.uniforms,d=2/units;
                // The forward HUD is a cockpit surface two metres away, never head-locked.
                u.right.value=right.map(function(x){return x*d;});u.up.value=up.map(function(x){return x*d;});u.back.value=back.map(function(x){return x*d;});
                u.center.value=eyeCenter;
                u.extent.value=[source.width/source.height*Math.tan(Math.PI/8),Math.tan(Math.PI/8)];
                renderer.render(hudScene,camera);
            },
            mount:/** @param {import('./types').ControlActions} value */function(value){
                actions=value;if(button)return;
                var xr=/** @type {{xr?:import('./flight-vr-types').XR}} */ (navigator).xr;
                if(!xr)return;
                button=document.createElement('button');button.type='button';button.textContent='Enter VR';button.disabled=true;
                status=document.createElement('span');status.setAttribute('role','status');
                var row=document.createElement('div');row.className='flight-vr-controls';row.append(button,status);
                var launch=document.getElementById('launch');(launch||host).appendChild(row);
                xr.isSessionSupported('immersive-vr').then(function(supported){if(button){button.disabled=!supported;button.hidden=!supported;}}).catch(function(){if(button)button.hidden=true;});
                button.onclick=async function(){
                    if(!xr||entering)return;if(active()){var existing=renderer.xr.getSession();if(existing)await existing.end();return;}
                    entering=true;if(button)button.disabled=true;
                    /** @type {import('./flight-vr-types').Session|null} */var session=null;
                    try{
                        if(actions&&actions.isDead())throw Error('Restart flight before entering VR.');
                        DW.audio.unlock();if(actions)actions.pause();
                        session=await xr.requestSession('immersive-vr',{optionalFeatures:[]});
                        renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');
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
