'use strict';
// Experiment-only: suppress timer expiry while the existing opponent is alive.
// Initial acquisition and replacement of dead targets use the unchanged live selector.
module.exports=function holdTargets(combat,holdSeconds){
    for(const craft of combat.enemies){
        if(craft.hp<=0)continue;
        const target=combat.enemies.find(other=>other.id===craft.targetId&&other.hp>0&&other.team!==craft.team);
        if(target)craft.retarget=Math.max(craft.retarget,holdSeconds);
    }
};
