(function () {
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Pack} Pack */
    /** @typedef {import('./types').Model} Model */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Batch} Batch */
    /** @typedef {import('./types').ArtCraft} ArtCraft */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Images} Images */
    /** @typedef {import('./types').HullHit} HullHit */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id */
    function find(id) {
        var result = /** @type {{pack: Pack; model: Model} | null} */ (null);
        (DW.shipPacks || []).forEach(function (pack) {
            pack.models.forEach(function (model) {
                if (model.id === id)
                    result = { pack: pack, model: model };
            });
        });
        return result;
    }
    /** @param {Pick<Model, 'vertices'>} model @param {Pose[]} poses @param {number} units @returns {Batch[]} */
    function geometry(model, poses, units) {
        var source = model.vertices, data = new Float32Array(source.length * poses.length), offset = 0;
        poses.forEach(function (p) {
            for (var i = 0; i < source.length; i += 6) {
                for (var a = 0; a < 3; a++)
                    data[offset + a] = p.eye[a] + (p.right[a] * source[i] - p.back[a] * source[i + 1] + p.up[a] * source[i + 2]) / units;
                for (var b = 0; b < 3; b++)
                    data[offset + 3 + b] = p.right[b] * source[i + 3] - p.back[b] * source[i + 4] + p.up[b] * source[i + 5];
                offset += 6;
            }
        });
        return [{ vertices: data, color: [.62, .72, .78] }];
    }
    // Bake face finishes and flush markings once in model coordinates. No per-frame
    // surface generation, extra scene objects, texture fetches or external assets.
    /** @type {WeakMap<Model, number[][]>} */
    var finishes = new WeakMap();
    /** @param {Model} model @param {Pose[]} poses @param {number} units @returns {Batch[]} */
    function detailedGeometry(model, poses, units) {
        var baked = finishes.get(model);
        if (!baked) {
            baked = [[], [], [], []];
            var v = model.vertices, minY = Infinity, maxY = -Infinity, maxX = 0;
            for (var k = 0; k < v.length; k += 6) {
                minY = Math.min(minY, v[k + 1]);
                maxY = Math.max(maxY, v[k + 1]);
                maxX = Math.max(maxX, Math.abs(v[k]));
            }
            for (var i = 0; i < v.length; i += 18) {
                var x = (v[i] + v[i + 6] + v[i + 12]) / 3, y = (v[i + 1] + v[i + 7] + v[i + 13]) / 3;
                var forward = (y - minY) / (maxY - minY || 1), top = v[i + 5] > .45;
                var glass = top && Math.abs(x) < maxX * .23 && forward > .55 && forward < .82;
                var group = glass ? 2 : (!top || forward < .17) ? 1 : 0;
                for (var j = 0; j < 18; j++)
                    baked[group].push(v[i + j]);
                if (group !== 0)
                    continue;
                // Inset armor face leaves a narrow dark joint around the plate.
                // Only broad faces receive a service stripe, keeping small facets quiet.
                var area = Math.hypot((v[i + 6] - v[i]) * (v[i + 13] - v[i + 1]) - (v[i + 7] - v[i + 1]) * (v[i + 12] - v[i]));
                if (area <= 1.2)
                    continue;
                var marking = Math.abs(x) > maxX * .35 && forward > .25 && forward < .65;
                /** @param {number} a @param {number} b @param {number} c */
                function point(a, b, c) {
                    var out = /** @type {number[]} */ ([]);
                    for (var axis = 0; axis < 3; axis++)
                        out.push(v[i + axis] * a + v[i + 6 + axis] * b + v[i + 12 + axis] * c + v[i + 3 + axis] * .008);
                    return out.concat(v.slice(i + 3, i + 6));
                }
                var weights = marking ? [[.62, .18, .2], [.52, .28, .2], [.12, .28, .6], [.22, .18, .6]] : [[.94, .03, .03], [.03, .94, .03], [.03, .03, .94]];
                var points = weights.map(function (w) {
                    return point(w[0], w[1], w[2]);
                });
                var dest = marking ? baked[3] : baked[1];
                if (marking) {
                    [0, 1, 2, 0, 2, 3].forEach(function (n) {
                        dest.push.apply(dest, points[n]);
                    });
                }
                // Seams use three thin inset strips rather than adding raised parts.
                else {
                    for (var edge = 0; edge < 3; edge++) {
                        var next = (edge + 1) % 3, outer = v.slice(i + edge * 6, i + edge * 6 + 6), outerNext = v.slice(i + next * 6, i + next * 6 + 6);
                        for (var a = 0; a < 3; a++) {
                            outer[a] += outer[a + 3] * .008;
                            outerNext[a] += outerNext[a + 3] * .008;
                        }
                        [outer, outerNext, points[next], outer, points[next], points[edge]].forEach(function (pt) {
                            dest.push.apply(dest, pt);
                        });
                    }
                }
            }
            finishes.set(model, baked);
        }
        var colors = /** @type {[number,number,number][]} */ ([[.68, .71, .65], [.28, .33, .36], [.075, .18, .24], [.88, .74, .39]]);
        return baked.map(function (source, index) {
            var batch = geometry({ vertices: source }, poses, units)[0];
            batch.color = colors[index];
            batch.finish = index === 1 || index === 2 ? 1 : 0;
            return batch;
        });
    }
    /** @param {number} index @param {number} wave */
    function mixedModel(index, wave) {
        var packs = (DW.shipPacks || []).filter(function(pack){return !pack.missionOnly;}), models = /** @type {Model[]} */ ([]), longest = Math.max.apply(null, packs.map(function (p) {
            return p.models.length;
        }));
        // Cycle through the available Quaternius models across waves.
        for (var i = 0; i < longest; i++)
            packs.forEach(function (pack) {
                if (pack.models[i])
                    models.push(pack.models[i]);
            });
        return models.length ? models[(index + Math.max(0, wave - 1) * 16) % models.length] : null;
    }
    /** @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units */
    function fleetGeometry(craft, selection, wave, units) {
        /** @type {Map<Model, Pose[]>} */
        var groups = new Map();
        craft.forEach(function (e) {
            var entry = (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model);
            if (!entry)
                return;
            if (!groups.has(entry))
                groups.set(entry, []);
            var poses = groups.get(entry);
            if (poses)
                poses.push(e.pose);
        });
        var merged = /** @type {{parts: Float32Array[]; length: number; color: [number,number,number]; finish?: number}[]} */ ([]);
        groups.forEach(function (poses, model) {
            detailedGeometry(model, poses, units).forEach(function (batch, index) {
                if (!merged[index])
                    merged[index] = { parts: [], length: 0, color: batch.color, finish: batch.finish };
                merged[index].parts.push(batch.vertices);
                merged[index].length += batch.vertices.length;
            });
        });
        return merged.map(function (group) {
            var vertices = new Float32Array(group.length), offset = 0;
            group.parts.forEach(function (part) {
                vertices.set(part, offset);
                offset += part.length;
            });
            return { vertices: vertices, color: group.color, finish: group.finish };
        });
    }
    // Preserve the artist's UVs and smooth normals while baking flight poses.
    /** @param {Model} model @param {Pose[]} poses @param {number} units @param {HTMLImageElement} [texture] @param {Vector} [paint] @returns {Batch} */
    function sourceGeometry(model, poses, units, texture, paint) {
        var raw = model.texturedVertices;
        if (!raw)
            throw new Error('Model has no textured vertices: ' + model.id);
        const source = raw;
        var data = new Float32Array(source.length * poses.length), offset = 0;
        poses.forEach(function (p) {
            for (var i = 0; i < source.length; i += 8) {
                for (var a = 0; a < 3; a++)
                    data[offset + a] = p.eye[a] + (p.right[a] * source[i] - p.back[a] * source[i + 1] + p.up[a] * source[i + 2]) / units;
                for (var b = 0; b < 3; b++)
                    data[offset + 3 + b] = p.right[b] * source[i + 3] - p.back[b] * source[i + 4] + p.up[b] * source[i + 5];
                data[offset + 6] = source[i + 6];
                data[offset + 7] = source[i + 7];
                offset += 8;
            }
        });
        return { vertices: data, color: [1, 1, 1], texture: texture, stride: 8, paint: paint };
    }
    /** @type {WeakMap<Model,{source:number[],vertices:Float32Array}>} */
    var sourceBuffers = new WeakMap();
    /** Immutable model mesh plus a small per-craft transform; no posed vertex bake.
     * @param {Model} model @param {Pose} pose @param {number} units
     * @param {HTMLImageElement} [texture] @param {Vector} [paint] @returns {Batch} */
    function sourceDraw(model, pose, units, texture, paint) {
        var source = model.texturedVertices;
        if (!source) throw new Error('Model has no textured vertices: ' + model.id);
        var cached = sourceBuffers.get(model);
        if (!cached || cached.source !== source) {
            cached = {source:source,vertices:new Float32Array(source)};
            sourceBuffers.set(model,cached);
        }
        return {vertices:cached.vertices,color:[1,1,1],stride:8,texture:texture,paint:paint,
            staticGeometry:true,origin:/** @type {[number,number,number]} */ (pose.eye),scale:1/units,
            basis:new Float32Array([pose.right[0],pose.right[1],pose.right[2],-pose.back[0],-pose.back[1],-pose.back[2],pose.up[0],pose.up[1],pose.up[2]])};
    }
    /** @type {Map<string, Promise<HTMLImageElement>>} */
    var textureImages = new Map();
    function loadTextures() {
        return Promise.all((DW.shipPacks || []).map(function (pack) {
            return Promise.all(pack.models.map(function (model) {
                var cached = textureImages.get(model.id);
                if (cached)
                    return cached;
                var pending = /** @type {Promise<HTMLImageElement>} */ (new Promise(function (resolve, reject) {
                    var image = new Image();
                    image.onload = function () {
                        resolve(image);
                    };
                    image.onerror = function () {
                        reject(new Error('Could not load ' + model.texture));
                    };
                    image.src = assetUrl('../assets/ships/' + pack.id + '/' + model.texture);
                }));
                textureImages.set(model.id, pending);
                return pending;
            }));
        })).then(function (images) {
            /** @type {Images} */
            var result = new Map();
            (DW.shipPacks || []).forEach(function (pack, p) {
                pack.models.forEach(function (model, m) {
                    result.set(model.id, images[p][m]);
                });
            });
            return result;
        });
    }
    /** @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units @param {Images} images @param {Vector} [paint] @param {boolean} [transforms] */
    function sourceFleetGeometry(craft, selection, wave, units, images, paint, transforms) {
        /** @type {Map<Model, Pose[]>} */
        var groups = new Map();
        craft.forEach(function (e) {
            var model = (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model);
            if (!model)
                return;
            if (!groups.has(model))
                groups.set(model, []);
            var poses = groups.get(model);
            if (poses)
                poses.push(e.pose);
        });
        var batches = /** @type {Batch[]} */ ([]);
        groups.forEach(function (poses, model) {
            if (transforms) poses.forEach(function (pose) {
                batches.push(sourceDraw(model, pose, units, images.get(model.id), paint));
            });
            else batches.push(sourceGeometry(model, poses, units, images.get(model.id), paint));
        });
        return batches;
    }
    // Reviewed nozzle centers in normalized ship metres: right X, forward Y, up Z.
    // Fourth value is nozzle radius. These are art attachments, not physics data.
    /** @type {Record<string, number[][]>} */
    var engineMounts = {
        Bob: [[-1.69, -3.23, -.267, .85], [1.69, -3.23, -.267, .85]],
        Challenger: [[-1.345, -5.73, -.746, .65], [1.345, -5.73, -.746, .65]],
        Dispatcher: [[-1.564, -7.63, -.22, .48], [1.564, -7.63, -.22, .48], [0, -7.99, .436, .35]],
        Executioner: [[-5.574, -5.92, .007, .48], [5.574, -5.92, .007, .48], [-1.185, -5.70, -.388, .48], [1.185, -5.70, -.388, .48]],
        Imperial: [[-2.556, -7.85, -.306, .48], [2.556, -7.85, -.306, .48], [0, -7.50, -.329, .8]],
        Insurgent: [[-2.295, -7.66, .271, .4], [2.295, -7.66, .271, .4], [-3.531, -7.23, -1.02, .45], [3.531, -7.23, -1.02, .45]],
        Omen: [[-2.029, -4.61, -.823, .65], [2.029, -4.61, -.823, .65]],
        Pancake: [[-2.041, -3.71, .286, .75], [2.041, -3.71, .286, .75]],
        Spitfire: [[-6.421, -4.20, .906, .65], [-6.421, -4.20, -1.095, .65], [6.421, -4.20, .906, .65], [6.421, -4.20, -1.095, .65]],
        Striker: [[-2.176, -6.09, -.273, .38], [2.176, -6.09, -.273, .38], [0, -8.05, .632, .27]],
        Zenith: [[-1.47, -7.68, -.088, .6], [1.47, -7.68, -.088, .6]]
    };
    // Muzzle centers inspected on the shipped mesh, in the same local metres as
    // sourceDraw: right X, forward Y, up Z. Keep asymmetric barrels asymmetric.
    /** @type {Record<string, number[][]>} */
    var gunMounts = {
        Bob: [[0, 4.402, -.389]],
        Challenger: [[0, 2.822, -.76]],
        Dispatcher: [[-1.278, 7.962, -2.308], [1.278, 7.962, -2.308]],
        Executioner: [[-1.19, 5.429, -.321], [1.19, 5.429, -.321]],
        Imperial: [[-1.55, 4.95, -.46], [1.55, 4.95, -.46]],
        Insurgent: [[-1.969, 3.1, -1.276], [1.969, 3.1, -1.276]],
        Omen: [[0, 6.898, -.45]],
        Pancake: [[-2.904, 5.455, -1.839], [2.904, 5.455, -1.839]],
        Spitfire: [[-.986, 1.575, .429], [.986, 1.575, .429]],
        Striker: [[-1.763, 5.314, -.668], [1.764, 4.041, .079]],
        Zenith: [[0, 3.323, -.34]]
    };
    /** @param {Model} model @returns {Vector[]} */
    function gunAnchors(model) {
        if(model.gunMounts)return model.gunMounts;
        if (model.id === 'blockout') return [[-3, 4, -1.3], [3, 4, -1.3]];
        var anchors = gunMounts[model.name];
        if (!anchors) throw new Error('No reviewed gun anchors for ' + model.id);
        return anchors;
    }
    /** @param {Model} model */
    function engineAnchors(model) {
        return model.engineMounts || engineMounts[model.name] || [];
    }
    /** @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units @param {Pose} view @param {number} time @returns {Batch} */
    function engineGeometry(craft, selection, wave, units, view, time) {
        var data = /** @type {number[]} */ ([]);
        /** @param {Vector} center @param {Vector} along @param {Vector} side @param {number} length @param {number} width @param {number} opacity */
        function quad(center, along, side, length, width, opacity) {
            [[-1, -1], [-1, 1], [1, 1], [-1, -1], [1, 1], [1, -1]].forEach(function (uv) {
                for (var a = 0; a < 3; a++)
                    data.push(center[a] + (along[a] * uv[0] * length + side[a] * uv[1] * width) / units);
                data.push(uv[0], uv[1], opacity);
            });
        }
        craft.forEach(function (e) {
            if ((e.hp !== undefined && e.hp <= 0) || e.age !== undefined || e.pose.throttle <= 0)
                return;
            var entry = (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model);
            var anchors = entry ? engineAnchors(entry) : [[0, -6, 0]], p = e.pose;
            var power = Math.min(1, Math.max(0, p.throttle)), pulse = 1 + .035 * Math.sin(time * 23 + e.index * 2.7);
            anchors.forEach(function (anchor) {
                var radius = anchor[3] || .65;
                var center = p.eye.map(function (x, i) {
                    return x + (p.right[i] * anchor[0] - p.back[i] * anchor[1] + p.up[i] * anchor[2]) / units;
                });
                // Rear-facing halo shrinks from the front; the hull still occludes it.
                var facing = Math.max(0, p.back.reduce(function (sum, v, i) {
                    return sum + v * view.back[i];
                }, 0));
                quad(center, view.up, view.right, radius * 1.4 * pulse, radius * 1.4 * pulse, (.3 + .7 * facing) * (.45 + .55 * power));
                var projected = p.back.map(function (v, i) {
                    return v - view.back[i] * p.back.reduce(function (sum, n, j) {
                        return sum + n * view.back[j];
                    }, 0);
                });
                var size = Math.hypot.apply(null, projected);
                var along = size > .001 ? projected.map(function (v) {
                    return v / size;
                }) : view.up;
                var side = [view.back[1] * along[2] - view.back[2] * along[1], view.back[2] * along[0] - view.back[0] * along[2], view.back[0] * along[1] - view.back[1] * along[0]];
                var tail = radius * (2.8 + power * 6) * pulse;
                var plume = center.map(function (v, i) {
                    return v + p.back[i] * tail * .5 / units;
                });
                quad(plume, along, side, Math.max(radius * .15, tail * .5 * size), radius * (.6 + power * .3), .6 + power * .35);
            });
        });
        return { vertices: new Float32Array(data), color: [.25, .65, 1] };
    }
    // Collision and decals share the displayed model's local metre coordinates.
    var blockout = /** @type {Model} */ ({ id: 'blockout', name: 'Training fighter', triangles: 6, vertices: [] });
    (function () {
        var p = [[0, 11, 0], [-7, -6, 0], [0, -3, 2.5], [7, -6, 0], [0, -6, -2]];
        [[0, 1, 2], [0, 2, 3], [0, 4, 1], [0, 3, 4], [1, 4, 2], [2, 4, 3]].forEach(function (f) {
            var n = normal(p[f[0]], p[f[1]], p[f[2]]);
            f.forEach(function (i) {
                blockout.vertices.push.apply(blockout.vertices, p[i].concat(n));
            });
        });
    }());
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
    /** @param {ArtCraft} e @param {string} selection @param {number} wave */
    function craftModel(e, selection, wave) {
        return (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model) || blockout;
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
    /** @typedef {{min:number[],max:number[],offsets:number[]|null,left:HullTree|null,right:HullTree|null}} HullTree */
    /** @type {WeakMap<Model,HullTree>} */var hullTrees=new WeakMap();
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
        var tree=hullTrees.get(model);
        if(!tree){var offsets=/** @type {number[]} */([]);for(var i=0;i<model.vertices.length;i+=18)offsets.push(i);tree=buildHullTree(model.vertices,offsets);hullTrees.set(model,tree);}
        var stack=[tree],result=/** @type {{offsets:number[],entry:number}[]} */([]);
        while(stack.length){var node=stack.pop();if(!node)continue;var entry=intersectsHullNode(node,a,d,padding);if(entry===null)continue;
            if(node.offsets)result.push({offsets:node.offsets,entry:entry});else {if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}
        }
        return result.sort(function(a,b){return a.entry-b.entry;});
    }
    /** @param {Model} model @param {Pose} pose @param {Vector} start @param {Vector} end @param {number} units @param {number} [boltRadius] */
    function hullHit(model, pose, start, end, units, boltRadius) {
        var a = localPoint(pose, start, units), d = minus(localPoint(pose, end, units), a), v = model.vertices, best = /** @type {HullHit | null} */ (null);
        var radius = hullBounds.get(model);
        if (radius === undefined) {
            radius = 0;
            for (var b = 0; b < v.length; b += 6)
                radius = Math.max(radius, Math.hypot(v[b], v[b + 1], v[b + 2]));
            hullBounds.set(model, radius);
        }
        var padding = boltRadius || 0;
        var span = dot3(d, d), fraction = span ? Math.max(0, Math.min(1, -dot3(a, d) / span)) : 0;
        if (Math.hypot.apply(null, a.map(function (x, j) {
            return x + d[j] * fraction;
        })) > radius + padding)
            return null;
        var candidates=hullCandidates(model,a,d,padding),bestOffset=Infinity;
        for (var candidateIndex=0;candidateIndex<candidates.length;candidateIndex++) {
          var leaf=candidates[candidateIndex];if(best&&leaf.entry>best.fraction)break;
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
                var contact = boltTriangle(a,d,[v.slice(i,i+3),v.slice(i+6,i+9),v.slice(i+12,i+15)],padding);
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
    /** @param {ArtCraft} e @param {HullHit} hit */
    function addScorch(e, hit) {
        var n = hit.normal, center = hit.local, axis = Math.abs(n[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
        var tangent = normal([0, 0, 0], n, axis), side = cross3(n, tangent), layers = /** @type {number[][]} */ ([[], [], [], [], []]);
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
    }
    /** @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units @returns {Batch[]} */
    function scorchGeometry(craft, selection, wave, units) {
        var layers = /** @type {number[][]} */ ([[], [], [], [], []]);
        craft.forEach(function (e) {
            var model = craftModel(e, selection, wave);
            (e.scorches || []).forEach(function (mark) {
                if (mark.modelId !== model.id)
                    return;
                mark.layers.forEach(function (source, i) {
                    var batch = geometry({ vertices: source }, [e.pose], units)[0];
                    layers[i].push.apply(layers[i], Array.from(batch.vertices));
                });
            });
        });
        return layers.map(function (data, i) {
            return { vertices: new Float32Array(data), color: [.22, .20, .17], opacity: [.10, .13, .16, .18, .12][i] };
        });
    }
    /** @type {WeakMap<ArtCraft,{modelId:string,marks:import('./types').Scorch[],layers:Float32Array[]}>} */
    var scorchBuffers=new WeakMap();
    /** Immutable local burn meshes plus GPU pose, including drifting wrecks.
     * @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units @returns {Batch[]} */
    function sourceScorchGeometry(craft,selection,wave,units){
        return craft.flatMap(function(e){
            var model=craftModel(e,selection,wave),marks=(e.scorches||[]).filter(function(mark){return mark.modelId===model.id;});
            if(!marks.length)return [];
            var cached=scorchBuffers.get(e);
            if(!cached||cached.modelId!==model.id||cached.marks.length!==marks.length||marks.some(function(mark,i){return !cached||cached.marks[i]!==mark;})){
                var layers=/** @type {number[][]} */([[],[],[],[],[]]);
                marks.forEach(function(mark){mark.layers.forEach(function(source,i){layers[i].push.apply(layers[i],source);});});
                cached={modelId:model.id,marks:marks,layers:layers.map(function(layer){return new Float32Array(layer);})};scorchBuffers.set(e,cached);
            }
            var pose=e.pose,basis=new Float32Array([pose.right[0],pose.right[1],pose.right[2],-pose.back[0],-pose.back[1],-pose.back[2],pose.up[0],pose.up[1],pose.up[2]]);
            return cached.layers.map(function(vertices,i){return {vertices:vertices,color:/** @type {[number,number,number]} */([.22,.20,.17]),opacity:[.10,.13,.16,.18,.12][i],staticGeometry:true,origin:/** @type {[number,number,number]} */(pose.eye),scale:1/units,basis:basis};});
        });
    }
    /** @param {HTMLSelectElement} select @param {boolean} [blockout] */
    function populate(select, blockout) {
        if (blockout) {
            var option = document.createElement('option');
            option.value = '';
            option.textContent = 'Driftworks · training blockout';
            select.appendChild(option);
        }
        (DW.shipPacks || []).forEach(function (pack) {
            var group = document.createElement('optgroup');
            group.label = pack.author + ' / ' + pack.id;
            pack.models.forEach(function (model) {
                var option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name + ' · ' + model.triangles.toLocaleString() + ' tris';
                group.appendChild(option);
            });
            select.appendChild(group);
        });
    }
    /** @param {string} hex */
    function paintColor(hex) {
        return /^#[0-9a-f]{6}$/i.test(hex) ? [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255] : undefined;
    }
    DW.shipPackModels = { gunAnchors: gunAnchors, craftModel: craftModel, hullHit: hullHit, addScorch: addScorch, scorchGeometry: scorchGeometry, sourceScorchGeometry: sourceScorchGeometry, paintColor: paintColor, find: find, loadTextures: loadTextures, sourceGeometry: sourceGeometry, sourceDraw: sourceDraw, sourceFleetGeometry: sourceFleetGeometry, geometry: geometry, detailedGeometry: detailedGeometry, mixedModel: mixedModel, fleetGeometry: fleetGeometry, engineAnchors: engineAnchors, engineGeometry: engineGeometry, populate: populate };
}());
