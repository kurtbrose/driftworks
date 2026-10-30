(function () {
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    // Compatibility facade; implementations and caches belong to their modules.
    DW.shipPackModels=Object.assign({},DW.shipCatalog,DW.shipHulls,DW.shipAssets,DW.shipRender);
}());
