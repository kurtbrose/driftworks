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
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    var find=DW.shipCatalog.find;
    /** @type {Map<string, Promise<HTMLImageElement>>} */
    var textureImages = new Map();
    /** Omit IDs for the full catalog; selected-model viewers can load on demand.
     * @param {string[]} [ids] */
    function loadTextures(ids) {
        var wanted=ids===undefined?null:new Set(ids);
        var selected=(DW.shipPacks||[]).flatMap(function(pack){return pack.models.filter(function(model){return !wanted||wanted.has(model.id);}).map(function(model){return {pack:pack,model:model};});});
        return Promise.all(selected.map(function (entry) {
                var pack=entry.pack,model=entry.model;
                var cached = textureImages.get(model.id);
                if (cached)
                    return cached;
                const texturePath = model.texture;
                if (!texturePath) throw new Error('Model has no texture: ' + model.id);
                var pending = /** @type {Promise<HTMLImageElement>} */ (new Promise(function (resolve, reject) {
                    var image = new Image();
                    image.onload = function () {
                        var wreck = new Image();
                        wreck.onload = function () { wreckTextures.set(image, wreck); resolve(image); };
                        wreck.onerror = function () { reject(new Error('Could not load wreck texture: ' + model.texture)); };
                        wreck.src = assetUrl('../assets/ships/' + pack.id + '/' + texturePath.replace(/\.[^.]+$/, '.wreck.webp'));
                    };
                    image.onerror = function () {
                        reject(new Error('Could not load ' + model.texture));
                    };
                    image.src = assetUrl('../assets/ships/' + pack.id + '/' + texturePath);
                }));
                textureImages.set(model.id, pending);
                return pending;
        })).then(function (images) {
            /** @type {Images} */
            var result = new Map();
            selected.forEach(function(entry,index){result.set(entry.model.id,images[index]);});
            return result;
        });
    }
    // Baked offline; rendering a new wreck performs only a cache lookup.
    /** @type {WeakMap<HTMLImageElement,HTMLImageElement>} */
    var wreckTextures = new WeakMap();
    /** @param {HTMLImageElement | undefined} image */
    function wreckTexture(image) { return image ? wreckTextures.get(image) || image : image; }
    /** All source and wreck images, for renderer upload during loading.
     * @param {Images} images @returns {HTMLImageElement[]} */
    function textureSources(images) {
        return Array.from(new Set(Array.from(images.values()).flatMap(function (image) {
            var wreck = wreckTextures.get(image);
            return wreck ? [image, wreck] : [image];
        })));
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
    DW.shipAssets = {loadTextures:loadTextures,textureSources:textureSources,wreckTexture:wreckTexture,populate:populate};
}());
