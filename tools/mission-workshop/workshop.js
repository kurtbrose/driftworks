(async function () {
  'use strict';
  const $ = id => document.getElementById(id), catalog = window.MissionWorkshopCatalog, model = window.MissionWorkshopModel;
  let state = model.fresh(), db, saveQueue = Promise.resolve(), sceneId = catalog.scenes[0].id, missionId = 'evacuation', characterId = '', recorder, stream, context, analyser, animation, chunks = [], recording, stopping = false, urls = [], sceneAudio, playbackToken = 0;
  function message(text) { $('message').textContent = text; }
  function fail(error) { console.error(error); message(error.message || String(error)); }
  function request(req) { return new Promise((resolve,reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  function transactionDone(tx) { return new Promise((resolve,reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Storage transaction aborted')); }); }
  try {
    const open = indexedDB.open('driftworks-mission-workshop',1);
    open.onupgradeneeded = () => open.result.createObjectStore('session');
    db = await request(open);
    const saved = await request(db.transaction('session').objectStore('session').get('current'));
    if (saved) state = model.validate(saved);
    $('storage').textContent = 'Local session ready · back up to preserve recordings';
  } catch(error) { $('storage').textContent = 'Local storage unavailable · export before closing'; fail(error); }
  function save() {
    if (!db) { $('storage').textContent = 'Not saved · back up before closing'; return Promise.resolve(); }
    $('storage').textContent = 'Saving…';
    const snapshot = structuredClone(state);
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const tx = db.transaction('session','readwrite'), done = transactionDone(tx);
      tx.objectStore('session').put(snapshot,'current'); await done;
      $('storage').textContent = 'Saved locally · ' + new Date().toLocaleTimeString();
    }).catch(error => { $('storage').textContent = 'Save failed · back up before closing'; fail(error); });
    return saveQueue;
  }
  const characters = () => catalog.characters.concat(state.characters), scenes = () => catalog.scenes.concat(state.scenes), lines = () => catalog.lines.concat(state.lines);
  const currentText = id => model.text(catalog,state,id);
  function node(tag, text, className) { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; if (className) result.className = className; return result; }
  function button(text, action, className) { const el = node('button',text,className); el.onclick = () => Promise.resolve().then(action).catch(fail); return el; }
  function option(select,value,text) { const o = node('option',text); o.value = value; select.append(o); }
  function allBusy(value) {
    for (const el of document.querySelectorAll('select,textarea,#add-character,#add-scene,#add-line,#restore,#play-scene,#backup,#revision')) el.disabled = value;
    for (const el of document.querySelectorAll('#scenes button,.record,.take button')) el.disabled = value;
  }
  function stopPlayback() { playbackToken++; if (sceneAudio) { sceneAudio.pause(); sceneAudio.dispatchEvent(new Event('ended')); sceneAudio = null; } document.querySelectorAll('audio').forEach(audio => audio.pause()); }
  function render() {
    stopPlayback(); urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    $('character').replaceChildren(); option($('character'),'','All characters / scene order');
    characters().forEach(c => option($('character'),c.id,c.name)); $('character').value = characterId;
    $('mission').replaceChildren(); catalog.missions.forEach(m => option($('mission'),m.id,m.title)); $('mission').value = missionId;
    const mission = catalog.missions.find(m => m.id === missionId), scene = scenes().find(s => s.id === sceneId);
    $('mission-label').textContent = mission.title; $('scene-title').textContent = scene.title; $('mission-context').textContent = mission.context;
    $('context').value = state.contexts[sceneId] ?? scene.context; $('plot').value = state.plots[missionId] || '';
    $('scenes').replaceChildren();
    scenes().filter(s => s.mission === missionId).forEach(s => {
      const rows = lines().filter(l => l.scene === s.id && (!characterId || l.character === characterId));
      const el = button(s.title,() => { sceneId = s.id; render(); },s.id === sceneId ? 'active' : '');
      el.append(node('small',rows.length + ' lines')); $('scenes').append(el);
    });
    $('lines').replaceChildren();
    const rows = lines().filter(l => l.scene === sceneId && (!characterId || l.character === characterId));
    rows.forEach(renderLine);
    if (!rows.length) $('lines').append(node('p','No lines for this character here. Choose another scene, show all characters, or add a line.','empty'));
    $('progress').textContent = rows.filter(l => state.takes.some(t => t.line === l.id && t.chosen && !model.stale(t,currentText(l.id)))).length + ' / ' + rows.length + ' lines have a current chosen take';
    $('dynamic-panel').hidden = missionId !== 'convoy'; $('dynamic-summary').textContent = catalog.dynamic.length + ' dynamic runtime call sites / source references';
    $('dynamic').replaceChildren(); catalog.dynamic.forEach(c => { $('dynamic').append(node('p',c.file + ':' + c.line), node('pre',c.expression)); });
  }
  function renderLine(line) {
    const card = node('article',undefined,'line-card'); card.dataset.line = line.id;
    const top = node('div',undefined,'line-top'), identity = node('div');
    identity.append(node('span',characters().find(c => c.id === line.character)?.name || line.character,'speaker'));
    const tag = node('span',line.source ? 'SCRIPT' : 'DRAFT / needs integration','tag'); identity.append(tag); top.append(identity); card.append(top);
    if (!line.source) {
      const speakerLabel = node('label','Speaker'), speaker = node('select');
      characters().forEach(c => option(speaker,c.id,c.name)); speaker.value = line.character;
      speaker.onchange = () => { line.character = speaker.value; save(); render(); };
      speakerLabel.append(speaker); card.append(speakerLabel);
    }
    const text = node('textarea',undefined,'line-text'); text.value = currentText(line.id); text.setAttribute('aria-label','Line for ' + identity.textContent);
    const directionLabel = node('label','Performance intention / revision note'), direction = node('input'); direction.type = 'text'; direction.value = state.edits[line.id]?.direction || line.direction || ''; direction.placeholder = 'Who am I talking to? What do I need from them?'; directionLabel.append(direction);
    const update = () => {
      model.edit(catalog,state,line.id,text.value,direction.value); save();
      card.querySelectorAll('.take').forEach(row => {
        const take = state.takes.find(t => t.id === row.dataset.take), stale = model.stale(take,text.value);
        row.classList.toggle('stale',stale); row.querySelector('small').textContent = stale ? 'Older wording · needs another take' : 'Matches current wording';
      });
      const visible = lines().filter(l => l.scene === sceneId && (!characterId || l.character === characterId));
      $('progress').textContent = visible.filter(l => state.takes.some(t => t.line === l.id && t.chosen && !model.stale(t,currentText(l.id)))).length + ' / ' + visible.length + ' lines have a current chosen take';
    };
    text.oninput = update; direction.oninput = update;
    const bottom = node('div',undefined,'line-bottom'), record = button('● Record take',() => startRecording(line.id), 'record');
    bottom.append(directionLabel,record); card.append(text,bottom);
    if (line.source) {
      const changed = line.source.hash !== state.edits[line.id]?.sourceHash && state.edits[line.id]?.sourceHash;
      card.append(node('p',(changed ? 'SOURCE CHANGED · reconcile draft before applying. ' : '') + line.source.file + ':' + line.source.line + ' · ' + line.id,'source'));
      if (state.edits[line.id]) card.append(button('Use current source wording',() => {
        if (!confirm('Replace this draft wording with the current source? Recorded takes will be kept.')) return;
        const intention = state.edits[line.id].direction; delete state.edits[line.id];
        model.edit(catalog,state,line.id,line.text,intention); save(); render();
      },'subtle'));
    }
    const takeList = node('div',undefined,'takes');
    state.takes.filter(t => t.line === line.id).forEach((take,i) => {
      const stale = model.stale(take,currentText(line.id)), row = node('div',undefined,'take' + (stale ? ' stale' : ''));
      row.dataset.take = take.id;
      const info = node('div'); info.append(node('div','Take ' + (i+1) + ' · ' + take.duration.toFixed(1) + 's' + (take.chosen ? ' · CHOSEN' : '') + (take.clipped ? ' · CLIPPED' : ''),take.chosen ? 'chosen' : ''));
      info.append(node('small',stale ? 'Older wording · needs another take' : 'Matches current wording')); row.append(info);
      const audio = node('audio'); audio.controls = true; audio.preload = 'none'; const url = URL.createObjectURL(take.blob); urls.push(url); audio.src = url;
      audio.onplay = () => { document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }); }; row.append(audio);
      row.append(button(take.chosen ? 'Unchoose' : 'Choose',() => { const chosen = !take.chosen; state.takes.filter(t => t.line === line.id).forEach(t => t.chosen = false); take.chosen = chosen; save(); render(); }));
      row.append(button('Download',() => download(take.blob,safe(line.id) + '-' + take.id + extension(take.blob.type))));
      row.append(button('Delete',() => { if (!confirm('Delete this recording? Backups remain available.')) return; state.takes = state.takes.filter(t => t.id !== take.id); save(); render(); }));
      const wording = node('details'); wording.append(node('summary','Recorded wording'),node('p',take.text)); row.append(wording); takeList.append(row);
    });
    card.append(takeList); $('lines').append(card);
  }
  const safe = value => value.replace(/[^a-z0-9_-]/gi,'-');
  const extension = type => type.includes('ogg') ? '.ogg' : type.includes('mp4') ? '.m4a' : '.webm';
  function download(blob,name) { const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),10000); }
  function jsonDownload(value,name) { download(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),name); }
  function disconnect() { cancelAnimationFrame(animation); stream?.getTracks().forEach(t => t.stop()); stream = null; if (context) context.close(); context = null; analyser = null; $('level').value = 0; }
  async function connect() {
    if (recording) return;
    disconnect();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Error('Recording needs a supported browser on localhost or HTTPS.');
    const chosen = $('device').value;
    stream = await navigator.mediaDevices.getUserMedia({audio:{deviceId:chosen ? {exact:chosen} : undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    try {
      context = new AudioContext(); await context.resume();
      analyser = context.createAnalyser(); analyser.fftSize = 2048; const input = context.createMediaStreamSource(stream); input.connect(analyser);
      if ($('monitor').checked) analyser.connect(context.destination);
      const samples = new Float32Array(analyser.fftSize); let lastClip = -Infinity;
      function meter() {
        if (!analyser) return; analyser.getFloatTimeDomainData(samples);
        const peak = samples.reduce((max,n) => Math.max(max,Math.abs(n)),0); $('level').value = peak;
        if (peak >= .98) { lastClip = performance.now(); if (recording) recording.clipped = true; }
        $('audio-status').textContent = performance.now()-lastClip < 1500 ? 'Clipping detected · reduce input gain.' : 'Input ready · peak ' + (peak ? (20*Math.log10(peak)).toFixed(0) : '−∞') + ' dBFS';
        animation = requestAnimationFrame(meter);
      }
      meter();
      const devices = await navigator.mediaDevices.enumerateDevices(); $('device').replaceChildren(); option($('device'),'','System default'); devices.filter(d => d.kind === 'audioinput').forEach(d => option($('device'),d.deviceId,d.label || 'Microphone')); $('device').value = chosen;
      message('Microphone enabled. Monitoring is optional; use headphones.');
    } catch(error) { disconnect(); throw error; }
  }
  async function startRecording(id) {
    if (recording || stopping) return;
    stopPlayback(); allBusy(true);
    try {
      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) await connect();
      const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream,mime ? {mimeType:mime} : {}); chunks = [];
      recording = {id:crypto.randomUUID(),line:id,text:currentText(id),direction:state.edits[id]?.direction || '',chosen:false,started:performance.now(),clipped:false};
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const take = recording;
        if (chunks.length) { state.takes.push({...take,duration:take.duration ?? (performance.now()-take.started)/1000,blob:new Blob(chunks,{type:recorder.mimeType})}); save(); message(take.clipped ? 'Take saved · clipping detected; consider reducing gain.' : 'Take saved. Listen back, retry, or choose it.'); }
        else message('No audio received. Check the input and try again.');
        recording = null; stopping = false; allBusy(false); $('connect').disabled = false; render();
      };
      recorder.onerror = event => { message('Recording error. Check input before retrying.'); if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.start(); $('connect').disabled = true;
      const recordButton = document.querySelector('[data-line="' + id + '"] .record'); recordButton.disabled = false; recordButton.textContent = '■ Stop recording'; recordButton.classList.add('recording');
      recordButton.onclick = () => { if (stopping) return; stopping = true; recording.duration = (performance.now()-recording.started)/1000; recordButton.disabled = true; recorder.stop(); };
      message('Recording…');
    } catch(error) { recording = null; stopping = false; allBusy(false); fail(error); }
  }
  $('connect').onclick = () => connect().catch(fail);
  $('device').onchange = () => connect().catch(fail);
  $('monitor').onchange = () => { if (!analyser) return; analyser.disconnect(); if ($('monitor').checked) analyser.connect(context.destination); };
  $('character').onchange = () => { characterId = $('character').value; render(); };
  $('mission').onchange = () => { missionId = $('mission').value; sceneId = scenes().find(s => s.mission === missionId).id; render(); };
  $('context').oninput = () => { state.contexts[sceneId] = $('context').value; save(); };
  $('plot').oninput = () => { state.plots[missionId] = $('plot').value; save(); };
  $('add-character').onclick = () => { const name = prompt('Character name / role'); if (!name?.trim()) return; const id = 'draft-character-' + crypto.randomUUID(); state.characters.push({id,name:name.trim()}); characterId = id; save(); render(); };
  $('add-scene').onclick = () => { const title = prompt('Scene title'); if (!title?.trim()) return; sceneId = 'draft-scene-' + crypto.randomUUID(); state.scenes.push({id:sceneId,mission:missionId,title:title.trim(),context:''}); save(); render(); };
  $('add-line').onclick = () => {
    const speaker = characterId || characters()[0].id;
    if (!characterId) message('New line assigned to ' + characters()[0].name + '. Select a character before adding to use another speaker.');
    state.lines.push({id:'draft-line-' + crypto.randomUUID(),scene:sceneId,character:speaker,text:'',direction:''}); save(); render();
  };
  $('revision').onclick = () => jsonDownload(model.revision(catalog,state),'driftworks-script-revisions.json');
  $('backup').onclick = async () => {
    try {
      const snapshot = structuredClone(state);
      const takes = await Promise.all(snapshot.takes.map(async take => {
        const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(take.blob); });
        const {blob,...metadata} = take; return {...metadata,data};
      }));
      jsonDownload({...snapshot,takes},'driftworks-workshop-backup.json'); message('Backup exported with all recordings.');
    } catch(error) { fail(error); }
  };
  $('restore').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.takes)) throw Error('Invalid backup');
      imported.takes = imported.takes.map(take => {
        if (typeof take.data !== 'string' || !/^data:audio\/[^,\r\n]+;base64,/.test(take.data)) throw Error('Invalid audio in backup');
        const split = take.data.indexOf(','), type = take.data.slice(5,split).replace(/;base64$/,''), raw = atob(take.data.slice(split+1));
        const {data,...metadata} = take; return {...metadata,blob:new Blob([Uint8Array.from(raw,c => c.charCodeAt(0))],{type})};
      });
      model.validate(imported);
      const knownCharacters = new Set(catalog.characters.concat(imported.characters).map(c => c.id)), knownScenes = new Set(catalog.scenes.concat(imported.scenes).map(s => s.id)), knownLines = new Set(catalog.lines.concat(imported.lines).map(l => l.id));
      if (imported.scenes.some(s => !catalog.missions.some(m => m.id === s.mission)) || imported.lines.some(l => !knownCharacters.has(l.character) || !knownScenes.has(l.scene)) || imported.takes.some(t => !knownLines.has(t.line))) throw Error('Backup has missing character, scene or line references');
      if (!confirm('Replace this local session with the backup? Export your current session first if needed.')) return;
      stopPlayback(); state = imported; sceneId = catalog.scenes[0].id; missionId = 'evacuation'; characterId = ''; await save(); render(); message('Backup restored.');
    } catch(error) { fail(error); } finally { event.target.value = ''; }
  };
  $('play-scene').onclick = async () => {
    stopPlayback(); const token = playbackToken;
    const rows = lines().filter(l => l.scene === sceneId); let played = 0, skipped = 0;
    try {
      for (const line of rows) {
        if (token !== playbackToken) return;
        const take = state.takes.find(t => t.line === line.id && t.chosen && !model.stale(t,currentText(line.id)));
        if (!take) { skipped++; continue; }
        const url = URL.createObjectURL(take.blob); sceneAudio = new Audio(url);
        const ended = new Promise((resolve,reject) => { sceneAudio.onended = resolve; sceneAudio.onerror = () => reject(Error('Cannot play this take')); });
        message('Scene playback · ' + characters().find(c => c.id === line.character)?.name + ': ' + currentText(line.id));
        try { await sceneAudio.play(); await ended; played++; } finally { URL.revokeObjectURL(url); }
      }
      if (token === playbackToken) message('Scene playback finished · ' + played + ' played, ' + skipped + ' without a current chosen take.');
    } catch(error) { fail(error); }
  };
  $('stop-scene').onclick = stopPlayback;
  window.addEventListener('beforeunload',event => { if (recording) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide',disconnect);
  render();
}());
