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
    var colors=[[.68,.71,.65],[.28,.33,.36],[.075,.18,.24],[.88,.74,.39]];
    return baked.map(function(source,index){var batch=geometry({vertices:source},poses,units)[0];batch.color=colors[index];batch.finish=index===1||index===2?1:0;return batch;});
  }
  function mixedModel(index,wave){
    var packs=DW.shipPacks||[],models=[],longest=Math.max.apply(null,packs.map(function(p){return p.models.length;}));
    // Cycle through the available Quaternius models across waves.
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
  // Preserve the artist's UVs and smooth normals while baking flight poses.
  function sourceGeometry(model,poses,units,texture,paint){
    var source=model.texturedVertices,data=new Float32Array(source.length*poses.length),offset=0;
    poses.forEach(function(p){for(var i=0;i<source.length;i+=8){
      for(var a=0;a<3;a++)data[offset+a]=p.eye[a]+(p.right[a]*source[i]-p.back[a]*source[i+1]+p.up[a]*source[i+2])/units;
      for(var b=0;b<3;b++)data[offset+3+b]=p.right[b]*source[i+3]-p.back[b]*source[i+4]+p.up[b]*source[i+5];
      data[offset+6]=source[i+6];data[offset+7]=source[i+7];offset+=8;
    }});
    return {vertices:data,color:[1,1,1],texture:texture,stride:8,paint:paint};
  }
  var textureImages=new Map();
  function loadTextures(){
    return Promise.all((DW.shipPacks||[]).map(function(pack){return Promise.all(pack.models.map(function(model){
      if(textureImages.has(model.id))return textureImages.get(model.id);
      var pending=new Promise(function(resolve,reject){var image=new Image();image.onload=function(){resolve(image);};image.onerror=function(){reject(new Error('Could not load '+model.texture));};image.src='../assets/ships/'+pack.id+'/'+model.texture;});
      textureImages.set(model.id,pending);return pending;
    }));})).then(function(images){var result=new Map();(DW.shipPacks||[]).forEach(function(pack,p){pack.models.forEach(function(model,m){result.set(model.id,images[p][m]);});});return result;});
  }
  function sourceFleetGeometry(craft,selection,wave,units,images,paint){
    var groups=new Map();
    craft.forEach(function(e){var model=selection==='mixed'?mixedModel(e.index,e.artWave||wave):(find(selection)||{}).model;if(!model)return;if(!groups.has(model))groups.set(model,[]);groups.get(model).push(e.pose);});
    var batches=[];groups.forEach(function(poses,model){batches.push(sourceGeometry(model,poses,units,images.get(model.id),paint));});return batches;
  }
  // Reviewed nozzle centers in normalized ship metres: right X, forward Y, up Z.
  // Fourth value is nozzle radius. These are art attachments, not physics data.
  var engineMounts={
    Bob:[[-1.69,-3.23,-.267,.85],[1.69,-3.23,-.267,.85]],
    Challenger:[[-1.345,-5.73,-.746,.65],[1.345,-5.73,-.746,.65]],
    Dispatcher:[[-1.564,-7.63,-.22,.48],[1.564,-7.63,-.22,.48],[0,-7.99,.436,.35]],
    Executioner:[[-5.574,-5.92,.007,.48],[5.574,-5.92,.007,.48],[-1.185,-5.70,-.388,.48],[1.185,-5.70,-.388,.48]],
    Imperial:[[-2.556,-7.85,-.306,.48],[2.556,-7.85,-.306,.48],[0,-7.50,-.329,.8]],
    Insurgent:[[-2.295,-7.66,.271,.4],[2.295,-7.66,.271,.4],[-3.531,-7.23,-1.02,.45],[3.531,-7.23,-1.02,.45]],
    Omen:[[-2.029,-4.61,-.823,.65],[2.029,-4.61,-.823,.65]],
    Pancake:[[-2.041,-3.71,.286,.75],[2.041,-3.71,.286,.75]],
    Spitfire:[[-6.421,-4.20,.906,.65],[-6.421,-4.20,-1.095,.65],[6.421,-4.20,.906,.65],[6.421,-4.20,-1.095,.65]],
    Striker:[[-2.176,-6.09,-.273,.38],[2.176,-6.09,-.273,.38],[0,-8.05,.632,.27]],
    Zenith:[[-1.47,-7.68,-.088,.6],[1.47,-7.68,-.088,.6]]
  };
  function engineAnchors(model){return engineMounts[model.name]||[];}
  function engineGeometry(craft,selection,wave,units,view,time){
    var data=[];
    function quad(center,along,side,length,width,opacity){
      [[-1,-1],[-1,1],[1,1],[-1,-1],[1,1],[1,-1]].forEach(function(uv){
        for(var a=0;a<3;a++)data.push(center[a]+(along[a]*uv[0]*length+side[a]*uv[1]*width)/units);
        data.push(uv[0],uv[1],opacity);
      });
    }
    craft.forEach(function(e){
      if(e.hp<=0||e.age!==undefined||e.pose.throttle<=0)return;
      var entry=selection==='mixed'?mixedModel(e.index,e.artWave||wave):(find(selection)||{}).model;
      var anchors=entry?engineAnchors(entry):[[0,-6,0]],p=e.pose;
      var power=Math.min(1,Math.max(0,p.throttle)),pulse=1+.035*Math.sin(time*23+e.index*2.7);
      anchors.forEach(function(anchor){
        var radius=anchor[3]||.65;
        var center=p.eye.map(function(x,i){return x+(p.right[i]*anchor[0]-p.back[i]*anchor[1]+p.up[i]*anchor[2])/units;});
        // Rear-facing halo shrinks from the front; the hull still occludes it.
        var facing=Math.max(0,p.back.reduce(function(sum,v,i){return sum+v*view.back[i];},0));
        quad(center,view.up,view.right,radius*1.4*pulse,radius*1.4*pulse,(.3+.7*facing)*(.45+.55*power));
        var projected=p.back.map(function(v,i){return v-view.back[i]*p.back.reduce(function(sum,n,j){return sum+n*view.back[j];},0);});
        var size=Math.hypot.apply(null,projected);
        var along=size>.001?projected.map(function(v){return v/size;}):view.up;
        var side=[view.back[1]*along[2]-view.back[2]*along[1],view.back[2]*along[0]-view.back[0]*along[2],view.back[0]*along[1]-view.back[1]*along[0]];
        var tail=radius*(2.8+power*6)*pulse;
        var plume=center.map(function(v,i){return v+p.back[i]*tail*.5/units;});
        quad(plume,along,side,Math.max(radius*.15,tail*.5*size),radius*(.6+power*.3),.6+power*.35);
      });
    });
    return {vertices:new Float32Array(data),color:[.25,.65,1]};
  }
  // Collision and decals share the displayed model's local metre coordinates.
  var blockout={id:'blockout',vertices:[]};
  (function(){var p=[[0,11,0],[-7,-6,0],[0,-3,2.5],[7,-6,0],[0,-6,-2]];
    [[0,1,2],[0,2,3],[0,4,1],[0,3,4],[1,4,2],[2,4,3]].forEach(function(f){
      var n=normal(p[f[0]],p[f[1]],p[f[2]]);f.forEach(function(i){blockout.vertices.push.apply(blockout.vertices,p[i].concat(n));});
    });
  }());
  function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function minus(a,b){return a.map(function(v,i){return v-b[i];});}
  function cross3(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function normal(a,b,c){var n=cross3(minus(b,a),minus(c,a)),l=Math.hypot.apply(null,n)||1;return n.map(function(v){return v/l;});}
  function craftModel(e,selection,wave){return selection==='mixed'?mixedModel(e.index,e.artWave||wave):(find(selection)||{}).model||blockout;}
  function localPoint(p,world,units){var d=minus(world,p.eye);return [dot3(d,p.right)*units,-dot3(d,p.back)*units,dot3(d,p.up)*units];}
  var hullBounds=new WeakMap();
  function hullHit(model,pose,start,end,units){
    var a=localPoint(pose,start,units),d=minus(localPoint(pose,end,units),a),v=model.vertices,best=null;
    var radius=hullBounds.get(model);
    if(radius===undefined){radius=0;for(var b=0;b<v.length;b+=6)radius=Math.max(radius,Math.hypot(v[b],v[b+1],v[b+2]));hullBounds.set(model,radius);}
    var span=dot3(d,d),fraction=span?Math.max(0,Math.min(1,-dot3(a,d)/span)):0;
    if(Math.hypot.apply(null,a.map(function(x,j){return x+d[j]*fraction;}))>radius)return null;
    for(var i=0;i<v.length;i+=18){
      var p=v.slice(i,i+3),e=minus(v.slice(i+6,i+9),p),f=minus(v.slice(i+12,i+15),p);
      var h=cross3(d,f),det=dot3(e,h);if(Math.abs(det)<1e-10)continue;
      var offset=minus(a,p),u=dot3(offset,h)/det;if(u<0||u>1)continue;
      var q=cross3(offset,e),w=dot3(d,q)/det;if(w<0||u+w>1)continue;
      var t=dot3(f,q)/det;if(t<0||t>1||best&&t>=best.fraction)continue;
      var n=normal(p,v.slice(i+6,i+9),v.slice(i+12,i+15));
      best={fraction:t,point:start.map(function(x,j){return x+(end[j]-x)*t;}),
        local:a.map(function(x,j){return x+d[j]*t;}),normal:n,model:model};
    }
    return best;
  }
  function addScorch(e,hit){
    var n=hit.normal,center=hit.local,axis=Math.abs(n[2])<.9?[0,0,1]:[0,1,0];
    var tangent=normal([0,0,0],n,axis),side=cross3(n,tangent),layers=[[],[],[],[],[]];
    // Clip a small polygonal burn to nearby hull triangles. No floating quads,
    // back-side bleed, textures, or per-frame mesh projection.
    var v=hit.model.vertices;
    for(var i=0;i<v.length;i+=18){
      var tri=[v.slice(i,i+3),v.slice(i+6,i+9),v.slice(i+12,i+15)],face=normal(tri[0],tri[1],tri[2]);
      if(dot3(face,n)<.35||[0,1,2].some(function(k){return Math.min(tri[0][k],tri[1][k],tri[2][k])>center[k]+1.4||Math.max(tri[0][k],tri[1][k],tri[2][k])<center[k]-1.4;}))continue;
      [.78,.63,.48,.33,.18].forEach(function(radius,layer){
        var poly=tri;
        function clip(direction,limit){
          var out=[];poly.forEach(function(a,j){var b=poly[(j+1)%poly.length],da=dot3(minus(a,center),direction)-limit,db=dot3(minus(b,center),direction)-limit;
            if(da<=0)out.push(a);if((da<=0)!==(db<=0)){var t=da/(da-db);out.push(a.map(function(x,k){return x+(b[k]-x)*t;}));}
          });poly=out;
        }
        clip(n,.3);clip(n.map(function(x){return -x;}),.3);
        for(var edge=0;edge<12&&poly.length;edge++){var angle=edge*Math.PI/6;
          clip(tangent.map(function(x,k){return x*Math.cos(angle)+side[k]*Math.sin(angle);}),radius*(1+.22*Math.sin(edge*7.3+center[0]*2.1+center[1]*3.7+center[2])));
        }
        for(var j=1;j+1<poly.length;j++)[poly[0],poly[j],poly[j+1]].forEach(function(p){layers[layer].push.apply(layers[layer],p.map(function(x,k){return x+face[k]*(.012+layer*.004);}).concat(face));});
      });
    }
    if(!e.scorches)e.scorches=[];e.scorches.push({modelId:hit.model.id,layers:layers});if(e.scorches.length>24)e.scorches.shift();
  }
  function scorchGeometry(craft,selection,wave,units){
    var layers=[[],[],[],[],[]];craft.forEach(function(e){var model=craftModel(e,selection,wave);
      (e.scorches||[]).forEach(function(mark){if(mark.modelId!==model.id)return;mark.layers.forEach(function(source,i){var batch=geometry({vertices:source},[e.pose],units)[0];layers[i].push.apply(layers[i],batch.vertices);});});
    });
    return layers.map(function(data,i){return {vertices:new Float32Array(data),color:[.22,.20,.17],opacity:[.10,.13,.16,.18,.12][i]};});
  }
  function populate(select,blockout){
    if(blockout){var option=document.createElement('option');option.value='';option.textContent='Driftworks · training blockout';select.appendChild(option);}
    (DW.shipPacks||[]).forEach(function(pack){var group=document.createElement('optgroup');group.label=pack.author+' / '+pack.id;pack.models.forEach(function(model){var option=document.createElement('option');option.value=model.id;option.textContent=model.name+' · '+model.triangles.toLocaleString()+' tris';group.appendChild(option);});select.appendChild(group);});
  }
  function paintColor(hex){return /^#[0-9a-f]{6}$/i.test(hex)?[parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255]:undefined;}
  DW.shipPackModels={craftModel:craftModel,hullHit:hullHit,addScorch:addScorch,scorchGeometry:scorchGeometry,paintColor:paintColor,find:find,loadTextures:loadTextures,sourceGeometry:sourceGeometry,sourceFleetGeometry:sourceFleetGeometry,geometry:geometry,detailedGeometry:detailedGeometry,mixedModel:mixedModel,fleetGeometry:fleetGeometry,engineAnchors:engineAnchors,engineGeometry:engineGeometry,populate:populate};
}());
