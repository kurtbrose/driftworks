const assert=require('node:assert/strict');
const {createFlight,dt}=require('../tools/headless.cjs');
for(const controls of [{stop:true},{boost:true,throttle:1,yaw:.7,pitch:.4}]){
 const f=createFlight({mission:'scramble',seed:29});
 let s=f.snapshot(),c=s.combat;
 assert.equal(s.world.asteroids.length,0);
 const wing=c.enemies.slice(0,3);
 assert(wing[0].pose.eye[0]<s.state.eye[0]);
 assert(wing[1].pose.eye[0]>s.state.eye[0]&&wing[2].pose.eye[0]>wing[1].pose.eye[0]);
 assert.equal(wing[0].pose.eye[1],wing[1].pose.eye[1]);
 assert.equal(wing[1].pose.eye[1],wing[2].pose.eye[1]);
 f.advance(.4,controls);c=f.snapshot().combat;
 assert(c.enemies[0].pose.velocity[1]>0);
 assert.equal(c.enemies[1].pose.velocity[1],0);
 assert.equal(c.enemies[2].pose.velocity[1],0);
 let hitTick=false;
 for(let tick=0;tick<720;tick++){
  c=f.snapshot().combat;
  const before=c.enemies[0].hp,hits=c.enemies[3].guns.hits;
  f.advance(dt,controls);c=f.snapshot().combat;
  if(tick===240)assert(c.enemies.slice(0,3).every(ship=>!ship.hangarLaunch),'All wingmen leave launch holds by 2.4 seconds');
  if(before>0&&c.enemies[0].hp===0){
   assert(c.enemies[3].guns.hits>hits,'Loss occurs on an actual projectile/hull contact');
   assert(c.enemies[3].guns.impacts.length>0,'Contact has a visible impact');
   assert(c.enemies[0].pose.eye[1]>47.5/f.DW.sim.METERS_PER_UNIT,'Victim clears the flight deck before impact');
   hitTick=true;
  }
 }
 assert(c.enemies.slice(1,3).every(ship=>!ship.hangarLaunch),'Wingmen use combat AI as soon as they clear the deck');
 assert(c.enemies.slice(1,3).some(ship=>Math.abs(ship.pose.velocity[0])+Math.abs(ship.pose.velocity[2])>5),'Wingmen maneuver instead of riding straight launch rails');
 assert(c.enemies.slice(6).reduce((n,ship)=>n+ship.guns.fired,0)>12,'Live furball fires real shots');
 assert(c.enemies.slice(6).some(ship=>ship.guns.hits>0),'Live battle shots connect');
 assert(hitTick,'The left fighter is hit independently of player maneuvering');
 assert.equal(c.enemies[0].hp,0);

 assert(c.wrecks.some(w=>w.id===c.enemies[0].id+'-wreck'));
 assert(f.transcript.some(l=>l.text.includes('ALL FIGHTERS')));
 assert.equal(c.playerKills||0,0,'Scripted attacker owns the kill');
 f.reset();assert.equal(f.snapshot().combat.scramble.beat,0);
 assert(f.snapshot().combat.enemies[0].hp>0);
}
// Negative control: removing the actual incoming shots must prevent the loss.
{
 const f=createFlight({mission:'scramble',seed:29});
 const gun=f.snapshot().combat.enemies[3].guns,step=f.DW.flightGuns.step;
 f.DW.flightGuns.step=function(guns,pose,weapon,trigger,...rest){
  return step(guns,pose,weapon,guns===gun?false:trigger,...rest);
 };
 f.advance(4.4,{stop:true});
 assert(f.snapshot().combat.enemies[0].hp>0,'No incoming bolt means no unexplained explosion');
 assert.equal(gun.hits,0);
}
console.log('PASS SCRAMBLE: one left / two right, staggered launch, real bolt/hull destruction independent of player controls, impact and reset');
