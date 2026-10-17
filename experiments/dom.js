(function () {
    'use strict';
    /** @typedef {import('./types').ElementsGetter} ElementsGetter */
    /** @typedef {import('./types').Elements} Elements */
    /**
     * HTML entry points own these IDs. Fail at the lookup with a useful message
     * instead of letting a missing control fail later in a frame or event handler.
     * @param {Document} document
     * @returns {ElementsGetter}
     */
    function controls(document) {
        return function get(id) {
            var element = document.getElementById(id);
            if (!element)
                throw new Error('Missing experiment element #' + id);
            return /** @type {Elements[typeof id]} */ (element);
        };
    }
    window.Driftworks = window.Driftworks || {};
    window.Driftworks.experimentDom = controls;
}());
