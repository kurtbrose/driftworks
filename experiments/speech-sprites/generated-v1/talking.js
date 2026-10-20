(function(){
  'use strict';
  /** @param {string} id */
  function element(id){return /** @type {HTMLElement} */ (document.getElementById(id));}
  /** @param {string} id */
  function input(id){return /** @type {HTMLInputElement} */ (element(id));}
  /** @param {string} id */
  function select(id){return /** @type {HTMLSelectElement} */ (element(id));}
  var DW=/** @type {Required<import('../../../src/types').DriftworksNamespace>} */ (window.Driftworks),api=DW.mumble,blend=DW.faceBlend;
  var text=/** @type {HTMLTextAreaElement} */ (element('line')),voice=select('voice'),mood=select('mood');
  var speak=/** @type {HTMLButtonElement} */ (element('speak')),motion=input('motion');
  /** @type {AudioContext | null} */ var audio=null;
  /** @type {AudioBufferSourceNode | null} */ var source=null;
  /** @type {import('./types').FaceRenderer | null} */ var renderer=null;
  /** @type {import('../../types').SpeechPlan | null} */ var plan=null;
  var active=false,generation=0,started=0,offset=0,nextBlink=3000,frames=0,closed=false;
  Object.keys(api.presets).forEach(function(name){var option=document.createElement('option');option.textContent=name;voice.appendChild(option);});voice.value='Woman · warm';
  motion.checked=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop(){
    generation++;active=false;
    if(source){source.onended=null;source.stop();source.disconnect();source=null;}
    element('status').textContent='CHANNEL READY';
  }
  element('stop').onclick=stop;
  speak.onclick=async function(){
    stop();var line=text.value.trim(),ticket=generation;if(!line||!renderer)return;
    element('status').textContent='PREPARING AUDIO';
    try{
      var Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio is unavailable.');
      audio=audio||new Audio();await audio.resume();
      if(ticket!==generation||closed)return;
      if(audio.state!=='running')throw new Error('Audio could not start.');
      var settings=Object.assign({},api.defaults,api.presets[voice.value],{seed:17,volume:.55});
      settings.speed*=Number(select('pace').value);
      plan=api.analyze(line,settings);
      var transmission=api.transmit(api.render(plan,22050),22050,{mode:select('channel').value,effects:.45,seed:17});
      var buffer=audio.createBuffer(1,transmission.samples.length,22050);buffer.copyToChannel(new Float32Array(transmission.samples),0);
      source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);
      started=audio.currentTime+.03;offset=transmission.speechOffset;active=true;
      element('subtitle').textContent='';element('status').textContent='● RECEIVING';
      element('timing').textContent=transmission.duration.toFixed(1)+' seconds · '+voice.value+' · '+select('channel').value;
      var playing=source;
      source.onended=function(){playing.disconnect();if(ticket!==generation)return;source=null;active=false;element('subtitle').textContent=line;element('status').textContent='TRANSMISSION COMPLETE';};
      source.start(started);
    }catch(error){if(ticket!==generation||closed)return;stop();element('status').textContent='AUDIO ERROR';element('timing').textContent=String(error);}
  };
  text.addEventListener('keydown',function(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();speak.click();}});
  /** @param {number} now */
  function draw(now){
    if(closed||!renderer)return;
    /** @type {import('./types').FaceLayer[]} */ var layers=[];
    // Use one coherent expression, never translucent neutral/expression lips.
    if(mood.value!=='neutral')layers.push({image:mood.value==='smile'?'smile-soft':mood.value,shape:mood.value==='wide'?blend.presets.eyes:blend.presets.face,alpha:1});
    var cue=active&&plan&&audio?blend.speechCue(plan,audio.currentTime-started-offset):null;
    if(active&&plan&&cue)element('subtitle').textContent=plan.text.slice(0,cue.revealed);
    if(!motion.checked){
      // Fully replace every resting/smiling lip pixel. Feather only on skin;
      // temporal alpha blending would leave two different lip outlines visible.
      if(cue&&cue.alpha>0)layers.push({image:cue.image,shape:[48,61,13,8,20],alpha:1});
      if(now>=nextBlink+145)nextBlink=now+2800+Math.random()*2600;
      if(input('blink').checked&&now>=nextBlink){
        // Eyelids only: retain the current expression's eyebrows.
        layers.push({image:'blink',shape:[38.5,44.6,7.4,4.3,25],alpha:1},{image:'blink',shape:[56.5,44.6,7.4,4.3,25],alpha:1});
      }
    }
    renderer.draw(layers);
    if(frames++%90===0)element('proof').textContent='Protected area check: '+renderer.protectedChanges()+' changed pixels outside the face mask.';
    requestAnimationFrame(draw);
  }
  /** @type {Record<string, HTMLImageElement>} */ var images={};
  Promise.all(['master','eh','ah','oo','blink','wide','smile-soft','angry'].map(function(name){return new Promise(function(resolve,reject){var image=new Image();image.onload=function(){images[name]=image;resolve(image);};image.onerror=reject;image.src=name+'.png';});})).then(function(){
    if(closed)return;renderer=blend.create(/** @type {HTMLCanvasElement} */ (element('face')),images);speak.disabled=false;element('status').textContent='CHANNEL READY';requestAnimationFrame(draw);
  }).catch(function(){element('status').textContent='PORTRAIT FAILED TO LOAD';});
  window.addEventListener('pagehide',function(){closed=true;stop();if(audio)void audio.close();});
  window.addEventListener('pageshow',function(event){if(event.persisted&&closed){closed=false;audio=null;element('status').textContent='CHANNEL READY';requestAnimationFrame(draw);}});
}());
