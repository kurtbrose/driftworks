const fs=require('node:fs');
function run(){
 const D=window.Driftworks,U=D.sim.METERS_PER_UNIT,host=document.getElementById('viewer');
 document.body.classList.add('flight-active');
 const panel=document.createElement('div');panel.style.cssText='position:fixed;z-index:30;left:18px;top:18px;padding:14px;background:#07151df2;border:1px solid #578178;border-radius:8px;max-width:440px';
 panel.innerHTML='<b>ELLIS / LIVE LEAD VALIDATION</b><p>Real session, HUD and guns. Aim aligns the test camera only; Fire never snaps to the target.</p><label>Region <select id="aim-side"><option value="0">Asteroid</option><option value="1">Rime</option></select></label><label>Case <select id="aim-case"><option value="remote">Moving target across mouth</option><option value="static">Stationary visible-image shot</option><option value="crossing">Target crosses during flight</option><option value="muzzle">Muzzles straddle throat</option></select></label><button id="aim-reset">Reset</button> <button id="aim-align">Aim at pip</button> <button id="aim-fire">Fire</button> <button id="aim-miss">Off-pip test</button><pre id="aim-result" style="white-space:pre-wrap"></pre>';
 document.body.appendChild(panel);
 const session=D.flightSession.create({seed:29,terrainHit:()=>null,surfaceFrame:(_a,d)=>({point:d}),onGunshot:()=>{},onImpact:()=>{}}),config={profile:D.arcade.profiles[0],weapon:D.retailWeapons[0]};
 let snapshot=session.reset({mode:'ellis',enabled:true,profile:config.profile}),target,running=false,fire=false,elapsed=0,last=0,remainder=0;
 const presentation=D.flightPresentation.mount(host,()=>snapshot.world,w=>{snapshot.world=w;session.setWorld(w);}),hud=D.flightHud.mount(host);
 const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function face(direction){snapshot.state.back=direction.map(v=>-v);snapshot.state.right=normalize(cross(direction,[0,0,1]));snapshot.state.up=cross(snapshot.state.right,direction);}
 function align(){const lead=D.training.firingSolution(snapshot.combat,snapshot.combat.player,target,config.weapon);if(lead)face(lead.direction);}
 function reset(){
  running=false;fire=false;elapsed=0;remainder=0;snapshot=session.reset({mode:'ellis',enabled:true,profile:config.profile});snapshot.world.asteroids=[];snapshot.world.ships=[];
  const side=Number(document.getElementById('aim-side').value),kind=document.getElementById('aim-case').value,remote=kind!=='crossing';
  Object.assign(snapshot.state,{region:side,eye:[side*12000/U,(kind==='muzzle'?-2302:-2350)/U,1550/U],velocity:[0,0,0],ramp:[0,0,0],rates:[0,0,0],throttle:0});face([0,1,0]);
  const state=Object.assign(D.arcade.create(0),{region:remote?1-side:side,eye:[((remote?1-side:side)*12000+(kind==='remote'?20:kind==='static'?80:0))/U,(kind==='crossing'?-2301:kind==='muzzle'?-1690:-1660)/U,1550/U],velocity:kind==='crossing'?[0,150,0]:kind==='muzzle'||kind==='static'?[0,0,0]:[25,40,0]});
  target=D.training.createCraft('Pip validation target',state,'enemy');target.hp=target.maxHp=1000;target.shield=target.maxShield=0;target.collision={kind:'sphere',radiusM:7};snapshot.combat.enemies=[target];if(kind==='static')D.training.configureHulls(snapshot.combat,'mixed','mixed');snapshot.combat.hangarSupport=true;snapshot.combat.targetId=target.id;snapshot.combat.targetLocked=true;align();draw();
 }
 function draw(){
  const art=presentation.appearance();presentation.pose(snapshot.state);presentation.render(snapshot,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
  hud.render({...snapshot,...art,weapon:config.weapon,units:U,paused:!running,speakerId:null,mouse:[0,0],showMouseStick:false,shipImages:new Map()});
  const lead=D.training.firingSolution(snapshot.combat,snapshot.combat.player,target,config.weapon);
  document.getElementById('aim-result').textContent=(running?'RUNNING':'PAUSED')+' / '+elapsed.toFixed(3)+' s\nShooter chart '+(snapshot.state.region||0)+' / target chart '+(target.pose.region||0)+'\n'+(lead?'VALID / flight time '+lead.time.toFixed(3)+' s':'NO FIRING SOLUTION')+'\n'+snapshot.guns.fired+' bolts fired / '+snapshot.guns.hits+' actual hits\nTarget hull '+target.hp+' / '+target.maxHp;
 }
 document.getElementById('aim-reset').onclick=reset;document.getElementById('aim-side').onchange=reset;document.getElementById('aim-case').onchange=reset;document.getElementById('aim-align').onclick=()=>{align();draw();};document.getElementById('aim-fire').onclick=()=>{running=true;fire=true;};document.getElementById('aim-miss').onclick=()=>{reset();face(normalize(snapshot.state.back.map((v,i)=>-v+(i===0?.65:0))));running=true;fire=true;};
 function frame(now){const delta=last?Math.min(.05,(now-last)/1000):0;last=now;if(running&&!document.hidden){remainder+=delta;while(remainder>=1/120){remainder-=1/120;const dt=1/120,route=D.flightGuns.bridgeTravel(target.pose.eye,target.pose.velocity.map(v=>v*dt/U),target.pose.region||0);target.pose.eye=route.point;target.pose.region=route.region;if(route.normal)for(const key of ['right','up','back','velocity'])target.pose[key]=D.flightGuns.bridgeVector(target.pose[key],route.normal);session.advance(dt,{throttle:0,throttleRate:0,fire,stop:true},config);fire=false;snapshot=session.snapshot();elapsed+=dt;if(elapsed>=1.5){running=false;break;}}}if(!document.hidden)draw();requestAnimationFrame(frame);}
 reset();requestAnimationFrame(frame);
}
let html=fs.readFileSync('experiments/flight.html','utf8').replace(/<script src="flight.js[^>]*><\/script>/,'').replace(/(src|href)="(?![./#]|https?:)([^"]+)"/g,'$1="../experiments/$2"');
html=html.replace('</body>','<script>('+run.toString()+')();</script></body>');
fs.writeFileSync('studies/ellis-aim-study.html',html);
