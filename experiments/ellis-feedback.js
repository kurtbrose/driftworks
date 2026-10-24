(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {import('./types').Pose} pose */
    function describe(pose){
        var units=DW.sim.METERS_PER_UNIT,region=pose.region||0;
        var distance=Math.hypot(pose.eye[0]*units-region*12000,pose.eye[1]*units+2000,pose.eye[2]*units-1550);
        return {region:region,distance:distance,gap:Math.max(0,distance-300),proximity:Math.max(0,Math.min(1,(600-distance)/300))};
    }
    function create(){
        /** @type {number|null} */var previous=null;
        var near=false,flash=0;
        return {
            reset:function(){previous=null;near=false;flash=0;},
            /** @param {import('./types').Pose} pose @param {number} dt @param {boolean} active @param {boolean} enabled @returns {import('./types').EllisCue} */
            update:function(pose,dt,active,enabled){
                var info=describe(pose),entered=false,exited=false,crossed=false;
                if(!enabled){previous=null;near=false;flash=0;return Object.assign(info,{proximity:0,near:false,entered:false,exited:false,crossed:false,flash:0});}
                if(active&&previous!==null){
                    crossed=previous!==info.region;
                    entered=!near&&info.distance<=550;
                    exited=near&&info.distance>=620;
                    if(entered)near=true;if(exited)near=false;
                    flash=Math.max(0,flash-Math.max(0,dt));
                    if(crossed)flash=1.8;
                }else near=near?info.distance<620:info.distance<=550;
                previous=info.region;
                return Object.assign(info,{near:near,entered:entered,exited:exited,crossed:crossed,flash:flash});
            }
        };
    }
    DW.ellisFeedback={describe:describe,create:create};
}());
