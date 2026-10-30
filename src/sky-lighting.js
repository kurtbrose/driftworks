(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    var assetUrl=/** @type {(value:string,base?:string)=>string} */(window.Driftworks.assetUrl);
    /** @type {Promise<Record<string,import('./types').SkyEnvironmentLighting>>|null} */
    var lightingCache=null;
    function loadSkyLighting(){
        if(!lightingCache){
            var url=new URL(assetUrl('../assets/backgrounds/sky-lighting-v1.json'),window.location.href);
            lightingCache=window.fetch(url).then(function(response){if(!response.ok)throw new Error('Sky lighting cache unavailable');return response.json();})
                .then(/** @param {{version:number,families:Record<string,{sh:number[][],map:string,radiance?:string}>}} data */ function(data){
                    if(data.version!==1 || !data.families)throw new Error('Invalid sky lighting cache');
                    return Promise.all(Object.keys(data.families).map(function(key){
                        return new Promise(/** @param {(entry:{key:string,value:import('./types').SkyEnvironmentLighting})=>void} resolve */ function(resolve,reject){
                            var image=new Image();image.onload=async function(){
                                try{
                                    var family=data.families[key];
                                    /** @type {Float32Array|undefined} */ var radiance;
                                    if(family.radiance){
                                        var response=await window.fetch(assetUrl(family.radiance,url.href));
                                        if(!response.ok)throw new Error('Sky radiance cache unavailable');
                                        var bytes=await response.arrayBuffer();
                                        if(bytes.byteLength!==512*256*4*4)throw new Error('Invalid sky radiance dimensions');
                                        radiance=new Float32Array(bytes);
                                    }
                                    resolve({key:key,value:{sh:family.sh,map:family.map,image:image,radiance:radiance}});
                                }catch(error){reject(error);}
                            };
                            image.onerror=function(){reject(new Error('Sky reflection cache unavailable'));};image.src=assetUrl(data.families[key].map,url.href);
                        });
                    })).then(function(entries){
                        /** @type {Record<string,import('./types').SkyEnvironmentLighting>} */ var result={};
                        entries.forEach(function(entry){result[entry.key]=entry.value;});return result;
                    });
                });
        }
        return lightingCache;
    }
    DW.skyLighting={load:loadSkyLighting};
}());
