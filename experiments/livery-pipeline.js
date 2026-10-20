import { artVertexKey, treatmentSamples } from './livery-art.js';
import { mirrorTreatmentMesh } from './livery-symmetry.js';
/** CPU surface preparation. No DOM, scene actors, caches or WebGL access.
 * @typedef {{batches:import('./hull-panels').HullBatch[],regions:import('./hull-panels').Region[],curvature:Map<string,number>,symmetry:import('./livery-symmetry').MirrorPlane|null}} PreparedHull
 * @typedef {ReturnType<typeof import('./livery-art').chunkTreatment>|null|undefined} MaterialSampler
 */
/** A material section belongs to a source triangle/part, not each interpolated vertex normal.
 * @param {ArrayLike<number>} vertices @param {number} start @param {number} stride */
function materialTriangle(vertices, start, stride) {
    const point = [0, 1, 2].map(k => (vertices[start + k] + vertices[start + stride + k] + vertices[start + stride * 2 + k]) / 3), a = [0, 1, 2].map(k => vertices[start + stride + k] - vertices[start + k]), b = [0, 1, 2].map(k => vertices[start + stride * 2 + k] - vertices[start + k]);
    let normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = Math.hypot(...normal) || 1, sign = normal.reduce((sum, x, k) => sum + x * vertices[start + 3 + k], 0) < 0 ? -1 : 1;
    normal = normal.map(x => x / length * sign);
    return { point, normal };
}
/** Append source triangles and their material assignments. Source buffers stay immutable.
 * @param {number[]} data @param {PreparedHull} fitted
 * @param {import('./livery-art').ArtRecipe|null} recipe
 * @param {MaterialSampler} sampler @param {boolean} subdivide */
export function appendSourceSurface(data, fitted, recipe, sampler, subdivide) {
    const start = data.length / 12, batches = fitted.batches;
    const sourceOwners = /** @type {(number|undefined)[]} */ ([]), faceOwners = new Map(/** @type {[string,number][]} */ ([]));
    fitted.regions.forEach(r => r.faces.forEach(f => faceOwners.set(f.v.map(v => artVertexKey(v)).sort().join('|'), r.id)));
    batches.forEach(source => {
        const stride = source.stride || 6;
        for (let t = 0; t < source.vertices.length; t += stride * 3) {
            const original = source.vertices.slice(t, t + stride * 3), owner = faceOwners.get([0, 1, 2].map(j => artVertexKey(original, j * stride)).sort().join('|'));
            const vertices = subdivide ? treatmentSamples(original, stride) : original;
            for (let i = 0; i < vertices.length; i += stride) {
                data.push(...vertices.slice(i, i + 6));
                sourceOwners.push(owner);
                const color = source.color || [.5, .5, .5], protect = source.opacity !== undefined || ['mechanical', 'structural', 'marking', 'cockpit'].includes(source.role || '') || Math.max(...color) < .31;
                data.push(...color, (protect ? 1 : 0) + (fitted.curvature.get(artVertexKey(vertices, i)) || 0) * .2, stride === 8 ? vertices[i + 6] : 0, stride === 8 ? vertices[i + 7] : 0);
            }
        }
    });
    if (sampler)
        for (let i = start * 12; i < data.length; i += 12) {
            const triangle = materialTriangle(data, start * 12 + Math.floor((i - start * 12) / 36) * 36, 12), weights = sampler(data.slice(i, i + 3), data.slice(i + 3, i + 6), (recipe?.id || 0), triangle.point, triangle.normal, sourceOwners[i / 12 - start]);
            for (let k = 0; k < 3; k++)
                data[i + 6 + k] = weights[k];
        }
    return { start, count: data.length / 12 - start, bias: 0 };
}
/** Append generated geometry in stable decal-layer order.
 * @param {number[]} data @param {import('./hull-panels').PanelBatch[]} generated
 * @param {PreparedHull} fitted @param {import('./livery-art').ArtRecipe|null} recipe
 * @param {MaterialSampler} sampler @param {boolean} mirror @param {boolean} subdivide */
export function appendTreatmentLayers(data, generated, fitted, recipe, sampler, mirror, subdivide) {
    const passes = /** @type {{start:number,count:number,bias:number}[]} */ ([]);
    // Group decals by coat so paint and markings have stable, separate depth
    // layers. Real armor geometry keeps ordinary depth testing and occlusion.
    for (const bias of [0, 1, 2, 3]) {
        const layerStart = data.length / 12;
        generated.filter(batch => (batch.decalLayer || 0) === bias).forEach(source => {
            const mirrored = mirror && fitted.symmetry && !source.diagnostic ? { ...source, vertices: mirrorTreatmentMesh(source.vertices, fitted.symmetry) } : source;
            const batch = subdivide && !source.diagnostic ? { ...source, vertices: treatmentSamples(mirrored.vertices, 8) } : mirrored;
            for (let i = 0; i < batch.vertices.length; i += 8) {
                const triangle = materialTriangle(batch.vertices, Math.floor(i / 24) * 24, 8);
                const weights = sampler && !batch.diagnostic
                    ? sampler(Array.from(batch.vertices.slice(i, i + 3)),
                        Array.from(batch.vertices.slice(i + 3, i + 6)), recipe?.id || 0,
                        triangle.point, triangle.normal, source.regionId)
                    : batch.paint;
                const role = batch.diagnostic ? 3 : batch.graphic ? 4 : 2;
                const curvature = fitted.curvature.get(artVertexKey(batch.vertices, i)) || 0;
                data.push(...batch.vertices.slice(i, i + 6), ...weights,
                    role + curvature * .2, batch.vertices[i + 6], batch.vertices[i + 7]);
            }
        });
        const count = data.length / 12 - layerStart;
        if (count)
            passes.push({ start: layerStart, count, bias });
    }
    return passes;
}
