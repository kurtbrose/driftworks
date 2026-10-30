(function () {
    'use strict';
    /** @typedef {import('./types').StudyConfig} Config */
    /** @typedef {import('./types').StudyRow} Row */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {number[]} numbers */
    function median(numbers) {
        if (!numbers.length) return null;
        var sorted=numbers.slice().sort(function(a,b){return a-b;}), middle=Math.floor(sorted.length/2);
        return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
    }
    /** Deterministic screening design, bounded before starting a worker.
     * @param {Config} config @returns {import('./types').StudyCase[]} */
    function plan(config) {
        if (!Number.isInteger(config.seeds)||config.seeds<1||config.seeds>10||!Number.isInteger(config.seed)||config.seed<0||config.seed+config.seeds>4294967296||
            !Number.isFinite(config.duration)||config.duration<1||config.duration>120) throw new Error('Use 1–10 seeds, a valid initial seed, and a 1–120 second limit.');
        if (!['mirror','all','anchor'].includes(config.pairing)||!['retail','unshielded','paired'].includes(config.defenses)) throw new Error('Invalid study design.');
        if (!config.ships.length||config.ships.some(function(i){return !Number.isInteger(i)||!DW.arcade.profiles[i];})||new Set(config.ships).size!==config.ships.length) throw new Error('Select valid, distinct ships.');
        if (!config.weapons.length||config.weapons.some(function(i){return !Number.isInteger(i)||(i!==-1&&!DW.retailWeapons[i]);})||new Set(config.weapons).size!==config.weapons.length) throw new Error('Select valid, distinct weapons.');
        if (!config.starts.length||config.starts.some(function(s){return !DW.flightDuel.starts.includes(s);})||new Set(config.starts).size!==config.starts.length) throw new Error('Select starting geometries.');
        if (!config.skills.length||config.skills.some(function(i){return ![0,1,2].includes(i);})||new Set(config.skills).size!==config.skills.length) throw new Error('Select opponent skill.');
        if (!config.pilots.length||config.pilots.some(function(p){return !['perfect','novice','practiced','expert'].includes(p);})||new Set(config.pilots).size!==config.pilots.length) throw new Error('Select testing pilots.');
        var styles=config.styles||['baseline'];
        if(!styles.length||styles.some(function(style){return !DW.flightDuel.styles.includes(style);})||new Set(styles).size!==styles.length)throw new Error('Select valid, distinct opponent styles.');
        var cases=/** @type {import('./types').StudyCase[]} */ ([]);
        var seen=/** @type {Set<string>} */ (new Set());
        styles.forEach(function(style){config.ships.forEach(function(ship){
            var opponents=config.pairing==='mirror'?[ship]:config.pairing==='anchor'?[config.ships[0]]:config.ships;
            opponents.forEach(function(opponent){config.weapons.forEach(function(weapon){config.starts.forEach(function(start){config.skills.forEach(function(skill){config.pilots.forEach(function(pilot){
                var seeds=pilot==='perfect'?1:config.seeds;
                for(var s=0;s<seeds;s++){
                    var defenses=config.defenses==='paired'?[false,true]:[config.defenses==='unshielded'];
                    defenses.forEach(function(unshielded){
                        var ownWeapon=weapon===-1?DW.flightSim.defaultWeapon(DW.arcade.profiles[ship]):weapon;
                        var otherWeapon=weapon===-1?DW.flightSim.defaultWeapon(DW.arcade.profiles[opponent]):weapon;
                        var key=JSON.stringify([style,ship,opponent,ownWeapon,otherWeapon,start,skill,pilot,config.seed+s,unshielded]);
                        if(seen.has(key))return;
                        seen.add(key);
                        if(cases.length>=2000)throw new Error('This design exceeds 2,000 duels. Select fewer factors or use mirror pairings.');
                        cases.push({id:'case-'+String(cases.length+1).padStart(4,'0'),options:{opponentStyle:style,profile:ship,opponentProfile:opponent,weapon:weapon,opponentWeapon:-2,start:start,skill:skill,seed:config.seed+s,duration:config.duration,category:pilot==='perfect'?'perfect':'human',flavor:pilot==='perfect'?'practiced':pilot,unshielded:unshielded}});
                    });
                }
            });});});});});
        });
        });
        return cases;
    }
    /** @param {Row[]} rows */
    function analyze(rows) {
        var buckets=/** @type {Map<string,Row[]>} */ (new Map());
        rows.forEach(function(row){var s=row.summary,key=JSON.stringify([s.opponentStyle,s.profile,s.opponentProfile,s.weapon,s.opponentWeapon,s.category,s.flavor,s.skill,s.unshielded]);var group=buckets.get(key)||[];group.push(row);buckets.set(key,group);});
        var groups=Array.from(buckets.values()).map(function(group){
            var first=group[0].summary,resolved=group.filter(function(r){return r.summary.outcome!=='timeout';});
            var seconds=group.reduce(function(n,r){return n+r.summary.seconds;},0)||1;
            return {separations:group.reduce(function(n,r){return n+r.summary.metrics.separations;},0),progressEscapes:group.reduce(function(n,r){return n+r.summary.metrics.progressEscapes;},0),style:first.opponentStyle,meanRange:group.reduce(function(n,r){return n+r.summary.metrics.rangeIntegral;},0)/seconds,attackFraction:group.reduce(function(n,r){return n+r.summary.metrics.attackSeconds;},0)/seconds,extendFraction:group.reduce(function(n,r){return n+r.summary.metrics.extendSeconds;},0)/seconds,rearThreatFraction:group.reduce(function(n,r){return n+r.summary.metrics.rearThreatSeconds;},0)/seconds,opportunityFraction:group.reduce(function(n,r){return n+r.summary.metrics.opponentOpportunities;},0)/seconds,label:first.profile+' → '+first.opponentProfile,pilot:first.category==='perfect'?'perfect':first.flavor,skill:first.skill,
                weapons:first.weapon+' / '+first.opponentWeapon,unshielded:first.unshielded,n:group.length,
                wins:group.filter(function(r){return r.summary.outcome==='player-win';}).length,
                losses:group.filter(function(r){return r.summary.outcome==='opponent-win';}).length,
                timeouts:group.length-resolved.length,medianKill:median(resolved.map(function(r){return r.summary.seconds;})),
                observedMean:group.reduce(function(n,r){return n+r.summary.seconds;},0)/group.length,
                longestDry:Math.max.apply(null,group.map(function(r){return r.summary.longestDry;}))};
        });
        groups.sort(function(a,b){return a.style.localeCompare(b.style)||a.label.localeCompare(b.label)||a.pilot.localeCompare(b.pilot);});
        var pairs=/** @type {Map<string,{retail?:Row;bare?:Row}>} */ (new Map());
        rows.forEach(function(row){var o=Object.assign({},row.options,{unshielded:false}),key=JSON.stringify(o),pair=pairs.get(key)||{};if(row.options.unshielded)pair.bare=row;else pair.retail=row;pairs.set(key,pair);});
        var matched=Array.from(pairs.values()).filter(function(pair){return pair.retail&&pair.bare;});
        var pairsCensored=matched.filter(function(p){return p.retail?.summary.outcome==='timeout'||p.bare?.summary.outcome==='timeout';}).length;
        var delta=matched.length?matched.reduce(function(n,p){return n+(p.retail?.summary.seconds||0)-(p.bare?.summary.seconds||0);},0)/matched.length:null;
        return {total:rows.length,wins:rows.filter(function(r){return r.summary.outcome==='player-win';}).length,losses:rows.filter(function(r){return r.summary.outcome==='opponent-win';}).length,
            timeouts:rows.filter(function(r){return r.summary.outcome==='timeout';}).length,medianKill:median(rows.filter(function(r){return r.summary.outcome!=='timeout';}).map(function(r){return r.summary.seconds;})),
            flagged:rows.filter(function(r){return r.summary.outcome==='timeout'||r.summary.longestDry>=10||r.summary.seconds<3;}),groups:groups,
            shieldPairs:matched.length,pairsCensored:pairsCensored,observedShieldDelta:delta};
    }
    /** @param {import('./types').DuelOptions} options */
    function watchUrl(options) {
        var params=new URLSearchParams({duel:'1'});
        Object.entries(options).forEach(function(entry){params.set(entry[0],String(entry[1]));});
        return 'flight.html?'+params.toString();
    }
    DW.flightStudy={plan:plan,analyze:analyze,watchUrl:watchUrl};
}());
