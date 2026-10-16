(function(){
  'use strict';
  var DW=window.Driftworks;
  function find(id){var result=null;(DW.shipPacks||[]).forEach(function(pack){pack.models.forEach(function(model){if(model.id===id)result={pack:pack,model:model};});});return result;}
  function geometry(model,poses,units){
    var source=model.vertices,data=new Float32Array(source.length*poses.length),offset=0;
    poses.forEach(function(p){for(var i=0;i<source.length;i+=6){for(var a=0;a<3;a++)data[offset+a]=p.eye[a]+(p.right[a]*source[i]-p.back[a]*source[i+1]+p.up[a]*source[i+2])/units;for(var b=0;b<3;b++)data[offset+3+b]=p.right[b]*source[i+3]-p.back[b]*source[i+4]+p.up[b]*source[i+5];offset+=6;}});
    return [{vertices:data,color:[.62,.72,.78]}];
  }
  function populate(select,blockout){
    if(blockout){var option=document.createElement('option');option.value='';option.textContent='Driftworks · training blockout';select.appendChild(option);}
    (DW.shipPacks||[]).forEach(function(pack){var group=document.createElement('optgroup');group.label=pack.author+' / '+pack.id;pack.models.forEach(function(model){var option=document.createElement('option');option.value=model.id;option.textContent=model.name+' · '+model.triangles.toLocaleString()+' tris';group.appendChild(option);});select.appendChild(group);});
  }
  DW.shipPackModels={find:find,geometry:geometry,populate:populate};
}());
