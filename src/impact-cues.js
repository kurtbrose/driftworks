(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    var impactStages=[{id:'before',label:'Before impact'},{id:'contact',label:'Contact / flash'},{id:'ejecta',label:'Young ejecta'},{id:'plume',label:'Growing plume'},{id:'cooling',label:'Cooling cap'},{id:'fallout',label:'Returning debris'},{id:'aftermath',label:'Regional aftermath'},{id:'fires',label:'Land fires'},{id:'smoke',label:'Smoke veil'}];
    function createImpactCues(){
        var held=0,from=0,to=0,age=0,duration=0,active=false,started=false,flashAge=Infinity;
        /** @type {{stage:number,duration:number}[]} */var queue=[];
        function snapshot(){var a=active?(duration?Math.min(1,age/duration):1):0;return {from:active?from:held,to:active?to:held,blend:a*a*(3-2*a),stage:impactStages[held].id,transitioning:active,queued:queue.length,flashAge:flashAge};}
        return {snapshot:snapshot,
            /** @param {string|number} stage @param {number} [seconds] */
            trigger:function(stage,seconds){var index=typeof stage==='number'?stage:impactStages.findIndex(function(s){return s.id===stage;}),d=seconds===undefined?8:seconds;
                if(!Number.isInteger(index)||index<0||index>=impactStages.length)throw new RangeError('Unknown impact cue');
                if(!Number.isFinite(d)||d<0||d>120)throw new RangeError('Impact transition must be 0–120 seconds');
                if((active&&index===to)||(queue.length&&queue[queue.length-1].stage===index))return true;
                if(queue.length>=16)return false;
                if(!active&&index===held&&!queue.length)return true;
                queue.push({stage:index,duration:d});return true;},
            reset:function(){held=from=to=0;age=duration=0;active=started=false;flashAge=Infinity;queue=[];},
            /** @param {number} elapsed @param {boolean} ready */
            update:function(elapsed,ready){
                if(!Number.isFinite(elapsed)||elapsed<0)throw new RangeError('Invalid cue elapsed time');
                if(!active&&queue.length){var command=queue.shift();if(command){from=held;to=command.stage;duration=command.duration;age=0;active=true;started=false;}}
                if(ready){
                    if(active&&!started){started=true;if(to===1)flashAge=0;}
                    if(Number.isFinite(flashAge))flashAge+=elapsed;
                    if(active){age=Math.min(duration,age+elapsed);if(age>=duration){held=to;active=false;}}
                }
                return snapshot();
            }
        };
    }
    DW.impactCues={stages:impactStages,create:createImpactCues};
}());
