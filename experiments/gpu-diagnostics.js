(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),key='driftworks.gpu-diagnostics.v1',debug=new URLSearchParams(location.search).get('gpuDebug')==='1';
    var run=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),stage='startup',sequence=0;
    /** @type {{stage:string;sequence:number;time:number}[]} */var recent=[];
    /** @type {unknown[]} */var records=[];
    try{var previous=/** @type {unknown[]} */(JSON.parse(localStorage.getItem(key)||'[]'));if(Array.isArray(previous))records=previous.slice(-24);}catch(_error){}
    /** @param {string} kind @param {unknown} [detail] */
    function record(kind,detail){
        records.push({run:run,time:new Date().toISOString(),kind:kind,stage:stage,sequence:sequence,recent:recent.slice(),path:location.pathname,detail:detail});records=records.slice(-24);
        try{localStorage.setItem(key,JSON.stringify(records));}catch(_error){}
    }
    /** Queue markers identify recently submitted work, not necessarily the faulting GPU command.
     * @param {string} name */
    function mark(name){if(!debug)return;stage=name;sequence++;recent.push({stage:name,sequence:sequence,time:performance.now()});if(recent.length>12)recent.shift();}
    ['webglcontextlost','webglcontextrestored','webglcontextcreationerror'].forEach(function(kind){
        document.addEventListener(kind,function(event){
            var canvas=event.target instanceof HTMLCanvasElement?event.target:null;
            var status='statusMessage' in event?String(event.statusMessage):'';
            record(kind,{status:status,canvas:canvas?{className:canvas.className,width:canvas.width,height:canvas.height,parent:canvas.parentElement&&canvas.parentElement.id}:null});
        },true);
    });
    window.addEventListener('error',function(event){record('javascript-error',{message:event.message,file:event.filename,line:event.lineno});});
    window.addEventListener('unhandledrejection',function(event){var rejection=/** @type {{reason:unknown}} */(event);record('unhandled-rejection',String(rejection.reason).slice(0,1200));});
    window.addEventListener('pagehide',function(event){record('pagehide',{backForwardCached:event.persisted});});
    var params=new URLSearchParams(location.search);
    record('startup',{debug:debug,mission:params.get('mission'),geometry:params.get('bridgeGeometry')||'full',ablation:params.get('ablate'),lod:params.get('bridgeLod')==='implicit'?'implicit':'explicit',view:params.get('view'),cap:params.get('cap')});
    function snapshot(){return JSON.stringify({run:run,stage:stage,sequence:sequence,recent:recent,records:records},null,2);}
    DW.gpuDiagnostics={mark:mark,snapshot:snapshot};
    if(debug){
        var panel=document.createElement('details'),summary=document.createElement('summary'),button=document.createElement('button'),pre=document.createElement('pre');
        panel.id='gpu-diagnostics';panel.style.cssText='position:fixed;z-index:200;left:8px;top:8px;max-width:560px;max-height:70vh;overflow:auto;background:#06131eef;color:white;padding:8px;font:11px monospace';
        summary.textContent='Graphics diagnostics';button.textContent='Refresh graphics log';button.onclick=function(){pre.textContent=snapshot();};pre.textContent=snapshot();panel.append(summary,button,pre);document.body.appendChild(panel);
    }
}());
