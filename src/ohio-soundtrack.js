(function(global){
  'use strict';
  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  var DW=/** @type {Required<DriftworksNamespace>} */(global.Driftworks);
  /** @param {(active:boolean)=>void} setMusicActive @param {(value:number,fallback:number)=>number} volumeValue @returns {import('./types').OhioSoundtrack} */
  function create(setMusicActive,volumeValue) {
    var assetUrl = /** @type {NonNullable<DriftworksNamespace['assetUrl']>} */ (window.Driftworks.assetUrl);
    var intro = new global.Audio(assetUrl('../assets/audio/ohio/radio-intro.wav'));
    var song = new global.Audio(assetUrl('../assets/audio/ohio/open-highway-spirit.m4a'));
    intro.playbackRate = 1.25;
    intro.preservesPitch = true;
    song.loop = true;
    intro.preload = song.preload = 'auto';
    var activated=false;
    var running = false, handedOff = false, songStarted = false;
    var songSeconds = 0, lastSongTime = 0;
    var level = .65;
    try { var saved = global.localStorage.getItem('driftworks-ohio-music-volume'); if(saved !== null) level = volumeValue(Number(saved), level); } catch (_) { /* Optional preferences. */ }
    function play(/** @type {HTMLAudioElement} */ media) { media.play().catch(function () { /* Retry on the next resume gesture. */ }); }
    function update() {
      var remaining = (intro.duration - intro.currentTime) / intro.playbackRate;
      var fade = handedOff ? 1 : isFinite(remaining) ? Math.max(0, Math.min(1, 1 - remaining / 3)) : 0;
      setMusicActive(running && level > 0 && (!intro.paused || !song.paused));
      intro.volume = level * (1 - fade);
      if (songStarted) {
        var songTime = song.currentTime;
        var advanced = songTime >= lastSongTime ? songTime - lastSongTime : song.duration - lastSongTime + songTime;
        if (isFinite(advanced)) songSeconds += Math.max(0, advanced);
        lastSongTime = songTime;
      }
      // Give the gag ten seconds, then settle the loop at 30% of its initial level.
      var settle = Math.max(0, Math.min(1, (songSeconds - 10) / 20));
      song.volume = level * fade * Math.pow(.30, settle);
      if (running && fade > 0 && !songStarted) { songStarted = true; play(song); }
    }
    intro.onended = function () { handedOff = true; update(); };
    intro.onerror = function () { handedOff = true; update(); };
    intro.ontimeupdate = update;
    function pause() { running = false; intro.pause(); song.pause(); update(); }
    global.addEventListener('pagehide', pause);
    function resume(){running=true;update();if(!handedOff)play(intro);if(songStarted)play(song);}
    return {
      resume:resume,
      resumeIfStarted:function(){if(activated)resume();},
      canSpeak:function(){return !activated||handedOff;},
      updateMission:function(combat,onAnnounceStart){if(!activated&&combat.openingStep>DW.flightMissions.resolve(combat.mode).opening.length){activated=true;onAnnounceStart();resume();}},
      pause: pause, update: update,
      isAnnouncing: function () { return !handedOff; },
      mount: function (/** @type {HTMLElement} */ host) {
        var label = global.document.createElement('label'), slider = global.document.createElement('input');
        label.textContent = 'Ohio radio / music';
        slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '.01'; slider.value = String(level);
        slider.setAttribute('aria-label', 'Ohio radio and music volume');
        slider.oninput = function () { level = volumeValue(Number(slider.value), level); update(); try { global.localStorage.setItem('driftworks-ohio-music-volume', String(level)); } catch (_) { /* Optional. */ } };
        label.appendChild(slider); host.appendChild(label);
      }
    };
  }

  DW.ohioSoundtrack={create:create};
})(window);
