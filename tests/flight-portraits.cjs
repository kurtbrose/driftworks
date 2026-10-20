const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async function(){
  let now=2000,lastLayers=[],created=0,canvas,loaded=0,offsetSeen,disposed=0,canvases=0;
  const lifecycle={},bitmaps=[],requests=[],idle=[];let failNext=false,suspendNext=false,resumeFetch;
  const classes=new Set(),calls=[];
  const document={baseURI:'http://localhost:8000/experiments/flight.html',createElement(){canvases++;
    return {ownerDocument:document,width:0,height:0,dataset:{},setAttribute(name,value){this[name]=value;},getContext(){return {clearRect(){},fillRect(){},drawImage(){},createRadialGradient(){return {addColorStop(){}};}};}};
  }};
  const panel={ownerDocument:document,appendChild(value){canvas=value;},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
  const window={Driftworks:{},matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{lifecycle[name]=fn;},requestIdleCallback:fn=>{idle.push(fn);}};
  const box={window,document,URL,AbortController,Float32Array,console,performance:{now:()=>now},
    fetch:(url,options)=>{assert.ok(url.startsWith('http://localhost:8000/assets/portraits/dogfight/runtime/portrait-'));loaded++;requests.push({url,signal:options.signal});const ok=!failNext;failNext=false;const response={ok,status:ok?200:503,blob:()=>Promise.resolve({url})};if(suspendNext){suspendNext=false;return new Promise(resolve=>{resumeFetch=()=>resolve(response);});}return Promise.resolve(response);},
    createImageBitmap:blob=>{const bitmap={url:blob.url,width:1792,height:256,closed:false,close(){this.closed=true;}};bitmaps.push(bitmap);return Promise.resolve(bitmap);}
  };
  async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
  vm.createContext(box);
  for(const file of ['experiments/mumble.js','experiments/comms-display.js','experiments/speech-sprites/generated-v1/face-blend.js','experiments/flight-portraits.js'])vm.runInContext(fs.readFileSync(file,'utf8'),box);
  const DW=window.Driftworks,api=DW.flightPortraits;
  DW.faceBlend.create=(target,frames)=>{
    created++;const bitmap=frames.master.image;assert.deepEqual(Array.from(frames.master.rect),[0,0,256,256]);assert.equal(frames.ah.image,bitmap);assert.equal(frames.eh,frames.ah);
    return {draw:layers=>{assert.ok(!bitmap.closed,'Active rendering cannot use an evicted bitmap');lastLayers=layers;},dispose:()=>{disposed++;}};
  };
  assert.equal(api.slot({portraitIndex:0}),1);assert.equal(api.slot({portraitIndex:1}),0);
  assert.equal(new Set(Array.from({length:16},(_,portraitIndex)=>api.slot({portraitIndex}))).size,16);assert.equal(api.slot({portraitIndex:8}),8);assert.equal(api.slot({portraitIndex:-1}),16);assert.ok(!Array.from({length:16},(_,portraitIndex)=>api.slot({portraitIndex})).includes(api.slot({portraitIndex:-1})));
  assert.equal(api.slot({portraitIndex:Infinity}),16);
  for(const [current,stress,expected] of [['calm',0,'neutral'],['calm',.7,'afraid'],['calm',.4,'angry'],['frustrated',0,'angry'],['afraid',0,'afraid'],['panicked',0,'afraid'],['confused',0,'afraid'],['relieved',0,'smile'],['confident',0,'smile'],['reassuring',0,'smile']])assert.equal(api.expression({current,stress,intensity:1}),expected);
  const view=api.mount(panel),line={portraitIndex:0,speaker:'WING ROOK / COVER',emotion:{current:'relieved',intensity:1,stress:0}};
  assert.equal(loaded,0,'Mount defers compact-asset warm-up until idle time');
  view.show(line);view.show({...line,portraitIndex:1,speaker:'WING LYNX / COVER'});
  await flush();
  assert.equal(created,1,'Late first-speaker image loading cannot replace the newer speaker');assert.equal(loaded,2);assert.equal(canvases,3,'Poses are atlas rectangles, not permanently cached canvases');
  assert.equal(canvas['aria-label'],'WING LYNX speaking portrait');assert.ok(classes.has('has-portrait'));assert.equal(lastLayers[0].image,'smile');
  const plan=DW.mumble.analyze('Moon, crew!',{seed:17});const cue=plan.events.find(e=>e.kind==='syllable'),audio={currentTime:0};
  view.play(plan,audio,0,.16);view.update(undefined,true);assert.ok(lastLayers.every(l=>l.image!=='oo'&&l.image!=='ah'));
  audio.currentTime=.16+cue.start+.025;view.update({current:'panicked',stress:.9,intensity:1},true);
  assert.equal(lastLayers[0].image,'afraid');assert.ok(lastLayers.some(l=>l.image==='oo'));assert.ok(lastLayers.every(l=>l.alpha===1));
  const pattern=DW.mumble.radioNoise(Math.ceil(plan.duration*22050),22050,{edgeScale:2.5});
  view.play(plan,audio,0,.4,pattern);audio.currentTime=pattern.duration;view.update(undefined,true);assert.ok(!canvas.hidden,'Playback completion keeps portrait for the sign-off');assert.ok(lastLayers.every(l=>l.image!=='oo'),'Playback clock closes mouth before onended');
  view.stop();assert.ok(canvas.hidden,'Audio stop must cut the portrait immediately');assert.ok(!classes.has('has-portrait'));
  view.show(line);view.clear();for(let i=0;i<5;i++)await Promise.resolve();assert.ok(canvas.hidden);assert.ok(!classes.has('has-portrait'));
  // Background warm-up is sequential and reuses foreground requests.
  let warmed=0;
  while(idle.length){const before=loaded;idle.shift()();assert.ok(loaded<=before+1,'Warm-up starts at most one character per idle callback');await flush();warmed++;}
  assert.equal(warmed,16);assert.equal(loaded,16,'Each compact character is requested once, including foreground callers');
  assert.equal(bitmaps.filter(b=>!b.closed).length,16);assert.equal(canvases,3,'Whole-cast warm-up must not create pose canvases');
  const warmLoads=loaded;
  for(let index=0;index<16;index++){view.show({...line,portraitIndex:index});await flush();}
  assert.equal(loaded,warmLoads,'Every warmed character is immediately reusable without another load');assert.ok(disposed>0);
  view.show({...line,portraitIndex:-1,speaker:'CONTROL / COMMAND'});await flush();assert.equal(loaded,warmLoads+1);assert.ok(bitmaps.some(b=>!b.closed&&b.url.endsWith('portrait-16.png')),'Control has its own compact atlas');assert.equal(bitmaps.filter(b=>!b.closed).length,17);
  lifecycle.pagehide();assert.ok(canvas.hidden);assert.ok(bitmaps.every(b=>b.closed),'Page exit closes the entire fixed cast cache');
  // A foreground caller must not wait behind another character's warm-up.
  suspendNext=true;lifecycle.pageshow({persisted:true});idle.shift()();
  view.show({...line,portraitIndex:1,speaker:'WING LYNX / COVER'});await flush();
  assert.ok(!canvas.hidden);assert.equal(canvas['aria-label'],'WING LYNX speaking portrait');
  resumeFetch();await flush();assert.equal(canvas['aria-label'],'WING LYNX speaking portrait');
  lifecycle.pagehide();while(idle.length)idle.shift()();await flush();
  // Failed loads must leave the glyph fallback and be retryable.
  failNext=true;view.show({...line,portraitIndex:4});await flush();assert.ok(canvas.hidden);assert.ok(!classes.has('has-portrait'));
  const failedLoads=loaded;view.show({...line,portraitIndex:4});await flush();assert.equal(loaded,failedLoads+1);assert.ok(!canvas.hidden);
  // Page exit aborts pending requests; late decodes must be closed too.
  let finishDecode;box.createImageBitmap=blob=>new Promise(resolve=>{finishDecode=()=>{const bitmap={url:blob.url,width:1792,height:256,closed:false,close(){this.closed=true;}};bitmaps.push(bitmap);resolve(bitmap);};});
  view.show(line);await flush();lifecycle.pagehide();finishDecode();await flush();assert.ok(bitmaps.every(b=>b.closed));
  assert.ok(requests.filter(r=>r.signal.aborted).length>0);
  lifecycle.pageshow({persisted:true});assert.ok(idle.length>0,'Restored pages restart background warm-up');
  lifecycle.pagehide();const beforeCancelled=loaded;while(idle.length)idle.shift()();await flush();assert.equal(loaded,beforeCancelled,'Cancelled idle callbacks cannot restart asset loads');
  // Exercise the actual radio adapter's playback clock, live feelings and cleanup.
  let queue=line,ended,startTime,sharedNoise,transmitNoise;
  const context={state:'running',currentTime:2,createBuffer:()=>({copyToChannel(){}}),createBufferSource:()=>({connect(){},disconnect(){},stop(){},start(t){startTime=t;},set onended(fn){ended=fn;}})};
  DW.flightPortraits.mount=()=>({show:l=>calls.push(['show',l]),play:(p,c,t,o,n)=>{sharedNoise=n;offsetSeen=o;calls.push(['play',t]);},finish:()=>calls.push(['finish']),decay:p=>calls.push(['decay',p]),stop:()=>calls.push(['stop']),clear:()=>calls.push(['clear']),update:feeling=>calls.push(['update',feeling])});
  const feeling={current:'frustrated',stress:.5,intensity:1};
  DW.flightComms={create:()=>({emotions:{wing:feeling}}),step:()=>{const value=queue;queue=null;return value;}};
  DW.flightDialogue={voiceOptions:()=>({seed:17})};DW.audio={setCommsActive(){},commsChannel:()=>({context,output:{}})};
  DW.mumble.render=()=>new Float32Array(10);DW.mumble.transmit=(pcm,rate,options)=>{transmitNoise=options.noise;return {samples:new Float32Array(10),duration:1,speechOffset:.4};};
  vm.runInContext(fs.readFileSync('experiments/flight-radio.js','utf8'),box);
  const panelClasses=new Set();
  const fields=[{},{}],radioPanel={querySelector:s=>s==='[data-speaker]'?fields[0]:fields[1],classList:{add:name=>panelClasses.add(name),remove:name=>panelClasses.delete(name),toggle(){}}},toggle={setAttribute(){}};
  queue={...line,craftId:'wing',text:'Cover me!',voice:'Scout',voiceSettings:{seed:17},seed:17,radioSeed:1};
  const radio=DW.flightRadio.mount(radioPanel,toggle);radio.unlock();radio.update(0,{},{});
  assert.equal(startTime,2);assert.equal(offsetSeen,.4);assert.equal(sharedNoise,transmitNoise,'Audio and picture must receive the exact same noise object');assert.equal(sharedNoise.edgeScale,2.5);assert.equal(sharedNoise.effects,.45);assert.equal(calls.find(c=>c[0]==='play')[1],2);
  assert.equal(calls.filter(c=>c[0]==='update').at(-1)[1],feeling);
  assert.ok(!panelClasses.has('idle'));ended();assert.ok(!panelClasses.has('idle'),'Half-second sign-off keeps text readable after audio completion');assert.ok(calls.some(c=>c[0]==='finish'));context.currentTime=2.49;radio.update(.49,{},{});assert.ok(!panelClasses.has('idle'));assert.equal(fields[1].textContent,'Cover me!','Player-facing subtitle stays clean and readable through sign-off');assert.ok(calls.some(c=>c[0]==='decay'&&c[1]>.95));context.currentTime=2.5;radio.update(.01,{},{});assert.ok(panelClasses.has('idle'),'Whole transmission hides after the half-second decay');assert.equal(fields[1].textContent,'');assert.ok(calls.some(c=>c[0]==='stop'));radio.reset();assert.ok(calls.some(c=>c[0]==='clear'));
  console.log('PASS dogfight portraits: stable cast, mood/stress mapping, fixed compact bitmap cache, idle warm-up, foreground priority, retries, late-decode cleanup, audio timing and live feelings');
})().catch(error=>{console.error(error);process.exitCode=1;});
