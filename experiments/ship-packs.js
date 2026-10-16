(function(){
  'use strict';
  var DW=window.Driftworks;
  function find(id){var result=null;(DW.shipPacks||[]).forEach(function(pack){pack.models.forEach(function(model){if(model.id===id)result={pack:pack,model:model};});});return result;}
  function geometry(model,poses,units){
    var source=model.vertices,data=new Float32Array(source.length*poses.length),offset=0;
    poses.forEach(function(p){for(var i=0;i<source.length;i+=6){for(var a=0;a<3;a++)data[offset+a]=p.eye[a]+(p.right[a]*source[i]-p.back[a]*source[i+1]+p.up[a]*source[i+2])/units;for(var b=0;b<3;b++)data[offset+3+b]=p.right[b]*source[i+3]-p.back[b]*source[i+4]+p.up[b]*source[i+5];offset+=6;}});
    return [{vertices:data,color:[.62,.72,.78]}];
  }
  // Bake face finishes and flush markings once in model coordinates. No per-frame
  // surface generation, extra scene objects, texture fetches or external assets.
  var finishes=new WeakMap();
  function detailedGeometry(model,poses,units){
    var baked=finishes.get(model);
    if(!baked){
      baked=[[],[],[],[]];
      var v=model.vertices,minY=Infinity,maxY=-Infinity,maxX=0;
      for(var k=0;k<v.length;k+=6){minY=Math.min(minY,v[k+1]);maxY=Math.max(maxY,v[k+1]);maxX=Math.max(maxX,Math.abs(v[k]));}
      for(var i=0;i<v.length;i+=18){
        var x=(v[i]+v[i+6]+v[i+12])/3,y=(v[i+1]+v[i+7]+v[i+13])/3;
        var forward=(y-minY)/(maxY-minY||1),top=v[i+5]>.45;
        var glass=top&&Math.abs(x)<maxX*.23&&forward>.55&&forward<.82;
        var group=glass?2:(!top||forward<.17)?1:0;
        for(var j=0;j<18;j++)baked[group].push(v[i+j]);
        if(group!==0)continue;
        // Inset armor face leaves a narrow dark joint around the plate.
        // Only broad faces receive a service stripe, keeping small facets quiet.
        var area=Math.hypot((v[i+6]-v[i])*(v[i+13]-v[i+1])-(v[i+7]-v[i+1])*(v[i+12]-v[i]));
        if(area<=1.2)continue;
        var marking=Math.abs(x)>maxX*.35&&forward>.25&&forward<.65;
        function point(a,b,c){var out=[];for(var axis=0;axis<3;axis++)out.push(v[i+axis]*a+v[i+6+axis]*b+v[i+12+axis]*c+v[i+3+axis]*.008);return out.concat(v.slice(i+3,i+6));}
        var weights=marking?[[.62,.18,.2],[.52,.28,.2],[.12,.28,.6],[.22,.18,.6]]:[[.94,.03,.03],[.03,.94,.03],[.03,.03,.94]];
        var points=weights.map(function(w){return point(w[0],w[1],w[2]);});
        var dest=marking?baked[3]:baked[1];
        if(marking){[0,1,2,0,2,3].forEach(function(n){dest.push.apply(dest,points[n]);});}
        // Seams use three thin inset strips rather than adding raised parts.
        else {for(var edge=0;edge<3;edge++){var next=(edge+1)%3,outer=v.slice(i+edge*6,i+edge*6+6),outerNext=v.slice(i+next*6,i+next*6+6);for(var a=0;a<3;a++){outer[a]+=outer[a+3]*.008;outerNext[a]+=outerNext[a+3]*.008;}[outer,outerNext,points[next],outer,points[next],points[edge]].forEach(function(pt){dest.push.apply(dest,pt);});}}
      }
      finishes.set(model,baked);
    }
    var colors=[[.49,.52,.47],[.17,.20,.22],[.055,.13,.18],[.78,.65,.32]];
    return baked.map(function(source,index){var batch=geometry({vertices:source},poses,units)[0];batch.color=colors[index];batch.finish=index===1||index===2?1:0;return batch;});
  }
  function mixedModel(index,wave){
    var packs=DW.shipPacks||[],models=[],longest=Math.max.apply(null,packs.map(function(p){return p.models.length;}));
    // Interleave creators so even a small wave samples both libraries.
    for(var i=0;i<longest;i++)packs.forEach(function(pack){if(pack.models[i])models.push(pack.models[i]);});
    return models.length?models[(index+Math.max(0,wave-1)*16)%models.length]:null;
  }
  function fleetGeometry(craft,selection,wave,units){
    var groups=new Map();
    craft.forEach(function(e){var entry=selection==='mixed'?mixedModel(e.index,e.artWave||wave):(find(selection)||{}).model;if(!entry)return;if(!groups.has(entry))groups.set(entry,[]);groups.get(entry).push(e.pose);});
    var merged=[];
    groups.forEach(function(poses,model){detailedGeometry(model,poses,units).forEach(function(batch,index){if(!merged[index])merged[index]={parts:[],length:0,color:batch.color,finish:batch.finish};merged[index].parts.push(batch.vertices);merged[index].length+=batch.vertices.length;});});
    return merged.map(function(group){var vertices=new Float32Array(group.length),offset=0;group.parts.forEach(function(part){vertices.set(part,offset);offset+=part.length;});return {vertices:vertices,color:group.color,finish:group.finish};});
  }
  function populate(select,blockout){
    if(blockout){var option=document.createElement('option');option.value='';option.textContent='Driftworks · training blockout';select.appendChild(option);}
    (DW.shipPacks||[]).forEach(function(pack){var group=document.createElement('optgroup');group.label=pack.author+' / '+pack.id;pack.models.forEach(function(model){var option=document.createElement('option');option.value=model.id;option.textContent=model.name+' · '+model.triangles.toLocaleString()+' tris';group.appendChild(option);});select.appendChild(group);});
  }
  DW.shipPackModels={find:find,geometry:geometry,detailedGeometry:detailedGeometry,mixedModel:mixedModel,fleetGeometry:fleetGeometry,populate:populate};
}());
