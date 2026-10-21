(function(){
  'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
  /** @typedef {import('./types').Line} Line */
  /** @typedef {import('./types').Feeling} Feeling */
  /** @typedef {import('./face-blend-types').FaceLayer} FaceLayer */
  var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
  var cast=[1,0,3,2,4,5,6,7,8,9,10,11,12,13,14,15]; // Same adult masculine/feminine ordering as pilotVoice.
  /** @param {Line} line */
  function slot(line){return typeof line.portraitIndex==='number'&&Number.isFinite(line.portraitIndex)&&line.portraitIndex>=0?cast[Math.floor(line.portraitIndex)%cast.length]:16;}
  /** @param {Feeling | undefined} feeling */
  function expression(feeling){
    if(!feeling)return 'neutral';
    var stress=Math.max(0,Math.min(1,feeling.stress||0)),mood=feeling.current;
    if(mood==='panicked'||mood==='afraid'||stress>=.62)return 'afraid';
    if(mood==='frustrated')return 'angry';
    if(mood==='confused')return 'afraid';
    if(mood==='confident'||mood==='relieved'||mood==='reassuring')return 'smile';
    return stress>=.35?'angry':'neutral';
  }
  var FRAME_SIZE=256,CACHE_LIMIT=17,poses=['master','ah','oo','blink','smile','angry','afraid'];
  /** @typedef {{controller: AbortController; bitmap: ImageBitmap | null; promise: Promise<Record<string, import('./face-blend-types').FaceSource>>}} Entry */
  /** @param {HTMLElement} panel */
  function mount(panel){
    var portraits=DW.flightMissions.current().portraits;
    // Wardrobe is presentation-only. Both casts retain the same calibrated slots,
    // seven expression rectangles, voice identities, and fixed cache budget.
    var portraitRoot='../assets/portraits/'+portraits.folder+'/runtime/';
    var canvas=panel.ownerDocument.createElement('canvas');canvas.width=canvas.height=512;canvas.className='radio-portrait';canvas.hidden=true;panel.appendChild(canvas);
    canvas.dataset.cast=portraits.cast;
    var animated=panel.ownerDocument.createElement('canvas');
    var display=DW.commsDisplay.create(canvas);
    /** @type {import('./types').RadioNoise | null} */ var noise=null;
    // Fixed cast cache: compact bitmaps only, never persistent pose canvases.
    /** @type {Map<number, Entry>} */ var cache=new Map();
    /** @param {Entry} entry */
    function release(entry){entry.controller.abort();if(entry.bitmap){entry.bitmap.close();entry.bitmap=null;}}
    /** @param {number} index */
    function load(index){
      var cached=cache.get(index);
      if(cached){cache.delete(index);cache.set(index,cached);return cached.promise;}
      /** @type {Entry} */ var entry={controller:new AbortController(),bitmap:null,promise:Promise.resolve({})};
      entry.promise=fetch(assetUrl(portraitRoot+'portrait-'+index+'.png'),{signal:entry.controller.signal}).then(function(response){
        if(!response.ok)throw new Error('Portrait request failed: '+response.status);
        return response.blob();
      }).then(function(blob){return createImageBitmap(blob);}).then(function(bitmap){
        if(entry.controller.signal.aborted){bitmap.close();throw new Error('Portrait request cancelled');}
        if(bitmap.width!==FRAME_SIZE*poses.length||bitmap.height!==FRAME_SIZE){bitmap.close();throw new Error('Invalid portrait dimensions');}
        entry.bitmap=bitmap;
        /** @type {Record<string, import('./face-blend-types').FaceSource>} */ var frames={};
        poses.forEach(function(name,i){frames[name]={image:bitmap,rect:[i*FRAME_SIZE,0,FRAME_SIZE,FRAME_SIZE]};});
        frames.eh=frames.ah;return frames;
      }).catch(/** @param {unknown} error */ function(error){if(cache.get(index)===entry)cache.delete(index);throw error;});
      cache.set(index,entry);
      while(cache.size>CACHE_LIMIT){var oldest=cache.keys().next().value;if(oldest===undefined)break;var evicted=cache.get(oldest);cache.delete(oldest);if(evicted)release(evicted);}
      return entry.promise;
    }
    var warmGeneration=0;
    /** @param {() => void} callback */
    function idle(callback){if(window.requestIdleCallback)window.requestIdleCallback(callback,{timeout:1500});else window.setTimeout(callback,100);}
    function warmup(){
      var run=++warmGeneration,next=0;
      function advance(){
        if(run!==warmGeneration||next>=cast.length)return;
        // Rook first. Foreground callers share pending requests or start their
        // own immediately, without waiting behind this sequential warm-up.
        var index=cast[next++];
        load(index).catch(function(){ /* A foreground request may retry later. */ }).then(function(){if(run===warmGeneration&&next<cast.length)idle(advance);});
      }
      idle(advance);
    }
    /** @type {import('./face-blend-types').FaceRenderer | null} */ var renderer=null;
    /** @type {import('./types').SpeechPlan | null} */ var plan=null;
    /** @type {AudioContext | null} */ var audio=null;
    /** @type {Feeling | undefined} */ var feeling;
    var ticket=0,current=-1,started=0,offset=0,lastDraw=-Infinity,blinkAt=0,visible=false,breakup=0;
    function discardRenderer(){if(renderer){renderer.dispose();renderer=null;}current=-1;}
    window.addEventListener('pagehide',function(){warmGeneration++;ticket++;visible=false;plan=null;audio=null;discardRenderer();cache.forEach(release);cache.clear();canvas.hidden=true;panel.classList.remove('has-portrait');});
    window.addEventListener('pageshow',function(event){if(event.persisted)warmup();});
    warmup();
    var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @param {Feeling} [live] @param {boolean} [force] */
    function update(live,force){
      if(live)feeling=live;
      if(!renderer||!visible)return;
      if(noise&&audio&&(audio.currentTime-started>=noise.duration)){plan=null;noise=null;}
      var now=performance.now();if(!force&&now-lastDraw<1000/30)return;lastDraw=now;
      /** @type {FaceLayer[]} */ var layers=[];
      var mood=expression(feeling);
      if(mood!=='neutral')layers.push({image:mood,shape:DW.faceBlend.presets.face,alpha:1});
      if(!reduce){
        var cue=plan&&audio?DW.faceBlend.speechCue(plan,audio.currentTime-started-offset):null;
        if(cue&&cue.alpha>0)layers.push({image:cue.image,shape:[48,61,13,8,20],alpha:1});
        if(now>=blinkAt+140)blinkAt=now+2800+(current*317)%2200;
        if(now>=blinkAt)layers.push({image:'blink',shape:[38.5,44.6,7.4,4.3,25],alpha:1},{image:'blink',shape:[56.5,44.6,7.4,4.3,25],alpha:1});
      }
      renderer.draw(layers);
      display.draw(animated,noise,audio?audio.currentTime-started:0,plan?plan.duration:0,{reduced:reduce,breakup:breakup});
      canvas.dataset.expression=mood;
    }
    function stop(){breakup=0;ticket++;visible=false;plan=null;audio=null;noise=null;canvas.hidden=true;panel.classList.remove('has-portrait');}
    return {
      /** @param {Line} line */
      show:function(line){
        var request=++ticket,index=slot(line);feeling=line.emotion;breakup=0;plan=null;audio=null;noise=null;visible=true;
        canvas.setAttribute('aria-label',line.speaker.split(' / ')[0]+' speaking portrait');
        if(index!==current){discardRenderer();canvas.hidden=true;panel.classList.remove('has-portrait');}
        load(index).then(function(source){
          if(request!==ticket||!visible)return;
          if(index!==current||!renderer){renderer=DW.faceBlend.create(animated,source);current=index;}
          canvas.hidden=false;panel.classList.add('has-portrait');update(undefined,true);
        }).catch(function(){if(request===ticket){canvas.hidden=true;panel.classList.remove('has-portrait');}});
      },
      /** @param {import('./types').SpeechPlan} value @param {AudioContext} context @param {number} time @param {number} speechOffset @param {import('./types').RadioNoise} [pattern] */
      play:function(value,context,time,speechOffset,pattern){plan=value;audio=context;started=time;offset=speechOffset;noise=pattern||null;},
      finish:function(){breakup=0;plan=null;noise=null;update(undefined,true);},
      /** @param {number} progress */
      decay:function(progress){breakup=progress;update(undefined,true);},
      stop:stop,
      clear:function(){ticket++;visible=false;plan=null;audio=null;noise=null;discardRenderer();canvas.hidden=true;panel.classList.remove('has-portrait');},
      update:update
    };
  }
  DW.flightPortraits={mount:mount,slot:slot,expression:expression};
}());
