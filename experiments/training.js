(function(){
  'use strict';
  var DW=window.Driftworks,U=DW.sim.METERS_PER_UNIT;
  function add(a,b){return a.map(function(x,i){return x+b[i];});}
  function sub(a,b){return a.map(function(x,i){return x-b[i];});}
  function scale(v,n){return v.map(function(x){return x*n;});}
  function dot(a,b){return a.reduce(function(s,x,i){return s+x*b[i];},0);}
  function length(v){return Math.hypot.apply(null,v);}
  function unit(v){var n=length(v);return n>1e-8?scale(v,1/n):[0,1,0];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  // Cast slots also own the recurring voices; names stay stable across waves.
  var pilotCallsigns=['Rook','Jinx','Flint','Echo','Mako','Sable','Patch','Nova','Viper','Wraith','Razor','Hex','Talon','Knell','Cinder','Shade'];
  function callsign(craft){
    if(!craft||craft.id==='control')return 'Control';
    if(craft.callsign)return craft.callsign;
    return Number.isFinite(craft.index)?pilotCallsigns[Math.abs(Math.floor(craft.index))%pilotCallsigns.length]:'Unknown';
  }
  function create(mode){return {mode:mode||'training',roundOver:false,enabled:true,time:0,wave:0,countdown:3,enemies:[],wrecks:[],kills:0,shield:120,hull:100,lastHit:-100,hitFlash:0,dead:false,targetId:null,slots:[],slotTimer:0,flashes:[],radioEvents:[],radioSerial:0,playerKills:0};}
  function radioEvent(t,event){
    t.radioEvents=t.radioEvents||[];t.radioSerial=(t.radioSerial||0)+1;
    event.serial=t.radioSerial;event.time=t.time;event.wave=t.wave;t.radioEvents.push(event);
    if(t.radioEvents.length>64)t.radioEvents.shift();
  }
  function alive(t){return t.enemies.filter(function(e){return e.hp>0;});}
  function face(pose,direction){var forward=unit(direction),reference=Math.abs(forward[2])>.95?[0,1,0]:[0,0,1];pose.right=unit(cross(forward,reference));pose.up=unit(cross(pose.right,forward));pose.back=scale(forward,-1);}
  // Constant-speed intercept in SI seconds, using world-space target velocity.
  function intercept(origin,position,velocity,speed){
    var delta=sub(position,origin),a=dot(velocity,velocity)-speed*speed,b=2*dot(delta,velocity),c=dot(delta,delta),time=0;
    if(Math.abs(a)<1e-8){if(b<0)time=-c/b;}
    else{var disc=b*b-4*a*c;if(disc>=0){var roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)].filter(function(x){return x>0;});if(roots.length)time=Math.min.apply(null,roots);}}
    return {point:add(position,scale(velocity,Math.min(2,time))),time:time};
  }
  function spawn(t,player,radius){
    t.wave++;t.countdown=0;t.slotTimer=0;t.slots=[];
    var count=t.mode==='furball'?16:Math.min(6,t.wave+2);t.roundOver=false;t.enemies=[];
    for(var i=0;i<count;i++){
      var pose=DW.arcade.create(radius),lateral=(i-(count-1)/2)*180;
      pose.eye=add(player.eye,add(scale(player.back,-(350+i*65)/U),add(scale(player.right,lateral/U),scale(player.up,(85+(i%2)*65)/U))));
      var safe=radius+90/U;if(length(pose.eye)<safe)pose.eye=scale(unit(pose.eye),safe);
      face(pose,sub(player.eye,pose.eye));pose.throttle=.6;
      var skill=Math.min(2,Math.floor((t.wave-1+i)/3));
      t.enemies.push({id:'wave-'+t.wave+'-'+i,index:i,callsign:callsign({index:i}),pose:pose,profile:DW.arcade.profiles[i%3===1?1:0],hp:90,maxHp:90,pilot:['Rookie','Veteran','Ace'][skill],skill:skill,mode:'approach',decision:i*.13,until:0,goal:player.eye.slice(),guns:DW.flightGuns.create(),damagedAt:-100,fire:false});
    }
    if(t.mode==='furball'){
      // Two opposing wings meet above the near side of the asteroid.
      var center=add(player.eye,add(scale(player.back,-450/U),scale(player.up,40/U)));
      if(length(center)<radius+100/U)center=scale(unit(center),radius+100/U);
      t.enemies.forEach(function(e,i){e.team=i<8?'ally':'enemy';var side=i<8?-1:1,j=i%8;
        e.pose.eye=add(center,add(scale(player.right,side*(300+(j%2)*80)/U),add(scale(player.back,(j-3.5)*65/U),scale(player.up,((j%3)-1)*85/U))));
        face(e.pose,sub(center,e.pose.eye));e.pose.throttle=.85;e.pose.velocity=scale(e.pose.back,-45);e.goal=center.slice();e.targetId=null;e.retarget=0;
      });
    }
    t.targetId=t.enemies.find(function(e){return e.team!=='ally';}).id;
  }
  function steer(pose,goal){var d=unit(sub(goal,pose.eye)),f=-dot(d,pose.back);return {pitch:Math.max(-1,Math.min(1,Math.atan2(dot(d,pose.up),f)*2)),yaw:Math.max(-1,Math.min(1,-Math.atan2(dot(d,pose.right),f)*2)),roll:0};}
  function decide(t,e,player){
    var distance=length(sub(player.eye,e.pose.eye))*U,active=t.mode==='furball'||t.slots.indexOf(e.id)>=0;
    if(t.time>=e.until){
      if(distance<140){e.mode='break';e.until=t.time+2.5+(2-e.skill)*.6;}
      else if(e.hp<45&&t.time-e.damagedAt<3){e.mode='evade';e.until=t.time+2.5;}
      else if(e.mode==='break'||e.mode==='evade'){e.mode='recover';e.until=t.time+1.1;}
      else{e.mode=active?'attack':'reposition';e.until=t.time+.8;}
    }
    var lead=intercept(e.pose.eye,player.eye,scale(player.velocity,1/U),DW.retailWeapons[0].speed/U);
    var goal=add(player.eye,scale(sub(lead.point,player.eye),[.25,.7,1][e.skill]));
    if(e.mode==='break'||e.mode==='evade'){
      var away=unit(sub(e.pose.eye,player.eye)),side=scale(e.pose.right,(e.index%2?1:-1)*220/U);
      goal=add(e.pose.eye,add(scale(away,450/U),side));
    }else if(e.mode==='recover'){goal=add(e.pose.eye,scale(e.pose.back,-220/U));}
    else if(!active){
      var angle=t.time*.16+e.index*2.4;
      goal=add(player.eye,[Math.cos(angle)*650/U,Math.sin(angle)*650/U,(150+Math.sin(angle*.7)*140)/U]);
    }else{
      // Predictable pilot error, held between human-scale decisions.
      goal=add(goal,scale(e.pose.right,Math.sin(t.time*.9+e.index)*[32,16,6][e.skill]/U));
    }
    e.goal=goal;e.pose.throttle=e.mode==='recover'?.65:e.mode==='attack'&&distance<450?.72:1;
    e.decision=[.65,.42,.28][e.skill];
  }
  function sphereHit(start,end,center,radius){
    var delta=sub(end,start),offset=sub(start,center),a=dot(delta,delta),c=dot(offset,offset)-radius*radius;
    if(c<=0)return {fraction:0,point:start.slice()};if(a<1e-14)return null;
    var b=2*dot(offset,delta),disc=b*b-4*a*c;if(disc<0)return null;
    var f=(-b-Math.sqrt(disc))/(2*a);return f>=0&&f<=1?{fraction:f,point:add(start,scale(delta,f))}:null;
  }
  function damagePlayer(t,weapon){
    if(t.dead)return;
    var shieldDamage=weapon.damage*weapon.shieldFactor,absorbed=Math.min(t.shield,shieldDamage);
    var shieldBefore=t.shield;
    t.shield-=absorbed;t.hull=Math.max(0,t.hull+(-weapon.damage*weapon.armorFactor)*(1-(shieldDamage>0?absorbed/shieldDamage:0)));
    if(shieldBefore>0&&t.shield<=0)radioEvent(t,{kind:'shield',victim:'player',team:'ally'});
    t.lastHit=t.time;t.hitFlash=.35;if(t.hull<=0)t.dead=true;
  }
  function damageEnemy(t,e,weapon,shooter){
    if(e.hp<=0)return;e.hp=Math.max(0,e.hp-weapon.damage*weapon.armorFactor);e.damagedAt=t.time;
    if(e.hp<=0){
      if(shooter==='player')t.playerKills=(t.playerKills||0)+1;
      radioEvent(t,{kind:'destroyed',victim:e.id,team:e.team||'enemy',index:e.index,killer:typeof shooter==='object'?shooter.id:shooter||null});
      var pose={eye:e.pose.eye.slice(),right:e.pose.right.slice(),up:e.pose.up.slice(),back:e.pose.back.slice(),velocity:e.pose.velocity.slice(),throttle:0};
      var axis=unit(add(pose.right,scale(pose.up,e.index%2?-.7:.7)));
      t.wrecks.push({id:e.id+'-wreck',index:e.index,team:e.team,artWave:t.wave,pose:pose,axis:axis,spin:(e.index%2?-1:1)*(.25+(e.index%5)*.09),age:0,scorches:e.scorches||[]});
      // Keep debris across waves, with a bounded rendering/memory budget.
      if(t.wrecks.length>48)t.wrecks.shift();
      e.fire=false;e.pose.throttle=0;
      if(e.team!=='ally')t.kills++;if(!alive(t).length)t.countdown=5;t.flashes.push({position:e.pose.eye.slice(),age:0,scale:14});}
  }
  function trace(t,start,end,bolt,team,terrainHit,player){
    var hit=terrainHit?terrainHit(start,end):null,best=hit?length(sub(hit,start)):Infinity,victim=null,surface=null;
    var shooter=typeof team==='object'?team:null,faction=shooter?shooter.team:team==='player'?'ally':'enemy';
    if(t.mode==='furball'){
      alive(t).forEach(function(e){if(e.team===faction)return;var candidate=t.hullHit?t.hullHit(e,start,end):sphereHit(start,end,e.pose.eye,9/U);if(candidate){var d=length(sub(candidate.point,start));if(d<best){best=d;hit=candidate.point;victim=e;surface=candidate;}}});
    }else if(team==='player')alive(t).forEach(function(e){var candidate=t.hullHit?t.hullHit(e,start,end):sphereHit(start,end,e.pose.eye,9/U);if(candidate){var d=length(sub(candidate.point,start));if(d<best){best=d;hit=candidate.point;victim=e;surface=candidate;}}});
    if(faction==='enemy'&&!t.dead){var candidate=sphereHit(start,end,player.eye,7/U);if(candidate){var d=length(sub(candidate.point,start));if(d<best){best=d;hit=candidate.point;victim='player';}}}
    if(victim&&victim!=='player'&&surface&&surface.model)DW.shipPackModels.addScorch(victim,surface);
    if(victim==='player')damagePlayer(t,bolt.weapon);else if(victim)damageEnemy(t,victim,bolt.weapon,shooter||team);
    // Report close projectile passes, clipped at the first collision so occluded bolts cannot speak.
    var endPoint=hit||end,delta=sub(endPoint,start),span=dot(delta,delta);
    function near(pose,entity,id,factionName){
      if(!pose||span<1e-12||t.time-(entity.nearMissAt===undefined?-100:entity.nearMissAt)<6)return;
      var fraction=Math.max(0,Math.min(1,dot(sub(pose.eye,start),delta)/span));
      var meters=length(sub(pose.eye,add(start,scale(delta,fraction))))*U;
      if(meters>10&&meters<30){entity.nearMissAt=t.time;radioEvent(t,{kind:'near',victim:id,team:factionName});}
    }
    alive(t).forEach(function(e){if((e.team||'enemy')!==faction&&victim!==e)near(e.pose,e,e.id,e.team||'enemy');});
    if(faction==='enemy'&&victim!=='player'&&!t.dead)near(player,t,'player','ally');
    return hit;
  }
  function stepWrecks(t,dt,terrainHit){
    t.wrecks=t.wrecks.filter(function(w){
      w.age+=dt;if(w.age>=120)return false;
      var p=w.pose,next=add(p.eye,scale(p.velocity,dt/U)),hit=terrainHit?terrainHit(p.eye,next):null;
      if(hit){p.velocity=[0,0,0];w.spin=0;}else p.eye=next;
      var angle=w.spin*dt,c=Math.cos(angle),s=Math.sin(angle);
      function rotate(v){return add(add(scale(v,c),scale(cross(w.axis,v),s)),scale(w.axis,dot(w.axis,v)*(1-c)));}
      p.back=unit(rotate(p.back));p.right=unit(cross(rotate(p.up),p.back));p.up=unit(cross(p.back,p.right));
      return true;
    });
  }
  function step(t,player,dt,radius,terrainHit){
    if(!t.enabled||t.dead)return;
    stepWrecks(t,dt,terrainHit);
    t.time+=dt;t.hitFlash=Math.max(0,t.hitFlash-dt);t.flashes=t.flashes.filter(function(f){f.age+=dt;return f.age<.22;});
    if(t.time-t.lastHit>7)t.shield=Math.min(120,t.shield+12*dt);
    var living=alive(t);
    if(!living.length||t.roundOver){t.countdown-=dt;if(t.countdown<=0){spawn(t,player,radius);living=alive(t);}}
    t.slotTimer-=dt;
    if(t.slotTimer<=0){
      // Two committed attack slots rotate every six seconds; other pilots reposition.
      var offset=Math.floor(t.time/6)%Math.max(1,living.length);
      t.slots=living.slice(offset).concat(living.slice(0,offset)).slice(0,2).map(function(e){return e.id;});t.slotTimer=3;
    }
    t.enemies.forEach(function(e){
      e.fire=false;
      if(e.hp>0){
        var opponent=player;
        if(t.mode==='furball'){
          e.retarget-=dt;var target=living.find(function(other){return other.id===e.targetId&&other.hp>0&&other.team!==e.team;});
          if(!target||e.retarget<=0){
            var choices=living.filter(function(other){return other.hp>0&&other.team!==e.team;});
            choices.sort(function(a,b){return length(sub(a.pose.eye,e.pose.eye))-length(sub(b.pose.eye,e.pose.eye));});
            // Commit to a nearby opponent for a few seconds rather than snapping targets.
            target=choices[e.index%Math.min(3,choices.length)];e.targetId=target?target.id:null;e.retarget=2.5+(e.index%3)*.7;
          }
          opponent=target?target.pose:e.team==='enemy'?player:null;
        }
        e.decision-=dt;if(e.decision<=0&&opponent)decide(t,e,opponent);
        var goal=e.goal;
        var future=add(e.pose.eye,scale(e.pose.velocity,1.6/U)),avoid=radius+65/U;
        if(length(future)<avoid||length(e.pose.eye)<avoid)goal=add(e.pose.eye,add(scale(unit(e.pose.eye),400/U),scale(e.pose.right,180/U)));
        // Separate nearby craft using steering demand, never velocity changes.
        living.forEach(function(other){if(other.id===e.id)return;var away=sub(e.pose.eye,other.pose.eye),d=length(away)*U;if(d<50)goal=add(goal,scale(unit(away),(50-d)*8/U));});
        var control=steer(e.pose,goal),distance=opponent?length(sub(opponent.eye,e.pose.eye))*U:Infinity;
        control.roll=e.mode==='evade'?Math.sin(t.time*1.8+e.index)*.65:0;
        control.boost=distance>1200&&dot(unit(sub(goal,e.pose.eye)),scale(e.pose.back,-1))>.95;
        DW.arcade.step(e.pose,e.profile,control,dt);
        // Conservative safety shell keeps AI craft clear of the asteroid.
        var safe=radius+20/U;if(length(e.pose.eye)<safe){e.pose.eye=scale(unit(e.pose.eye),safe);e.mode='break';e.until=t.time+2;}
        var aim=unit(sub(e.goal,e.pose.eye)),aligned=dot(aim,scale(e.pose.back,-1));
        e.fire=!!opponent&&(t.mode==='furball'||t.slots.indexOf(e.id)>=0)&&e.mode==='attack'&&distance>130&&distance<760&&aligned>.996&&((t.time+e.index*.77)%3)<.8;
      }
      DW.flightGuns.step(e.guns,e.pose,DW.retailWeapons[0],e.fire,dt,function(start,end,bolt){return trace(t,start,end,bolt,t.mode==='furball'?e:'enemy',terrainHit,player);});
    });
    var nowAlive=alive(t);if(living.length&&!nowAlive.length)t.countdown=5;
    if(t.mode==='furball'&&!t.roundOver&&t.wave>0&&(!nowAlive.some(function(e){return e.team==='ally';})||!nowAlive.some(function(e){return e.team==='enemy';}))){t.roundOver=true;t.countdown=5;}
    var targets=nowAlive.filter(function(e){return e.team!=='ally';});
    if(t.targetId&&!targets.some(function(e){return e.id===t.targetId;}))t.targetId=targets.length?targets[0].id:null;
  }
  function cycle(t){var list=alive(t).filter(function(e){return e.team!=='ally';}),index=list.findIndex(function(e){return e.id===t.targetId;});t.targetId=list.length?list[(index+1)%list.length].id:null;}
  function geometry(t){
    var data=[],points=[[0,11,0],[-7,-6,0],[0,-3,2.5],[7,-6,0],[0,-6,-2]],faces=[[0,1,2],[0,2,3],[0,4,1],[0,3,4],[1,4,2],[2,4,3]];
    alive(t).forEach(function(e){var p=e.pose,world=points.map(function(v){return add(p.eye,add(scale(p.right,v[0]/U),add(scale(p.back,-v[1]/U),scale(p.up,v[2]/U))));});faces.forEach(function(f){var n=unit(cross(sub(world[f[1]],world[f[0]]),sub(world[f[2]],world[f[0]])));f.forEach(function(i){data.push.apply(data,world[i].concat(n));});});});
    return [{vertices:new Float32Array(data),color:[.85,.29,.12]}];
  }
  function allGuns(t,playerGuns){var result={bolts:playerGuns.bolts.slice(),impacts:playerGuns.impacts.concat(t.flashes)};t.enemies.forEach(function(e){result.bolts=result.bolts.concat(e.guns.bolts.map(function(b){return Object.assign({},b,{team:e.team||'enemy'});}));result.impacts=result.impacts.concat(e.guns.impacts);});return result;}
  DW.training={callsign:callsign,create:create,alive:alive,spawn:spawn,stepWrecks:stepWrecks,steer:steer,intercept:intercept,sphereHit:sphereHit,damageEnemy:damageEnemy,damagePlayer:damagePlayer,trace:trace,step:step,cycle:cycle,geometry:geometry,allGuns:allGuns};
}());
