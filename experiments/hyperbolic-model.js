(function () {
  'use strict';
  /** @typedef {number[]} V */
  /** @typedef {{p:V,f:V,r:V}} Frame */
  /** @typedef {Frame & {id:number,team:number,hp:number,cool:number,dead:number,speed:number,trail:V[]}} Fighter */
  /** @param {V} a @param {V} b */
  const dot=(a,b)=>-a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  /** @param {V} a @param {V} b @param {number} x @param {number} y */
  const mix=(a,b,x,y)=>a.map((v,i)=>v*x+b[i]*y);
  /** @param {V} a @param {V} b */
  const distance=(a,b)=>Math.acosh(Math.max(1,-dot(a,b)));
  /** @param {V} p @param {V} v @param {number} s */
  const exp=(p,v,s)=>mix(p,v,Math.cosh(s),Math.sinh(s));
  /** @param {Frame} a @param {V} q */
  function bearing(a,q){return Math.atan2(dot(q,a.r),dot(q,a.f));}
  /** @param {Frame} a @param {number} angle */
  function turn(a,angle){const f=a.f;a.f=mix(f,a.r,Math.cos(angle),Math.sin(angle));a.r=mix(a.r,f,Math.cos(angle),-Math.sin(angle));}
  /** @param {Frame} a @param {number} s */
  function move(a,s){const p=a.p;a.p=exp(p,a.f,s);a.f=exp(a.f,p,s);}
  /** Remove accumulated floating-point frame drift. @param {Frame} a */
  function normalize(a){
    a.p[0]=Math.hypot(1,a.p[1],a.p[2]);
    a.f=mix(a.f,a.p,1,dot(a.f,a.p));
    a.f=a.f.map(v=>v/Math.sqrt(Math.max(1e-20,dot(a.f,a.f))));
    a.r=mix(a.r,a.p,1,dot(a.r,a.p));a.r=mix(a.r,a.f,1,-dot(a.r,a.f));
    a.r=a.r.map(v=>v/Math.sqrt(Math.max(1e-20,dot(a.r,a.r))));
  }
  /** Closest point on a geodesic segment, in curvature-radius units.
   * @param {Frame} a @param {V} q @param {number} length */
  function segmentDistance(a,q,length){const t=Math.atanh(Math.max(-.999999999,Math.min(.999999999,dot(a.f,q)/-dot(a.p,q))));return distance(exp(a.p,a.f,Math.max(0,Math.min(length,t))),q);}
  /** @param {number} radius */
  function create(radius=700){
    /** @type {Fighter[]} */ const fighters=[];
    for(let i=0;i<12;i++){
      const angle=i*Math.PI*2/12, d=(i===0?0:650+80*(i%3))/radius;
      const p=[Math.cosh(d),Math.sinh(d)*Math.cos(angle),Math.sinh(d)*Math.sin(angle)];
      const f=[Math.sinh(d),Math.cosh(d)*Math.cos(angle),Math.cosh(d)*Math.sin(angle)];
      const a={p,f,r:[0,-Math.sin(angle),Math.cos(angle)],id:i,team:i%2,hp:100,cool:i*.07,dead:0,speed:150,trail:[]};
      turn(a,Math.PI+.3);fighters.push(a);
    }
    return {radius,fighters,shots:/** @type {(Frame & {team:number,life:number})[]} */([]),bursts:/** @type {{p:V,life:number}[]} */([]),score:[0,0],time:0};
  }
  /** @param {ReturnType<typeof create>} w @param {number} dt @param {{auto:boolean,turn:number,throttle:number,fire:boolean}} input */
  function step(w,dt,input){
    w.time+=dt;
    for(const a of w.fighters){
      if(a.dead>0){a.dead-=dt;if(a.dead<=0){const anchor=w.fighters.find(b=>b.team===a.team&&b.dead<=0)||w.fighters[0];a.p=anchor.p.slice();a.f=anchor.f.slice();a.r=anchor.r.slice();turn(a,a.id*1.7);move(a,500/w.radius);a.hp=100;a.trail=[];}continue;}
      // Rotate distant contacts into reinforcements before Lorentz coordinates
      // lose precision. Space has no wall; the finite battle roster follows you.
      if(a.id!==0&&distance(a.p,w.fighters[0].p)*w.radius>2500){
        const player=w.fighters[0];a.p=player.p.slice();a.f=player.f.slice();a.r=player.r.slice();
        turn(a,a.id*2.4+w.time*.2);move(a,1100/w.radius);turn(a,Math.PI);a.trail=[];a.hp=100;
      }
      let steer=input.turn,fire=input.fire;
      if(a.id!==0||input.auto){
        const targets=w.fighters.filter(b=>b.team!==a.team&&b.dead<=0).sort((b,c)=>distance(a.p,b.p)-distance(a.p,c.p));
        const target=targets[0];fire=false;steer=0;
        if(target){const range=distance(a.p,target.p)*w.radius;const lead=exp(target.p,target.f,Math.min(.7,range/950)*target.speed/w.radius);const angle=bearing(a,lead);steer=Math.max(-1,Math.min(1,angle*2));fire=Math.abs(angle)<.13&&range<1400;}
        a.speed=155+20*Math.sin(w.time*.7+a.id);
      }else a.speed=Math.max(60,Math.min(310,a.speed+input.throttle*150*dt));
      turn(a,steer*1.7*dt);move(a,a.speed*dt/w.radius);
      a.trail.push(a.p.slice());if(a.trail.length>100)a.trail.shift();
      a.cool-=dt;
      if(fire&&a.cool<=0){w.shots.push({p:exp(a.p,a.f,25/w.radius),f:exp(a.f,a.p,25/w.radius),r:a.r.slice(),team:a.team,life:1.8});a.cool=.16;}
    }
    for(const shot of w.shots){
      const length=1000*dt/w.radius;
      for(const a of w.fighters){if(a.dead>0||a.team===shot.team)continue;
        if(segmentDistance(shot,a.p,length)*w.radius<22){a.hp-=25;shot.life=0;w.bursts.push({p:a.p.slice(),life:.5});if(a.hp<=0){a.dead=3;w.score[shot.team]++;}break;}}
      move(shot,length);shot.life-=dt;
    }
    w.shots=w.shots.filter(s=>s.life>0);w.bursts.forEach(b=>b.life-=dt);w.bursts=w.bursts.filter(b=>b.life>0);
    // Rebase by an exact Lorentz isometry each tick to avoid large coordinates.
    const eye=w.fighters[0];normalize(eye);const p=eye.p.slice(),f=eye.f.slice(),r=eye.r.slice();
    /** @param {V} v */ const local=v=>[-dot(v,p),dot(v,r),dot(v,f)];
    for(const a of [...w.fighters,...w.shots]){a.p=local(a.p);a.f=local(a.f);a.r=local(a.r);normalize(a);if('trail' in a)a.trail=a.trail.map(local);}
    w.bursts.forEach(b=>b.p=local(b.p));
  }
  const api={dot,mix,distance,exp,bearing,turn,move,segmentDistance,create,step};
  window.Driftworks=window.Driftworks||{};
  window.Driftworks.hyperbolic=api;
})();
