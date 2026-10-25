(function () {
    'use strict';
    var scope = /** @type {import('./types').SpeechWorkerScope} */ (/** @type {unknown} */ (globalThis));
    // Mumble is also used by ordinary browser scripts; give it the same namespace.
    scope.window = scope;
    scope.onmessage = function (event) {
        var request = event.data;
        if (request.kind === 'init') {
            scope.importScripts(request.url);
            return;
        }
        var api = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks).mumble;
        var rate = 22050, pcm = api.render(request.plan, rate);
        var noise = api.radioNoise(pcm.length, rate, {effects: .45, edgeScale: 2.5, seed: request.radioSeed});
        var transmission = api.transmit(pcm, rate, {mode: 'radio', seed: request.radioSeed, noise: noise});
        scope.postMessage({id: request.id, samples: transmission.samples, noise: noise,
            speechOffset: transmission.speechOffset || 0, duration: transmission.duration}, [/** @type {ArrayBuffer} */ (transmission.samples.buffer)]);
    };
}());
