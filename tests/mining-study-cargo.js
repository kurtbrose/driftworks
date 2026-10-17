// Shared, deterministic cargo blockout for orbit and first-person inspection.
(function(){
  var perimeter=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
  var machines=[
    {x:0,y:6.4,width:18,depth:3.2,height:3.35,machine:true,kind:'processor'},
    {x:9.4,y:-4,width:9,depth:3.6,height:3.35,machine:true,kind:'manipulator'},
    {x:-9.8,y:-4,width:7.2,depth:4.0,height:3.2,machine:true,kind:'deployment'}
  ];
  var slots=[];
  function inside(x,y){return perimeter.every(function(p,i){var q=perimeter[(i+1)%perimeter.length];return (q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0])>=0;});}
  [-9.8,-7.4,-5,-2.6,2.6,5,7.4,9.8].forEach(function(y){
    [-14,-11,-8,-5,-2,.5,5.75,8.75,11.75,14].forEach(function(x){
      var width=x===.5||x===14?1.4:2.7,depth=2.1;
      if(![-1,1].every(function(sx){return [-1,1].every(function(sy){return inside(x+sx*(width/2+.35),y+sy*(depth/2+.35));});}))return;
      if(perimeter.some(function(p){return Math.abs(x-p[0])<width/2+1.6&&Math.abs(y-p[1])<depth/2+1.4;}))return;
      if(machines.some(function(m){return Math.abs(x-m.x)<(width+m.width)/2+.25&&Math.abs(y-m.y)<(depth+m.depth)/2+.25;}))return;
      slots.push({x:x,y:y,width:width,depth:depth,height:Math.abs(x)-width/2<4.65&&Math.abs(y)-depth/2<3.65?2.25:2.65+(slots.length%3)*.22,cylinder:slots.length%8===3});
    });
  });
  // Heavy equipment loads first; smaller freight densely occupies the remaining bays.
  slots=machines.concat(slots.filter(function(s,i){return i%2===0;}),slots.filter(function(s,i){return i%2===1;}));
  function selected(fill){return slots.slice(0,Math.round(Math.max(0,Math.min(1,Number(fill)||0))*slots.length));}
  var cache={};
  function geometry(fill){
    var loads=selected(fill),count=loads.length;if(cache[count])return cache[count];
    var batches=[{vertices:[],color:[.38,.48,.53]},{vertices:[],color:[.63,.49,.30]},{vertices:[],color:[.48,.55,.50]}];
    function face(out,points){
      var a=points[0],b=points[1],c=points[2],u=b.map(function(v,k){return v-a[k];}),v=c.map(function(v,k){return v-a[k];});
      var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot.apply(null,n);n=n.map(function(v){return v/length;});
      for(var i=1;i<points.length-1;i++)[points[0],points[i],points[i+1]].forEach(function(p){out.push.apply(out,p.concat(n));});
    }
    function solid(s,out,bottom){
      var base=[],top=[],sides=s.cylinder?10:4;
      for(var i=0;i<sides;i++){
        var angle=i*Math.PI*2/sides,px=s.cylinder?Math.cos(angle)*s.width/2:[-1,1,1,-1][i]*s.width/2,py=s.cylinder?Math.sin(angle)*s.depth/2:[-1,-1,1,1][i]*s.depth/2;
        base.push([s.x+px,s.y+py,bottom]);top.push([s.x+px,s.y+py,bottom+s.height]);
      }
      face(out,base.slice().reverse());face(out,top);
      base.forEach(function(p,i){var j=(i+1)%sides;face(out,[p,base[j],top[j],top[i]]);});
    }
    // Axial process chambers and stowed payloads, kept deliberately schematic.
    function chamber(x,y,z,length,radius,out){
      var a=[],b=[];
      for(var i=0;i<8;i++){var angle=i*Math.PI/4;a.push([x-length/2,y+Math.cos(angle)*radius,z+Math.sin(angle)*radius]);b.push([x+length/2,y+Math.cos(angle)*radius,z+Math.sin(angle)*radius]);}
      face(out,a.slice().reverse());face(out,b);
      a.forEach(function(p,i){var j=(i+1)%8;face(out,[p,a[j],b[j],b[i]]);});
    }
    loads.forEach(function(s,index){
      var out=batches[index%3].vertices;
      function box(dx,dy,bottom,width,depth,height,batch){solid({x:s.x+dx,y:s.y+dy,width:width,depth:depth,height:height},batches[batch].vertices,4.5+bottom);}
      if(s.kind==='processor'){
        // Long vacuum-processing assembly: exposed transport rails and three vessels.
        [-1,1].forEach(function(side){box(0,side*1.38,.12,17.6,.30,.45,0);});
        [-5.4,0,5.4].forEach(function(x,index){
          box(x,0,.57,3.8,2.8,.35,0);
          chamber(s.x+x,s.y,6.36,4.4,1.32,batches[index%3].vertices);
        });
        [-2.7,2.7].forEach(function(x){box(x,0,1.4,1.1,1.25,.85,0);});
      }else if(s.kind==='manipulator'){
        // Uncrewed manipulator sled with paired arms folded against its equipment core.
        box(0,0,.15,8.7,3.2,.40,0);
        box(0,0,.55,3.8,2.6,1.55,2);
        [-1,1].forEach(function(side){
          box(-.2,side*.98,2.1,7.9,.58,.52,1);
          box(.8,side*1.12,2.67,5.4,.50,.60,0);
          box(-3.6,side*.98,1.35,.7,.8,.75,1);
        });
        box(3.55,0,.65,1.2,2.8,1.25,2);
      }else if(s.kind==='deployment'){
        // Paired stowed deployment modules in an open zero-G handling cradle.
        box(0,0,.12,6.8,1,.4,0);
        [-1,1].forEach(function(side){
          chamber(s.x,s.y+side*.98,6.05,5.4,.88,batches[2].vertices);
          box(side*2.95,0,.52,.35,3.8,1.65,0);
        });
        box(0,0,2.43,2.4,1.1,.65,1);
      }else if(!s.cylinder&&s.height>2.6){
        solid(Object.assign({},s,{height:1.5}),out,4.5);
        solid(Object.assign({},s,{width:s.width*.96,depth:s.depth*.96,height:s.height-1.54}),out,6.04);
      }else solid(s,out,4.5);
    });
    return cache[count]=batches.filter(function(b){return b.vertices.length;}).map(function(b){return {vertices:new Float32Array(b.vertices),color:b.color};});
  }
  window.Driftworks.miningStudyCargo={selected:selected,geometry:geometry};
})();
