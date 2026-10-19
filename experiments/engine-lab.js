(function () {
  'use strict';
  var tools = /** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks).audio.engine;
  /** @typedef {import('../src/engine-types').EngineTuning} Tuning */
  /** @typedef {keyof Omit<Tuning,'perspective'>} Knob */
  /** @param {string} id */ function get(id) { var el=document.getElementById(id); if(!el)throw new Error(id); return el; }
  /** @param {string} id */ function input(id) { return /** @type {HTMLInputElement} */(get(id)); }
  /** @param {string} id */ function button(id) { return /** @type {HTMLButtonElement} */(get(id)); }
  var tuning = tools.normalize({}), selected = 0;
  /** @type {AudioContext | null} */ var ctx=null;
  /** @type {import('../src/engine-types').EngineVoice | null} */ var voice=null;
  /** @type {AnalyserNode | null} */ var analyser=null;
  var running=false, boost=false, keyBoost=false, sequence=-1, last=0, animation=0, generation=0;
  /** @type {Partial<Record<Knob,boolean>>} */ var muted={};
  /** @type {Partial<Record<'a'|'b',Tuning>>} */ var slots={};
  /** @type {{key:Knob; label:string; min:number; max:number; step:number; layer?:boolean}[]} */
  var knobs=[
    {key:'bass',label:'Low rumble',min:0,max:1,step:.01,layer:true},
    {key:'whine',label:'Turbine whine',min:0,max:1,step:.01,layer:true},
    {key:'roar',label:'Exhaust roar',min:0,max:1,step:.01,layer:true},
    {key:'texture',label:'Mechanical texture',min:0,max:1,step:.01,layer:true},
    {key:'burner',label:'Afterburner punch',min:0,max:1,step:.01,layer:true},
    {key:'pitch',label:'Turbine / engine pitch',min:.5,max:2,step:.01},
    {key:'spool',label:'Spool inertia (seconds)',min:.08,max:1.5,step:.01},
    {key:'flutter',label:'Rumble flutter (Hz)',min:15,max:35,step:1},
    {key:'volume',label:'Listening level',min:0,max:1,step:.01}
  ];
  knobs.forEach(function(k){
    var row=document.createElement('div');row.className='knob';
    var label=document.createElement('label');label.htmlFor='mix-'+k.key;label.textContent=k.label;
    var out=document.createElement('output');out.id='value-'+k.key;label.appendChild(out);
    var slider=document.createElement('input');slider.id='mix-'+k.key;slider.type='range';slider.min=String(k.min);slider.max=String(k.max);slider.step=String(k.step);
    label.appendChild(slider);row.appendChild(label);
    slider.oninput=function(){tuning[k.key]=Number(slider.value);sync(false);};
    if(k.layer){var muteLabel=document.createElement('label'),mute=document.createElement('input');mute.type='checkbox';muteLabel.className='mute';muteLabel.appendChild(mute);muteLabel.append('Mute');mute.setAttribute('aria-label','Mute '+k.label);mute.onchange=function(){muted[k.key]=mute.checked;retune();};row.appendChild(muteLabel);}
    get('knobs').appendChild(row);
  });
  tools.presets.forEach(function(p,index){
    var b=document.createElement('button');b.className='preset';b.setAttribute('aria-pressed',String(index===selected));
    var name=document.createElement('strong'),desc=document.createElement('span');name.textContent=p.name;desc.textContent=p.description;b.append(name,desc);
    b.onclick=function(){selected=index;tuning=tools.normalize(p.tuning);sync(true);};get('presets').appendChild(b);
  });
  function retune(){var mix=Object.assign({},tuning);knobs.forEach(function(k){if(muted[k.key])mix[k.key]=0;});if(voice)voice.tune(mix);}
  /** @param {boolean} sliders */
  function sync(sliders){
    knobs.forEach(function(k){if(sliders)input('mix-'+k.key).value=String(tuning[k.key]);get('value-'+k.key).textContent=k.key==='flutter'?tuning[k.key]+' Hz':k.key==='spool'?tuning[k.key].toFixed(2)+' s':k.key==='pitch'?tuning[k.key].toFixed(2)+'x':Math.round(tuning[k.key]*100)+'%';});
    /** @type {HTMLSelectElement} */(get('perspective')).value=tuning.perspective;
    var match=tools.presets.findIndex(function(p){return JSON.stringify(p.tuning)===JSON.stringify(tuning);});
    if(match>=0)selected=match;
    get('voice-name').textContent=match>=0?tools.presets[match].name:'Custom mix';
    get('voice-description').textContent=match>=0?tools.presets[match].description:'Your tuned engine. Capture it in A or B, or save it for flight.';
    Array.from(get('presets').children).forEach(function(b,i){b.setAttribute('aria-pressed',String(i===match));});retune();
  }
  function stop(){
    generation++;running=false;boost=false;keyBoost=false;sequence=-1;
    if(voice)voice.stop();if(ctx)void ctx.suspend();
    cancelAnimationFrame(animation);last=0;get('power').textContent='0%';get('boost-readout').textContent='0%';get('stage').textContent='MANUAL';
    get('status').textContent='Stopped. No controller vibration.';boostLabel();
  }
  function boostLabel(){var on=boost||keyBoost;button('boost').setAttribute('aria-pressed',String(on));button('boost').textContent=on?'Afterburner on':'Afterburner off · hold B';}
  async function start(){
    var request=++generation;
    try{
      if(!ctx){
        var Ctor=window.AudioContext||window.webkitAudioContext;if(!Ctor)throw new Error('Web Audio is unavailable in this browser.');
        ctx=new Ctor();analyser=ctx.createAnalyser();analyser.fftSize=2048;var monitor=ctx.createGain();monitor.gain.value=2.6;analyser.connect(monitor).connect(ctx.destination);voice=tools.create(ctx,analyser,tuning);retune();
      }
      await ctx.resume();if(request!==generation||document.hidden){void ctx.suspend();return;}if(running)return;running=true;last=0;get('status').textContent='Running · adjust the mix or compare a different drive.';animation=requestAnimationFrame(frame);
    }catch(error){get('status').textContent=error instanceof Error?error.message:'Audio could not start.';}
  }
  /** @param {number} t */
  function frame(t){
    if(!running||!voice)return;
    var dt=last?Math.min(.1,(t-last)/1000):0;last=t;
    var throttle=Number(input('throttle').value),damage=Number(input('damage').value),maneuver=Number(input('maneuver').value),burn=boost||keyBoost;
    if(sequence>=0){
      sequence+=dt;
      if(sequence>=14){sequence=-1;boost=false;boostLabel();get('stage').textContent='MANUAL';}
      else {
        var s=sequence;
        throttle=s<2?0:s<5?(s-2)/3:s<10?1:s<12?.45:0;
        burn=s>=6&&s<9;damage=s>=9&&s<11?.7:0;maneuver=s>=9&&s<11?.8:0;
        input('throttle').value=String(throttle);input('damage').value=String(damage);input('maneuver').value=String(maneuver);
        ['throttle','damage','maneuver'].forEach(function(id){get(id+'-value').textContent=Math.round(Number(input(id).value)*100)+'%';});
        get('stage').textContent=s<2?'IDLE':s<5?'SPOOL UP':s<6?'CRUISE':s<9?'AFTERBURNER':s<11?'DAMAGED / TURN':'SPOOL DOWN';
      }
    }
    var state=voice.update(dt,{throttle:throttle,thrust:throttle,afterburner:burn,damage:damage,maneuver:maneuver});
    get('power').textContent=Math.round(state.spool*100)+'%';get('boost-readout').textContent=Math.round(state.boost*100)+'%';
    draw();animation=requestAnimationFrame(frame);
  }
  function draw(){
    if(!analyser||!ctx)return;
    var canvas=/** @type {HTMLCanvasElement} */(get('scope')),paint=canvas.getContext('2d');if(!paint)return;
    var data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(data);paint.clearRect(0,0,canvas.width,canvas.height);
    for(var i=0;i<80;i++){var hz=25*Math.pow(600,i/80),bin=Math.min(data.length-1,Math.round(hz*analyser.fftSize/ctx.sampleRate)),height=data[bin]/255*145;paint.fillStyle=i<20?'#f3a579':'#a6e9ca';paint.fillRect(i*11,160-height,7,height);}
    paint.fillStyle='#91a7ad';paint.font='12px monospace';paint.fillText('25 Hz / SUB',0,178);paint.fillText('TURBINE / EXHAUST',570,178);
  }
  button('start').onclick=function(){void start();};button('stop').onclick=stop;
  button('sequence').onclick=function(){boost=false;keyBoost=false;boostLabel();sequence=0;void start();};
  button('boost').onclick=function(){sequence=-1;boost=!boost;boostLabel();};
  ['throttle','damage','maneuver'].forEach(function(id){input(id).oninput=function(){sequence=-1;get('stage').textContent='MANUAL';get(id+'-value').textContent=Math.round(Number(input(id).value)*100)+'%';};});
  get('perspective').onchange=function(){tuning.perspective=/** @type {HTMLSelectElement} */(get('perspective')).value==='exterior'?'exterior':'cockpit';sync(false);};
  /** @type {('a'|'b')[]} */ var slotNames=['a','b'];
  slotNames.forEach(function(slot){button('store-'+slot).onclick=function(){slots[slot]=tools.normalize(tuning);button('recall-'+slot).disabled=false;get('save-status').textContent='Captured mix '+slot.toUpperCase()+'.';};button('recall-'+slot).onclick=function(){var mix=slots[slot];if(mix){tuning=tools.normalize(mix);sync(true);get('save-status').textContent='Listening to mix '+slot.toUpperCase()+'.';}};});
  button('apply').onclick=function(){get('save-status').textContent=tools.save(tuning)?'Saved for flight. Reload the flight page to hear this mix.':'Storage unavailable. Export the recipe to keep this mix.';};
  button('saved').onclick=function(){tuning=tools.load();sync(true);get('save-status').textContent='Loaded flight mix.';};
  button('reset').onclick=function(){tuning=tools.normalize(tools.presets[selected].tuning);sync(true);};
  button('export').onclick=function(){/** @type {HTMLTextAreaElement} */(get('recipe')).value=JSON.stringify(tuning,null,2);get('recipe-status').textContent='Recipe ready to copy.';};
  button('import').onclick=function(){try{
    /** @type {unknown} */
    var value=JSON.parse(/** @type {HTMLTextAreaElement} */(get('recipe')).value);if(!value||typeof value!=='object'||Array.isArray(value)||!('bass' in value))throw new Error('Paste an exported engine mix.');tuning=tools.normalize(/** @type {Partial<Tuning>} */(value));sync(true);get('recipe-status').textContent='Recipe loaded; values constrained to the bench ranges.';}catch(error){get('recipe-status').textContent=error instanceof Error?error.message:'Invalid recipe.';}};
  window.addEventListener('keydown',function(e){if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(e.code==='KeyB'){e.preventDefault();sequence=-1;keyBoost=true;boostLabel();}});
  window.addEventListener('keyup',function(e){if(e.code==='KeyB'){keyBoost=false;boostLabel();}});
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',function(){if(document.hidden)stop();});
  window.addEventListener('pagehide',function(){stop();if(voice)voice.dispose();if(ctx)void ctx.close();});
  sync(true);
}());
