(function () {
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {{name:string,pilotSeat?:number[],colors:Record<string,[number,number,number]>,parts:{material:string,component?:string,stage:number,vertices:number[]}[]}} Concept */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @typedef {{viewer:HTMLElement,model:HTMLSelectElement,revision:HTMLSelectElement,stage:HTMLSelectElement,crew:HTMLInputElement,cutaway:HTMLInputElement,download:HTMLAnchorElement,metadata:HTMLElement,reset:HTMLButtonElement,spin:HTMLButtonElement,top:HTMLButtonElement,front:HTMLButtonElement,side:HTMLButtonElement}} Elements */
    /** @template {keyof Elements} K @param {K} id @returns {Elements[K]} */
    function get(id){var element=document.getElementById(id);if(!element)throw new Error('Missing '+id);return /** @type {Elements[K]} */(element);}
    var host = get('viewer');
    var world = DW.sim.createInitialWorld();
    world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
    var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true,viewer:true});
    var units=DW.sim.METERS_PER_UNIT, spinning=true, last=0, revision=0, lastModel='', crewReady=false;
    /** @type {Concept | null} */ var model=null;
    var image=new Image();image.src=assetUrl('../assets/ships/concept-trio/panels.png');
    image.onload=function(){draw();};
    function reset(){
        world.camera={x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*.055*units};
        scene.setOrbit({yaw:-.65,tilt:.95,height:0});
    }
    function draw(){
        if(!model)return;
        var stage=Number(get('stage').value), triangles=0;
        /** @type {import('./types').Batch[]} */ var batches=[];
        var colors=model.colors;
        Object.keys(colors).forEach(function(material){
            var parts=model ? model.parts.filter(function(p){return p.material===material && p.stage<=stage && !(get('cutaway').checked && p.component==='canopy-shell');}) : [];
            var values=parts.flatMap(function(p){return p.vertices;}), v=new Float32Array(values);
            for(var i=0;i<v.length;i+=8)for(var a=0;a<3;a++)v[i+a]/=units;
            if(!v.length)return;
            triangles+=v.length/24;
            batches.push({vertices:v,stride:8,color:stage===0?[.58,.62,.65]:colors[material],
                texture:stage===2 && image.complete && image.naturalWidth>0 && ['armor','paint','plate','edge'].includes(material)?image:undefined,
                finish:material==='glass'?1:0,opacity:material==='glass' && get('cutaway').checked?.16:undefined});
        });
        function astronauts(){
            var standing=DW.miningStudyCrew?.poses?.standing;
            /** @param {{vertices:number[];color:[number,number,number]}[]} source @param {number[]} offset @param {number} scale */
            function add(source,offset,scale){
                source.forEach(function(batch){var v=new Float32Array(batch.vertices);
                    for(var i=0;i<v.length;i+=6)for(var axis=0;axis<3;axis++)v[i+axis]=(v[i+axis]*scale+offset[axis])/units;
                    batches.push({vertices:v,color:batch.color});
                });
            }
            if(standing && get('crew').checked)add(standing,[-7.8,1.0,-.98],1.8);
            if(get('cutaway').checked && model?.pilotSeat && DW.fighterCockpit){
                add(DW.fighterCockpit.crew,model.pilotSeat,1);
                add(DW.fighterCockpit.chair,[0,model.pilotSeat[1],model.pilotSeat[2]-.36],1);
            }
        }
        astronauts();
        scene.setStudyActors(batches);
        get('metadata').textContent=model.name+'  /  '+triangles.toLocaleString()+' triangles\n'+['Primary volumes and silhouette','Layered armor, frames and mechanical assemblies','Panel texture and concept colors'][stage]+(get('revision').value==='initial'?'\nFirst pass (download is the refined mesh)':'\nRefined geometry')+(get('crew').checked?'\nAstronaut: 1.80 m standing height'+(DW.miningStudyCrew?.error?' (load failed)':!DW.miningStudyCrew?.poses?' (loading)':''):'');
        get('download').href='../assets/ships/concept-trio/'+get('model').value+'.gltf';
    }
    async function load(){
        var ticket=++revision;
        try{
            var suffix=get('revision').value==='initial'?'-initial':'';
            var response=await fetch(assetUrl('../assets/ships/concept-trio/'+get('model').value+suffix+'.json'));
            if(!response.ok)throw new Error('Mesh load failed: '+response.status);
            var data=/** @type {Concept} */(await response.json());
            if(ticket!==revision)return;
            model=data;draw();if(lastModel!==get('model').value)reset();lastModel=get('model').value;
        }catch(error){get('metadata').textContent=String(error);}
    }
    get('model').onchange=load;get('revision').onchange=load;get('stage').onchange=draw;get('reset').onclick=reset;
    get('crew').onchange=draw;get('cutaway').onchange=draw;
    get('spin').onclick=function(){spinning=!spinning;get('spin').textContent=spinning?'Pause rotation':'Resume rotation';};
    host.addEventListener('pointerdown',function(){spinning=false;get('spin').textContent='Resume rotation';});
    /** @param {number} yaw @param {number} tilt */
    function view(yaw,tilt){spinning=false;get('spin').textContent='Resume rotation';scene.setOrbit({yaw:yaw,tilt:tilt,height:0});}
    get('top').onclick=function(){view(0,0.001);};get('front').onclick=function(){view(0,Math.PI/2);};get('side').onclick=function(){view(Math.PI/2,Math.PI/2);};
    /** @param {number} now */
    function frame(now){requestAnimationFrame(frame);var dt=Math.min(.1,(now-last)/1000);last=now;if(document.hidden)return;
        if(!crewReady && (DW.miningStudyCrew?.poses || DW.miningStudyCrew?.error)){crewReady=true;draw();}
        if(spinning){var orbit=scene.getOrbit();scene.setOrbit({yaw:orbit.yaw+dt*.25,tilt:orbit.tilt});}
        scene.sync(world);scene.render(world,1,0,dt);
    }
    reset();load();requestAnimationFrame(frame);
}());
