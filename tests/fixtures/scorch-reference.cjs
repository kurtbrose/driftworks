'use strict';
// Original full-mesh scorch projection retained as a differential oracle.
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normal(a,b,c){const n=cross3(minus(b,a),minus(c,a)),l=Math.hypot(...n)||1;return n.map(v=>v/l);}
module.exports=function addScorch(e, hit) {
        var n = hit.normal, center = hit.local, axis = Math.abs(n[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
        var tangent = normal([0, 0, 0], n, axis), side = cross3(n, tangent), layers = /** @type {number[][]} */ ([[], [], [], [], []]);
        // Clip a small polygonal burn to nearby hull triangles. No floating quads,
        // back-side bleed, textures, or per-frame mesh projection.
        var v = hit.model.vertices;
        for (var i=0;i<v.length;i+=18) {
            var tri = [v.slice(i, i + 3), v.slice(i + 6, i + 9), v.slice(i + 12, i + 15)], face = normal(tri[0], tri[1], tri[2]);
            if (dot3(face, n) < .35 || [0, 1, 2].some(function (k) {
                return Math.min(tri[0][k], tri[1][k], tri[2][k]) > center[k] + 1.4 || Math.max(tri[0][k], tri[1][k], tri[2][k]) < center[k] - 1.4;
            }))
                continue;
            [.78, .63, .48, .33, .18].forEach(function (radius, layer) {
                var poly = tri;
                /** @param {Vector} direction @param {number} limit */
                function clip(direction, limit) {
                    var out = /** @type {number[][]} */ ([]);
                    poly.forEach(function (a, j) {
                        var b = poly[(j + 1) % poly.length], da = dot3(minus(a, center), direction) - limit, db = dot3(minus(b, center), direction) - limit;
                        if (da <= 0)
                            out.push(a);
                        if ((da <= 0) !== (db <= 0)) {
                            var t = da / (da - db);
                            out.push(a.map(function (x, k) {
                                return x + (b[k] - x) * t;
                            }));
                        }
                    });
                    poly = out;
                }
                clip(n, .3);
                clip(n.map(function (x) {
                    return -x;
                }), .3);
                for (var edge = 0; edge < 12 && poly.length; edge++) {
                    var angle = edge * Math.PI / 6;
                    clip(tangent.map(function (x, k) {
                        return x * Math.cos(angle) + side[k] * Math.sin(angle);
                    }), radius * (1 + .22 * Math.sin(edge * 7.3 + center[0] * 2.1 + center[1] * 3.7 + center[2])));
                }
                for (var j = 1; j + 1 < poly.length; j++)
                    [poly[0], poly[j], poly[j + 1]].forEach(function (p) {
                        layers[layer].push.apply(layers[layer], p.map(function (x, k) {
                            return x + face[k] * (.012 + layer * .004);
                        }).concat(face));
                    });
            });
        }
        if (!e.scorches)
            e.scorches = [];
        e.scorches.push({ modelId: hit.model.id, layers: layers });
        if (e.scorches.length > 24)
            e.scorches.shift();
    };
