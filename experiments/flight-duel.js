(function () {
    'use strict';
    /** @typedef {import('./types').DuelOptions} Options */
    /** @typedef {import('./types').DuelReplay} Replay */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks), U = DW.sim.METERS_PER_UNIT, DT = 1 / 120;
    var starts = {
        headOn: {position:[0,600,0], forward:[0,-1,0]},
        crossing: {position:[350,350,0], forward:[-1,0,0]},
        tail: {position:[0,300,0], forward:[0,1,0]},
        turning: {position:[250,100,0], forward:[0,1,0]},
        opening: {position:[0,700,0], forward:[0,1,0]}
    };
    /** @param {import('./types').FlightState} pose @param {number[]} meters @param {number[]} forward @param {import('./types').Profile} profile */
    function setup(pose, meters, forward, profile) {
        pose.eye = meters.map(function(v,i){return (v+(i===2?10000:0))/U;});
        pose.back=forward.map(function(v){return -v;});
        pose.right=[forward[1],-forward[0],0]; pose.up=[0,0,1];
        pose.throttle=.8;
        pose.velocity=forward.map(function(v){return v*profile.maxVelocity[2]*.8;});
        pose.ramp=[0,0,profile.maxVelocity[2]*.8];
    }
    /** @param {Options} [configuration] */
    function create(configuration) {
        var options=Object.assign(/** @type {Required<Options>} */ ({start:'headOn',category:'human',flavor:'practiced',seed:1,skill:1,duration:60,profile:0,opponentProfile:-1,weapon:-1,opponentWeapon:-2,unshielded:false}),configuration);
        if(!starts[options.start] || !Number.isFinite(options.duration) || options.duration<=0 || ![0,1,2].includes(options.skill) || !DW.arcade.profiles[options.profile]) throw new Error('Invalid duel options');
        var profile=DW.arcade.profiles[options.profile], enemyProfile=options.opponentProfile === -1 ? profile : DW.arcade.profiles[options.opponentProfile];
        var weaponIndex=options.weapon === -1 ? DW.training.defaultWeapon(profile) : options.weapon;
        var requestedEnemyWeapon=options.opponentWeapon === -2 ? options.weapon : options.opponentWeapon;
        var enemyWeaponIndex=requestedEnemyWeapon === -1 ? (enemyProfile ? DW.training.defaultWeapon(enemyProfile) : 0) : requestedEnemyWeapon;
        if (!enemyProfile || !DW.retailWeapons[weaponIndex] || !DW.retailWeapons[enemyWeaponIndex] || typeof options.unshielded !== 'boolean') throw new Error('Invalid duel loadout');
        var weapon=DW.retailWeapons[weaponIndex], player=DW.arcade.create(0), combat=DW.training.create('training');
        DW.training.configure(combat,profile,options.unshielded);
        setup(player,[0,0,0],[0,1,0],profile);
        DW.training.spawn(combat,player,0); combat.enemies=combat.enemies.slice(0,1);
        var enemy=combat.enemies[0], initial=starts[options.start];
        DW.training.equip(enemy,enemyProfile,enemyWeaponIndex,options.unshielded);
        enemy.skill=options.skill; enemy.pilot=['Rookie','Veteran','Ace'][options.skill]; enemy.decision=0;
        setup(enemy.pose,initial.position,initial.forward,enemyProfile);
        combat.slots=[enemy.id];
        var pilot=DW.flightAI.create(options.category,options.flavor,options.seed), guns=DW.flightGuns.create();
        var tick=0, remainder=0, done=false, lastMode=enemy.mode, longestDry=0, dry=0;
        var metrics={playerOpportunities:0,opponentOpportunities:0,playerDamageSteps:0,opponentDamageSteps:0,modeChanges:0,minRange:Infinity,maxRange:0};
        var replay=/** @type {Replay} */ ({version:2,policy:pilot.version,observation:pilot.observation,cadence:DT,options:Object.assign({},options),inputs:[]});
        /** @param {number} elapsed @param {import('./types').PilotInput[]} [inputStream] */
        function advance(elapsed, inputStream) {
            if(!Number.isFinite(elapsed)||elapsed<0) throw new Error('Invalid elapsed time');
            remainder+=elapsed;
            while(!done && remainder+1e-10>=DT) {
                remainder=Math.max(0,remainder-DT);
                var time=tick*DT;
                var input=inputStream ? DW.flightAI.validate(inputStream[tick]) : pilot.step(time,player,enemy.pose,profile,weapon);
                replay.inputs.push(input);
                // Match flightSession order; never move a real craft inside a controller.
                player.throttle=input.throttle; DW.arcade.step(player,profile,input,DT);
                var hullBefore=combat.hull, shieldBefore=combat.shield;
                DW.training.step(combat,player,DT,0);
                if(combat.hull<hullBefore || combat.shield<shieldBefore) metrics.opponentDamageSteps++;
                var hpBefore=enemy.hp, enemyShieldBefore=enemy.shield;
                DW.flightGuns.step(guns,player,weapon,!combat.dead && input.fire,DT,function(a,b,bolt){return DW.training.trace(combat,a,b,bolt,'player',undefined,player);});
                if(enemy.hp<hpBefore || (enemy.shield || 0)<(enemyShieldBefore || 0)) metrics.playerDamageSteps++;
                var own=DW.flightAI.solution(player,enemy.pose.eye,enemy.pose.velocity,weapon), other=DW.flightAI.solution(enemy.pose,player.eye,player.velocity,DW.retailWeapons[enemyWeaponIndex]);
                var a=own.valid&&own.dot>.996, b=other.valid&&other.dot>.996;
                if(a) metrics.playerOpportunities+=DT;
                if(b) metrics.opponentOpportunities+=DT;
                dry=own.range<800 && !a && !b && enemy.hp===hpBefore && (enemy.shield || 0)>=(enemyShieldBefore || 0) && combat.lastHit<combat.time-DT/2 ? dry+DT : 0;
                longestDry=Math.max(longestDry,dry);
                metrics.minRange=Math.min(metrics.minRange,own.range); metrics.maxRange=Math.max(metrics.maxRange,own.range);
                if(lastMode!==enemy.mode) {metrics.modeChanges++;lastMode=enemy.mode;}
                tick++;
                done=combat.dead || enemy.hp<=0 || tick>=Math.ceil(options.duration/DT);
            }
            return summary();
        }
        function summary() {
            return {ticks:tick,seconds:tick*DT,done:done,outcome:combat.dead?'opponent-win':enemy.hp<=0?'player-win':done?'timeout':'running',
                category:pilot.category,flavor:pilot.flavor,skill:options.skill,start:options.start,seed:options.seed,profile:profile.name,weapon:weapon.name,
                playerHull:combat.hull,playerShield:combat.shield,opponentHull:enemy.hp,playerShots:guns.fired,opponentShots:enemy.guns.fired,
                opponentShield:enemy.shield || 0,playerMaxHull:combat.maxHull || 0,playerMaxShield:combat.maxShield || 0,opponentMaxHull:enemy.maxHp,opponentMaxShield:enemy.maxShield || 0,
                opponentProfile:enemyProfile.name,opponentWeapon:DW.retailWeapons[enemyWeaponIndex].name,unshielded:options.unshielded,
                longestDry:longestDry,metrics:Object.assign({},metrics)};
        }
        return {advance:advance,summary:summary,replay:replay,player:player,enemy:enemy,combat:combat,guns:guns};
    }
    /** @param {Options} [options] */
    function run(options) { var duel=create(options);duel.advance(duel.replay.options.duration);return duel; }
    /** @param {Replay} record */
    function replay(record) {
        if(record.version!==2 || record.cadence!==DT || !Array.isArray(record.inputs)) throw new Error('Unsupported duel replay; version 1 uses legacy training defenses');
        record.inputs.forEach(DW.flightAI.validate);
        var duel=create(record.options);
        if(record.inputs.length>Math.ceil(record.options.duration/DT)) throw new Error('Replay exceeds duration');
        duel.advance(record.inputs.length*DT,record.inputs);
        if(duel.summary().ticks!==record.inputs.length) throw new Error('Inputs after terminal duel state');
        return duel;
    }
    DW.flightDuel={create:create,run:run,replay:replay,starts:Object.keys(starts),dt:DT};
}());
