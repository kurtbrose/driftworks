(function () {
    'use strict';
    var scope=/** @type {import('./types').StudyWorkerScope} */ (/** @type {unknown} */ (globalThis));
    scope.window=scope;
    scope.DRIFTWORKS_TEST_MODE=true;
    /* script-manifest:studyWorker */
    var files=["../src/propulsion.js","../src/combat.js","../src/logistics.js","../src/formations.js","../src/sim.js","retail-profiles.js","retail-weapons.js","guns.js","flight-missions.js","mission-ohio.js","flight-collision.js","training.js","flight-model.js","../assets/ships/quaternius-ultimate-spaceships/meshes.js","../assets/ships/concept-trio/meshes.js","ship-packs.js","flight-ai.js","flight-duel.js","flight-study.js"];
    /* /script-manifest */
    scope.onmessage=async function(event){
        try {
            var hashes=/** @type {Record<string,string>} */ ({});
            // Classic-worker importScripts can reuse stale cached dependencies.
            // Fetch once, hash and execute the very same text in dependency order.
            var sources=await Promise.all(files.map(async function(file){
                var response=await fetch(file,{cache:'no-cache'});
                if(!response.ok)throw new Error('Cannot load '+file);
                var source=(await response.text()).replace(/\r\n/g,'\n');
                if(globalThis.crypto&&globalThis.crypto.subtle){
                    var digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
                    hashes[file]=Array.from(new Uint8Array(digest)).map(function(n){return n.toString(16).padStart(2,'0');}).join('');
                }
                return source;
            }));
            sources.forEach(function(source){
                var url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
                try{scope.importScripts(url);}finally{URL.revokeObjectURL(url);}
            });
            var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
            var cases=DW.flightStudy.plan(event.data);
            scope.postMessage({kind:'ready',total:cases.length,manifest:{policy:DW.flightAI.version,cadence:DW.flightDuel.dt,replaySchema:5,hashes:hashes}});
            var batch=/** @type {import('./types').StudyRow[]} */ ([]);
            for(var i=0;i<cases.length;i++){
                var duel=DW.flightDuel.run(cases[i].options);
                batch.push({id:cases[i].id,options:duel.replay.options,summary:duel.summary()});
                if(batch.length===5||i===cases.length-1){scope.postMessage({kind:'rows',rows:batch});batch=[];}
            }
            scope.postMessage({kind:'done'});
        } catch(error) {scope.postMessage({kind:'error',message:error instanceof Error?error.message:String(error)});}
    };
}());
