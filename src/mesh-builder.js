(function(global){
  'use strict';
  /** @typedef {[number,number,number]} V3 */
  var DW=/** @type {import('./types').DriftworksNamespace} */ (global.Driftworks);
  /** @returns {Float32Array} */
  function boxMesh() {
    /** @type {number[]} */ var data = [];
    var faces = [[0, 1, 2], [0, 2, 3]];
    for (var axis = 0; axis < 3; axis++) for (var sign = -1; sign <= 1; sign += 2) {
      var a = (axis + 1) % 3, b = (axis + 2) % 3;
      var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      faces.forEach(function (face) { face.forEach(function (i) {
        var p = [0, 0, 0], normal = [0, 0, 0];
        p[axis] = sign; p[a] = corners[i][0]; p[b] = corners[i][1]; normal[axis] = sign;
        data.push.apply(data, p.concat(normal));
      }); });
    }
    return new Float32Array(data);
  }

  // Shared template stays private; callers own their output arrays.
  var unitCube=boxMesh();
  /** @param {Record<string,number[]>} groups */
  function create(groups){
    var cube = unitCube;
    /** @param {string} material @param {number[]} center @param {number[]} size @param {number[][]} [basis] */
    function block(material, center, size, basis) {
      var axes = basis || [[1,0,0],[0,1,0],[0,0,1]], out = groups[material];
      for (var i=0;i<cube.length;i+=6) {
        for (var k=0;k<3;k++) out.push(center[k]+axes[0][k]*cube[i]*size[0]+axes[1][k]*cube[i+1]*size[1]+axes[2][k]*cube[i+2]*size[2]);
        for (var k=0;k<3;k++) out.push(axes[0][k]*cube[i+3]+axes[1][k]*cube[i+4]+axes[2][k]*cube[i+5]);
      }
    }
    /** @param {string} material @param {number[]} a @param {number[]} b @param {number} width @param {number} [depth] */
    function link(material,a,b,width,depth) {
      var delta=/** @type {V3} */ ([b[0]-a[0],b[1]-a[1],b[2]-a[2]]), len=Math.hypot.apply(null,delta);
      var x=/** @type {V3} */ (delta.map(function(v){return v/len;}));
      var h=Math.hypot(x[0],x[1]);
      var y=/** @type {V3} */ (h>1e-8?[-x[1]/h,x[0]/h,0]:[0,1,0]);
      var z=/** @type {V3} */ ([-x[2]*y[1],x[2]*y[0],x[0]*y[1]-x[1]*y[0]]);
      block(material,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[len/2,width,depth===undefined?width:depth],[x,y,z]);
    }
      /** Flat-shaded polygon: every triangle in a plate shares one face normal.
       * @param {string} material @param {number[][]} points
       */
      function plate(material,points) {
        var a=points[0],b=points[1],c=points[2];
        var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
        var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot.apply(null,n);
        for(var i=1;i<points.length-1;i++)[a,points[i],points[i+1]].forEach(function(p){groups[material].push(p[0],p[1],p[2],n[0]/length,n[1]/length,n[2]/length);});
      }
      /** Functional pivot/actuator cylinder aligned to its actual joint axis.
       * @param {string} material @param {number[]} a @param {number[]} b @param {number} radius
       */
      function jointBarrel(material,a,b,radius){
        var axis=b.map(function(v,k){return v-a[k];}),length=Math.hypot.apply(null,axis);axis=axis.map(function(v){return v/length;});
        var h=Math.hypot(axis[0],axis[1]),right=h>1e-8?[-axis[1]/h,axis[0]/h,0]:[0,1,0];
        var up=[axis[1]*right[2]-axis[2]*right[1],axis[2]*right[0]-axis[0]*right[2],axis[0]*right[1]-axis[1]*right[0]];
        /** @param {number[]} center @param {number} angle @returns {V3} */
        function rim(center,angle){return /** @type {V3} */ (center.map(function(v,k){return v+radius*(right[k]*Math.cos(angle)+up[k]*Math.sin(angle));}));}
        for(var n=0;n<8;n++){var angle=n*Math.PI/4,next=angle+Math.PI/4;plate(material,[rim(a,angle),rim(a,next),rim(b,next),rim(b,angle)]);plate(material,[a,rim(a,next),rim(a,angle)]);plate(material,[b,rim(b,angle),rim(b,next)]);}
      }
    return {block:block,link:link,plate:plate,barrel:jointBarrel};
  }
  DW.meshBuilder={create:create,boxMesh:boxMesh};
})(window);
