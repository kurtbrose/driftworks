(function(){'use strict';
 const texture=new Image();texture.src='aegis-armor-atlas-v1.png';const ready=texture.decode();
 window.AegisArmorStudy={ready,apply:function(batches){return batches.map(function(b){return b.texture&&/\/surface-atlas\.png(?:\?|$)/.test(b.texture.src)?Object.assign({},b,{texture}):b;});}};
})();
