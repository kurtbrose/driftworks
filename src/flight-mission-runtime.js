(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @param {Combat} combat */function openingPending(combat){var mission=DW.flightMissions.resolve(combat.mode);return mission.opening.length>0&&combat.openingStep<mission.opening.length+1;}
    /** A busy channel means the previous transmission has not completed.
     * @param {Combat} combat @param {boolean} busy */
    function openingCue(combat,busy){var mission=DW.flightMissions.resolve(combat.mode);
        if (combat.enabled && mission.opening.length && combat.openingStep < mission.opening.length+1) {
            if (busy || combat.time < 1 || mission.opening.some(function(line){return !combat.enemies[line.speakerIndex];})) return null;
            if (combat.openingStep === mission.opening.length) { combat.openingStep = mission.opening.length+1;  return null; }
            var introIndex = combat.openingStep++;
            var opening=mission.opening[introIndex], introCraft = combat.enemies[opening.speakerIndex];
            return {index:introIndex,line:opening,craft:introCraft};
        }
        return null;
    }
    /** @param {Combat} combat @param {boolean} busy */
    function scrambleCue(combat,busy){
        if(combat.scramble){
            var cue=combat.scramble.radio,at=[.1,.8,2.1,3.2,8],texts=['ALL FIGHTERS, SCRAMBLE! SCRAMBLE! Clear the flight deck!','Incoming! Plunging fire, high twelve!','Two is gone! Keep accelerating!','Three hit! Still flying. Go, go!','Flight, weapons free. Take the fight to them!'];
            if(cue<at.length){
                if(busy||combat.time<at[cue]||(cue===2&&combat.enemies[0].hp>0))return null;
                combat.scramble.radio++;
                return {text:texts[cue],speaker:cue===3?'LANCER THREE':'FLIGHT CONTROL',index:cue===3?1:2};
            }
        }
        return null;
    }
    /** @param {Combat} combat */function scramblePending(combat){return !!combat.scramble&&combat.scramble.radio<5;}
    DW.flightMissionRuntime={openingPending:openingPending,openingCue:openingCue,scramblePending:scramblePending,scrambleCue:scrambleCue};
}());
