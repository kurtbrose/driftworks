(function () {
  'use strict';
  var DW = window.Driftworks;
  var lines = {
    range: ['Range is clear. Enjoy the view, pilot.', 'Keep your turns smooth. We are watching from control.', 'All systems look good from here.'],
    ally: ['On your wing. Keep them busy!', 'Nice flying. Leave a few for the rest of us.', 'Stay loose, pilot. We have your back.'],
    enemy: ['That all you have, pilot?', 'Come closer. My guns are getting lonely.', 'You fly like a cargo hauler!'],
    danger: ['Shields are thin. Break away and regroup!', 'Watch your hull, pilot. Keep moving.']
  };
  var calls = {
    support: ["I've got him. Keep moving!", 'On your attacker. Break clear!', 'Covering you. Stay loose!'],
    firing: ['Taking the shot!', 'Guns on target!', 'Stay on him!'],
    target: ['Switching targets.', 'Picking up another fighter.', 'New target. Moving in.'],
    attack: ["I've got him!", 'Moving in. Keep him busy!', 'I have a shot. Going in!'],
    evade: ['Taking fire! Cover me!', 'Get this fighter off me!', 'Under pressure. Need a hand!'],
    break: ['Breaking off!', 'Too close. Pulling away!', 'Cover me. Breaking clear!'],
    recover: ['Coming around for another pass.', 'Regrouping. Keep them occupied!', 'Getting back in the fight.'],
    reposition: ['Moving into position. Cover me.', 'Swinging wide. Hold them here!', 'Setting up another run.']
  };
  var emotionalLines = {
    confused: ['Where is everybody?', "What's happening?", "Which one's ours?"],
    panicked: ["They're everywhere!", "There's too many!", "I can't get away!"],
    afraid: ['Help me!', "I can't shake him!", "I'm hit! I'm hit!"],
    frustrated: ['Come on!', 'Just hold still!', 'I had him!'],
    confident: ["We can do this.", 'One more.', 'Stay with me.'],
    relieved: ["I'm clear!", 'Oh, thank God.', "We're still here."]
  };
  var emotionalReplies = {
    confused: ["I'm here! I'm here!", 'Stay with my voice. We are together.'],
    panicked: ["Keep your cool. We're still in this.", 'Breathe. One at a time.'],
    afraid: ["I'm not leaving you. Just keep moving!", 'Keep your cool. Stay with me.'],
    frustrated: ['Take your time. You will get another shot.', 'We can do this.'],
    relieved: ["We're still here.", 'Good. Stay with us.']
  };
  var emotionStrength = {calm:0,confident:1,relieved:1,frustrated:2,confused:2,afraid:3,panicked:4};
  // Stress is the continuous baseline. Brief event modifiers never suppress fear.
  function deriveEmotion(emotion,time) {
    var was=emotion.current;
    var panic=was==='panicked'?0.65:0.8;
    var fear=was==='afraid'||was==='panicked'?0.25:0.35;
    var modifier=emotion.modifier&&time<emotion.modifier.until?emotion.modifier:null;
    emotion.current=emotion.stress>=panic?'panicked':emotion.stress>=fear?'afraid':modifier?modifier.current:'calm';
    emotion.intensity=emotion.current==='panicked'||emotion.current==='afraid'?emotion.stress:modifier?modifier.intensity*Math.min(1,(modifier.until-time)/3):0;
    if(was!==emotion.current)emotion.announced=null;
  }
  function setEmotion(state,id,current,intensity) {
    var emotion=state.emotions[id];
    if(!emotion)return;
    if(current==='panicked'||current==='afraid'){
      emotion.stress=Math.max(emotion.stress,current==='panicked'?0.85:0.5);
      emotion.recoverAfter=state.time+6;
    }else{
      emotion.modifier={current:current,intensity:intensity,until:state.time+10};
      if(current==='confused'||current==='frustrated')emotion.stress=Math.min(1,emotion.stress+0.08);
    }
    deriveEmotion(emotion,state.time);
  }
  function observeEmotions(state,living,combat,dt) {
    if(state.emotionWave!==combat.wave){state.emotions={};state.emotionalConversation=null;state.emotionWave=combat.wave;}
    var previous=state.situation;
    living.forEach(function(craft){
      var emotion=state.emotions[craft.id];
      if(!emotion)emotion=state.emotions[craft.id]={current:'calm',intensity:0,stress:0,recoverAfter:0,modifier:null};
      var old=previous&&previous.wave===combat.wave&&previous.craft[craft.id];
      var pursuers=living.filter(function(e){return e.team!==craft.team&&e.targetId===craft.id&&e.mode==='attack';}).length;
      // Integrate only an observed interval, not time before a craft appeared.
      if(old){
        if(old.pursued&&pursuers)emotion.stress=Math.min(1,emotion.stress+dt*(pursuers>1?0.1:0.06));
        else if(!old.pursued&&!pursuers){
          var recovery=Math.max(0,state.time-Math.max(state.time-dt,emotion.recoverAfter));
          emotion.stress=Math.max(0,emotion.stress-recovery*0.035);
        }
        var damage=Math.max(0,old.hp-craft.hp);
        if(damage){
          emotion.stress=Math.min(1,emotion.stress+damage*0.015);
          if(craft.hp<=30)emotion.stress=Math.max(emotion.stress,1);
          emotion.recoverAfter=state.time+6;
        }
        if(old.pursued&&!pursuers)emotion.modifier={current:'relieved',intensity:0.7,until:state.time+10};
      }
      deriveEmotion(emotion,state.time);
    });
    Object.keys(state.emotions).forEach(function(id){if(!living.some(function(c){return String(c.id)===id;}))delete state.emotions[id];});
  }
  function voiceOptions(preset,emotion) {
    var v=Object.assign({},preset),e=emotion||{current:'calm',intensity:0},n=e.intensity;
    var fear=e.current==='afraid'||e.current==='panicked';
    var strain=Math.max(fear?n:0,e.stress||0);
    v.pitch=(v.pitch||150)*(1+0.16*strain+(e.current==='frustrated'?0.06*n:0));
    v.speed=(v.speed||1)*(1+(fear?0.18:e.current==='relieved'?-0.1:e.current==='reassuring'?-0.12:0)*n);
    v.variation=(v.variation===undefined?0.35:v.variation)+(e.current==='panicked'?0.3:e.current==='reassuring'?-0.12:0)*n;
    v.tremor=(v.tremor||0)+0.22*strain;
    return v;
  }
  var templates = {
    loss: ['We lost {pilot}!', '{pilot} is gone. Stay together!', 'We have lost {count}. Keep your eyes open.'],
    kill: ['Nice shooting, {pilot}!', '{pilot} got one. Keep it up!', 'Good kill, {pilot}!'],
    nearPlayer: ['Close pass, pilot. Stay sharp!', 'That nearly hit you, pilot. Keep moving!'],
    near: ['That was a little close.', 'Too close for comfort!', 'Missed me. Barely.'],
    shield: ["Your shields are gone, pilot. Break clear!", 'Pilot, you are exposed. Get out of there!'],
    damaged: ['My hull is coming apart! Cover me!', 'Taking heavy damage. Need a hand!'],
    vulnerable: ["His hull is failing! Finish him!", '{pilot} is badly damaged. Stay on him!'],
    escaped: ['Finally shook that bastard.', 'Lost my tail. Coming back around.', 'Clear at last. Coming around.'],
    missed: ['Slippery little thing.', 'He got away from that pass.', 'Missed the pass. Coming around.'],
    streak: ['Leave some for us, will you?', 'That is {count} for you, pilot. Save us a few!', 'Pilot is on a roll. {count} kills!'],
    outnumbered: ["We are running out of friends here. {friends} against {enemies}.", 'Only {friends} of us left. Stay together!'],
    remaining: ['{count} hostiles left. Keep the pressure on!', '{count} left. Stay sharp!'],
    contact: ['Pilot, bandit at your {bearing}{height}. About {range} meters.', 'Contact {direction}{height}, roughly {range} meters out.', 'Eyes {direction}{height}, pilot. Hostile about {range} meters.', 'Enemy spotted. Your {bearing}{height}, range about {range} meters.'],
    closing: ['{pilot} closing at {speed} meters per second.', '{pilot} is coming in fast. {speed} meters per second!']
  };
  function numberWords(value) {
    var n=Number.isFinite(Number(value))?Math.max(0,Math.min(999999,Math.round(Number(value)))):0,small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    if(n<20)return small[n];
    if(n<100)return ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'][Math.floor(n/10)]+(n%10?' '+small[n%10]:'');
    if(n<1000)return small[Math.floor(n/100)]+' hundred'+(n%100?' '+numberWords(n%100):'');
    return numberWords(Math.floor(n/1000))+' thousand'+(n%1000?' '+numberWords(n%1000):'');
  }
  function callsign(craft) { return craft && Number.isFinite(craft.index) ? numberWords(craft.index+1).replace(/^./,function(c){return c.toUpperCase();}) : 'pilot'; }
  function compose(kind,data) {
    var variants=kind==='remaining'&&data.count===1?["One left. Let's wrap this up.",'Last hostile. Finish this!']:templates[kind];
    if(kind==='contact'&&data.vertical)variants=['Pilot, contact {direction}, about {range} meters.', 'Hostile {direction}. Roughly {range} meters out.'];
    var composed=variants.map(function(text){return text.replace(/\{(\w+)\}/g,function(_,key){return typeof data[key]==='number'?numberWords(data[key]):String(data[key]===undefined?'pilot':data[key]);});});
    composed.templateKeys=variants.slice();
    return composed;
  }
  // Twenty-four tiny records, shared across pilots. Templates count too, so changing
  // a number or callsign does not make the same delivery sound new to the scheduler.
  function pickLine(state,choices,random) {
    var scored=choices.map(function(text,index){
      var key=choices.templateKeys?choices.templateKeys[index]:text,score=0;
      state.recentLines.forEach(function(entry,i){
        if(entry.text===text)score+=(i+1)*2;
        if(entry.key===key)score+=i+1;
      });
      return {text:text,key:key,score:score};
    });
    var nonRepeat=scored.filter(function(entry){return entry.text!==state.last;});
    if(nonRepeat.length)scored=nonRepeat;
    var best=Math.min.apply(null,scored.map(function(entry){return entry.score;}));
    var pool=scored.filter(function(entry){return entry.score===best;});
    var chosen=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
    state.recentLines.push({text:chosen.text,key:chosen.key});
    if(state.recentLines.length>24)state.recentLines.shift();
    state.last=chosen.text;
    return chosen.text;
  }
  function contactData(player,point) {
    if(!player||!player.eye||!player.right||!player.up||!player.back)return null;
    var delta=point.map(function(v,i){return (v-player.eye[i])*DW.sim.METERS_PER_UNIT;}),distance=Math.hypot.apply(null,delta);
    if(distance<1)return null;
    function dot(axis){return delta.reduce(function(sum,v,i){return sum+v*axis[i];},0);}
    var right=dot(player.right),forward=-dot(player.back),up=dot(player.up),horizontal=Math.hypot(right,forward);
    var clock=(Math.round(Math.atan2(right,forward)*6/Math.PI)+12)%12||12;
    var direction=forward>Math.abs(right)*1.5?'ahead of you':forward<-Math.abs(right)*1.5?'behind you':right>0?'off your right':'off your left';
    var bearing=numberWords(clock)+" o'clock",height=up/distance>0.34?' high':up/distance<-.34?' low':'';
    if(horizontal<distance*.25){direction=up>0?'above you':'below you';bearing=up>0?'twelve high overhead':'six low underneath';height='';}
    return {distance:distance,range:Math.max(100,Math.round(distance/100)*100),bearing:bearing,direction:direction,height:height,vertical:horizontal<distance*.25,sector:horizontal<distance*.25?direction:clock+height};
  }
  function richer(state,combat,living,player) {
    var result=[],contacts=[],previous=state.situation,now={},wave=combat.wave;
    if(previous&&previous.wave!==wave)state.contactReports={};
    function offer(craft,event,data,fact){
      if(!craft)return;
      var entry={craft:craft,event:event,data:data||{},texts:compose(event,data||{})};
      var feeling={loss:'confused',kill:'confident',missed:'frustrated',outnumbered:'panicked'}[event];
      if(feeling)setEmotion(state,craft.id,feeling,0.8);
      if(fact){entry.expires=state.time+7;entry.wave=wave;state.facts.push(entry);}else result.push(entry);
    }
    function witness(team,except){return living.filter(function(e){return (e.team||'enemy')===team&&e.id!==except;}).sort(function(a,b){return (state.spoken[a.id]===undefined?-Infinity:state.spoken[a.id])-(state.spoken[b.id]===undefined?-Infinity:state.spoken[b.id]);})[0] || (team==='ally'?{id:'control',team:'ally',mode:'range'}:null);}
    var sameWave=previous&&previous.wave===wave;
    var events=(combat.radioEvents||[]).filter(function(e){return e.serial>state.radioSerial;});
    events.forEach(function(e){
      state.radioSerial=Math.max(state.radioSerial,e.serial);
      if(e.wave!==wave||combat.time-e.time>7)return;
      var subject=living.find(function(c){return c.id===e.victim;});
      if(e.kind==='destroyed'){
        var lost=(combat.enemies||[]).filter(function(c){return c.hp<=0&&(c.team||'enemy')===e.team;}).length;
        offer(witness(e.team), 'loss',{pilot:callsign(e),count:lost},true);
        var killer=living.find(function(c){return c.id===e.killer;});
        if(killer)offer(witness(killer.team||'enemy',killer.id),'kill',{pilot:callsign(killer)},true);
      }else if(e.kind==='near')offer(subject|| (e.victim==='player'?witness('ally'):null),e.victim==='player'?'nearPlayer':'near',{},true);
      else if(e.kind==='shield')offer(witness('ally'),'shield',{},true);
    });
    living.forEach(function(craft){
      var old=sameWave?previous.craft[craft.id]:null;
      var pursued=living.some(function(e){return e.team!==craft.team&&e.targetId===craft.id&&e.mode==='attack';});
      var target=living.find(function(e){return e.id===craft.targetId;});
      var contact=craft.pose&&(craft.team||'enemy')==='enemy'?contactData(player,craft.pose.eye):null;
      var inContact=!!contact&&contact.distance<=(old&&old.inContact?3000:2500);
      var report=state.contactReports[craft.id];
      if(inContact&&!state.facts.some(function(e){return e.contactId===craft.id;})&&(!old||!old.inContact||(report&&state.time-report.time>=30&&(report.sector!==contact.sector||report.range!==contact.range)))) contacts.push({target:craft,data:contact});
      var closing=0;
      if(craft.pose&&player&&player.eye&&player.velocity&&(craft.team||'enemy')==='enemy'){
        var delta=craft.pose.eye.map(function(v,i){return v-player.eye[i];}),distance=Math.hypot.apply(null,delta);
        if(distance>0&&craft.pose.velocity)closing=-delta.reduce(function(sum,v,i){return sum+v*(craft.pose.velocity[i]-player.velocity[i]);},0)/distance;
      }
      var passHit=!!(old&&old.targetId===craft.targetId&&old.mode==='attack'&&(old.passHit||(target&&target.hp<old.targetHp)));
      now[craft.id]={inContact:inContact,passHit:passHit,firedPass:!!craft.fire||!!(old&&old.mode==='attack'&&craft.mode==='attack'&&old.targetId===craft.targetId&&old.firedPass),hp:craft.hp,pursued:pursued,fire:!!craft.fire,targetId:craft.targetId,targetHp:target?target.hp:null,mode:craft.mode,closing:closing};
      if(!old)return;
      if(old.hp>30&&craft.hp<=30)offer(craft,'damaged',{},true);
      if(old.pursued&&!pursued&&old.mode==='evade')offer(craft,'escaped',{});
      if(old.mode==='attack'&&target&&target.id===old.targetId&&!passHit&&old.firedPass&&craft.mode!=='attack')offer(craft,'missed',{});
      if(target&&old.targetId===target.id&&old.targetHp>30&&target.hp<=30)offer(craft,'vulnerable',{pilot:callsign(target)},true);
      if(old.closing<50&&closing>=50)offer(witness('ally'),'closing',{pilot:callsign(craft),speed:Math.round(closing/10)*10});
    });
    if(contacts.length){
      contacts.sort(function(a,b){return a.data.distance-b.data.distance;});
      var spotted=contacts[0],before=state.facts.length;
      offer(witness('ally'),'contact',spotted.data,true);
      if(state.facts.length>before)state.facts[state.facts.length-1].contactId=spotted.target.id;
    }
    Object.keys(state.contactReports).forEach(function(id){if(!now[id])delete state.contactReports[id];});
    var allies=living.filter(function(e){return e.team==='ally';}).length,enemies=living.length-allies;
    if(sameWave){
      if(enemies>0&&enemies<previous.enemies)offer(witness('ally'),'remaining',{count:enemies},true);
      if(allies>0&&enemies>allies&&previous.allies>=previous.enemies)offer(witness('ally'),'outnumbered',{friends:allies,enemies:enemies},true);
      var playerRun=(combat.radioEvents||[]).filter(function(e){return e.kind==='destroyed'&&e.killer==='player'&&e.wave===wave&&combat.time-e.time<=20;}).length;
      if((combat.playerKills||0)>previous.playerKills&&playerRun>=2)offer(witness('ally'),'streak',{count:playerRun},true);
    }
    state.situation={wave:wave,craft:now,allies:allies,enemies:enemies,playerKills:combat.playerKills||0};
    state.facts=state.facts.filter(function(entry){return entry.expires>=state.time&&entry.wave===wave&&(!entry.contactId||living.some(function(e){var c=e.id===entry.contactId&&e.pose?contactData(player,e.pose.eye):null;return c&&c.distance<=3000;}))&&(entry.event!=='remaining'||entry.data.count===enemies)&&(entry.event!=='shield'||combat.shield<=0)&&(entry.event!=='outnumbered'||(allies>0&&enemies>allies))&&(entry.craft.id==='control'||living.some(function(e){return e.id===entry.craft.id;}));}).slice(-12);
    return result.concat(state.facts);
  }
  function create() { return { wait: 4, serial: 0, last: '', recentLines: [], danger: false, quiet: 2, time: 0, modes: {}, activity: {}, spoken: {}, quietGap: 2, lastCraft: null, recentActivities: [], activitySpoken: {}, conversation: null, situation: null, radioSerial: 0, facts: [], contactReports: {}, emotions: {}, emotionWave: null, emotionalConversation: null }; }
  function activityKind(event) { return event === 'attack' || event === 'firing' ? 'offense' : event; }
  function onTail(craft, living) {
    return craft.pose && living.some(function (other) {
      if (other.team === craft.team || other.mode !== 'attack' || other.targetId !== craft.id || !other.pose) return false;
      var delta = other.pose.eye.map(function (v, i) { return v - craft.pose.eye[i]; });
      var distance = Math.hypot.apply(null, delta);
      return distance > 0 && delta.reduce(function (sum, v, i) { return sum + v * craft.pose.back[i]; }, 0) / distance > 0.5;
    });
  }
  function responder(state, living) {
    var request = state.conversation;
    if (!request) return null;
    var caller = living.find(function (e) { return e.id === request.caller; });
    var threat = living.find(function (e) { return e.id === request.threat; });
    if (state.time > request.expires || !caller || !threat || caller.team === threat.team ||
        threat.targetId !== caller.id || (threat.mode !== 'attack' && threat.mode !== 'evade')) {
      state.conversation = null; return null;
    }
    return living.find(function (helper) {
      if (helper.id === caller.id || helper.team !== caller.team || helper.mode !== 'attack' ||
          helper.targetId !== threat.id || state.time - (state.spoken[helper.id] === undefined ? -Infinity : state.spoken[helper.id]) < 10) return false;
      if (helper.fire) return true;
      // The reply describes actual movement toward the caller's attacker.
      return helper.pose && threat.pose && helper.pose.velocity && helper.pose.velocity.reduce(function (sum, v, i) {
        return sum + v * (threat.pose.eye[i] - helper.pose.eye[i]);
      }, 0) > 0;
    }) || null;
  }
  // Active flight seconds only. No queue: a busy channel drops opportunities.
  function step(state, dt, combat, busy, random, player) {
    dt = Math.max(0, dt); state.time += dt;
    state.wait = Math.max(0, state.wait - dt);
    state.quiet = busy ? 0 : state.quiet + dt;
    random = random || Math.random;
    var living = combat.enabled ? combat.enemies.filter(function (e) { return e.hp > 0; }) : [];
    observeEmotions(state,living,combat,dt);
    var modes = {}, activity = {}, candidates = combat.enabled ? richer(state,combat,living,player) : [];
    if(!combat.enabled){state.emotionalConversation=null;state.facts=[];state.situation=null;state.contactReports={};state.radioSerial=combat.radioSerial||0;}
    living.forEach(function (craft) {
      modes[craft.id] = craft.mode;
      var previous = state.activity[craft.id], event = null;
      activity[craft.id] = { fire: !!craft.fire, targetId: craft.targetId };
      if (state.modes[craft.id] && state.modes[craft.id] !== craft.mode && calls[craft.mode]) event = craft.mode;
      else if (previous && craft.mode === 'attack') {
        if (craft.fire && !previous.fire) event = 'firing';
        else if (craft.targetId && previous.targetId !== craft.targetId) event = 'target';
      }
      if (event && state.time - (state.spoken[craft.id] === undefined ? -Infinity : state.spoken[craft.id]) >= 10) candidates.push({craft: craft, event: event});
    });
    state.activity = activity;
    state.modes = modes;
    Object.keys(state.spoken).forEach(function (id) { if (!(id in modes)) delete state.spoken[id]; });
    var helper = responder(state, living);
    if (helper) candidates.push({craft: helper, event: 'support'});
    var exchange=state.emotionalConversation;
    if(exchange){
      var caller=living.find(function(c){return c.id===exchange.caller;});
      if(!caller||state.time>exchange.expires)state.emotionalConversation=null;
      else {
        var listener=living.find(function(c){var e=state.emotions[c.id];return c.id!==caller.id&&c.team===caller.team&&e&&emotionStrength[e.current]<3&&state.time-(state.spoken[c.id]===undefined?-Infinity:state.spoken[c.id])>=10;});
        if(listener)candidates.push({craft:listener,event:'emotionalReply',texts:emotionalReplies[exchange.emotion]});
      }
    }
    living.forEach(function(c){
      var e=state.emotions[c.id];
      if(e.current!=='calm'&&e.announced!==e.current)candidates.push({craft:c,event:'emotion',texts:emotionalLines[e.current]});
      if(e.current==='calm')e.announced=null;
    });
    if (busy || combat.dead || state.quiet < state.quietGap) return null;
    var kind, choices, craft;
    // Frequent events share airtime limits; attack and firing describe the same activity.
    var counts = {};
    state.recentActivities.forEach(function (kind) { counts[kind] = (counts[kind] || 0) + 1; });
    candidates = candidates.filter(function (entry) {
      if(state.time-(state.spoken[entry.craft.id]===undefined?-Infinity:state.spoken[entry.craft.id])<10)return false;
      var category = activityKind(entry.event), last = state.activitySpoken[category];
      return last === undefined || state.time - last >= (category==='contact'?18:4) + (counts[category] || 0) * 3;
    });
    if (candidates.length) {
      var urgent = candidates.filter(function (e) { return e.event === 'loss' || e.event === 'shield' || e.event === 'damaged' || e.event === 'evade' || e.event === 'break'; });
      var replies = candidates.filter(function (e) { return e.event === 'support'; });
      if(!replies.length)replies=candidates.filter(function(e){return e.event==='emotionalReply';});
      var pool = urgent.length ? urgent : replies.length ? replies : candidates;
      // Choose an activity before a pilot: eight shooters get no more weight than one recovering craft.
      var categories = [];
      pool.forEach(function (entry) { var category = activityKind(entry.event); if (categories.indexOf(category) < 0) categories.push(category); });
      var weights = categories.map(function (category) { return 1 / Math.pow(1 + (counts[category] || 0), 2); });
      var draw = random() * weights.reduce(function (sum, weight) { return sum + weight; }, 0), chosen = categories[categories.length - 1];
      for (var i = 0; i < categories.length; i++) { draw -= weights[i]; if (draw <= 0) { chosen = categories[i]; break; } }
      pool = pool.filter(function (entry) { return activityKind(entry.event) === chosen; });
      var otherSpeakers = pool.filter(function (e) { return e.craft.id !== state.lastCraft; });
      if (otherSpeakers.length) pool = otherSpeakers;
      var selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
      craft = selected.craft;
      kind = craft.team === 'ally' ? 'ally' : 'enemy';
      if(selected.contactId){
        var contactTarget=living.find(function(e){return e.id===selected.contactId;}),freshContact=contactData(player,contactTarget.pose.eye);
        selected.texts=compose('contact',freshContact);
        state.contactReports[selected.contactId]={time:state.time,sector:freshContact.sector,range:freshContact.range};
      }
      if(selected.event==='loss') {selected.data.count=(combat.enemies||[]).filter(function(e){return e.hp<=0&&(e.team||'enemy')===(craft.team||'enemy');}).length;selected.texts=compose('loss',selected.data);}
      if(selected.event==='outnumbered'){selected.texts=compose('outnumbered',{friends:living.filter(function(e){return e.team==='ally';}).length,enemies:living.filter(function(e){return e.team!=='ally';}).length});}
      choices = selected.texts || (selected.event === 'evade' && onTail(craft, living) ? ["He's on my tail! Cover me!"] : calls[selected.event]);
      var feeling=state.emotions[craft.id];
      if(feeling&&feeling.current!=='calm'&&/^(attack|firing|target|recover|reposition)$/.test(selected.event))choices=emotionalLines[feeling.current];
      state.facts=state.facts.filter(function(entry){return entry!==selected;});
      state.spoken[craft.id] = state.time;
      state.activitySpoken[chosen] = state.time;
      state.recentActivities.push(chosen);
      if (state.recentActivities.length > 8) state.recentActivities.shift();
    } else if (state.wait > 0) return null;
    var enemies = living.some(function (e) { return e.team !== 'ally'; });
    var allies = living.some(function (e) { return e.team === 'ally'; });
    var danger = combat.enabled && combat.hull < 40;
    kind = kind || (danger && !state.danger ? 'danger' : enemies && random() < 0.5 ? 'enemy' : allies ? 'ally' : 'range');
    state.danger = danger;
    choices = choices || lines[kind];
    var text = pickLine(state,choices,random);
    var replyTo = null;
    var feeling=craft&&state.emotions[craft.id];
    if(craft&&selected.event==='emotionalReply'){
      replyTo=state.emotionalConversation.caller;state.emotionalConversation=null;
    }else if(feeling&&feeling.current!=='calm'&&/^(emotion|attack|firing|target|recover|reposition|damaged|escaped|loss|outnumbered|missed)$/.test(selected.event)){
      feeling.announced=feeling.current;
      if(emotionalReplies[feeling.current]&&!state.emotionalConversation)state.emotionalConversation={caller:craft.id,emotion:feeling.current,expires:state.time+14};
    }
    if (craft && selected.event === 'support') {
      replyTo = state.conversation.caller; state.conversation = null;
    } else if (craft && !state.conversation && /cover me|need a hand|get this fighter|on my tail/i.test(text)) {
      var threats = living.filter(function (e) { return e.team !== craft.team && e.targetId === craft.id && e.mode === 'attack'; });
      if (threats.length) state.conversation = { caller: craft.id, threat: threats[0].id, expires: state.time + 14 };
    }
    state.last = text; state.serial++; state.quiet = 0; state.quietGap = 0.9 + random() * 2.8; state.lastCraft = craft ? craft.id : null; state.wait = 18 + random() * 12;
    var line = { text: text, speaker: kind === 'enemy' ? 'BANDIT / OPEN CHANNEL' : kind === 'ally' ? 'WING / FLIGHT CHANNEL' : 'CONTROL / RANGE CHANNEL', voice: kind === 'enemy' ? 'Pirate' : kind === 'ally' ? 'Scout' : 'Navigator', hostile: kind === 'enemy', seed: state.serial + 37 };
    if (craft) { line.speaker = (craft.team === 'ally' ? 'WING ' : 'BANDIT ') + (Number.isFinite(craft.index) ? craft.index + 1 : craft.id) + ' / ' + (selected.event==='support'? 'COVER' : selected.event==='emotionalReply'?'REASSURANCE':selected.event==='emotion'?feeling.current.toUpperCase():selected.event.toUpperCase()); line.craftId = craft.id; line.mode = craft.mode; line.event = selected.event; if(craft.id==='control')line.speaker='CONTROL / RANGE CHANNEL'; if (replyTo) line.replyTo = replyTo; }
    if(feeling)line.emotion={current:selected.event==='emotionalReply'?'reassuring':feeling.current,intensity:selected.event==='emotionalReply'?0.8:feeling.intensity,stress:feeling.stress};
    return line;
  }
  function mount(panel, toggle) {
    var clock = create(), context, source, generation = 0, muted = false, remaining = 0, channelRemaining = 0, currentSpeaker = null;
    var speaker = panel.querySelector('[data-speaker]'), subtitle = panel.querySelector('[data-subtitle]');
    function stop() { generation++; channelRemaining = 0; currentSpeaker = null; if (source) { source.onended = null; source.stop(); source.disconnect(); source = null; } panel.classList.remove('transmitting'); }
    function unlock() {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try { context = context || new Audio(); context.resume().catch(function () {}); } catch (_) { /* Subtitles remain available. */ }
    }
    function speak(line) {
      currentSpeaker = line.craftId && line.craftId !== 'control' ? line.craftId : null;
      speaker.textContent = line.speaker; subtitle.textContent = line.text;
      panel.classList.toggle('hostile', line.hostile); panel.classList.add('transmitting'); remaining = 9;
      try {
        var api = DW.mumble, rate = 22050;
        var plan = api.analyze(line.text, Object.assign(voiceOptions(api.presets[line.voice],line.emotion), { seed: line.seed, volume: 0.42 }));
        channelRemaining = plan.duration + 0.5;
        if (muted || !context || context.state !== 'running') return;
        var transmission = api.transmit(api.render(plan, rate), rate, { mode: 'radio', effects: 0.45, seed: line.seed });
        var buffer = context.createBuffer(1, transmission.samples.length, rate); buffer.copyToChannel(transmission.samples, 0);
        source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
        var ticket = generation, playing = source;
        source.onended = function () { playing.disconnect(); if (ticket === generation) { source = null; channelRemaining = 0; currentSpeaker = null; panel.classList.remove('transmitting'); } };
        source.start(); channelRemaining = transmission.duration; remaining = Math.max(9, transmission.duration + 2);
      } catch (_) { stop(); }
    }
    toggle.onclick = function () { muted = !muted; toggle.textContent = muted ? 'Voice off' : 'Voice on'; toggle.setAttribute('aria-pressed', String(muted)); if (muted) stop(); };
    window.addEventListener('pagehide', function () { stop(); if (context) context.close(); });
    return {
      speakerId: function () { return currentSpeaker; },
      unlock: unlock,
      pause: stop,
      reset: function () { stop(); clock = create(); remaining = 0; speaker.textContent = 'RANGE COMMS'; subtitle.textContent = 'Standing by for flight.'; panel.classList.remove('hostile'); },
      update: function (dt, combat, player) {
        remaining = Math.max(0, remaining - dt); channelRemaining = Math.max(0, channelRemaining - dt);
        if (!source && channelRemaining <= 0) currentSpeaker = null;
        if (!remaining) { panel.classList.remove('transmitting'); subtitle.textContent = 'Channel clear.'; }
        var line = step(clock, dt, combat, !!source || channelRemaining > 0, Math.random, player); if (line) speak(line);
      }
    };
  }
  DW.flightComms = { create: create, step: step, mount: mount, compose: compose, numberWords: numberWords, contactData: contactData, pickLine: pickLine, voiceOptions: voiceOptions };
}());
