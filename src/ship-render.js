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
    var find=DW.shipCatalog.find,mixedModel=DW.shipCatalog.mixedModel,craftModel=DW.shipCatalog.craftModel,engineAnchors=DW.shipCatalog.engineAnchors;
    var wreckTexture=DW.shipAssets.wreckTexture;
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
    /** @param {ArtCraft[]} craft @param {string} selection @param {number} wave @param {number} units @param {Images} images @param {Vector} [paint] @param {boolean} [transforms] */
    function sourceFleetGeometry(craft, selection, wave, units, images, paint, transforms) {
        var batches = /** @type {Batch[]} */ ([]);
        [false, true].forEach(function (wreck) {
            /** @type {Map<Model, Pose[]>} */
            var groups = new Map();
            craft.forEach(function (e) {
                if ((e.age !== undefined || (e.hp !== undefined && e.hp <= 0)) !== wreck) return;
                var model = (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model);
                if (!model) return;
                if (!groups.has(model)) groups.set(model, []);
                var poses = groups.get(model);
                if (poses) poses.push(e.pose);
            });
            groups.forEach(function (poses, model) {
                var texture = wreck ? wreckTexture(images.get(model.id)) : images.get(model.id);
                var tint = wreck ? undefined : paint;
                if (transforms) poses.forEach(function (pose) {
                    batches.push(sourceDraw(model, pose, units, texture, tint));
                });
                else batches.push(sourceGeometry(model, poses, units, texture, tint));
            });
        });
        return batches;
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
    /** @type {WeakMap<ArtCraft,{modelId:string,marks:import('../experiments/types').Scorch[],layers:Float32Array[]}>} */
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
    /** @param {string} hex */
    function paintColor(hex) {
        return /^#[0-9a-f]{6}$/i.test(hex) ? [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255] : undefined;
    }
    DW.shipRender = {geometry:geometry,detailedGeometry:detailedGeometry,fleetGeometry:fleetGeometry,sourceGeometry:sourceGeometry,sourceDraw:sourceDraw,sourceFleetGeometry:sourceFleetGeometry,engineGeometry:engineGeometry,scorchGeometry:scorchGeometry,sourceScorchGeometry:sourceScorchGeometry,paintColor:paintColor};
}());
