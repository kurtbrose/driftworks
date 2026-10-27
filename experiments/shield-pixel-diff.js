(function(){
    'use strict';
    /** @param {Uint8ClampedArray} a @param {Uint8ClampedArray} b @param {Uint8ClampedArray[]} repeatsA @param {Uint8ClampedArray[]} repeatsB */
    function compare(a,b,repeatsA,repeatsB){
        if(a.length%4||[b].concat(repeatsA,repeatsB).some(function(v){return v.length!==a.length;}))throw new Error('RGBA capture dimensions differ');
        var noise=0,changed=0,visibleChanges=0,strong=0,max=0,sum=0,heat=new Uint8ClampedArray(a.length);
        for(var i=0;i<a.length;i+=4){var d=0,unstable=false;for(var k=0;k<3;k++){var value=Math.abs(a[i+k]-b[i+k]);d=Math.max(d,value);sum+=value;unstable=unstable||repeatsA.some(function(r){return r[i+k]!==a[i+k];})||repeatsB.some(function(r){return r[i+k]!==b[i+k];});}if(unstable)noise++;if(d>0)changed++;if(d>=3)visibleChanges++;if(d>=10)strong++;max=Math.max(max,d);heat[i]=Math.min(255,d*16);heat[i+1]=Math.min(255,d*4);heat[i+3]=255;}
        return {noise:noise,changed:changed,visibleChanges:visibleChanges,strong:strong,max:max,mean:a.length?sum/(a.length/4*3):0,heat:heat};
    }
    window.Driftworks.shieldPixelDiff={compare:compare};
}());
