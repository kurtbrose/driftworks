(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @typedef {import('./types').Combat} Combat */
    /** @typedef {import('./types').Line} Line */
    // Only Cycle A is authored here. Later catastrophe beats intentionally wait for a second pass.
    var scenes = [
        [[2,'Shuttle Five, departure confirmed. Proceed to assigned jump coordinates.'],[5,'Copy, Control. Five out.'],[0,"Three, take up station off the depot. We're covering fuel operations."],[2,'Shuttle Six, fuel transfer in progress. Two minutes remaining.'],[4,'Two minutes. Six.']],
        [[2,'Defense Control, demolition teams report charges in place. Safeties engaged. Fueling continues.'],[4,'Depot Control, Shuttle Six. Say again, demolition charges?'],[2,"Affirmative, Six. They'll remain safed until the final departure."],[4,'Copy.']],
        [[1,'Contacts. Bearing zero-eight-five. Four, maybe six.'],[0,'Flight, weapons free. Keep them off the depot.']],
        [[2,'Six, fuel transfer complete. Stand by for clearance.'],[4,'Standing by. Six.']],
        [[3,'Depot Control, Station Four has suspended service. Diverting Shuttle Eight to your location.'],[2,'Copy. Bay occupied. Hold Eight outside the approach until Six clears.'],[3,'Acknowledged.']],
        [[2,'Shuttle Six, cleared to depart.'],[4,'Cleared to depart. Six.']],
        [[0,'Corridor clear. Hold station for Eight.']]
    ];
    var names=['Actual / LEAD','Finch / WINGMAN','DEPOT CONTROL','DEFENSE CONTROL','SHUTTLE SIX','SHUTTLE FIVE'];
    // Stable civilian roster identities; facility and fighter cast slots remain independent.
    /** @type {Record<number,{id:string;portrait:number;voice:number}>} */
    var shuttlePilots={4:{id:'elena-park',portrait:2,voice:3},5:{id:'daniel-okafor',portrait:1,voice:0}};
    var depotWorker={id:'jo-mercer',portrait:0,voice:1};
    /** @param {Combat} combat @param {import('./types').FlightState} player */
    function start(combat,player) {
        var U=DW.sim.METERS_PER_UNIT;
        player.eye=[0,-500/U,1200];player.velocity=[0,0,0];player.throttle=0;player.ramp=[0,0,0];
        player.right=[1,0,0];player.up=[0,0,1];player.back=[0,-1,0];
        combat.enemies.forEach(function(c,i){c.team=i<2?'ally':'enemy';c.callsign=i<2?['Actual','Finch'][i]:'Raider '+(i-1);c.pose.eye=[(i<2?(i?100:-100):280+i*40)/U,(-140+i*55)/U,1200+(i<2?45:90)/U];});
        combat.evacuation={scene:0,line:0,wait:2,elapsed:0,quiet:0,departure:0,complete:false,reserve:combat.enemies.splice(2),origin:[0,0,1200]};
        combat.enemies.forEach(function(c){c.plotArmor=true;});
        combat.targetId=null;combat.roundOver=false;
    }
    /** The channel owns progression: never consume a line until it can actually be heard.
     * @param {Combat} combat @param {number} dt @param {boolean} busy @returns {Line|null} */
    function step(combat,dt,busy) {
        var s=combat.evacuation;if(!s||!combat.enabled||combat.dead)return null;
        if(DW.evacuationScenery&&DW.evacuationScenery.status()!=='Ready')return null;
        s.elapsed+=dt;s.wait=Math.max(0,s.wait-dt);
        var hostiles=combat.enemies.some(function(c){return c.team==='enemy'&&c.hp>0;});
        s.quiet=hostiles?0:s.quiet+dt;
        if(s.scene>=6)s.departure=Math.min(1,s.departure+dt/18);
        if(busy||s.wait>0||s.complete)return null;
        if(s.scene===3&&(hostiles||s.quiet<5||s.elapsed<120))return null;
        if(s.scene===6&&(s.departure<1||hostiles||s.quiet<5))return null;
        var scene=scenes[s.scene];
        if(s.line===scene.length){
            if(s.scene===2){combat.enemies=combat.enemies.concat(s.reserve);s.reserve=[];combat.targetId=combat.enemies.find(function(c){return c.team==='enemy';})?.id||null;}
            s.scene++;s.line=0;s.wait=s.scene===1?8:s.scene===4?7:3;
            if(s.scene===scenes.length)s.complete=true;
            return null;
        }
        var row=scene[s.line++],index=Number(row[0]),text=String(row[1]);s.wait=2;
        var civilian=shuttlePilots[index],worker=index===2?depotWorker:undefined,voiceIndex=civilian?civilian.voice:worker?worker.voice:index;
        return {text:text,speaker:names[index],voice:'Scout',hostile:false,seed:101+index*37,radioSeed:7919+index,
            voiceSettings:Object.assign({},DW.flightDialogue.pilotVoice(/** @type {import('./types').Craft} */({id:civilian?civilian.id:worker?worker.id:'evac-radio-'+index,index:voiceIndex})),{speed:.85}),
            runwayPortraitIndex:worker?worker.portrait:undefined,civilianPortraitIndex:civilian?civilian.portrait:undefined,portraitIndex:Math.min(index,4),craftId:index<2?combat.enemies[index]?.id:'control',event:'evacuationStory'};
    }
    DW.evacuationMission={start:start,step:step};
}());
