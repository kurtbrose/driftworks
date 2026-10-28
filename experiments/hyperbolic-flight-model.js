(function () {
  'use strict';
  const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
  /** @typedef {import('./hyperbolic-flight-types').Actor} Actor */
  /** @typedef {import('./hyperbolic-flight-types').Frame} Frame */
  /** @typedef {number[]} V */
  /** @param {V} a @param {V} b */
  const dot=(a,b)=>-a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
  /** @param {V} a @param {V} b @param {number} x @param {number} y */
  const mix=(a,b,x,y)=>a.map((v,i)=>v*x+b[i]*y);
  /** @param {V} p @param {V} q */
  const distance=(p,q)=>Math.acosh(Math.max(1,-dot(p,q)));
  /** @param {V} p @param {V} v @param {number} s */
  const exp=(p,v,s)=>mix(p,v,Math.cosh(s),Math.sinh(s));
  /** @param {V} p @param {V} v @param {V} w @param {number} s */
  const transport=(p,v,w,s)=>mix(w,mix(v,p,Math.cosh(s)-1,Math.sinh(s)),1,dot(w,v));
  /** @param {Frame} a @param {V} xyz */
  const tangent=(a,xyz)=>a.p.map((_,i)=>a.axes.reduce((sum,axis,j)=>sum+axis[i]*xyz[j],0));
  /** @param {Frame} a @param {V} q */
  function relative(a,q){const d=distance(a.p,q),s=Math.sinh(d);return a.axes.map(axis=>dot(q,axis)*(s>1e-12?d/s:1));}
  /** @param {Frame} a @param {V} offset @param {number} radius */
  function move(a,offset,radius){const length=Math.hypot(...offset);if(length<1e-12)return;const v=tangent(a,offset.map(x=>x/length)),s=length/radius,p=a.p;a.p=exp(p,v,s);a.axes=a.axes.map(w=>transport(p,v,w,s));}
  /** @param {Frame} a */
  function normalize(a){a.p[0]=Math.hypot(1,...a.p.slice(1));a.axes=a.axes.map((w,j)=>{
    let v=mix(w,a.p,1,dot(w,a.p));for(let k=0;k<j;k++)v=mix(v,a.axes[k],1,-dot(v,a.axes[k]));
    const n=Math.sqrt(Math.max(1e-18,dot(v,v)));a.axes[j]=v.map(x=>x/n);return a.axes[j];
  });}
  /** @returns {import('./types').FlightState} */
  function localState(){return {eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1],velocity:[0,0,-70],rates:[0,0,0],ramp:[0,0,70],throttle:1};}
  /** @param {Actor} a @param {import('./types').FlightInput} input @param {number} dt @param {number} radius */
  function fly(a,input,dt,radius){
    const s=a.flight;DW.arcade.step(s,DW.arcade.profiles[0],input,dt);
    move(a,s.eye.map(v=>v*DW.sim.METERS_PER_UNIT),radius);
    const basis=[s.right,s.up,s.back];a.axes=basis.map(axis=>tangent(a,axis));
    s.velocity=basis.map(axis=>axis.reduce((sum,v,i)=>sum+v*s.velocity[i],0));
    s.eye=[0,0,0];s.right=[1,0,0];s.up=[0,1,0];s.back=[0,0,1];
  }
  /** @param {number} radius @returns {import('./hyperbolic-flight-types').HyperWorld} */
  function create(radius=650){
    const actors=Array.from({length:12},/** @param {unknown} _ @param {number} id @returns {Actor} */(_,id)=>({id,team:id%2,p:[1,0,0,0],axes:[[0,1,0,0],[0,0,1,0],[0,0,0,1]],flight:localState(),hp:100,dead:0,cool:id*.04,trail:[]}));
    const w={radius,actors,bolts:[],bursts:[],time:0,score:[0,0],shots:0,hits:0,landmarks:/** @type {V[]} */([]),stars:/** @type {V[]} */([])};
    actors.slice(1).forEach(a=>spawn(w,a));
    // Fixed physical beacons in three dimensions; their spacing and parallax
    // make the geometry legible without inventing a physical boundary.
    for(let i=0;i<180;i++){const z=1-2*(i+.5)/180,angle=i*2.3999632297,r=Math.sqrt(1-z*z),d=400+(i%7)*160;w.landmarks.push(exp([1,0,0,0],[0,r*Math.cos(angle),z,r*Math.sin(angle)],d/radius));}
    for(let i=0;i<450;i++){const z=1-2*(i+.5)/450,angle=i*2.3999632297,r=Math.sqrt(1-z*z);w.stars.push([1,r*Math.cos(angle),z,r*Math.sin(angle)]);}
    return w;
  }
  /** @param {import('./hyperbolic-flight-types').HyperWorld} w @param {Actor} a */
  function spawn(w,a){const me=w.actors[0];a.p=me.p.slice();a.axes=me.axes.map(v=>v.slice());
    const angle=a.id*2.4+w.time*.1;move(a,[Math.sin(angle)*260,Math.cos(angle*1.7)*160,-(280+a.id*30)],w.radius);
    if(a.team===1){a.axes[0]=a.axes[0].map(v=>-v);a.axes[2]=a.axes[2].map(v=>-v);}
    a.hp=100;a.dead=0;a.flight=localState();a.trail=[];
  }
  /** Constant-velocity geodesic intercept shared by AI and the HUD pip.
   * The muzzle is 16 m forward; bolts travel at 1,000 m/s for 1.6 s.
   * @param {import('./hyperbolic-flight-types').HyperWorld} w @param {Actor} a @param {Actor} target
   * @returns {import('./hyperbolic-flight-types').Lead|null} */
  function lead(w,a,target){
    if(a.dead>0||target.dead>0)return null;
    const speed=Math.hypot(...target.flight.velocity),velocity=tangent(target,target.flight.velocity.map(v=>v/(speed||1)));
    /** @param {number} time */
    function sample(time){const point=speed?exp(target.p,velocity,time*speed/w.radius):target.p;return {point,error:distance(a.p,point)*w.radius-16-1000*time};}
    let lo=0,hi=1.6;if(sample(lo).error<=0||sample(hi).error>0)return null;
    let time=sample(0).error/1000,hit=sample(time);
    for(let i=0;i<8&&Math.abs(hit.error)>.0001;i++){time=Math.max(lo,Math.min(hi,time+hit.error/1000));hit=sample(time);}
    if(Math.abs(hit.error)>.001){for(let i=0;i<26;i++){const t=(lo+hi)*.5;if(sample(t).error>0)lo=t;else hi=t;}time=(lo+hi)*.5;hit=sample(time);}
    const d=relative(a,hit.point),length=Math.hypot(...d);
    if(!length||Math.abs(hit.error)>.001)return null;
    return {direction:d.map(v=>v/length),point:hit.point,time,range:distance(a.p,target.p)*w.radius};
  }
  /** @param {import('./hyperbolic-flight-types').HyperWorld} w @param {Actor} a @param {Actor} target */
  function aim(w,a,target){
    const solution=lead(w,a,target),d=solution?solution.direction:relative(a,target.p),length=Math.hypot(...d)||1,range=distance(a.p,target.p)*w.radius;
    return {pitch:Math.max(-1,Math.min(1,Math.atan2(d[1],-d[2])*2-a.flight.rates[0]*.2)),yaw:Math.max(-1,Math.min(1,-Math.atan2(d[0],-d[2])*2-a.flight.rates[1]*.2)),fire:!!solution&&-d[2]/length>.993,boost:range>900};
  }
  /** Exact closest distance to a finite geodesic segment. @param {V} p @param {V} v @param {V} q @param {number} length */
  function segmentDistance(p,v,q,length){const ratio=dot(v,q)/-dot(p,q),s=Math.max(0,Math.min(length,Math.atanh(Math.max(-.999999999999,Math.min(.999999999999,ratio)))));return distance(exp(p,v,s),q);}
  /** @param {import('./hyperbolic-flight-types').HyperWorld} w @param {number} dt @param {import('./hyperbolic-flight-types').Input} input */
  function step(w,dt,input){
    w.time+=dt;
    for(const a of w.actors){
      if(a.dead>0){a.dead-=dt;if(a.dead<=0)spawn(w,a);continue;}
      if(a.id&&distance(a.p,w.actors[0].p)*w.radius>Math.min(2800,w.radius*5))spawn(w,a);
      let controls=/** @type {import('./types').FlightInput & {fire?:boolean}} */(input);
      if(a.id||input.auto){const target=w.actors.filter(b=>b.team!==a.team&&b.dead<=0).sort((b,c)=>distance(a.p,b.p)-distance(a.p,c.p))[0];controls=target?aim(w,a,target):{};a.flight.throttle=1;}
      else a.flight.throttle=Math.max(0,Math.min(1,a.flight.throttle+(input.throttleRate||0)*dt*.5));
      if(a.id===0&&input.stop)a.flight.throttle=0;
      fly(a,controls,dt,w.radius);a.cool-=dt;
      if(controls.fire&&a.cool<=0){const dir=a.axes[2].map(v=>-v);w.bolts.push({p:exp(a.p,dir,16/w.radius),v:exp(dir,a.p,16/w.radius),team:a.team,owner:a.id,life:1.6});a.cool=.12;w.shots++;}
      if(Math.floor(w.time*20)!==Math.floor((w.time-dt)*20)){a.trail.push(a.p.slice());if(a.trail.length>36)a.trail.shift();}
    }
    for(const b of w.bolts){const span=1000*dt/w.radius;
      for(const a of w.actors){if(a.team===b.team||a.dead>0)continue;if(segmentDistance(b.p,b.v,a.p,span)*w.radius<12){a.hp-=20;b.life=0;w.hits++;w.bursts.push({p:a.p.slice(),age:0,large:a.hp<=0});if(a.hp<=0){a.dead=3;w.score[b.team]++;}break;}}
      const p=b.p;b.p=exp(p,b.v,span);b.v=exp(b.v,p,span);b.life-=dt;
    }
    w.bolts=w.bolts.filter(b=>b.life>0);w.bursts.forEach(b=>b.age+=dt);w.bursts=w.bursts.filter(b=>b.age<1);
    const eye=w.actors[0];normalize(eye);const p=eye.p.slice(),axes=eye.axes.map(v=>v.slice());
    /** @param {V} v */const local=v=>[-dot(v,p),...axes.map(a=>dot(v,a))];
    w.actors.forEach(a=>{a.p=local(a.p);a.axes=a.axes.map(local);normalize(a);a.trail=a.trail.map(local);});
    w.bolts.forEach(b=>{b.p=local(b.p);b.p[0]=Math.hypot(1,...b.p.slice(1));b.v=local(b.v);b.v=mix(b.v,b.p,1,dot(b.v,b.p));const norm=Math.sqrt(Math.max(1e-18,dot(b.v,b.v)));b.v=b.v.map(v=>v/norm);});
    w.bursts.forEach(b=>b.p=local(b.p));
    w.landmarks=w.landmarks.map(local).filter(p=>p[0]<Math.cosh(5));
    w.stars=w.stars.map(v=>{const q=local(v);return q.map(x=>x/q[0]);});
  }
  DW.hyperbolicFlight={dot,mix,distance,exp,transport,tangent,relative,move,normalize,create,step,segmentDistance,aim,lead};
})();
