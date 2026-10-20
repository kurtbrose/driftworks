(function () {
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id */
    function control(id){var element=document.getElementById(id);if(!element)throw new Error('Missing review control '+id);return /** @type {HTMLInputElement} */ (element);}
    var host=control('viewer'), world=DW.sim.createInitialWorld(), units=DW.sim.METERS_PER_UNIT;
    world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
    var scene=DW.scene3d.create(host,function(){return world;},function(value){world=value;},{study:true,viewer:true});
    var sky=DW.flightSkybox.create(host,{style:8});
    var model=/** @type {HTMLSelectElement} */ (document.getElementById('review-model')), skyChoice=control('review-sky'), status=control('review-status');
    DW.shipPackModels.populate(model,false);
    model.value='quaternius-ultimate-spaceships:Striker';
    /** @type {import('./types').Pose} */
    var actor={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
    var textures=DW.shipPackModels.loadTextures(), ticket=0;
    function reset(){world.camera={x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*.27/(8.5/units)};scene.setOrbit({yaw:.4,tilt:.9,height:0});}
    async function update(){
        var current=++ticket, entry=DW.shipPackModels.find(model.value);
        if(!entry)return;
        status.textContent='Loading '+entry.model.name+'...';
        try{
            var images=await textures;if(current!==ticket)return;
            scene.setStudyActors([DW.shipPackModels.sourceGeometry(entry.model,[actor],units,images.get(entry.model.id),DW.shipPackModels.paintColor('#607451'))]);
            status.textContent=entry.model.name+' / original textured 3D model';
        }catch(error){status.textContent=String(error);}
    }
    var skyYaw=102, skyPitch=0;
    /** @param {number} yaw @param {number} pitch @param {string} caption */
    function framing(yaw,pitch,caption){skyYaw=yaw;skyPitch=pitch;control('caption').textContent=caption;}
    control('opening').onclick=function(){framing(102,0,'Dark opening / calm silhouette with detail around the edges');};
    control('rim').onclick=function(){framing(102,-14,'Bright rim / deliberate stress test for hull contrast');};
    control('empty').onclick=function(){framing(50,0,'Open field / black space as a visual rest');};
    control('landmark').onclick=function(){framing(-65,15,'Secondary landmark / unique filament on the far side of the sky');};
    skyChoice.onchange=function(){sky.setStyle(Number(skyChoice.value));};
    control('review-exposure').oninput=function(){sky.setExposure(Number(control('review-exposure').value));};
    model.onchange=update;control('review-reset').onclick=reset;
    window.addEventListener('resize',reset);reset();update();
    var last=0;
    /** @param {number} now */
    function render(now){
        requestAnimationFrame(render);if(document.hidden || now-last<1000/30)return;last=now;
        var yaw=skyYaw*Math.PI/180,pitch=skyPitch*Math.PI/180,c=Math.cos(pitch),s=Math.sin(pitch);
        sky.render({eye:[0,0,0],right:[Math.sin(yaw),-Math.cos(yaw),0],up:[-Math.cos(yaw)*s,-Math.sin(yaw)*s,c],back:[-Math.cos(yaw)*c,-Math.sin(yaw)*c,-s]},1,false);
        scene.sync(world);scene.render(world,1,0,0);
    }
    requestAnimationFrame(render);
}());
