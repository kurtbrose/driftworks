(function(){
  'use strict';
  /** @typedef {import('./types').Line} Line */
  /** @typedef {import('./types').Feeling} Feeling */
  /** @typedef {import('./speech-sprites/generated-v1/types').FaceLayer} FaceLayer */
  var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
  // Atlas coordinates, calibrated on the supplied 1448 x 1086 master.
  // [mouth X in cell, mouth Y in cell, eye-line Y in cell].
  var anchors=[[187,322,245],[181,322,239],[176,323,243],[179,310,216],[183,263,186],[185,269,188],[181,259,166],[185,270,190]];
  var cast=[1,0,3,2,4,5,6,7]; // Same adult masculine/feminine ordering as pilotVoice.
  /** @param {Line} line */
  function slot(line){return typeof line.portraitIndex==='number'&&Number.isFinite(line.portraitIndex)&&line.portraitIndex>=0?cast[Math.floor(line.portraitIndex)%8]:2;}
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
  /** @type {Promise<Record<string, HTMLImageElement>> | null} */ var atlasPromise=null;
  function atlases(){
    if(!atlasPromise)atlasPromise=Promise.all(['neutral','ah','oo','blink','smile','angry','afraid'].map(/** @param {string} name @returns {Promise<{name:string;image:HTMLImageElement}>} */ function(name){return new Promise(function(resolve,reject){var image=new Image();image.onload=function(){resolve({name:name,image:image});};image.onerror=reject;image.src=new URL('../assets/portraits/dogfight/'+name+'.png',document.baseURI).href;});})).then(function(items){
      /** @type {Record<string, HTMLImageElement>} */ var result={};items.forEach(function(item){result[item.name]=item.image;});return result;
    });
    return atlasPromise;
  }
  /** @type {Record<number, Record<string, HTMLCanvasElement>>} */ var cache={};
  /** @param {number} index @param {Record<string, HTMLImageElement>} source */
  function prepare(index,source){
    if(cache[index])return cache[index];
    /** @type {Record<string, HTMLCanvasElement>} */ var result={};
    var a=anchors[index],scale=(.61-.44)*512/(a[1]-a[2]),left=.48*512-a[0]*scale,top=.61*512-a[1]*scale;
    Object.keys(source).forEach(function(name){
      var image=source[name],canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      var ctx=/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      ctx.fillStyle='#0b1115';ctx.fillRect(0,0,512,512);
      ctx.drawImage(image,(index%4)*image.naturalWidth/4,Math.floor(index/4)*image.naturalHeight/2,image.naturalWidth/4,image.naturalHeight/2,left,top,362*scale,543*scale);
      result[name==='neutral'?'master':name]=canvas;
    });
    result.eh=result.ah;cache[index]=result;return result;
  }
  /** @param {HTMLElement} panel */
  function mount(panel){
    var canvas=panel.ownerDocument.createElement('canvas');canvas.width=canvas.height=512;canvas.className='radio-portrait';canvas.hidden=true;panel.appendChild(canvas);
    // Decode while the sortie is still on its launch screen, not on first speech.
    void atlases().catch(function(){ /* The radio glyph remains the fallback. */ });
    /** @type {import('./speech-sprites/generated-v1/types').FaceRenderer | null} */ var renderer=null;
    /** @type {import('./types').SpeechPlan | null} */ var plan=null;
    /** @type {AudioContext | null} */ var audio=null;
    /** @type {Feeling | undefined} */ var feeling;
    var ticket=0,current=-1,started=0,offset=0,lastDraw=-Infinity,blinkAt=0,visible=false;
    var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @param {Feeling} [live] @param {boolean} [force] */
    function update(live,force){
      if(live)feeling=live;
      if(!renderer||!visible)return;
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
      renderer.draw(layers);canvas.dataset.expression=mood;
    }
    return {
      /** @param {Line} line */
      show:function(line){
        var request=++ticket,index=slot(line);feeling=line.emotion;plan=null;audio=null;visible=true;
        canvas.setAttribute('aria-label',line.speaker.split(' / ')[0]+' speaking portrait');
        if(index!==current){renderer=null;canvas.hidden=true;panel.classList.remove('has-portrait');}
        atlases().then(function(source){
          if(request!==ticket||!visible)return;
          if(index!==current||!renderer){renderer=DW.faceBlend.create(canvas,prepare(index,source));current=index;}
          canvas.hidden=false;panel.classList.add('has-portrait');update(undefined,true);
        }).catch(function(){if(request===ticket){canvas.hidden=true;panel.classList.remove('has-portrait');}});
      },
      /** @param {import('./types').SpeechPlan} value @param {AudioContext} context @param {number} time @param {number} speechOffset */
      play:function(value,context,time,speechOffset){plan=value;audio=context;started=time;offset=speechOffset;},
      stop:function(){plan=null;audio=null;update(undefined,true);},
      clear:function(){ticket++;visible=false;plan=null;audio=null;canvas.hidden=true;panel.classList.remove('has-portrait');},
      update:update
    };
  }
  DW.flightPortraits={mount:mount,slot:slot,expression:expression};
}());
