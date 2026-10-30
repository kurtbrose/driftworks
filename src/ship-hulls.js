(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('../experiments/types').Pack} Pack */
    /** @typedef {import('../experiments/types').Model} Model */
    /** @typedef {import('../experiments/types').Pose} Pose */
    /** @typedef {import('../experiments/types').Batch} Batch */
    /** @typedef {import('../experiments/types').ArtCraft} ArtCraft */
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/types').Images} Images */
    /** @typedef {import('../experiments/types').HullHit} HullHit */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {Vector} a @param {Vector} b */
    function dot3(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    /** @param {Vector} a @param {Vector} b */
    function minus(a, b) {
        return a.map(function (v, i) {
            return v - b[i];
        });
    }
    /** @param {Vector} a @param {Vector} b */
    function cross3(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    /** @param {Vector} a @param {Vector} b @param {Vector} c */
    function normal(a, b, c) {
        var n = cross3(minus(b, a), minus(c, a)), l = Math.hypot.apply(null, n) || 1;
        return n.map(function (v) {
            return v / l;
        });
    }
    /** @param {Pose} p @param {Vector} world @param {number} units */
    function localPoint(p, world, units) {
        var d = minus(world, p.eye);
        return [dot3(d, p.right) * units, -dot3(d, p.back) * units, dot3(d, p.up) * units];
    }
    /** Sweep a spherical bolt head against a triangle's face, edge capsules and vertices.
     * All inputs are model-local metres; returns the first surface contact.
     * @param {Vector} a @param {Vector} d @param {Vector[]} tri @param {number} r
     * @returns {{fraction:number; local:Vector; normal:Vector} | null} */
    function boltTriangle(a, d, tri, r) {
        var p=tri[0],q=tri[1],v=tri[2];
        var ex=q[0]-p[0],ey=q[1]-p[1],ez=q[2]-p[2],fx=v[0]-p[0],fy=v[1]-p[1],fz=v[2]-p[2];
        var nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,length=Math.hypot(nx,ny,nz)||1;
        nx/=length;ny/=length;nz/=length;
        var ee=ex*ex+ey*ey+ez*ez,ef=ex*fx+ey*fy+ez*fz,ff=fx*fx+fy*fy+fz*fz,denom=ee*ff-ef*ef;
        var ox=a[0]-p[0],oy=a[1]-p[1],oz=a[2]-p[2],height=ox*nx+oy*ny+oz*nz,speed=d[0]*nx+d[1]*ny+d[2]*nz;
        var best=Infinity,bx=0,by=0,bz=0;
        if(denom>1e-15)for(var face=0;face<2;face++){
            var side=face?r:-r,t=Math.abs(height)<=r?0:Math.abs(speed)>1e-15?(side-height)/speed:-1;
            if(t<0||t>1)continue;
            var cx=a[0]+d[0]*t,cy=a[1]+d[1]*t,cz=a[2]+d[2]*t;
            var h=(cx-p[0])*nx+(cy-p[1])*ny+(cz-p[2])*nz;
            cx-=nx*h;cy-=ny*h;cz-=nz*h;
            var vx=cx-p[0],vy=cy-p[1],vz=cz-p[2],ve=vx*ex+vy*ey+vz*ez,vf=vx*fx+vy*fy+vz*fz;
            var u=(ve*ff-vf*ef)/denom,w=(vf*ee-ve*ef)/denom;
            if(u>=-1e-9&&w>=-1e-9&&u+w<=1+1e-9&&t<best){best=t;bx=cx;by=cy;bz=cz;}
        }
        var planeEntry=Math.abs(height)<=r?0:Math.abs(speed)>1e-15?((height>0?r:-r)-height)/speed:-1;
        if(best!==planeEntry)for(var corner=0;corner<3;corner++){
            var point=tri[corner],next=tri[(corner+1)%3];
            var vertex=boltEntry(a[0]-point[0],a[1]-point[1],a[2]-point[2],d[0],d[1],d[2],r);
            if(vertex!==null&&vertex<best){best=vertex;bx=point[0];by=point[1];bz=point[2];}
            var dx=next[0]-point[0],dy=next[1]-point[1],dz=next[2]-point[2],edgeLength=dx*dx+dy*dy+dz*dz;
            if(edgeLength<1e-15)continue;
            var ax=a[0]-point[0],ay=a[1]-point[1],az=a[2]-point[2];
            var along=(ax*dx+ay*dy+az*dz)/edgeLength,rate=(d[0]*dx+d[1]*dy+d[2]*dz)/edgeLength;
            var edge=boltEntry(ax-dx*along,ay-dy*along,az-dz*along,d[0]-dx*rate,d[1]-dy*rate,d[2]-dz*rate,r);
            if(edge===null)continue;
            var distance=along+rate*edge;
            if(distance>=0&&distance<=1&&edge<best){best=edge;bx=point[0]+dx*distance;by=point[1]+dy*distance;bz=point[2]+dz*distance;}
        }
        return best===Infinity?null:{fraction:best,local:[bx,by,bz],normal:[nx,ny,nz]};
    }
    /** Scalar sphere/cylinder entry; avoids temporary vectors per triangle edge.
     * @param {number} x @param {number} y @param {number} z
     * @param {number} dx @param {number} dy @param {number} dz @param {number} r */
    function boltEntry(x,y,z,dx,dy,dz,r){
        var c=x*x+y*y+z*z-r*r;if(c<=0)return 0;
        var aa=dx*dx+dy*dy+dz*dz,b=x*dx+y*dy+z*dz,disc=b*b-aa*c;
        if(aa<1e-15||disc<0)return null;
        var t=(-b-Math.sqrt(disc))/aa;return t>=0&&t<=1?t:null;
    }
    /** @type {WeakMap<Model, number>} */
    var hullBounds = new WeakMap();
    /** Rotation-independent source-mesh bound, in metres. @param {Model} model */
    function hullRadius(model) {
        var radius=hullBounds.get(model);
        if(radius===undefined&&model.hullIndex&&model.hullIndex.version===1&&model.hullIndex.vertexCount===model.vertices.length)radius=model.hullIndex.radius;
        if(radius===undefined){radius=0;for(var i=0;i<model.vertices.length;i+=6)radius=Math.max(radius,Math.hypot(model.vertices[i],model.vertices[i+1],model.vertices[i+2]));hullBounds.set(model,radius);}
        return radius;
    }
    /** @typedef {{min:number[],max:number[],offsets:number[]|null,left:HullTree|null,right:HullTree|null}} HullTree */
    /** @type {WeakMap<Model,HullTree>} */var hullTrees=new WeakMap();
    /** @param {Model} model */
    function hullTree(model){
        var tree=hullTrees.get(model);
        if(!tree){var baked=model.hullIndex;if(baked&&baked.version===1&&baked.vertexCount===model.vertices.length)tree=baked.tree;
            else {var offsets=/** @type {number[]} */([]);for(var i=0;i<model.vertices.length;i+=18)offsets.push(i);tree=buildHullTree(model.vertices,offsets);}
            hullTrees.set(model,tree);
        }return tree;
    }
    /** Immutable source meshes get one median-split triangle index.
     * @param {number[]} vertices @param {number[]} offsets @returns {HullTree} */
    function buildHullTree(vertices,offsets){
        var min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
        offsets.forEach(function(offset){for(var corner=0;corner<3;corner++)for(var axis=0;axis<3;axis++){
            var v=vertices[offset+corner*6+axis];min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);
        }});
        if(offsets.length<=12)return {min:min,max:max,offsets:offsets,left:null,right:null};
        var axis=max[1]-min[1]>max[0]-min[0]?1:0;if(max[2]-min[2]>max[axis]-min[axis])axis=2;
        offsets.sort(function(a,b){return vertices[a+axis]+vertices[a+6+axis]+vertices[a+12+axis]-vertices[b+axis]-vertices[b+6+axis]-vertices[b+12+axis];});
        var middle=Math.floor(offsets.length/2);
        return {min:min,max:max,offsets:null,left:buildHullTree(vertices,offsets.slice(0,middle)),right:buildHullTree(vertices,offsets.slice(middle))};
    }
    /** @param {HullTree} node @param {Vector} a @param {Vector} d @param {number} padding */
    function intersectsHullNode(node,a,d,padding){
        var lo=0,hi=1;
        for(var axis=0;axis<3;axis++){
            var min=node.min[axis]-padding,max=node.max[axis]+padding;
            if(Math.abs(d[axis])<1e-12){if(a[axis]<min||a[axis]>max)return null;continue;}
            var one=(min-a[axis])/d[axis],two=(max-a[axis])/d[axis];
            lo=Math.max(lo,Math.min(one,two));hi=Math.min(hi,Math.max(one,two));if(lo>hi)return null;
        }return lo;
    }
    /** @param {Model} model @param {Vector} a @param {Vector} d @param {number} padding */
    function hullCandidates(model,a,d,padding){
        var tree=hullTree(model);
        var stack=[tree],result=/** @type {{offsets:number[],entry:number}[]} */([]);
        while(stack.length){var node=stack.pop();if(!node)continue;var entry=intersectsHullNode(node,a,d,padding);if(entry===null)continue;
            if(node.offsets)result.push({offsets:node.offsets,entry:entry});else {if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}
        }
        return result.sort(function(a,b){return a.entry-b.entry;});
    }
    // Synchronous hull queries do not nest; scratch storage never escapes a query.
    /** @type {HullTree[]} */var hitStack=[];
    var hitTriangle=[[0,0,0],[0,0,0],[0,0,0]];
    /** @param {Model} model @param {Pose} pose @param {Vector} start @param {Vector} end @param {number} units @param {number} [boltRadius] */
    function hullHit(model, pose, start, end, units, boltRadius) {
        var a = localPoint(pose, start, units), d = minus(localPoint(pose, end, units), a), v = model.vertices, best = /** @type {HullHit | null} */ (null);
        var radius = hullRadius(model);
        var padding = boltRadius || 0;
        var span = dot3(d, d), fraction = span ? Math.max(0, Math.min(1, -dot3(a, d) / span)) : 0;
        if (Math.hypot.apply(null, a.map(function (x, j) {
            return x + d[j] * fraction;
        })) > radius + padding)
            return null;
        // Warm the shared tree once; traverse directly instead of collecting/sorting leaves.
        var tree=hullTree(model),stack=hitStack;stack.length=0;stack.push(tree);
        var bestOffset=Infinity,tri=hitTriangle;
        while(stack.length) {
          var leaf=stack.pop();if(!leaf)continue;
          var entry=intersectsHullNode(leaf,a,d,padding);if(entry===null||best&&entry>best.fraction)continue;
          if(!leaf.offsets){
            var left=leaf.left,right=leaf.right,l=left?intersectsHullNode(left,a,d,padding):null,r=right?intersectsHullNode(right,a,d,padding):null;
            if(l!==null&&r!==null&&left&&right){if(l<r){stack.push(right,left);}else{stack.push(left,right);}}
            else {if(l!==null&&left)stack.push(left);if(r!==null&&right)stack.push(right);}continue;
          }
          for(var triangleIndex=0;triangleIndex<leaf.offsets.length;triangleIndex++) {
            var i=leaf.offsets[triangleIndex];
            if (padding > 0) {
                // Reject triangles outside the short swept bolt bounds before
                // constructing face/edge tests on detailed meshes.
                var outside = false;
                for (var axis = 0; axis < 3; axis++) {
                    var segmentEndAxis=a[axis]+d[axis]*(best?best.fraction:1);
                    var lo = Math.min(a[axis],segmentEndAxis)-padding, hi = Math.max(a[axis],segmentEndAxis)+padding;
                    if (Math.min(v[i+axis],v[i+6+axis],v[i+12+axis])>hi || Math.max(v[i+axis],v[i+6+axis],v[i+12+axis])<lo) { outside=true; break; }
                }
                if(outside) continue;
                for(var corner=0;corner<3;corner++)for(var component=0;component<3;component++)tri[corner][component]=v[i+corner*6+component];
                var contact = boltTriangle(a,d,tri,padding);
                if(contact && (!best || contact.fraction < best.fraction || contact.fraction===best.fraction&&i<bestOffset)) {
                    bestOffset=i;
                    var local=contact.local;
                    best={fraction:contact.fraction,local:local,normal:contact.normal,model:model,
                        point:pose.eye.map(function(x,j){return x+(pose.right[j]*local[0]-pose.back[j]*local[1]+pose.up[j]*local[2])/units;})};
                }
                continue;
            }
            var p = v.slice(i, i + 3), e = minus(v.slice(i + 6, i + 9), p), f = minus(v.slice(i + 12, i + 15), p);
            var h = cross3(d, f), det = dot3(e, h);
            if (Math.abs(det) < 1e-10)
                continue;
            var offset = minus(a, p), u = dot3(offset, h) / det;
            if (u < 0 || u > 1)
                continue;
            var q = cross3(offset, e), w = dot3(d, q) / det;
            if (w < 0 || u + w > 1)
                continue;
            var t = dot3(f, q) / det;
            if (t < 0 || t > 1 || best && (t > best.fraction || t===best.fraction&&i>=bestOffset))
                continue;
            var n = normal(p, v.slice(i + 6, i + 9), v.slice(i + 12, i + 15));
            bestOffset=i;best = { fraction: t, point: start.map(function (x, j) {
                    return x + (end[j] - x) * t;
                }),
                local: a.map(function (x, j) {
                    return x + d[j] * t;
                }), normal: n, model: model };
          }
        }
        return best;
    }
    // A convex triangle clipped by fourteen planes has at most seventeen vertices.
    // Synchronous projection owns scratch buffers; only finished numeric layers escape.
    var scorchPolyA=new Float64Array(64*3),scorchPolyB=new Float64Array(64*3);
    /** @param {ArtCraft} e @param {HullHit} hit */
    function addScorch(e, hit) {
        var n = hit.normal, center = hit.local, axis = Math.abs(n[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
        var tangent = normal([0, 0, 0], n, axis), side = cross3(n, tangent), layers = /** @type {number[][]} */ ([[], [], [], [], []]);
        var planes=[n,n.map(function(x){return -x;})],limits=/** @type {number[][]} */([]),radii=[.78,.63,.48,.33,.18];
        for(var edge=0;edge<12;edge++){var angle=edge*Math.PI/6;planes.push(tangent.map(function(x,k){return x*Math.cos(angle)+side[k]*Math.sin(angle);}));}
        for(var layer=0;layer<5;layer++){var values=[.3,.3];for(var edge=0;edge<12;edge++)values.push(radii[layer]*(1+.22*Math.sin(edge*7.3+center[0]*2.1+center[1]*3.7+center[2])));limits.push(values);}
        // Clip a small polygonal burn to nearby hull triangles. No floating quads,
        // back-side bleed, textures, or per-frame mesh projection.
        var v = hit.model.vertices;
        var offsets=hullCandidates(hit.model,center,[0,0,0],1.4).flatMap(function(leaf){return leaf.offsets;}).sort(function(a,b){return a-b;});
        for (var triangleIndex=0;triangleIndex<offsets.length;triangleIndex++) {
            var i=offsets[triangleIndex];
            var tri = [v.slice(i, i + 3), v.slice(i + 6, i + 9), v.slice(i + 12, i + 15)], face = normal(tri[0], tri[1], tri[2]);
            if (dot3(face, n) < .35 || [0, 1, 2].some(function (k) {
                return Math.min(tri[0][k], tri[1][k], tri[2][k]) > center[k] + 1.4 || Math.max(tri[0][k], tri[1][k], tri[2][k]) < center[k] - 1.4;
            }))
                continue;
            for(var layer=0;layer<5;layer++){
                var input=scorchPolyA,output=scorchPolyB,count=3;
                for(var corner=0;corner<3;corner++)for(var component=0;component<3;component++)input[corner*3+component]=tri[corner][component];
                for(var plane=0;plane<14&&count;plane++){
                    var direction=planes[plane],limit=limits[layer][plane],written=0;
                    for(var vertex=0;vertex<count;vertex++){
                        var next=(vertex+1)%count,ai=vertex*3,bi=next*3;
                        var da=(input[ai]-center[0])*direction[0]+(input[ai+1]-center[1])*direction[1]+(input[ai+2]-center[2])*direction[2]-limit;
                        var db=(input[bi]-center[0])*direction[0]+(input[bi+1]-center[1])*direction[1]+(input[bi+2]-center[2])*direction[2]-limit;
                        if(da<=0){for(var k=0;k<3;k++)output[written*3+k]=input[ai+k];written++;}
                        if((da<=0)!==(db<=0)){var t=da/(da-db);for(var k=0;k<3;k++)output[written*3+k]=input[ai+k]+(input[bi+k]-input[ai+k])*t;written++;}
                    }
                    var swap=input;input=output;output=swap;count=written;
                }
                for(var j=1;j+1<count;j++)for(var corner=0;corner<3;corner++){
                    var offset=(corner===0?0:corner===1?j:j+1)*3;
                    for(var k=0;k<3;k++)layers[layer].push(input[offset+k]+face[k]*(.012+layer*.004));
                    layers[layer].push(face[0],face[1],face[2]);
                }
            }
        }
        if (!e.scorches)
            e.scorches = [];
        e.scorches.push({ modelId: hit.model.id, layers: layers });
        if (e.scorches.length > 24)
            e.scorches.shift();
    }
    DW.shipHulls = {hullRadius:hullRadius,hullHit:hullHit,addScorch:addScorch};
}());
