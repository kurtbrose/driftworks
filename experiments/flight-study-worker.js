(function () {
    'use strict';
    var scope=/** @type {import('./types').StudyWorkerScope} */ (/** @type {unknown} */ (globalThis));
    scope.window=scope;
    scope.DRIFTWORKS_TEST_MODE=true;
    var files=['../src/propulsion.js','../src/combat.js','../src/logistics.js','../src/formations.js','../src/sim.js','retail-profiles.js','retail-weapons.js','guns.js','training.js','flight-model.js','flight-ai.js','flight-duel.js','flight-study.js'];
    scope.importScripts.apply(scope,files);
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    scope.onmessage=async function(event){
        try {
            var cases=DW.flightStudy.plan(event.data),hashes=/** @type {Record<string,string>} */ ({});
            if(globalThis.crypto && globalThis.crypto.subtle){
                await Promise.all(files.map(async function(file){var response=await fetch(file,{cache:'no-cache'});if(!response.ok)throw new Error('Cannot fingerprint '+file);var text=(await response.text()).replace(/\r\n/g,'\n'),digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));hashes[file]=Array.from(new Uint8Array(digest)).map(function(n){return n.toString(16).padStart(2,'0');}).join('');}));
            }
            scope.postMessage({kind:'ready',total:cases.length,manifest:{policy:DW.flightAI.version,cadence:DW.flightDuel.dt,replaySchema:2,hashes:hashes}});
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
