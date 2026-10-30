(function(){
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/types').Batch} Batch */
    /** @typedef {import('../experiments/types').FlightView} FlightView */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var U=DW.sim.METERS_PER_UNIT;
    /** @param {Vector} a @param {Vector} b */
    function dot(a,b){return a.reduce(function(n,v,i){return n+v*b[i];},0);}
    /** Immutable mesh buffers are shared across both capital ships and all mounts. */
    var smokeTexture=/** @type {HTMLImageElement|undefined} */(undefined);
    /** @type {{centers:number[][];extent:number[];charts:{n:number[];d:number;u:number[];v:number[];offset:number[]}[]}|null} */ var armorCharts=null;
    /** @type {HTMLImageElement|undefined} */ var armorNormal;
    /** @type {Promise<void>|null} */ var armorLoad=null;
    /** @type {WeakMap<Float32Array,Float32Array|null>} */ var armorUVs=new WeakMap();
    /** Preserve the paint UVs; project a second channel only onto standard armor.
     * @param {Float32Array} vertices */
    function armorUV(vertices){
        if(!armorCharts)return null;
        if(armorUVs.has(vertices))return armorUVs.get(vertices)||null;
        var data=armorCharts,uv=new Float32Array(vertices.length/3),found=false;
        for(var i=0;i<vertices.length;i+=18){
            var points=[0,6,12].map(function(j){return Array.from(vertices.subarray(i+j,i+j+3),function(v){return v*U;});});
            for(var center of data.centers){var local=points.map(function(p){return p.map(function(v,k){return v-center[k];});});
                if(!local.every(function(p){return p.every(function(v,k){return Math.abs(v)<=data.extent[k]+.002;});}))continue;
                var face=data.charts.find(function(f){return local.every(function(p){return Math.abs(dot(f.n,p)-f.d)<.002;});});
                if(!face)continue;
                for(var j=0;j<3;j++){uv[i/3+j*2]=dot(face.u,local[j])+face.offset[0];uv[i/3+j*2+1]=dot(face.v,local[j])+face.offset[1];}found=true;break;
            }
        }
        armorUVs.set(vertices,found?uv:null);return found?uv:null;
    }
    var surfaceTexture=/** @type {HTMLImageElement|undefined} */(undefined);
    /** @type {Map<string,HTMLImageElement>} */var interiorTextures=new Map();
    /** @type {Promise<void>|null} */var surfaceLoad=null;
    /** @type {WeakMap<Float32Array,Float32Array>} */var surfaceBuffers=new WeakMap();
    var cachedAsset=/** @type {import('../experiments/types').AegisFlightAsset|null} */(null);
    /** @type {Map<string,Float32Array>} */var vertexCache=new Map();
    /** Shared prepared resource, invalidated with its authored asset revision. */
    var idleAsset=/** @type {import('../experiments/types').AegisFlightAsset|null} */(null);
    /** Fixed turrets can join the hull; armed mounts retain independent pivots.
     * @param {import('../experiments/types').AegisFlightAsset} source */
    function prepareIdleAsset(source){
        if(idleAsset)return idleAsset;
        /** @type {Map<string,{color:[number,number,number];vertices:number[]}>} */var groups=new Map();
        /** @type {Map<string,number[]>} */var idleUV=new Map();
        /** @param {{color:[number,number,number];vertices:number[]}} batch @param {Vector} pivot @param {number[]=} uv */
        function add(batch,pivot,uv){
            var key=batch.color.join(','),group=groups.get(key);
            if(!group){group={color:batch.color,vertices:[]};groups.set(key,group);}
            var index=source.batches.findIndex(function(b){return b.color.join(',')===key;}),finish=source.surface&&source.surface.batches[index];
            var mapped=idleUV.get(key);if(finish&&!mapped){mapped=[];idleUV.set(key,mapped);}
            for(var k=0;k<batch.vertices.length;k+=6){
                for(var axis=0;axis<3;axis++)group.vertices.push(batch.vertices[k+axis]+pivot[axis]);
                group.vertices.push(batch.vertices[k+3],batch.vertices[k+4],batch.vertices[k+5]);
                if(finish&&mapped)mapped.push(uv?uv[k/3]:finish.plainUV[0],uv?uv[k/3+1]:finish.plainUV[1]);
            }
        }
        source.batches.forEach(function(b,i){add(b,[0,0,0],source.surface&&source.surface.batches[i]?.uv);});
        /** @type {NonNullable<import('../experiments/types').AegisFlightAsset['interiors']>} */var interiors=(source.interiors||[]).slice();
        /** @type {NonNullable<import('../experiments/types').AegisFlightAsset['interiors']>[number]|null} */var idleEngines=null;
        (source.engines||[]).forEach(function(e){e.batches.forEach(function(b){
            if(!b.finish){add(b,e.position);return;}
            if(!idleEngines)idleEngines={kind:'engines',color:[1,1,1],vertices:[],finish:{atlas:b.finish.atlas,shader:b.finish.shader,color:[1,1,1],uv:[],plainUV:[0,0]}};
            for(var k=0;k<b.vertices.length;k+=6){for(var axis=0;axis<3;axis++)idleEngines.vertices.push(b.vertices[k+axis]+e.position[axis]);idleEngines.vertices.push(b.vertices[k+3],b.vertices[k+4],b.vertices[k+5]);}
            if(idleEngines.finish)idleEngines.finish.uv.push(...b.finish.uv);
        });});
        if(idleEngines)interiors.push(idleEngines);
        source.turrets.forEach(function(t,i){t.batches.forEach(function(b,j){add(b,t.position,source.surface&&source.surface.turrets?.[i]?.[j]?.uv);});});
        idleAsset=Object.assign({},source,{batches:Array.from(groups.values()),interiors:interiors,turrets:[],engines:[]});
        if(source.surface)idleAsset.surface={atlas:source.surface.atlas,batches:idleAsset.batches.map(function(b){var index=source.batches.findIndex(function(s){return s.color.join(',')===b.color.join(',');}),finish=source.surface&&source.surface.batches[index];return finish?Object.assign({},finish,{uv:idleUV.get(b.color.join(','))||[]}):null;})};
        return idleAsset;
    }
    /** @param {import('../experiments/types').AegisSimulation} simulation @param {import('../experiments/types').AegisRigOptions} [options] */
    function create(simulation,options){
        var state=simulation.visualState();
        var sourceAsset=state.asset,unarmed=state.unarmed,origin=state.origin,team=state.team;
        if(cachedAsset!==sourceAsset){cachedAsset=sourceAsset;vertexCache.clear();surfaceBuffers=new WeakMap();idleAsset=null;}
        var asset=unarmed?prepareIdleAsset(sourceAsset):sourceAsset;
        /** @param {number[]} values */function vertices(values){var key=values.join(','),buffer=vertexCache.get(key);if(!buffer){buffer=new Float32Array(values.map(function(v,i){return i%6<3?v/U:v;}));vertexCache.set(key,buffer);}return buffer;}
        /** @param {[number,number,number]} color @returns {[number,number,number]} */function livery(color){if(team!=='enemy'||Math.max(...color)<=.28)return color;if(color[0]>color[2]*1.12&&color[1]>color[2]*1.08)return [color[0]*.9,color[1]*.34,color[2]*.32];return color[2]>color[0]*1.25?[color[2]*.38,color[1]*.12,color[0]*.22]:color;}
        /** @param {Vector} p @param {boolean} [inverse] */function rotate(p,inverse){var a=(options?options.state.heading:0)*(inverse?-1:1),c=Math.cos(a),s=Math.sin(a);return [c*p[0]-s*p[1],s*p[0]+c*p[1],p[2]];}
        var mounts=asset.turrets.map(function(t,index){
            var basis=new Float32Array([1,0,0,0,1,0,0,0,1]),pivot=/** @type {[number,number,number]} */(t.position.map(function(v,i){return v/U+origin[i];}));
            var batches=t.batches.map(function(b){
                return {vertices:vertices(b.vertices),color:livery(b.color),origin:pivot,basis:basis,staticGeometry:true};
            });
            return {source:t,state:state.mounts[index],basis:basis,batches:batches};
        });
        var engines=(asset.engines||[]).map(function(e){return {source:e,batches:e.batches.map(function(b){return {vertices:vertices(b.vertices),color:livery(b.color),origin:/** @type {[number,number,number]} */(worldEngine(e.position)),basis:new Float32Array([1,0,0,0,1,0,0,0,1]),staticGeometry:true};})};});
        /** @param {Vector} p */function worldEngine(p){return rotate(p).map(function(v,i){return v/U+origin[i];});}
        var world=worldEngine;
        var parts=state.parts;
        /** @type {{state:import('../experiments/types').AegisVisualPart;batches:Batch[];original:{vertices:Float32Array;color:[number,number,number]}[];dead:boolean}[]} */
        var visualParts=mounts.map(function(m,i){return {state:parts[i],batches:m.batches,original:m.batches.map(function(b){return {vertices:b.vertices,color:b.color};}),dead:false};}).concat(engines.map(function(e,i){return {state:parts[mounts.length+i],batches:e.batches,original:e.batches.map(function(b){return {vertices:b.vertices,color:b.color};}),dead:false};}));
        var hullBasis=new Float32Array([1,0,0,0,1,0,0,0,1]);
        /** @type {Batch[]} */var staticBatches=asset.batches.concat(asset.interiors||[]).map(function(b){return {vertices:vertices(b.vertices),color:livery(b.color),origin:/** @type {[number,number,number]} */(origin),basis:hullBasis,staticGeometry:true};});
        /** @param {Batch} b @param {import('../experiments/types').AegisSurfaceFinish|undefined} finish @param {import('../experiments/types').AegisVisualPart|null} part */
        function prepareSurface(b,finish,part){if(!finish)return null;var texture=finish.atlas?interiorTextures.get(finish.atlas):surfaceTexture;if(!texture)return null;
            var prepared=surfaceBuffers.get(b.vertices);
            if(!prepared){prepared=new Float32Array(b.vertices.length/6*8);for(var k=0,j=0;k<b.vertices.length;k+=6,j+=8){prepared.set(b.vertices.subarray(k,k+6),j);prepared[j+6]=finish.uv[k/3];prepared[j+7]=finish.uv[k/3+1];}surfaceBuffers.set(b.vertices,prepared);}
            var normalUV=part?null:armorUV(b.vertices);
            return {normalUV:normalUV,batch:b,original:b.vertices,color:b.color,prepared:prepared,finish:livery(finish.color),shader:finish.shader,texture:texture,part:part,enabled:true};
        }
        var surfaceStates=staticBatches.map(function(b,i){return prepareSurface(b,i<asset.batches.length?asset.surface&&asset.surface.batches[i]:asset.interiors?.[i-asset.batches.length]?.finish,null);});
        mounts.forEach(function(m,i){m.batches.forEach(function(b,j){surfaceStates.push(prepareSurface(b,asset.surface&&asset.surface.turrets?.[i]?.[j],parts[i]));});});
        engines.forEach(function(e,i){e.batches.forEach(function(b,j){surfaceStates.push(prepareSurface(b,e.source.batches[j].finish,parts[mounts.length+i]));});});
        /** Review/benchmark switch; keeps actor arrays, poses and damage ownership stable.
         * @param {boolean} enabled @param {'turrets'=} scope */function setSurfaceDetail(enabled,scope){surfaceStates.forEach(function(s){if(!s||(scope==='turrets'&&(!s.part||s.part.kind==='engine')))return;s.enabled=enabled;applySurface(s);});}
        /** @param {NonNullable<typeof surfaceStates[number]>} s */function applySurface(s){if(s.part&&s.part.hp<=0)return;var b=s.batch;b.vertices=s.enabled?s.prepared:s.original;b.color=s.enabled?s.finish:s.color;if(s.enabled&&s.normalUV&&armorNormal){b.normalUV=s.normalUV;b.normalTexture=armorNormal;}else{delete b.normalUV;delete b.normalTexture;}if(s.enabled){b.stride=8;b.texture=s.texture;if(s.shader!==undefined)b.finish=s.shader;}else{delete b.stride;delete b.texture;delete b.finish;}}
        setSurfaceDetail(true);
        function sync(){visualParts.forEach(function(part){
            if(part.state.hp<=0&&!part.dead){
                var original=part.original;
                part.batches.forEach(function(b,i){
                    var v=original[i].vertices,out=/** @type {number[]} */([]);
                    // Planar UVs follow each face's dominant normal; buffers change once on destruction.
                    for(var j=0;j<v.length;j+=6){var axis=Math.abs(v[j+3])>Math.abs(v[j+4])?0:1;if(Math.abs(v[j+5])>Math.abs(v[j+3+axis]))axis=2;out.push(v[j],v[j+1],v[j+2],v[j+3],v[j+4],v[j+5],(v[j+(axis===0?1:0)]*U/28)%1+.5,(v[j+(axis===2?1:2)]*U/28)%1+.5);}
                    b.vertices=new Float32Array(out);b.stride=8;b.texture=smokeTexture;b.color=[.24,.22,.20];
                });
                part.dead=true;
            }else if(part.state.hp>0&&part.dead){
                part.batches.forEach(function(b,i){b.vertices=part.original[i].vertices;b.color=part.original[i].color;delete b.stride;delete b.texture;});part.dead=false;
                surfaceStates.forEach(function(s){if(s&&s.part===part.state)applySurface(s);});
            }
        });}
        var renderBatches=staticBatches.concat(mounts.flatMap(function(m){return m.batches;}),engines.flatMap(function(e){return e.batches;}));
        /** @returns {Batch[]} */function geometry(){
            sync();
            var heading=options?options.state.heading:0,ch=Math.cos(heading),sh=Math.sin(heading);
            hullBasis.set([ch,sh,0,-sh,ch,0,0,0,1]);
            engines.forEach(function(e){var p=world(e.source.position);e.batches.forEach(function(b){b.basis.set(hullBasis);b.origin.splice(0,3,...p);});});
            mounts.forEach(function(m){
                var cy=Math.cos(m.state.yaw+heading),sy=Math.sin(m.state.yaw+heading),ce=Math.cos(m.state.elevation),se=Math.sin(m.state.elevation),b=m.basis,pivot=world(m.source.position);
                m.batches.forEach(function(batch){if(batch.origin)for(var k=0;k<3;k++)batch.origin[k]=pivot[k];});
                // Column-major Rz(yaw) * Ry(elevation), shared by all material batches.
                b[0]=cy*ce;b[1]=sy*ce;b[2]=-se;b[3]=-sy;b[4]=cy;b[5]=0;b[6]=cy*se;b[7]=sy*se;b[8]=ce;
            });
            if(options&&options.bridge)renderBatches.forEach(function(b){b.region=options.state.region||0;b.lensCenter=options.state.position;b.lensRadius=750;});
            return renderBatches;
        }
        /** @param {import('../experiments/types').Pose} pose @param {boolean=} shields */function effects(pose,shields){var state=simulation.visualState(),mounts=state.mounts,bridgeMetric=state.bridgeMetric,seconds=state.seconds,shieldHits=state.shieldHits;var batches=DW.flightGuns.geometry({bolts:mounts.flatMap(function(m){return m.guns.bolts.map(function(b){return Object.assign({},b,{team:team});});}),impacts:mounts.flatMap(function(m){return m.guns.impacts;})},pose,bridgeMetric);shieldHits=shieldHits.filter(function(h){return seconds-h.time<(h.heavy?.65:.36);});if(shields!==false&&shieldHits.length&&DW.combatShields&&DW.aegisShieldEnvelope)batches=batches.concat(DW.combatShields.capital(DW.aegisShieldEnvelope,shieldHits.map(function(h){return {anchor:DW.combatShields.anchor(DW.aegisShieldEnvelope,h.point),time:h.time,heavy:h.heavy};}),seconds,origin,options?options.state.heading:0,options&&options.state.region||0));return batches;}
        return {geometry:geometry,effects:effects,setSurfaceDetail:setSurfaceDetail,sync:sync};
    }
    function load(){
        if(!smokeTexture&&typeof Image!=='undefined'){smokeTexture=new Image();smokeTexture.src=assetUrl('../assets/ships/aegis-kit/scorched.svg');}
        /** @param {string} file @param {()=>boolean} ready */function script(file,ready){return new Promise(function(resolve,reject){if(ready()){resolve(undefined);return;}var element=document.createElement('script');element.src=assetUrl('../assets/ships/aegis-kit/'+file);element.onload=function(){if(ready())resolve(undefined);else reject(new Error('Capital asset did not register: '+file));};element.onerror=function(){reject(new Error('Could not load local capital asset: '+file));};document.head.appendChild(element);});}
        return Promise.all([script('flight-rig.js',function(){return !!DW.aegisFlightAsset;}),script('shield-envelope.js',function(){return !!DW.aegisShieldEnvelope;})]).then(function(){
            if(!DW.aegisFlightAsset.surface||typeof Image==='undefined')return;
            var atlas=DW.aegisFlightAsset.surface.atlas;
            if(!surfaceLoad)surfaceLoad=new Promise(function(resolve,reject){var image=new Image();image.onload=function(){surfaceTexture=image;resolve();};image.onerror=function(){surfaceLoad=null;reject(new Error('Could not load capital surface atlas'));};image.src=assetUrl('../assets/ships/aegis-kit/'+atlas);});
            const finishes=[...(DW.aegisFlightAsset.interiors||[]),...(DW.aegisFlightAsset.engines||[]).flatMap(e=>e.batches)];
            const files=Array.from(new Set(finishes.map(b=>b.finish&&b.finish.atlas).filter(Boolean)));
            if(!armorLoad)armorLoad=Promise.all([fetch(assetUrl('../assets/ships/aegis-kit/armor-normal.json')).then(function(r){if(!r.ok)throw Error('Armor chart load failed');return r.json();}).then(/** @param {{centers:number[][];extent:number[];charts:{n:number[];d:number;u:number[];v:number[];offset:number[]}[]}} data */function(data){armorCharts=data;}),new Promise(function(resolve,reject){var image=new Image();image.onload=function(){armorNormal=image;resolve(undefined);};image.onerror=reject;image.src=assetUrl('../assets/ships/aegis-kit/armor-normal.png');})]).then(function(){}).catch(/** @param {unknown} error */function(error){armorLoad=null;throw error;});
            return Promise.all([surfaceLoad,armorLoad,...files.map(function(file){if(!file||interiorTextures.has(file))return Promise.resolve();return new Promise(function(resolve,reject){var image=new Image();image.onload=function(){interiorTextures.set(file,image);resolve(undefined);};image.onerror=function(){reject(new Error('Could not load capital texture: '+file));};image.src=assetUrl('../assets/ships/aegis-kit/'+file);});})]).then(function(){});
        });
    }
    DW.aegisVisual={create:create,load:load};
}());
