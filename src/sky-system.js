(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {import('../experiments/types').FlightMission['sky']} missionSky */
    function describe(missionSky){
    var system=missionSky.jadeSystem;
    /** @param {number[]} v */
    function jadeRotate(v){var frame=system?system.frame:[[1,0,0],[0,1,0],[0,0,1]];return frame[0].map(function(_,j){return v.reduce(function(sum,x,i){return sum+x*frame[i][j];},0);});}
    var jadeObserver=system?system.observer:[0,-85000,0];
    var jadeMoons=(system?system.moons:[]).map(function(moon){
        var delta=moon.position.map(function(v,i){return v-jadeObserver[i];}),rangeKm=Math.hypot(...delta);
        return {...moon,rangeKm,direction:jadeRotate(delta.map(function(v){return v/rangeKm;})),radius:Math.asin(moon.diameterKm/2/rangeKm)};
    });
    var moonData=new Float32Array(jadeMoons.flatMap(function(moon){return moon.direction.concat(Math.sin(moon.radius));}));
    var moonRanges=new Float32Array(jadeMoons.map(function(m){return m.rangeKm;}));
    var planetRange=system?Math.hypot(...system.observer):85000;
    var planetRadius=system?Math.asin(system.planetRadiusKm/planetRange):Math.atan(1.31);
    var planetDirection=system?jadeRotate(system.observer.map(function(v){return -v/planetRange;})):[0,1,0];
    var jadePlanetData=new Float32Array(planetDirection.concat(Math.cos(planetRadius)));
    var gasScale=missionSky.jadeSystem&&planetRange>100000?Math.tan(planetRadius)/1.31:1;
        return {system:system,jadeRotate:jadeRotate,jadeObserver:jadeObserver,jadeMoons:jadeMoons,moonData:moonData,moonRanges:moonRanges,planetRange:planetRange,planetRadius:planetRadius,planetDirection:planetDirection,jadePlanetData:jadePlanetData,gasScale:gasScale};
    }
    DW.skySystem={describe:describe};
}());
