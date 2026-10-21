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
    define('furball',{encounter:{kind:'furball',count:16}});
    define('planet-hero',{
        title:'Planet hero flight · Driftworks',heading:'DRIFTWORKS / PLANET HERO TEST',subtitle:'STATIC PLANET BACKDROP · LOCAL DOGFIGHT',
        sky:{kind:'landmarks',features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:110,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}
    },'furball');
    define('planet-hero-80',{sky:{features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:80,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}},'planet-hero');
    define('planet-hero-140',{sky:{features:[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:140,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:35,roll:0,widthDeg:7,gain:1}]}},'planet-hero');
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
