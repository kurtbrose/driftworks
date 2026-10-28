(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('./types').FlightMission} Mission */
    /** @typedef {{[key:string]:unknown}} Data */
    /** @param {unknown} value @returns {value is unknown[]} */
    function isList(value){return Array.isArray(value);}
    /** Arrays replace; records inherit recursively. No functions or browser resources. @param {unknown} base @param {unknown} patch @returns {unknown} */
    function merge(base,patch){
        if(isList(patch))return patch.map(function(value){return merge(undefined,value);});
        if(patch&&typeof patch==='object'){
            var result=/** @type {Data} */({});
            var previous=/** @type {Data} */(base&&typeof base==='object'&&!Array.isArray(base)?base:{});
            Object.keys(previous).forEach(function(key){result[key]=merge(undefined,previous[key]);});
            Object.keys(patch).forEach(function(key){
                if(key==='__proto__'||key==='prototype'||key==='constructor')throw new Error('Invalid mission key');
                result[key]=merge(previous[key],/** @type {Data} */(patch)[key]);
            });
            return result;
        }
        if(patch===undefined)return base;
        if(typeof patch==='function'||(typeof patch==='number'&&!Number.isFinite(patch)))throw new Error('Mission definitions must be JSON-safe');
        return patch;
    }
    /** @param {unknown} value */
    function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}}
    /** @type {Record<string,Mission>} */var definitions=Object.create(null);
    /** @param {string} id @param {import('./types').MissionOverrides} overrides @param {string} [parent] */
    function define(id,overrides,parent){
        if(!/^[a-z][a-z0-9-]*$/.test(id)||definitions[id])throw new Error('Invalid or duplicate mission ID: '+id);
        if(parent&&!definitions[parent])throw new Error('Unknown parent mission: '+parent);
        var result=/** @type {Mission} */(merge(definitions[parent||'default']||{},overrides));
        result.id=id;
        if(result.version!==1||!(result.units.distanceScale>0)||!(result.units.speedScale>0))throw new Error('Invalid mission version or units');
        if(result.sky.kind==='landmarks'&&result.sky.features.length!==2)throw new Error('Landmark skies require a planet and a sun');
        if(['training','furball','patrol'].indexOf(result.encounter.kind)<0||!Number.isInteger(result.encounter.count)||result.encounter.count<0)throw new Error('Invalid encounter kind or count');
        var reserve=result.encounter.reinforcements;
        if(reserve&&(!Number.isInteger(reserve.rosterSplit)||reserve.rosterSplit<1||result.encounter.count<2||result.encounter.count%2||result.encounter.count>reserve.rosterSplit*2||result.encounter.callsigns.length<reserve.rosterSplit*2||!(reserve.launchSeconds>0)||!(reserve.launchSpeed>0)))throw new Error('Invalid reinforcement roster or launch');
        if(!(result.encounter.spawn.backRadii>0)||!Number.isFinite(result.encounter.spawn.altitudeMeters))throw new Error('Invalid spawn');
        if(result.opening.some(function(line){return !Number.isInteger(line.speakerIndex)||line.speakerIndex<0||(result.encounter.count>0&&line.speakerIndex>=result.encounter.count);}))throw new Error('Invalid opening speaker');
        freeze(result);definitions[id]=result;return result;
    }
    define('default',{
        version:1,title:'Flight lab · Driftworks',heading:'DRIFTWORKS / SORTIE 01',subtitle:'ASTEROID RANGE · CLEAR THE HOSTILES',hint:'Combat ahead / Engines at 100% on start. Mouse to steer / Click to fire / Esc to pause',
        units:{distanceScale:1,distanceLabel:'m',distanceWord:'meters',speedScale:1,speedLabel:'m/s',speedWord:'meters per second',radarKilometers:true},
        teams:{ally:{status:'WINGMEN',target:'WING',radio:'WING'},enemy:{status:'HOSTILES',target:'TARGET',radio:'BANDIT'}},
        comms:{calls:{},named:{},friendlyAddress:['pilot'],hostileAddress:['pilot'],ambientCast:false},
        portraits:{folder:'dogfight',cast:'standard'},sky:{kind:'selectable',features:[]},scenery:[],
        encounter:{kind:'training',count:0,immediate:false,callsigns:['Rook','Jinx','Flint','Echo','Mako','Sable','Patch','Nova','Viper','Wraith','Razor','Hex','Talon','Knell','Cinder','Shade'],spawn:{backRadii:2.6,altitudeMeters:300}},opening:[]
    });
    define('scramble',{title:'SCRAMBLE! / Driftworks',heading:'DRIFTWORKS / SCRAMBLE!',subtitle:'SCRIPTED EVENTS / COMBAT LAUNCH',hint:'Launch begins as soon as textures are ready. One wingman left, two right. Fly immediately: W/S throttle / Shift boost / Esc pause.',encounter:{kind:'furball',count:6,immediate:true,callsigns:['Lancer Two','Lancer Three','Lancer Four','Raider One','Raider Two','Raider Three']}});
    define('furball',{encounter:{kind:'furball',count:16}});
    define('hyperbolic',{emptySpace:true,title:'Hyperbolic flight / Driftworks',heading:'DRIFTWORKS / HYPERBOLIC FLIGHT',subtitle:'CONSTANT NEGATIVE CURVATURE / STANDARD FLIGHT COMBAT',sky:{hyperbolic:650},encounter:{immediate:true}},'furball');
    define('battle',{title:'Battle background / Driftworks',heading:'DRIFTWORKS / BATTLE PROTOTYPE',subtitle:'CAPITAL ENGAGEMENT / SQUADRON ZONE DEFENSE',encounter:{count:30,immediate:true}},'furball');
    /** Frozen fictional system in planet-centered km; all moon centers share one plane.
     * @param {boolean} nearMoon @returns {import('./types').JadeSystem} */
    function jadeSystem(nearMoon){
        var tilt=25*Math.PI/180,e1=[-Math.cos(tilt),0,Math.sin(tilt)],normal=[Math.sin(tilt),0,Math.cos(tilt)];
        var moons=[{name:'Cinder',diameterKm:3620,orbitKm:390000,phaseDeg:110},
            {name:'Rime',diameterKm:3100,orbitKm:620000,phaseDeg:0},
            {name:'Umber',diameterKm:5180,orbitKm:1030000,phaseDeg:80},
            {name:'Serein',diameterKm:4740,orbitKm:1770000,phaseDeg:250}].map(function(m){
                var phase=m.phaseDeg*Math.PI/180;
                return {...m,position:e1.map(function(v,i){return m.orbitKm*(v*Math.sin(phase)-(i===1?Math.cos(phase):0));})};
            });
        var observer=[0,-85000,0],frame=[[1,0,0],[0,1,0],[0,0,1]];
        if(nearMoon){
            // 900 km above Rime; planet and moon separated by about 55 degrees.
            observer=moons[1].position.map(function(v,i){return v+2450*(-e1[i]*Math.sin(55*Math.PI/180)-(i===1?Math.cos(55*Math.PI/180):0));});
            var yaw=120*Math.PI/180,pitch=48*Math.PI/180;
            var center=[Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)];
            var north=[-Math.cos(yaw)*Math.sin(pitch),-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch)];
            var east=[-Math.sin(yaw),Math.cos(yaw),0];
            // Proper rotation: e1 -> -north, +Y -> center, plane normal -> east.
            frame=[0,1,2].map(function(i){return north.map(function(v,j){return -e1[i]*v+(i===1?center[j]:0)+normal[i]*east[j];});});
        }
        return {planetRadiusKm:68000,planetMassKg:1.7e27,planeNormal:normal,observer,frame,moons};
    }
    define('gas-giant',{
        emptySpace:true,weaponsDisabled:true,
        title:'Jade weather / free flight · Driftworks',heading:'DRIFTWORKS / JADE WEATHER',
        subtitle:'GAS GIANT / QUIET FREE FLIGHT',
        hint:'No combat. W/S throttle · X stop · arrows steer · Q/E roll · Shift boost · Esc pause. Fly and watch the storms.',
        sky:{kind:'landmarks',gasGiant:true,jadeSystem:jadeSystem(false),cubeFaces:['px','nx','py','ny','pz','nz'].map(function(face){return 'gas-giant-lightning-v1/dark-cube/'+face+'.png';}),features:[
            {asset:'gas-giant-lightning-v1/dark.png',yaw:90,pitch:0,roll:0,widthDeg:110,gain:1},
            {asset:'features/warm-sun-v1.png',yaw:20,pitch:20,roll:0,widthDeg:7,gain:1}
        ]}
    });
    define('jade-rime',{
        title:'Rime / moon-side free flight / Driftworks',heading:'DRIFTWORKS / RIME APPROACH',
        subtitle:'900 KM ABOVE RIME / JADE GIANT OVERHEAD',
        hint:'Look up for the jade giant. Rime fills the sky below. Fixed observation point; flight controls move the ship, not the orbital tableau.',
        sky:{jadeSystem:jadeSystem(true),rimeSurface:'jade-moons-v1/rime-disk-v2.png'}
    },'gas-giant');
    define('ellis',{
        title:'Ellis bridge / Driftworks',heading:'DRIFTWORKS / ELLIS BRIDGE',
        subtitle:'ASTEROID RANGE / RIME WORMHOLE DOGFIGHT',
        hint:'Fly through the spherical mouth ahead, above the asteroid. Turn around to return. W/S throttle / Shift boost / X stop / Esc pause.',
        emptySpace:false,weaponsDisabled:false,sky:{wormhole:true},
        encounter:{kind:'furball',count:8,immediate:true}
    },'jade-rime');
    define('cinematic',{emptySpace:true,sky:{jadeSystem:jadeSystem(false),rimeSurface:''},title:'Bridge battle / cinematic demo / Driftworks',heading:'DRIFTWORKS / CINEMATIC DEMO',subtitle:'TWO WORLDS / ENDLESS CAPITAL ENGAGEMENT',hint:'Start demo to watch. Esc pauses; C cuts to the next camera. Fighters launch from both carriers as losses occur.',encounter:{count:0,immediate:false}},'ellis');
    define('planet-hero',{
        title:'Planet hero flight · Driftworks',heading:'DRIFTWORKS / PLANET HERO TEST',subtitle:'STATIC PLANET BACKDROP · LOCAL DOGFIGHT',
        sky:{kind:'landmarks',features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:110,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}
    },'furball');
    define('planet-hero-80',{sky:{features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:80,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}},'planet-hero');
    define('planet-hero-140',{sky:{features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:140,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}},'planet-hero');
    define('planet-orbital-watch',{
        emptySpace:true,
        title:'Orbital planet study · Driftworks',heading:'DRIFTWORKS / ORBITAL PLANET STUDY',
        subtitle:'STATIC GEOMETRY STUDY · EMPTY SPACE',
        hint:'W/S throttle · X stop · arrows steer · Esc pause. Static orbital-reference planet; impact animation remains in Impact Watch.',
        sky:{features:[{asset:'planet-hero-orbital-v2/master.png',yaw:90,pitch:-30,roll:0,widthDeg:110,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}
    },'planet-hero');
    define('planet-orbital-static',{
        title:'Six-camera planet skybox · Driftworks',
        subtitle:'SIX-CAMERA BAKED SKYBOX · EMPTY SPACE',
        sky:{cubeFaces:['px','nx','py','ny','pz','nz'].map(function(face){return 'planet-hero-orbital-v2/cube-v1/'+face+'.png';})}
    },'planet-orbital-watch');
    define('planet-orbital-cube',{
        title:'Orbital impact · Driftworks',heading:'DRIFTWORKS / ORBITAL IMPACT',
        subtitle:'ANIMATED SIX-FACE SKYBOX · MISSION-CUED IMPACT',
        hint:'Next cue advances the cinematic sky; each stage holds. W/S throttle · X stop · arrows steer · Esc pause.',
        sky:{bakedImpact:true,cubeStages:'planet-hero-orbital-v2/animation-cube-v1/'}
    },'planet-orbital-static');
    // Existing bookmarks now use the approved planet and six-camera sequence.
    define('planet-impact-baked',{emptySpace:false,title:'Orbital impact dogfight · Driftworks'},'planet-orbital-cube');
    define('planet-impact-watch',{emptySpace:true,title:'Orbital impact watch · Driftworks'},'planet-orbital-cube');
    define('evacuation',{emptySpace:false,title:'Evacuation / cockpit dry run',heading:'DRIFTWORKS / EVACUATION',subtitle:'CYCLE A / HOLD THE REFUELING CORRIDOR',hint:'Protect fuel operations. Three fighters, one occupied bay. First-cycle radio playtest; Esc pauses.',encounter:{kind:'furball',count:6,immediate:true,callsigns:['Actual','Finch','Raider One','Raider Two','Raider Three','Raider Four']}},'planet-orbital-cube');
    define('asteroid-patrol',{encounter:{kind:'patrol',count:2,immediate:true}});
    /** Boolean support retains the old compose(kind,data,true) API during migration. @param {string|boolean} [id] */
    function resolve(id){return definitions[id===true?'ohio':typeof id==='string'?id:'default']||definitions.default;}
    function current(){var search=typeof window.location==='undefined'?'':window.location.search||'',match=/(?:^|[?&])mission=([^&]*)/.exec(search);try{return resolve(match?decodeURIComponent(match[1]):undefined);}catch(_){return resolve();}}
    /** @param {string} text @param {number} index @param {boolean} hostile @param {Mission} mission */
    function address(text,index,hostile,mission){
        var names=hostile?mission.comms.hostileAddress:mission.comms.friendlyAddress;
        return text.replace(/\{pilot\}|\b[Pp]ilot\b/g,function(word){if(word==='{pilot}')return word;var name=names[index%names.length]||'pilot';return word==='Pilot'?name[0].toUpperCase()+name.slice(1):name;});
    }
    DW.flightMissions={define:define,resolve:resolve,current:current,address:address};
}());
