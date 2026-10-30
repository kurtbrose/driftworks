(function(){
  'use strict';
  var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
  /** @typedef {[number,number,number]} V3 */
  /** @typedef {import('./types').Vec2} Vec2 */
  var boxMesh=DW.meshBuilder.boxMesh;
  /** Translate the existing rounded 72 x 34 habitat silhouette into a drum. */
  /** @param {number} [segments] */
  function habitatMesh(segments) {
    var count = segments || 96;
    /** @type {number[]} */ var data = [];
    var capSteps=count/8, rings=/** @type {number[]} */ ([]);
    for(var cap=capSteps;cap>=0;cap--)rings.push(-31-5*Math.sin(cap*Math.PI/(2*capSteps)));
    for(var cap=0;cap<=capSteps;cap++)rings.push(31+5*Math.sin(cap*Math.PI/(2*capSteps)));
    /** @param {number} x */
    function radius(x) { return Math.abs(x) <= 31 ? 17 : 12 + Math.sqrt(Math.max(0, 25 - Math.pow(Math.abs(x) - 31, 2))); }
    /** @param {number} x @param {number} angle @param {number} [cap] */
    function vertex(x, angle, cap) {
      var r = radius(x), slope = Math.abs(x) <= 31 ? 0 : -(Math.abs(x) - 31) * Math.sign(x) / Math.sqrt(Math.max(.001, 25 - Math.pow(Math.abs(x) - 31, 2)));
      var length = Math.hypot(1, slope);
      data.push(x, r * Math.sin(angle), r * Math.cos(angle), cap || -slope / length, cap ? 0 : Math.sin(angle) / length, cap ? 0 : Math.cos(angle) / length);
    }
    for (var ring = 0; ring < rings.length - 1; ring++) for (var i = 0; i < count; i++) {
      var a = i * Math.PI * 2 / count, b = (i + 1) * Math.PI * 2 / count;
      vertex(rings[ring], a); vertex(rings[ring + 1], a); vertex(rings[ring + 1], b);
      vertex(rings[ring], a); vertex(rings[ring + 1], b); vertex(rings[ring], b);
    }
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < count; i++) {
        data.push(side * 36, 0, 0, side, 0, 0);
        vertex(side * 36, i * Math.PI * 2 / count, side); vertex(side * 36, (i + 1) * Math.PI * 2 / count, side);
      }
    });
    return new Float32Array(data);
  }

  /** Rounded extrusions for the original bearing, spine and fixed machinery. */
  /** @param {number} width @param {number} length @param {number} depth @param {number} radius */
  function roundedHullMesh(width, length, depth, radius) {
    /** @type {number[]} */ var data = [];
    /** @type {Vec2[]} */ var outline = [];
    for (var corner = 0; corner < 4; corner++) {
      var angle = corner * Math.PI / 2;
      var cx = Math.cos(angle + Math.PI / 4) > 0 ? width / 2 - radius : -width / 2 + radius;
      var cy = Math.sin(angle + Math.PI / 4) > 0 ? length / 2 - radius : -length / 2 + radius;
      for (var i = 0; i <= 8; i++) { var t = angle + i * Math.PI / 16; outline.push({ x: cx + Math.cos(t) * radius, y: cy + Math.sin(t) * radius }); }
    }
    outline.forEach(function (p, i) {
      var q = outline[(i + 1) % outline.length], nx = q.y - p.y, ny = p.x - q.x;
      var len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      data.push(p.x,p.y,-depth/2,nx,ny,0, q.x,q.y,-depth/2,nx,ny,0, q.x,q.y,depth/2,nx,ny,0,
        p.x,p.y,-depth/2,nx,ny,0, q.x,q.y,depth/2,nx,ny,0, p.x,p.y,depth/2,nx,ny,0);
      [-1, 1].forEach(function (side) { data.push(0,0,side*depth/2,0,0,side, p.x,p.y,side*depth/2,0,0,side, q.x,q.y,side*depth/2,0,0,side); });
    });
    return new Float32Array(data);
  }

  /** Keep circular silhouette error below roughly half a screen pixel. */
  /** @param {number} radiusPixels */
  function habitatLod(radiusPixels) {
    return radiusPixels > 2000 ? 384 : radiusPixels > 500 ? 192 : 96;
  }

  /** Static station hardware is batched by finish, with no per-detail draw calls. */
  /** @param {number} [detail] */
  function mothershipHardware(detail) {
    var refinement=detail || 1;
    /** @param {V3} v @returns {V3} */
    function normalize3(v){var length=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/length,v[1]/length,v[2]/length];}
    /** @param {V3} a @param {V3} b @returns {V3} */
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @type {Record<string, number[]>} */ var groups = {};
    /** @param {string} material @param {V3} a @param {V3} b @param {number} radius @param {number} [sides] */
    function tube(material, a, b, radius, sides) {
      var count = Math.min(64,(sides || 8)*refinement), axis = normalize3([b[0]-a[0],b[1]-a[1],b[2]-a[2]]);
      var right = normalize3(cross(axis, Math.abs(axis[2]) < .9 ? [0,0,1] : [0,1,0])), up = cross(axis,right);
      var data = groups[material] || (groups[material] = []);
      /** @param {V3} center @param {number} angle @param {number} [cap] */
      function vertex(center, angle, cap) {
        var n = right.map(function(v,i){return v*Math.cos(angle)+up[i]*Math.sin(angle);});
        data.push(center[0]+n[0]*radius,center[1]+n[1]*radius,center[2]+n[2]*radius,
          cap ? axis[0]*cap : n[0],cap ? axis[1]*cap : n[1],cap ? axis[2]*cap : n[2]);
      }
      for(var i=0;i<count;i++) {
        var p=i*Math.PI*2/count,q=(i+1)*Math.PI*2/count;
        vertex(a,p);vertex(b,p);vertex(b,q);vertex(a,p);vertex(b,q);vertex(a,q);
        [a,b].forEach(function(center,j){var sign=j?1:-1;data.push(center[0],center[1],center[2],axis[0]*sign,axis[1]*sign,axis[2]*sign);vertex(center,p,sign);vertex(center,q,sign);});
      }
    }
    /** @param {string} material @param {V3} center @param {V3} size */
    function block(material,center,size) {
      var data=groups[material]||(groups[material]=[]), source=boxMesh();
      for(var i=0;i<source.length;i+=6)data.push(center[0]+source[i]*size[0],center[1]+source[i+1]*size[1],center[2]+source[i+2]*size[2],source[i+3],source[i+4],source[i+5]);
    }
    /** @param {string} material @param {number} x @param {number} radius @param {number} thickness */
    function ring(material,x,radius,thickness) {
      var data=groups[material]||(groups[material]=[]), count=96*refinement, sides=8+2*Math.log2(refinement);
      /** @param {number} along @param {number} around */
      function vertex(along,around){
        var nx=Math.sin(around), radial=Math.cos(around), ny=Math.sin(along)*radial,nz=Math.cos(along)*radial;
        data.push(x+thickness*nx,Math.sin(along)*(radius+thickness*radial),Math.cos(along)*(radius+thickness*radial),nx,ny,nz);
      }
      for(var i=0;i<count;i++)for(var j=0;j<sides;j++){
        var a=i*Math.PI*2/count,b=(i+1)*Math.PI*2/count,c=j*Math.PI*2/sides,d=(j+1)*Math.PI*2/sides;
        vertex(a,c);vertex(b,c);vertex(b,d);vertex(a,c);vertex(b,d);vertex(a,d);
      }
    }
    // Fixed bearing cages embrace the spinning shell; axial hubs remain stationary.
    [-38,38].forEach(function(x){
      ring('metal',x,18.3,.65);ring('dark',x,16.8,1.1);
      tube('metal',[x-2,0,0],[x+2,0,0],4,24);
      for(var i=0;i<8;i++){var a=i*Math.PI/4;tube('metal',[x,Math.sin(a)*4,Math.cos(a)*4],[x,Math.sin(a)*17,Math.cos(a)*17],.45);}
      tube('metal',[x,0,0],[x+(x<0?-6:6),0,0],2.6,24);
      ring('orange',x+(x<0?-2:2),4.2,.25);
    });
    // Coaxial fixed structure extends from the two habitat hubs.
    [-1,1].forEach(function(end){
      [-4,4].forEach(function(y){[-4,4].forEach(function(z){tube('metal',[end*42,y,z],[end*64,y,z],.4);});});
      for(var x=42;x<64;x+=5.5){
        [-4,4].forEach(function(z){tube('metal',[end*x,-4,z],[end*(x+5.5),4,z],.24);});
        [-4,4].forEach(function(y){tube('metal',[end*x,y,-4],[end*(x+5.5),y,4],.24);});
      }
      tube('shell',[end*44,0,0],[end*53,0,0],3.2,24);
      tube('dark',[end*48,0,0],[end*48.6,0,0],3.3,24);
      // Local tank cluster follows the same longitudinal axis.
      [-1,1].forEach(function(side){
        tube('tank',[end*54,side*6,0],[end*62,side*6,0],2,16);
        tube('orange',[end*54,side*6,0],[end*54.3,side*6,0],2.1,16);
        tube('metal',[end*54,side*4,-2],[end*62,side*6,-2],.2);
      });
    });
    // Aft thermal wings attach beyond the drum, keeping the habitat unobstructed.
    [-1,1].forEach(function(side){
      tube('metal',[51,side*4,0],[51,side*31,0],.45);
      for(var i=0;i<3;i++){
        var y=side*(12+i*8);
        block('thermal',[53,y,0],[9,3.5,.18]);
        [-9,0,9].forEach(function(d){block('metal',[53+d,y,.25],[.12,3.5,.12]);});
        for(var j=-8;j<=8;j+=2)block('dark',[53+j,y,.22],[.06,3.3,.04]);
        tube('metal',[43,side*4,0],[44,y,0],.18);
      }
      // Forward docking arms, service deck and a small collar.
      tube('metal',[-56,side*3,0],[-56,side*13,0],1,16);
      tube('dark',[-56,side*13,0],[-56,side*15,0],1.7,24);
      tube('orange',[-56,side*15,0],[-56,side*15.3,0],1.8,24);
      block('dark',[-56,side*9,-2],[4,3,.25]);
      tube('metal',[-60,side*6,-1],[-60,side*12,-1],.12);
      tube('metal',[-52,side*6,-1],[-52,side*12,-1],.12);
      block('light',[-54,side*15,0],[.2,.2,.2]);
    });
    // Utility shuttle at the forward collar; propulsion points aft along X.
    tube('shell',[-56,16.2,0],[-56,18.5,0],.55,12);
    block('dark',[-56,17.7,.55],[.4,.4,.1]);
    block('orange',[-56,18.5,0],[.6,.15,.6]);
    [-3,3].forEach(function(y){
      tube('tank',[63,y,0],[67,y,0],1.5,16);
      tube('dark',[67,y,0],[71,y,0],2,20);
      tube('metal',[70.5,y,0],[71,y,0],2.2,20);
    });
    tube('metal',[-64,0,0],[-71,0,4],.15);block('light',[-71,0,4],[.25,.25,.25]);
    // Drum ribs and access tracks rotate as a single batched mesh about its axis.
    [-30,-20,-10,0,10,20,30].forEach(function(x){ring('rotor',x,17.12,.16);});
    for(var i=0;i<12;i++){var a=i*Math.PI/6;tube('rotor',[-31,Math.sin(a)*17.14,Math.cos(a)*17.14],[31,Math.sin(a)*17.14,Math.cos(a)*17.14],.09,6);}
    return groups;
  }

  DW.stationModels={habitatMesh:habitatMesh,roundedHullMesh:roundedHullMesh,habitatLod:habitatLod,mothershipHardware:mothershipHardware};
}());
