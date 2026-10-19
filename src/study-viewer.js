(function(global){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */ (global.Driftworks);
    /** Shared panel lifecycle; callers retain scene content and frame scheduling.
     * @param {import('./types').StudyViewConfig} config
     * @returns {import('./types').StudyView} */
    function createView(config){
        var world=config.world, host=config.host;
        var scene=DW.scene3d.create(host,function(){return world;},function(next){world=next;},{study:true,viewer:true,zoomToTerrain:config.zoomToTerrain});
        /** @type {import('./types').StudyView} */
        var view={id:config.id,host:host,scene:scene,world:function(){return world;},manual:false,
            fit:function(){if(!view.manual)config.fit(view);},
            reset:function(pose){view.manual=false;scene.setOrbit(pose||config.pose);view.fit();},
            dispose:function(){host.removeEventListener('viewer-interaction',interact);if(observer)observer.disconnect();}
        };
        function interact(){view.manual=true;}
        host.addEventListener('viewer-interaction',interact);
        var observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(view.fit);
        if(observer)observer.observe(host);
        scene.setOrbit(config.pose);view.fit();
        return view;
    }
    /** Same local 12 m Spitfire used by the mining rig study. Coordinates of origin
     * are renderer units; length is meters, independent of the subject's artwork scale.
     * @param {number} length @param {number} units @param {import('./types').ViewerVector} origin @param {number} [yaw]
     * @returns {import('../experiments/types').Batch[]} */
    function referenceFighter(length,units,origin,yaw){
        var entry=DW.shipPackModels.find('quaternius-ultimate-spaceships:Spitfire');
        if(!entry)throw new Error('Missing local Spitfire reference');
        var source=entry.model,min=Infinity,max=-Infinity;
        for(var i=1;i<source.vertices.length;i+=6){min=Math.min(min,source.vertices[i]);max=Math.max(max,source.vertices[i]);}
        var c=Math.cos(yaw||0),s=Math.sin(yaw||0);
        return DW.shipPackModels.detailedGeometry(source,[{eye:origin,right:[c,s,0],back:[s,-c,0],up:[0,0,1]}],(max-min)*units/length);
    }
    DW.studyViewer={createView:createView,referenceFighter:referenceFighter};
})(window);
