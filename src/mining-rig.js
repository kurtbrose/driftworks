(function(global){
  'use strict';
  /** @typedef {[number,number,number]} V3 */
  /** @typedef {Record<string,number[]>} Groups */
  /** @typedef {{knee:number[],tip:number[],normal:number[]}} ContactPose */
  /** @typedef {ReturnType<NonNullable<import('./types').DriftworksNamespace['meshBuilder']>['create']>} MeshBuilder */
  var DW=/** @type {Required<import('./types').DriftworksNamespace>} */ (global.Driftworks);
  /** @returns {Groups} */
  function emptyGroups(){return {ochre:[],steel:[],dark:[],light:[],marker:[],lamp:[]};}
  /** Copy private component meshes into the caller's output, retaining material order.
   * @param {Groups} groups @param {Groups} component */
  function append(groups,component){Object.keys(component).forEach(function(key){groups[key]=groups[key].concat(component[key]);});}

  /** Compatibility facade. Mode precedence is historical: ramps, infill, then legs.
   * time/working remain accepted; the reference artwork has no idle deformation.
   * @param {number} deployment @param {number} time @param {boolean} working
   * @param {number} [panelOpen] @param {string} [interiorCut] @param {boolean} [legsOnly]
   * @param {boolean} [infillOnly] @param {ContactPose[]} [contactPoses]
   * @param {number[]} [rampLimits] @param {boolean} [rampsOnly] */
  function miningPlatformGeometry(deployment,time,working,panelOpen,interiorCut,legsOnly,infillOnly,contactPoses,rampLimits,rampsOnly){
    if(rampsOnly)return rampGeometry(panelOpen,rampLimits);
    if(infillOnly)return infillGeometry();
    if(legsOnly)return legGeometry(deployment,contactPoses);
    return fullGeometry(deployment,panelOpen,interiorCut,contactPoses,rampLimits);
  }
  /** @param {number} [panelOpen] @param {number[]} [rampLimits] */
  function rampGeometry(panelOpen,rampLimits){
    var groups=emptyGroups(),mesh=DW.meshBuilder.create(groups);
    perimeter.forEach(function(p,i){bayAssembly(mesh,i,panelOpen,rampLimits).leaves();});
    return groups;
  }
  function infillGeometry(){
    var groups=emptyGroups(),mesh=DW.meshBuilder.create(groups);
    perimeter.forEach(function(p,i){bayAssembly(mesh,i).infill();});
    return groups;
  }
  /** @param {number} deployment @param {ContactPose[]} [contactPoses] */
  function legGeometry(deployment,contactPoses){
    var groups=emptyGroups(),mesh=DW.meshBuilder.create(groups),d=Math.max(0,Math.min(1,deployment));
    perimeter.forEach(function(p,i){buildLeg(groups,mesh,d,contactPoses,p[0],i,p[1]);});
    return groups;
  }
  /** @param {number} deployment @param {number} [panelOpen] @param {string} [interiorCut]
   * @param {ContactPose[]} [contactPoses] @param {number[]} [rampLimits] */
  function fullGeometry(deployment,panelOpen,interiorCut,contactPoses,rampLimits){
    var groups=emptyGroups(),mesh=DW.meshBuilder.create(groups),d=Math.max(0,Math.min(1,deployment));
    var bays=perimeter.map(function(p,i){return bayAssembly(mesh,i,panelOpen,rampLimits);});
    // Keep moving leaf artwork contiguous so fixed-frame geometry can be inspected separately.
    bays.forEach(function(bay){bay.leaves();});
    bays.forEach(function(bay){bay.mechanisms();});
    bays.forEach(function(bay){bay.infill();});
    buildDeck(mesh);
    append(groups,cabinGeometry(interiorCut));
    buildChassis(mesh);
    perimeter.forEach(function(p,i){buildLeg(groups,mesh,d,contactPoses,p[0],i,p[1]);});
    append(groups,miningPlatformLights());
    return groups;
  }
  var perimeter=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
  /** Miter the outboard hinge polygon so adjacent closed bays share a corner.
   * @param {number} index @param {number} [clearance] @returns {V3}
   */
  function outerHinge(index,clearance){
    var p=perimeter[index],previous=perimeter[(index+perimeter.length-1)%perimeter.length],next=perimeter[(index+1)%perimeter.length];
    var before=[p[0]-previous[0],p[1]-previous[1]],after=[next[0]-p[0],next[1]-p[1]],beforeLength=Math.hypot.apply(null,before),afterLength=Math.hypot.apply(null,after);
    var n=[before[1]/beforeLength,-before[0]/beforeLength],m=[after[1]/afterLength,-after[0]/afterLength],scale=(clearance===undefined?.72:clearance)/(1+n[0]*m[0]+n[1]*m[1]);
    return [p[0]+(n[0]+m[0])*scale,p[1]+(n[1]+m[1])*scale,4.5];
  }
  /** @param {MeshBuilder['plate']} plate @param {V3[]} points */
  function doorLeaf(plate,points){
    var u=points[1].map(function(v,i){return v-points[0][i];}),v=points[2].map(function(v,i){return v-points[0][i];});
    var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot.apply(null,n);
    var back=points.map(function(p){return /** @type {V3} */ ([p[0]-n[0]/length*.22,p[1]-n[1]/length*.22,p[2]-n[2]/length*.22]);});
    plate('ochre',points);plate('steel',back.slice().reverse());
    for(var k=0;k<4;k++){var j=(k+1)%4;plate('ochre',[points[k],back[k],back[j],points[j]]);}
    // Paint in an orthonormal leaf frame: fixed physical widths and 45-degree
    // stripes, clipped to an inset panel rather than stretched over its trapezoid.
    var span=Math.hypot.apply(null,u),axis=u.map(function(value){return value/span;}),normal=n.map(function(value){return value/length;});
    var across=[normal[1]*axis[2]-normal[2]*axis[1],normal[2]*axis[0]-normal[0]*axis[2],normal[0]*axis[1]-normal[1]*axis[0]];
    var outline=points.map(function(p){var delta=p.map(function(value,k){return value-points[0][k];});return [delta.reduce(function(sum,value,k){return sum+value*axis[k];},0),delta.reduce(function(sum,value,k){return sum+value*across[k];},0)];});
    /** @param {number[][]} polygon @param {number} a @param {number} b @param {number} limit */
    function clip(polygon,a,b,limit){
      /** @type {number[][]} */ var result=[];
      polygon.forEach(function(p,i){var q=polygon[(i+1)%polygon.length],dp=a*p[0]+b*p[1]-limit,dq=a*q[0]+b*q[1]-limit;
        if(dp<=0)result.push(p);
        if((dp<0 && dq>0)||(dp>0 && dq<0)){var t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
      });return result;
    }
    var band=outline.slice();
    outline.forEach(function(p,i){var q=outline[(i+1)%4],dx=q[0]-p[0],dy=q[1]-p[1];band=clip(band,dy,-dx,dy*p[0]-dx*p[1]-.35*Math.hypot(dx,dy));});
    var top=Math.max.apply(null,outline.map(function(p){return p[1];}))-.35;
    band=clip(band,0,1,top);band=clip(band,0,-1,-(top-.28));
    /** @param {string} material @param {number[][]} polygon @param {number} lift */
    function paint(material,polygon,lift){if(polygon.length<3)return;plate(material,polygon.map(function(p){return /** @type {V3} */ (points[0].map(function(value,k){return value+axis[k]*p[0]+across[k]*p[1]-normal[k]*(.22+lift);}));}).reverse());}
    paint('dark',band,.018);
    var width=.14*Math.SQRT2,pitch=width*2,values=band.map(function(p){return p[0]-p[1];});
    var start=Math.floor(Math.min.apply(null,values)/pitch),end=Math.ceil(Math.max.apply(null,values)/pitch);
    for(var stripe=start;stripe<=end;stripe++)paint('light',clip(clip(band,1,-1,stripe*pitch+width),-1,1,-stripe*pitch),.036);
  }
  /** Chamfered hardpoint shared by the frame socket and leg shoulder.
   * @param {MeshBuilder} mesh @param {string} material @param {number} x @param {number} y @param {number} bottom @param {number} top @param {number} halfX @param {number} halfY @param {number} taper
   */
  function hardpoint(mesh,material,x,y,bottom,top,halfX,halfY,taper){
    var plate=mesh.plate;
    var c=.28,shape=[[-1,-1+c],[-1+c,-1],[1-c,-1],[1,-1+c],[1,1-c],[1-c,1],[-1+c,1],[-1,1-c]];
    var base=shape.map(function(p){return /** @type {V3} */ ([x+p[0]*halfX,y+p[1]*halfY,bottom]);});
    var cap=shape.map(function(p){return /** @type {V3} */ ([x+p[0]*halfX*taper,y+p[1]*halfY*taper,top]);});
    plate(material,base.slice().reverse());plate(material,cap);
    base.forEach(function(p,i){var j=(i+1)%8;plate(material,[p,base[j],cap[j],cap[i]]);});
  }

  /** A bay shares its hinge calculations; each method emits only its own assembly.
   * @param {MeshBuilder} mesh @param {number} i @param {number} [panelOpen] @param {number[]} [rampLimits] */
  function bayAssembly(mesh,i,panelOpen,rampLimits){
    var block=mesh.block,link=mesh.link,plate=mesh.plate,j=(i+1)%perimeter.length;
    var a=/** @type {V3} */ ([perimeter[i][0],perimeter[i][1],4.5]),b=/** @type {V3} */ ([perimeter[j][0],perimeter[j][1],4.5]),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),ax=dx/len,ay=dy/len;
    /** @param {V3} p @param {V3} q @param {number} t @returns {V3} */
    function mix(p,q,t){return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t];}
    // Each bay ends at its own tower clearance plane, rather than shrinking the whole roof.
    var towerPlan=[[-6,-3],[-4,-4.5],[4,-4.5],[6,-3],[6,3],[4,4.5],[-4,4.5],[-6,3]];
    var nx=ay,ny=-ax;
    var clearance=Math.max.apply(null,towerPlan.map(function(v){return (v[0]*nx+v[1]*ny)*1.14;}))+.40;
    /** Intersect adjacent clearance planes to retain non-overlapping, mitered bay edges.
     * @param {number} index @returns {V3} */
    function roofEnd(index){
      var v=perimeter[index],other=perimeter[index===i?(index+7)%8:(index+1)%8];
      var ex=index===i?v[0]-other[0]:other[0]-v[0],ey=index===i?v[1]-other[1]:other[1]-v[1],length=Math.hypot(ex,ey),mx=ey/length,my=-ex/length;
      var limit=Math.max.apply(null,towerPlan.map(function(v){return (v[0]*mx+v[1]*my)*1.14;}))+.40,det=nx*my-ny*mx;
      return [(clearance*my-ny*limit)/det,(nx*limit-clearance*mx)/det,9.45];
    }
    var innerA=roofEnd(i),innerB=roofEnd(j);
    // Outboard hinge line clears the fixed rails and posts, including panel thickness.
    var hingeA=outerHinge(i),hingeB=outerHinge(j);
    // Roof underside at 9.23 clears the raised pod ribs and their sockets (top 9.18).
    var topA=/** @type {V3} */ ([hingeA[0],hingeA[1],9.45]),topB=/** @type {V3} */ ([hingeB[0],hingeB[1],9.45]);
    innerA[2]=9.45;innerB[2]=9.45;
    var inward=-(innerA[0]-hingeA[0])*ay+(innerA[1]-hingeA[1])*ax;
    var fullLower=Math.PI*115/180,elbowHeight=4.5+4.95*Math.cos(fullLower);
    var fullUpper=Math.PI+Math.asin(elbowHeight/inward)-fullLower;
    var t=Math.max(0,Math.min(1,panelOpen || 0,rampLimits?rampLimits[i]:1));
    // Uncover the roof first; closing reverses this so the wall seats before the roof.
    var lowerAngle=fullLower*Math.max(0,(t-.4)/.6),upperAngle=fullUpper*Math.min(1,t/.4);
    /** @param {V3} v @param {V3} origin @param {number} angle @returns {V3} */
    function rotate(v,origin,angle){var x=v[0]-origin[0],y=v[1]-origin[1],z=v[2]-origin[2],along=x*ax+y*ay,c=Math.cos(angle),sn=Math.sin(angle);return [origin[0]+x*c+ay*z*sn+ax*along*(1-c),origin[1]+y*c-ax*z*sn+ay*along*(1-c),origin[2]+z*c+(ax*y-ay*x)*sn];}
    var wallTopA=rotate(topA,hingeA,lowerAngle),wallTopB=rotate(topB,hingeA,lowerAngle);
    var roofTipA=rotate(rotate(innerA,topA,upperAngle),hingeA,lowerAngle),roofTipB=rotate(rotate(innerB,topA,upperAngle),hingeA,lowerAngle);
    var edgeGap=.8/len,rootGap=1.75/len;
    return {leaves:buildLeaves,mechanisms:buildMechanisms,infill:buildInfill};
    function buildLeaves(){
      doorLeaf(plate,[mix(hingeA,hingeB,rootGap),mix(hingeA,hingeB,1-rootGap),mix(wallTopA,wallTopB,1-edgeGap),mix(wallTopA,wallTopB,edgeGap)]);
      // The roof leaf shares the wall top hinge.
      doorLeaf(plate,[mix(wallTopA,wallTopB,edgeGap),mix(wallTopA,wallTopB,1-edgeGap),mix(roofTipA,roofTipB,1-edgeGap),mix(roofTipA,roofTipB,edgeGap)]);
    }
    function buildMechanisms(){
      var barrel=mesh.barrel;
      /** Position relative to the root axis, positive outward and upward.
       * @param {number} along @param {number} outward @param {number} z @returns {V3}
       */
      function rootPoint(along,outward,z){return [hingeA[0]+dx*along+ay*outward,hingeA[1]+dy*along-ax*outward,z];}
      // Three short pin joints: fixed clevis ears straddle each moving panel lug.
      [.20,.50,.80].forEach(function(along){
        var half=.55/len,ear=.37/len;
        [-1,1].forEach(function(side){
          link('dark',rootPoint(along+side*ear,-.8,4.5),rootPoint(along+side*ear,.08,4.5),.17);
          barrel('steel',rootPoint(along+side*(half-.08/len),0,4.5),rootPoint(along+side*(half+.08/len),0,4.5),.30);
        });
        barrel('steel',rootPoint(along-half,0,4.5),rootPoint(along+half,0,4.5),.23);
        link('steel',rotate(rootPoint(along,0,4.5),hingeA,lowerAngle),rotate(rootPoint(along,.12,5.15),hingeA,lowerAngle),.21);
        // Matching fold joint: lower-leaf brackets and an upper-leaf lug share a pin.
        var jointA=rotate(rootPoint(along-half,0,9.45),hingeA,lowerAngle),jointB=rotate(rootPoint(along+half,0,9.45),hingeA,lowerAngle);
        barrel('steel',jointA,jointB,.21);
        [-1,1].forEach(function(side){
          var mount=rootPoint(along+side*ear,0,9.45),tail=rootPoint(along+side*ear,-.12,8.85);
          link('steel',rotate(tail,hingeA,lowerAngle),rotate(mount,hingeA,lowerAngle),.16);
          barrel('light',rotate(rootPoint(along+side*(half-.07/len),0,9.45),hingeA,lowerAngle),rotate(rootPoint(along+side*(half+.07/len),0,9.45),hingeA,lowerAngle),.27);
        });
        var roofLug=mix(mix(topA,topB,along),mix(innerA,innerB,along),.13);
        link('steel',mix(wallTopA,wallTopB,along),rotate(rotate(roofLug,topA,upperAngle),hingeA,lowerAngle),.18);
      });
      // One telescoping powered strut per door, partly sheltered alongside the root.
      var jackBase=rootPoint(.32,1,4.75),jackEnd=rotate(rootPoint(.32,.45,7.1),hingeA,lowerAngle),sleeveEnd=mix(jackBase,jackEnd,.64);
      barrel('steel',jackBase,sleeveEnd,.16);barrel('light',sleeveEnd,jackEnd,.075);
      link('dark',rootPoint(.32,-.15,4.6),jackBase,.22);
      barrel('steel',rootPoint(.29,1,4.75),rootPoint(.35,1,4.75),.21);
      var movingPinA=rotate(rootPoint(.29,.45,7.1),hingeA,lowerAngle),movingPinB=rotate(rootPoint(.35,.45,7.1),hingeA,lowerAngle);
      barrel('steel',movingPinA,movingPinB,.20);
      // Fixed angle stops and closure receivers; panel tabs nest into the cage in transit.
      [.12,.88].forEach(function(along){
        link('dark',rootPoint(along,.35,3.9),rootPoint(along,1.05,3.9),.32);
        link('dark',rootPoint(along,-.72,8.4),rootPoint(along,-.45,9.0),.14);
        link('dark',rootPoint(along,-.45,9.0),rootPoint(along,.45,9.0),.18);
        var tongueA=rotate(rootPoint(along,-.2,9.2),hingeA,lowerAngle),tongueB=rotate(rootPoint(along,.65,9.2),hingeA,lowerAngle);
        link('steel',tongueA,tongueB,.18);
      });
      // Same cage topology and hardpoints; narrow box sections retain depth with less top-view mass.
      link('dark',[a[0],a[1],5.35],[a[0],a[1],8.4],.31,.35);
      link('dark',[a[0],a[1],8.4],[b[0],b[1],8.4],.245,.285);
      link('dark',[a[0],a[1],4.5],[b[0],b[1],4.5],.31,.38);
      // Each leg-root rib terminates at the suspended pod's structural belt.
      var seatScale=Math.min(4.45/Math.max(.001,Math.abs(a[0])),3.45/Math.max(.001,Math.abs(a[1])));
      var seat=/** @type {V3} */ ([a[0]*seatScale,a[1]*seatScale,8.8]);
      link('dark',[a[0],a[1],8.4],seat,.23,.30);
      block('dark',seat,[.38,.38,.30]);
    }
    function buildInfill(){
      /** @type {V3[][]} */ var polygons=[];
      var fixedA=outerHinge(i,.30),fixedB=outerHinge(j,.30);
      var roofA=/** @type {V3} */ ([fixedA[0],fixedA[1],9.05]),roofB=/** @type {V3} */ ([fixedB[0],fixedB[1],9.05]);
      var roofInnerA=/** @type {V3} */ ([innerA[0],innerA[1],9.05]),roofInnerB=/** @type {V3} */ ([innerB[0],innerB[1],9.05]);
      // Recessed stationary collar closes the remaining opening up to the pressure cabin.
      /** @param {V3} v @returns {V3} */
      function cabinEdge(v){
        var scale=Infinity;
        towerPlan.forEach(function(a,k){var b=towerPlan[(k+1)%8],ex=b[0]-a[0],ey=b[1]-a[1],projection=ey*v[0]-ex*v[1];if(projection>0)scale=Math.min(scale,(ey*a[0]-ex*a[1])*.979/projection);});
        return [v[0]*scale,v[1]*scale,9.05];
      }
      polygons.push([roofInnerA,roofInnerB,cabinEdge(roofInnerB),cabinEdge(roofInnerA)]);
      [-1,1].forEach(function(side){
        var edge=side<0?edgeGap+.1/len:1-edgeGap-.1/len,outer=side<0?0:1;
        var start=mix(roofA,roofB,edge),end=mix(roofInnerA,roofInnerB,edge),outerStart=mix(roofA,roofB,outer),outerEnd=mix(roofInnerA,roofInnerB,outer);
        polygons.push(side<0?[outerStart,start,end,outerEnd]:[start,outerStart,outerEnd,end]);
        // Side cheek begins above the leg shoulder, preserving its mechanical opening.
        var bottom=mix(fixedA,fixedB,outer),lowerEdge=mix(fixedA,fixedB,side<0?rootGap:1-rootGap),upperEdge=mix(roofA,roofB,edge);
        bottom[2]=5.55;lowerEdge[2]=5.55;
        polygons.push(side<0?[bottom,lowerEdge,upperEdge,outerStart]:[lowerEdge,bottom,outerStart,upperEdge]);
      });
      polygons.forEach(function(points){
        var u=points[1].map(function(v,k){return v-points[0][k];}),v=points[2].map(function(v,k){return v-points[0][k];});
        var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot.apply(null,n);
        var back=points.map(function(p){return /** @type {V3} */ (p.map(function(v,k){return v-n[k]/length*.10;}));});
        plate('dark',points);plate('dark',back.slice().reverse());
        points.forEach(function(p,i){var j=(i+1)%points.length;plate('dark',[p,back[i],back[j],points[j]]);});
      });
    }
  }

  /** @param {MeshBuilder} mesh */
  function buildDeck(mesh){
    var plate=mesh.plate;
    var lower=perimeter.map(function(p){return /** @type {V3} */ ([p[0],p[1],4.5]);});
    plate('steel',lower);
    // Separate the belly from the deck: coincident opposite faces cause z-fighting.
    var belly=lower.map(function(p){return /** @type {V3} */ ([p[0],p[1],p[2]-.35]);});
    plate('dark',belly.slice().reverse());
    lower.forEach(function(p,i){var j=(i+1)%lower.length;plate('dark',[p,belly[i],belly[j],lower[j]]);});
  }
  /** @param {MeshBuilder} mesh */
  function buildChassis(mesh){
    // Follow the deck's hinge polygon with a recessed, bevelled belly. The old
    // rectangular block and longitudinal rails protruded through diagonal bays.
    var upper=perimeter.map(function(p,i){var v=outerHinge(i,-.45);v[2]=4.10;return v;});
    var lower=perimeter.map(function(p,i){var v=outerHinge(i,-.95);v[2]=3.35;return v;});
    mesh.plate('dark',upper);
    mesh.plate('dark',lower.slice().reverse());
    upper.forEach(function(p,i){var j=(i+1)%upper.length;mesh.plate('dark',[p,lower[i],lower[j],upper[j]]);});
  }

  /** @param {Groups} groups @param {MeshBuilder} mesh @param {number} d @param {ContactPose[] | undefined} contactPoses
   * @param {number} root @param {number} index @param {number} rootY */
  function buildLeg(groups,mesh,d,contactPoses,root,index,rootY){
    var block=mesh.block,link=mesh.link,jointBarrel=mesh.barrel;
    var reach=6*d;
    var mount=/** @type {V3} */ ([root,rootY,4]);
    // Each anchor reaches out through its corner gap, not sideways into a bay.
    var bisector=outerHinge(index),outX=bisector[0]-root,outY=bisector[1]-rootY,outLength=Math.hypot(outX,outY);
    outX/=outLength;outY/=outLength;
    var knee=/** @type {V3} */ ([root+outX*(1.5+reach*.55),rootY+outY*(1.5+reach*.55),4]);
    var tip=/** @type {V3} */ ([root+outX*(2+reach),rootY+outY*(2+reach),1.4+(1-d)*2]);
    var contactPose=contactPoses && contactPoses[index];
    if(contactPose){knee=/** @type {V3} */ (contactPose.knee);tip=/** @type {V3} */ (contactPose.tip);}
    // One chassis node receives both the leg clevis and replaceable frame shoe.
    hardpoint(mesh,'dark',root,rootY,3.05,4.15,1.55,1.28,.86);
    hardpoint(mesh,'ochre',root,rootY,4.15,4.92,1.48,1.16,.62);
    hardpoint(mesh,'steel',root,rootY,4.94,5.22,.70,.62,.84);
    // Split socket cheeks grip the post; the adapter remains a separate part.
    [-1,1].forEach(function(s){block('dark',[root+s*.49,rootY,5.39],[.14,.52,.28]);});
    link('steel',[root-.86,rootY-.55,4.45],[root-.5,rootY-.55,5.25],.10,.17);
    link('steel',[root+.86,rootY+.55,4.45],[root+.5,rootY+.55,5.25],.10,.17);
    var vx=knee[0]-root,vy=knee[1]-rootY,vlen=Math.hypot(vx,vy),tx=-vy/vlen,ty=vx/vlen;
    /** @param {V3} center @param {number} along @param {number} z @returns {V3} */
    function offset(center,along,z){return [center[0]+tx*along,center[1]+ty*along,center[2]+z];}
    [-1,1].forEach(function(s){
      link('steel',offset(mount,s*.78,-.65),offset(mount,s*.78,.62),.16,.42);
      link('dark',offset(mount,s*.78,-.55),offset(knee,s*.55,-.18),.12,.30);
    });
    jointBarrel('steel',offset(mount,-.96,0),offset(mount,.96,0),.52);
    jointBarrel('dark',offset(mount,-1.03,0),offset(mount,-.95,0),.34);
    jointBarrel('dark',offset(mount,.95,0),offset(mount,1.03,0),.34);
    link('dark',mount,knee,.56,.78);
    link('steel',knee,tip,.43,.62);
    jointBarrel('steel',offset(knee,-.73,0),offset(knee,.73,0),.62);
    var actuatorA=offset(mount,.9,-.60),actuatorB=offset(knee,.65,-.4),actuatorMid=/** @type {V3} */ (actuatorA.map(function(v,k){return v+(actuatorB[k]-v)*.60;}));
    jointBarrel('steel',actuatorA,actuatorMid,.17);jointBarrel('light',actuatorMid,actuatorB,.085);
    var headStart=Object.keys(groups).map(function(key){return groups[key].length;});
    // Distinct ankle pivot and compact gripper carrier, with separate jaw pins.
    jointBarrel('steel',offset(tip,-.62,0),offset(tip,.62,0),.45);
    hardpoint(mesh,'dark',tip[0],tip[1],tip[2]-.52,tip[2]-.12,.85,.68,.85);
    [-1,1].forEach(function(jaw){
      var spread=.8+d*.7;
      var knuckle=/** @type {V3} */ ([tip[0]+tx*jaw*spread+outX*1.1,tip[1]+ty*jaw*spread+outY*1.1,tip[2]-.2]);
      var tooth=/** @type {V3} */ ([tip[0]+tx*jaw*.45+outX*1.8,tip[1]+ty*jaw*.45+outY*1.8,tip[2]-1.4]);
      var jawRoot=/** @type {V3} */ ([tip[0]+tx*jaw*.55,tip[1]+ty*jaw*.55,tip[2]-.25]);
      jointBarrel('steel',[jawRoot[0]-outX*.25,jawRoot[1]-outY*.25,jawRoot[2]],[jawRoot[0]+outX*.25,jawRoot[1]+outY*.25,jawRoot[2]],.22);
      link('steel',jawRoot,knuckle,.28,.36);link('dark',knuckle,tooth,.23,.30);
      block('steel',tooth,[.28,.30,.16]);
    });
    if(contactPose){
      var normalLength=Math.hypot.apply(null,contactPose.normal),normal=contactPose.normal.map(function(v){return v/normalLength;}),forward=/** @type {V3} */ ([outX,outY,0]);
      var projection=forward[0]*normal[0]+forward[1]*normal[1];
      forward=/** @type {V3} */ (forward.map(function(v,k){return v-normal[k]*projection;}));
      var fl=Math.hypot.apply(null,forward);forward=/** @type {V3} */ (forward.map(function(v){return v/fl;}));
      var tangent=[normal[1]*forward[2]-normal[2]*forward[1],normal[2]*forward[0]-normal[0]*forward[2],normal[0]*forward[1]-normal[1]*forward[0]];
      Object.keys(groups).forEach(function(key,k){var data=groups[key];for(var v=headStart[k];v<data.length;v+=6){
        var x=data[v]-tip[0],y=data[v+1]-tip[1],z=data[v+2]-tip[2],along=x*outX+y*outY,across=x*tx+y*ty;
        var nx=data[v+3],ny=data[v+4],nz=data[v+5],na=nx*outX+ny*outY,nt=nx*tx+ny*ty;
        for(var axis=0;axis<3;axis++){data[v+axis]=tip[axis]+forward[axis]*along+tangent[axis]*across+normal[axis]*z;data[v+3+axis]=forward[axis]*na+tangent[axis]*nt+normal[axis]*nz;}
      }});
    }
    block('dark',[knee[0],knee[1],knee[2]+.22],[.25,.18,.13]);
    block('lamp',[knee[0],knee[1],knee[2]+.37],[.16,.09,.025]);
  }

  // Only four distinct cabin variants exist; animation and terrain never change them.
  /** @type {Record<string,Record<string,number[]>>} */ var cabinCache={};
  /** @param {string} [interiorCut] */
  function cabinGeometry(interiorCut){
    var key=interiorCut==='lower'?'lower':interiorCut==='upper'?'upper':interiorCut?'cut':'closed';
    if(cabinCache[key])return cabinCache[key];
    /** @type {Record<string,number[]>} */ var groups={ochre:[],steel:[],dark:[],light:[],marker:[],lamp:[]};
    var mesh=DW.meshBuilder.create(groups),block=mesh.block,link=mesh.link,plate=mesh.plate;
      {
        // A sealed, compact control house seats on the deck, forward of the cargo.
        var cabinOutline=[[-6,-3],[-4,-4.5],[4,-4.5],[6,-3],[6,3],[4,4.5],[-4,4.5],[-6,3]];
        var cabinBase=cabinOutline.map(function(p){return /** @type {V3} */ ([p[0],p[1],9]);});
        var cabinWall=cabinOutline.map(function(p){return /** @type {V3} */ ([p[0],p[1],12.5]);});
        var cabinRoof=cabinOutline.map(function(p){return /** @type {V3} */ ([p[0]*.86,p[1]*.86,13.5]);});
        if(!interiorCut)cabinOutline.forEach(function(p,i){var j=(i+1)%8;
          {
            var p=cabinOutline[i],q=cabinOutline[j];
            var waistA=/** @type {V3} */ ([p[0]*.96,p[1]*.96,10]),waistB=/** @type {V3} */ ([q[0]*.96,q[1]*.96,10]);
            var sillA=/** @type {V3} */ ([p[0]*1.14,p[1]*1.14,11.15]),sillB=/** @type {V3} */ ([q[0]*1.14,q[1]*1.14,11.15]);
            var browA=/** @type {V3} */ ([p[0]*1.10,p[1]*1.10,12.5]),browB=/** @type {V3} */ ([q[0]*1.10,q[1]*1.10,12.5]);
            plate('ochre',[cabinBase[i],cabinBase[j],waistB,waistA]);
            plate('ochre',[waistA,waistB,sillB,sillA]);
            plate('ochre',[sillA,sillB,browB,browA]);
            plate('ochre',[browA,browB,cabinRoof[j],cabinRoof[i]]);
            /** Recessed glazing within yellow mullions; lower band normals look outward/down.
             * @param {V3} a @param {V3} b @param {V3} c @param {V3} d
             */
            function viewport(a,b,c,d){
              var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];
              var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot.apply(null,n);
              /** @param {number} along @param {number} up @returns {V3} */
              function point(along,up){return /** @type {V3} */ (a.map(function(x,k){return (x+(b[k]-x)*along)*(1-up)+(d[k]+(c[k]-d[k])*along)*up+n[k]/len*.025;}));}
              plate('dark',[point(.12,.15),point(.88,.15),point(.88,.85),point(.12,.85)]);
            }
            viewport(waistA,waistB,sillB,sillA);
            viewport(sillA,sillB,browB,browA);
            viewport(browA,browB,cabinRoof[j],cabinRoof[i]);
          }
        });
        if(!interiorCut)plate('ochre',cabinRoof);
        if(!interiorCut) {
          // Shuttle roof interface: a broad marked pad around a sealed octagonal airlock.
          // The cabin roof is the pad's underside: do not duplicate that plane.
          var padCorners=/** @type {V3[]} */ ([[-4.45,-3.15,13.74],[4.45,-3.15,13.74],[4.45,3.15,13.74],[-4.45,3.15,13.74]]);
          plate('ochre',padCorners);
          padCorners.forEach(function(p,i){var q=padCorners[(i+1)%4];plate('ochre',[[p[0],p[1],13.5],[q[0],q[1],13.5],q,p]);});
          [-1,1].forEach(function(side){
            block('light',[0,side*2.85,13.77],[3.65,.13,.03]);
            block('light',[side*4.05,0,13.77],[.13,2.45,.03]);
            // Alignment chevrons remain large enough to read at gameplay-ish zoom.
            plate('light',[[side*3.7,-.65,13.79],[side*3.7,.65,13.79],[side*2.9,0,13.79]]);
            plate('light',[[-.65,side*2.5,13.79],[.65,side*2.5,13.79],[0,side*1.95,13.79]]);
          });
          var collar=[[-2.3,-1],[-1.5,-1.8],[1.5,-1.8],[2.3,-1],[2.3,1],[1.5,1.8],[-1.5,1.8],[-2.3,1]];
          collar.forEach(function(p,i){var q=collar[(i+1)%8];
            var outerA=/** @type {V3} */ ([p[0],p[1],14.14]),outerB=/** @type {V3} */ ([q[0],q[1],14.14]);
            plate('steel',[outerA,outerB,[q[0]*.72,q[1]*.72,14.14],[p[0]*.72,p[1]*.72,14.14]]);
            plate('steel',[[p[0],p[1],13.75],[q[0],q[1],13.75],outerB,outerA]);
            plate('dark',[[p[0]*.72,p[1]*.72,13.82],[q[0]*.72,q[1]*.72,13.82],[q[0]*.72,q[1]*.72,14.14],[p[0]*.72,p[1]*.72,14.14]]);
          });
          plate('dark',collar.map(function(p){return /** @type {V3} */ ([p[0]*.72,p[1]*.72,13.83]);}));
          block('steel',[-.64,0,13.88],[.6,1.02,.05]);
          block('steel',[.64,0,13.88],[.6,1.02,.05]);
          // Four hardpoints provide alignment bumpers and obvious docking clamp sockets.
          [-1,1].forEach(function(x){[-1,1].forEach(function(y){
            block('steel',[x*3.65,y*2.4,13.98],[.64,.53,.23]);
            block('dark',[x*3.98,y*2.4,14.42],[.23,.53,.34]);
            block('ochre',[x*3.71,y*2.4,14.78],[.5,.55,.12]);
          });});
        }
        {
          {
            // Two-level pod hangs above an uninterrupted cargo deck.
            var plan=interiorCut==='lower',wallTop=plan?8.55:9.78,wallBottom=7.13;
            [-1,1].forEach(function(side){
              block('dark',[side*4.45,0,(wallBottom+wallTop)/2],[.15,3.6,(wallTop-wallBottom)/2]);
              block('dark',[0,side*3.45,(wallBottom+wallTop)/2],[4.3,.15,(wallTop-wallBottom)/2]);
              link('dark',[-4.45,side*3.45,8.8],[4.45,side*3.45,8.8],.16,.24);
              link('dark',[side*4.45,-3.45,8.8],[side*4.45,3.45,8.8],.16,.24);
            });
            // Downward airlock in the translation well, with a side pressure door.
            var lockTop=plan?8.55:9.78;
            [-1,1].forEach(function(side){
              block('steel',[2.75,side*1.5,(7.35+lockTop)/2],[1.45,.10,(lockTop-7.35)/2]);
              block('steel',[1.2,side*1.05,(7.35+lockTop)/2],[.10,.35,(lockTop-7.35)/2]);
            });
            block('steel',[4.25,0,(7.35+lockTop)/2],[.05,1.4,(lockTop-7.35)/2]);
            if(!plan)block('steel',[1.2,0,9.64],[.10,.7,.14]);
            // Static hatch and inner door are replaced by operable leaves in first person.
            block('light',[2.75,0,7.24],[1.43,1.38,.06]);
            if(!plan)block('light',[1.2,0,8.43],[.06,.68,1.05]);
            /** Floor/ceiling slabs share a clear microgravity translation opening.
             * @param {number} z @param {number} scale @param {number} thickness
             */
            function ringDeck(z,scale,thickness){
              // Clip four nonoverlapping floor regions to the actual faceted hull.
              var footprint=z<9?[[-4.3,-3.3],[4.3,-3.3],[4.3,3.3],[-4.3,3.3]]:cabinOutline;
              var boundary=footprint.map(function(p){return [p[0]*scale,p[1]*scale];});
              [[0,1.3,false],[0,4.2,true],[1,-1.4,false],[1,1.4,true]].forEach(function(region,index){
                var poly=boundary.map(function(p){return p.slice();});
                /** @param {number} axis @param {number} limit @param {boolean} greater */
                function clip(axis,limit,greater){
                  var out=/** @type {number[][]} */ ([]);
                  poly.forEach(function(p,i){var q=poly[(i+1)%poly.length],inside=greater?p[axis]>=limit:p[axis]<=limit,next=greater?q[axis]>=limit:q[axis]<=limit;
                    if(inside)out.push(p);
                    if(inside!==next){var t=(limit-p[axis])/(q[axis]-p[axis]);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
                  });poly=out;
                }
                if(index>=2){clip(0,1.3,true);clip(0,4.2,false);}
                clip(Number(region[0]),Number(region[1]),Boolean(region[2]));
                var top=poly.map(function(p){return /** @type {V3} */ ([p[0],p[1],z]);});
                plate('steel',top);plate('steel',top.map(function(p){return /** @type {V3} */ ([p[0],p[1],z-thickness]);}).reverse());
                top.forEach(function(p,i){var q=top[(i+1)%top.length];plate('steel',[p,[p[0],p[1],z-thickness],[q[0],q[1],z-thickness],q]);});
              });
            }
            ringDeck(7.35,1,.22);
            if(!plan){
              ringDeck(10,.96,.22);
              if(interiorCut==='upper')cabinOutline.forEach(function(p,i){var q=cabinOutline[(i+1)%8];link('dark',[p[0]*1.01,p[1]*1.01,10.18],[q[0]*1.01,q[1]*1.01,10.18],.08,.18);});
            }
            // Microgravity circulation: clear drift space with staggered stopping grips.
            var guideTop=plan?8.55:10.45;
            [-1,1].forEach(function(side){
              link('steel',[3.95,side*1.08,4.9],[3.95,side*1.08,guideTop],.035);
            });
            // Individual U-shaped handles, offset between sides rather than ladder rungs.
            /** @param {number} x @param {number} y @param {number} z @param {number} side */
            function grab(x,y,z,side){
              link('light',[x,y,z-.20],[x-side*.22,y,z-.20],.035);
              link('light',[x-side*.22,y,z-.20],[x-side*.22,y,z+.20],.035);
              link('light',[x-side*.22,y,z+.20],[x,y,z+.20],.035);
            }
            for(var grip=0;grip<7;grip++){
              var gripZ=5.25+grip*.8;
              if(gripZ+.2<guideTop)grab(3.95,grip%2?1.08:-1.08,gripZ,1);
            }
            // Entry and staging grips give crew places to arrest motion and redirect.
            grab(-4.28,.35,8.15,-1);grab(-2.16,-2.9,8.15,-1);
            if(!plan){
              // Short rim grips mark the bridge arrival without fencing off the opening.
              link('light',[1.5,-1.62,10.3],[2.15,-1.62,10.3],.04);
              link('light',[3.2,1.62,10.3],[3.85,1.62,10.3],.04);
              // Free-floating roof transfer: staggered grabs beneath the docking hatch.
              link('steel',[-.85,0,10.35],[-.85,0,13.45],.035);
              for(var roofGrip=0;roofGrip<4;roofGrip++)grab(-.85,roofGrip%2?.24:-.24,10.65+roofGrip*.8,-1);
            }
          }
          // Continuous lookout glazing on all eight faces, interrupted by structural posts.

          // Leave the cargo work floor clear under and around the suspended pod.

        }
      }
    cabinCache[key]=groups;return groups;
  }

  /** @type {Record<string,number[]> | null} */ var rigFixtureCache=null;
  /** Shared hooded lamps, conductive yokes and radiator fins; no per-frame rebuild. */
  function miningPlatformLights(){
    if(rigFixtureCache)return rigFixtureCache;
    /** @type {Record<string,number[]>} */ var groups={steel:[],dark:[],lamp:[],marker:[]};
    const lights=DW.miningLights;if(!lights)return groups;
    var box=DW.meshBuilder.create(groups).block;
    lights.mounts.forEach(function(m){
      var axes=lights.basis(m.target.map(function(v,k){return v-m.position[k];}));
      /** @param {number} x @param {number} y @param {number} z */
      function at(x,y,z){return m.position.map(function(v,k){return v+axes[0][k]*x+axes[1][k]*y+axes[2][k]*z;});}
      box('dark',at(0,0,-.34),[.62,.34,.32],axes);
      box('steel',at(0,0,-.63),[.68,.39,.06],axes);
      for(var fin=-2;fin<=2;fin++)box('steel',at(fin*.24,0,-.78),[.035,.35,.14],axes);
      box('lamp',at(0,0,.015),[.5,.24,.025],axes);
      // Deep visor and cheeks protect the face without blocking its wide beam.
      box('steel',at(0,.34,.06),[.65,.045,.18],axes);
      [-1,1].forEach(function(side){box('dark',at(side*.60,0,.04),[.045,.30,.15],axes);box('steel',at(side*.76,0,-.32),[.075,.4,.08],axes);});
      var delta=m.position.map(function(v,k){return v-m.anchor[k];}),length=Math.hypot.apply(null,delta);
      box('steel',m.position.map(function(v,k){return (v+m.anchor[k])/2;}),[.12,.12,length/2],lights.basis(delta));
    });
    // Repeated bay fixtures represent an array; the shader evaluates one broad cargo field.
    [-12,-7,-2,3,8,13].forEach(function(x){[-1,1].forEach(function(side){
      box('dark',[x,side*8.7,5.9],[.29,.17,.13],[[1,0,0],[0,1,0],[0,0,1]]);
      box('lamp',[x,side*8.7,5.75],[.20,.09,.025],[[1,0,0],[0,1,0],[0,0,1]]);
    });});
    box('dark',[4.5,0,7.24],[.20,.14,.08],[[1,0,0],[0,1,0],[0,0,1]]);
    box('lamp',[4.5,0,7.14],[.12,.075,.025],[[1,0,0],[0,1,0],[0,0,1]]);
    // Low-profile heads graze the roof toward the docking coaming; outside the clear pad.
    [-1,1].forEach(function(x){[-1,1].forEach(function(y){
      var center=[x*4.85,y*3.55,13.88],axes=lights.basis([-center[0],-center[1],.16]);
      box('dark',center,[.42,.15,.18],axes);
      box('steel',center.map(function(v,k){return v-axes[2][k]*.20;}),[.45,.18,.035],axes);
      box('lamp',center.map(function(v,k){return v+axes[2][k]*.19;}),[.32,.09,.025],axes);
    });});
    // Low-power approach references; illumination is approximated by broad worksite fields.
    [-1,1].forEach(function(x){[-1,1].forEach(function(y){box('dark',[x*3.6,y*2.3,13.82],[.42,.19,.08],[[1,0,0],[0,1,0],[0,0,1]]);box('marker',[x*3.6,y*2.3,13.92],[.30,.09,.025],[[1,0,0],[0,1,0],[0,0,1]]);});});
    rigFixtureCache=groups;return groups;
  }

  DW.miningRig={geometry:miningPlatformGeometry,ramps:rampGeometry,infill:infillGeometry,legs:legGeometry,lights:miningPlatformLights};
})(window);
