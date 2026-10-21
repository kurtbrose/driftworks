/** @param {Window} global */
(function (global) {
  'use strict';
  /** @type {import('./types').DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @param {unknown} value @param {number} fallback */
  function volumeValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }
  /** @param {{getMaster: () => number; setMaster: (value: number) => void}} options */
  function createMixer(options) {
    /** @type {AudioContext | null} */ var context=null;
    /** @typedef {import('./engine-types').FlightMix} FlightMix */
    /** @type {GainNode | null} */ var flightBus = null;
    /** @type {GainNode | null} */ var weaponsBus = null;
    /** @type {GainNode | null} */ var impactsBus = null;
    /** @type {GainNode | null} */ var commsBus = null;
    var commsActive = false, musicActive = false, impactUntil = 0;
    var mix = loadMix();
    /** @param {Partial<FlightMix>} value @returns {FlightMix} */
    function normalizeMix(value) {
      return {engine:volumeValue(value.engine,.55), weapons:volumeValue(value.weapons,.55),
        impacts:volumeValue(value.impacts,.85), comms:volumeValue(value.comms,.85), ducking:value.ducking !== false};
    }
    function loadMix() {
      try {
        /** @type {unknown} */ var value = JSON.parse(global.localStorage.getItem('driftworks-flight-mix-v1') || 'null');
        if(value && typeof value==='object') return normalizeMix(/** @type {Partial<FlightMix>} */(value));
      } catch(error) { /* Optional preferences. */ }
      return normalizeMix({});
    }
    /** @param {FlightMix} value @param {boolean} speech @param {boolean} hit */
    function mixLevels(value, speech, hit) {
      var talking = value.ducking && speech && value.comms > 0;
      return {engine:value.engine * (musicActive ? Math.pow(10, -3 / 20) : 1) * Math.min(talking?.84:1, value.ducking && hit && value.impacts > 0?.3:1),
        weapons:value.weapons * (talking?.6:1), impacts:value.impacts, comms:value.comms*.5};
    }
    function applyMix() {
      if(!context || !flightBus || !weaponsBus || !impactsBus || !commsBus)return;
      var now=context.currentTime, hit=now<impactUntil, levels=mixLevels(mix,commsActive,hit);
      [[flightBus,levels.engine],[weaponsBus,levels.weapons],[impactsBus,levels.impacts],[commsBus,levels.comms]].forEach(function(pair){
        var bus=/** @type {GainNode} */(pair[0]), level=/** @type {number} */(pair[1]);
        bus.gain.cancelScheduledValues(now);
        bus.gain.setTargetAtTime(level,now,level < bus.gain.value ? .035 : .22);
      });
      if(hit)flightBus.gain.setTargetAtTime(mixLevels(mix,commsActive,false).engine,impactUntil,.22);
    }
    /** @param {Partial<FlightMix>} value */
    function setMix(value) {
      mix=normalizeMix(Object.assign({},mix,value));
      try{global.localStorage.setItem('driftworks-flight-mix-v1',JSON.stringify(mix));}catch(error){/* Optional. */}
      applyMix();
    }
    /** @param {boolean} active */
    function setCommsActive(active) { commsActive=active;applyMix(); }
    /** @param {boolean} active */
    function setMusicActive(active) {
      if (musicActive === active) return;
      musicActive = active;
      applyMix();
    }
    /** @param {HTMLElement} host */
    function mountMixer(host) {
      var details=global.document.createElement('details'), summary=global.document.createElement('summary');
      summary.textContent='Sound balance'; details.appendChild(summary);
      var description=global.document.createElement('p');description.textContent='Engine stays behind comms and impacts. Levels are remembered in this browser.';details.appendChild(description);
      /** @type {('master'|'engine'|'weapons'|'impacts'|'comms')[]} */ var channels=['master','engine','weapons','impacts','comms'];
      /** @type {HTMLInputElement[]} */ var sliders=[];
      channels.forEach(function(channel){
        var label=global.document.createElement('label'), slider=global.document.createElement('input'), readout=global.document.createElement('output');
        label.textContent=channel==='master'?'All sound effects':channel.charAt(0).toUpperCase()+channel.slice(1);
        slider.type='range';slider.min='0';slider.max='1';slider.step='.01';
        slider.value=String(channel==='master'?options.getMaster():mix[channel]);
        slider.setAttribute('aria-label',channel==='master'?'All sound effects volume':channel+' volume');
        function change(){readout.textContent=' '+Math.round(Number(slider.value)*100)+'%';}
        slider.oninput=function(){if(channel==='master')options.setMaster(Number(slider.value));else setMix({[channel]:Number(slider.value)});change();};
        change();label.append(readout,slider);details.appendChild(label);sliders.push(slider);
      });
      var duckLabel=global.document.createElement('label'), duck=global.document.createElement('input');
      duck.type='checkbox';duck.checked=mix.ducking;duck.style.width='auto';
      duck.onchange=function(){setMix({ducking:duck.checked});};duckLabel.append(duck,' Prioritize comms and impacts');details.appendChild(duckLabel);
      var reset=global.document.createElement('button');reset.type='button';reset.textContent='Reset sound balance';
      reset.onclick=function(){setMix(normalizeMix({}));options.setMaster(1);sliders.forEach(function(slider,index){var channel=channels[index];slider.value=String(channel==='master'?1:mix[channel]);if(slider.oninput)slider.dispatchEvent(new Event('input'));});duck.checked=mix.ducking;};
      details.appendChild(reset);host.appendChild(details);
    }

    /** @param {AudioContext} ctx @param {GainNode} effects @param {GainNode} master @param {AudioNode} destination */
    function attach(ctx, effects, master, destination) {
      context=ctx;
      flightBus=ctx.createGain(); weaponsBus=ctx.createGain(); impactsBus=ctx.createGain(); commsBus=ctx.createGain();
      [flightBus,weaponsBus,impactsBus,commsBus].forEach(function(bus){bus.gain.value=0;bus.connect(effects);});
      var limiter=ctx.createDynamicsCompressor();
      limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=4;limiter.attack.value=.003;limiter.release.value=.18;
      master.connect(limiter).connect(destination);
      applyMix();
    }
    return {get:function(){return Object.assign({},mix);}, set:setMix, setCommsActive:setCommsActive, setMusicActive:setMusicActive,
      impact:function(){if(context){impactUntil=context.currentTime+.22;applyMix();}},
      mount:mountMixer, attach:attach, normalize:normalizeMix, levels:mixLevels,
      channel:/** @param {'engine'|'weapons'|'impacts'|'comms'} name */ function(name) {
        return name==='engine'?flightBus:name==='weapons'?weaponsBus:name==='impacts'?impactsBus:commsBus;
      }};
  }
  Driftworks.audioMixer = {create:createMixer};
})(window);
