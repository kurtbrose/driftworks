'use strict';
// Observe at the gun-step boundary, after targeting and steering, without changing inputs.
module.exports=function createTelemetry(DW,combat,dt){
    const U=DW.sim.METERS_PER_UNIT;
    const pilots=new Map(combat.enemies.map(e=>[e.guns,{id:e.id,team:e.team,aliveSeconds:0,shots:0,hits:0,switches:0,acquisitions:0,switchesWhileGoalHeld:0,targetSeconds:0,rangeSeconds:0,leadAlignedSeconds:0,opportunitySeconds:0,triggerSeconds:0,opportunityWindows:0,longestOpportunity:0,gates:{noTarget:0,notAttack:0,tooClose:0,tooFar:0,invalidSolution:0,misaligned:0,dutyClosed:0,trigger:0},modes:{},targets:{},lastTarget:null,lastDecision:0,window:0}]));
    const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
    function before(guns,pose,weapon,trigger){
        const m=pilots.get(guns),e=combat.enemies.find(c=>c.guns===guns);
        if(!m)return null;
        // Projectiles already in flight can still hit after their shooter dies.
        if(e.hp<=0)return {m,fired:guns.fired,hits:guns.hits};
        m.aliveSeconds+=dt;m.modes[e.mode]=(m.modes[e.mode]||0)+dt;
        const target=combat.enemies.find(c=>c.id===e.targetId&&c.hp>0&&c.team!==e.team);
        const id=target?target.id:null;
        if(id!==m.lastTarget){if(id&&m.lastTarget){m.switches++;if(e.decision<m.lastDecision-1e-8)m.switchesWhileGoalHeld++;}else if(id)m.acquisitions++;m.lastTarget=id;}
        m.lastDecision=e.decision;
        let range=Infinity,aligned=false,leadAligned=false;
        if(target){
            m.targetSeconds+=dt;m.targets[id]=(m.targets[id]||0)+dt;
            const delta=target.pose.eye.map((v,i)=>v-pose.eye[i]);range=Math.hypot(...delta)*U;
            const lead=DW.training.intercept(pose.eye,target.pose.eye,target.pose.velocity.map(v=>v/U),weapon.speed/U);
            const aim=lead.point.map((v,i)=>v-pose.eye[i]),length=Math.hypot(...aim);
            leadAligned=lead.time>0&&lead.time<=weapon.lifetime&&length>0&&-dot(aim,pose.back)/length>.996;
        }
        const inRange=range>130&&range<Math.min(760,weapon.speed*weapon.lifetime);
        if(inRange)m.rangeSeconds+=dt;
        if(inRange&&leadAligned)m.leadAlignedSeconds+=dt;
        const goal=(e.gunGoal||e.goal).map((v,i)=>v-pose.eye[i]),length=Math.hypot(...goal);
        aligned=length>0&&-dot(goal,pose.back)/length>.996;
        const opportunity=!!target&&e.mode==='attack'&&inRange&&e.gunValid!==false&&aligned;
        if(opportunity){m.opportunitySeconds+=dt;if(!m.window)m.opportunityWindows++;m.window+=dt;m.longestOpportunity=Math.max(m.longestOpportunity,m.window);}else m.window=0;
        // Ordered, mutually exclusive reasons: later gates may also fail.
        const gate=!target?'noTarget':e.mode!=='attack'?'notAttack':range<=130?'tooClose':!inRange?'tooFar':e.gunValid===false?'invalidSolution':!aligned?'misaligned':!trigger?'dutyClosed':'trigger';
        m.gates[gate]+=dt;if(trigger)m.triggerSeconds+=dt;
        return {m,fired:guns.fired,hits:guns.hits};
    }
    function after(guns,snapshot){if(snapshot){snapshot.m.shots+=guns.fired-snapshot.fired;snapshot.m.hits+=guns.hits-snapshot.hits;}}
    function summary(){
        const rows=[...pilots.values()].map(({lastTarget,lastDecision,window,...m})=>m);
        for(const m of rows){
            require('node:assert/strict')(Math.abs(Object.values(m.gates).reduce((a,b)=>a+b,0)-m.aliveSeconds)<1e-6,'Gate time conservation');
            require('node:assert/strict')(m.hits<=m.shots,'Hits cannot exceed emitted bolts');
        }
        const sum=key=>rows.reduce((n,m)=>n+m[key],0),gates={};
        for(const key of Object.keys(rows[0].gates))gates[key]=rows.reduce((n,m)=>n+m.gates[key],0);
        return {aliveSeconds:sum('aliveSeconds'),shots:sum('shots'),hits:sum('hits'),hitRate:sum('shots')?sum('hits')/sum('shots'):null,rangeSeconds:sum('rangeSeconds'),leadAlignedSeconds:sum('leadAlignedSeconds'),opportunitySeconds:sum('opportunitySeconds'),triggerSeconds:sum('triggerSeconds'),opportunityWindows:sum('opportunityWindows'),switches:sum('switches'),switchesWhileGoalHeld:sum('switchesWhileGoalHeld'),targetSeconds:sum('targetSeconds'),gates,pilots:rows};
    }
    return {before,after,summary};
};
