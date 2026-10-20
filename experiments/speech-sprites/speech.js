(function () {
  'use strict';
  // Columns: neutral, four mouth openings, blink, happy, angry, scared, somber.
  // Explicit crops accommodate the reference sheet's slightly uneven spacing.
  var xs=[10,213,399,585,766,942,1115,1280,1442,1600];
  var centers=[105,303,490,674,852,1030];
  var crew = [
    {name:'Lt. Harper', y:16, h:176, xs:xs, w:190, mouth:135, eyes:99},
    {name:'Cmdr. Reyes', y:208, h:160, xs:xs, w:190, mouth:312, eyes:271},
    {name:'Lt. Collins', y:382, h:162, xs:xs, w:190, mouth:487, eyes:451},
    {name:'Lt. Nakamura', y:558, h:152, xs:xs, w:190, mouth:660, eyes:620},
    {name:'Dr. Voss', y:720, h:147, xs:xs, w:190, mouth:810, eyes:771}
  ];
  var canvas=/** @type {HTMLCanvasElement} */ (document.getElementById('portrait')), ctx=/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  var choice=/** @type {HTMLSelectElement} */ (document.getElementById('crew')), line=/** @type {HTMLElement} */ (document.getElementById('line'));
  var status=/** @type {HTMLElement} */ (document.getElementById('status')), script=/** @type {HTMLTextAreaElement} */ (document.getElementById('script'));
  var motion=/** @type {HTMLInputElement} */ (document.getElementById('motion')), pace=/** @type {HTMLSelectElement} */ (document.getElementById('pace'));
  var api=/** @type {Required<import('../../src/types').DriftworksNamespace>} */ (window.Driftworks).mumble;
  var voice=/** @type {HTMLSelectElement} */ (document.getElementById('voice'));
  var channel=/** @type {HTMLSelectElement} */ (document.getElementById('channel'));
  var image=new Image(), active=false, blinkAt=0, started=0, speechOffset=0, generation=0;
  /** @type {AudioContext | null} */ var context=null;
  /** @type {AudioBufferSourceNode | null} */ var source=null;
  /** @type {import('../types').SpeechPlan | null} */ var plan=null;
  var cast=['Woman · warm','Man · baritone','Scout','Woman · bright','Old man'];
  Object.keys(api.presets).forEach(function(name){var option=document.createElement('option');option.textContent=name;voice.appendChild(option);});
  motion.checked=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  crew.forEach(function(person,i){var option=document.createElement('option');option.value=String(i);option.textContent=person.name;choice.appendChild(option);});
  /** @param {number} frame */
  function draw(frame){
    var person=crew[Number(choice.value)];
    ctx.fillStyle='#0b1115';ctx.fillRect(0,0,132,144);ctx.imageSmoothingEnabled=false;
    if(image.complete && image.naturalWidth){
      var scale=Math.min(132/person.w,144/person.h), height=person.h*scale, top=144-height;
      // Keep head, hair, shoulders and camera fixed. Generated full frames are
      // not registered animation cells; only transplant the speaking features.
      ctx.drawImage(image,person.xs[0],person.y,person.w,person.h,0,top,132,height);
      if(frame){
        var blink=frame===5, width=blink?92:46, patchHeight=blink?24:28;
        var y=blink?person.eyes:person.mouth;
        ctx.drawImage(image,centers[frame]-width/2,y-patchHeight/2,width,patchHeight,
          (centers[0]-width/2-person.xs[0])*scale,top+(y-patchHeight/2-person.y)*scale,width*scale,patchHeight*scale);
      }
    }
  }
  function stop(){
    generation++;active=false;
    if(source){source.onended=null;source.stop();source.disconnect();source=null;}
    status.textContent='CHANNEL READY';draw(0);
  }
  function select(){stop();voice.value=cast[Number(choice.value)]; /** @type {HTMLElement} */ (document.getElementById('name')).textContent=crew[Number(choice.value)].name;line.textContent='Awaiting transmission.';}
  /** @type {HTMLElement} */ (document.getElementById('play')).onclick=async function(){
    stop();var text=script.value.trim(), ticket=generation;if(!text)return;
    status.textContent='PREPARING AUDIO';
    try {
      var Audio=window.AudioContext || window.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio is unavailable');
      context=context || new Audio();await context.resume();
      if(ticket!==generation)return;
      if(context.state!=='running')throw new Error('Audio could not start');
      var settings=Object.assign({},api.defaults,api.presets[voice.value]);
      settings.speed*=Number(pace.value);settings.seed=17+Number(choice.value)*101;settings.volume=.55;
      plan=api.analyze(text,settings);
      var transmission=api.transmit(api.render(plan,22050),22050,{mode:channel.value,effects:.45,seed:settings.seed});
      var buffer=context.createBuffer(1,transmission.samples.length,22050);
      buffer.copyToChannel(new Float32Array(transmission.samples),0);
      source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
      started=context.currentTime+.03;speechOffset=transmission.speechOffset;
      line.textContent='';active=true;status.textContent='● RECEIVING';
      var playing=source;
      source.onended=function(){playing.disconnect();if(ticket!==generation)return;source=null;active=false;line.textContent=text;status.textContent='TRANSMISSION COMPLETE';draw(0);};
      source.start(started);
    } catch(error){stop();status.textContent='AUDIO ERROR';line.textContent=String(error);}
  };
  /** @type {HTMLElement} */ (document.getElementById('stop')).onclick=stop;choice.onchange=select;
  /** @param {number} now */
  function tick(now){
    /** @type {import('../types').Syllable | null} */ var syllable=null;
    var elapsed=context ? context.currentTime-started-speechOffset : 0;
    if(active && plan){
      var revealed=0;
      plan.events.forEach(function(event){
        if(event.start<=elapsed){revealed=event.to;if(event.kind==='syllable' && elapsed<event.start+event.duration)syllable=event;}
      });
      line.textContent=plan.text.slice(0,revealed);
    }
    var frame=0;
    if(!motion.checked){
      if(now>=blinkAt+140)blinkAt=now+2700+Math.random()*2200;
      if(now>=blinkAt)frame=5;
      else if(syllable){
        // Open only during the short voiced burst used by Mumble's renderer.
        var cue=/** @type {import('../types').Syllable} */ (syllable);
        var phase=(elapsed-cue.start)/Math.min(cue.duration*.72,.075);
        if(phase<1)frame=phase<.22 || phase>.8 ? 1 : /[ao]/.test(cue.vowel) ? 4 : /[eu]/.test(cue.vowel) ? 3 : 2;
      }
    }
    draw(frame);requestAnimationFrame(tick);
  }
  image.onload=function(){select();requestAnimationFrame(tick);};
  image.onerror=function(){status.textContent='SHEET FAILED TO LOAD';};
  image.src='crew-sheet-v2.png';
  window.addEventListener('pagehide',function(){stop();if(context)void context.close();});
}());
