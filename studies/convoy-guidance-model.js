(function(){
    'use strict';
    var DW=window.Driftworks;
    var copy=function(v){return JSON.parse(JSON.stringify(v));};
    var distance=function(a,b){return Math.hypot.apply(null,a.map(function(v,k){return v-b[k];}));};
    /** Deterministic review adapter. Guidance/coverage are production code; scenario stimuli
     * and departing-ship transit are explicit lab orders, not simulated weapons/combat. */
    function create(seedBodies,scenario,settings){
        settings=Object.assign({speed:25,power:2,bearing:180,startup:'settled'},settings);
        var initial=copy(seedBodies),bodies=copy(initial),departing=[],escorts=[],time=0,serial=30,events=[],history={},flags={};
        var center=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.position[k];},0)/bodies.length;});
        var template=bodies.map(function(b){return b.position.map(function(v,k){return v-center[k];});});
        if(settings.startup==='mixed')bodies.forEach(function(b,i){var angle=(i*2.399963)%(Math.PI*2),pitch=Math.sin(i*1.7)*.3;b.position=b.position.map(function(v,k){return v+[Math.cos(angle)*120,Math.sin(angle)*100,Math.sin(i*3.1)*80][k];});b.forward=[Math.sin(angle)*Math.cos(pitch),Math.cos(angle)*Math.cos(pitch),Math.sin(pitch)];b.velocity=b.forward.map(function(v){return v*settings.speed;});});
        var group=settings.startup==='settled'?DW.fleetGuidance.settle(bodies,{speed:settings.speed}):DW.fleetGuidance.create(bodies,[0,1,0],template),goals={},threats=[],nextCover=0,frames=0;
        var course=group.forward.slice(),across=DW.fleetGuidance.frame(course).right;
        group.velocity=course.map(function(v){return v*settings.speed;});center=group.anchor.slice();
        for(var i=0;i<6;i++)escorts.push({id:'escort-'+i,position:[center[0]+(i-2.5)*70,center[1]-550,center[2]+90],velocity:[0,settings.speed,0],radius:8,packet:5,role:'escort'});
        function event(text){events.push({time:time,text:text});}
        function settleStart(){group=DW.fleetGuidance.settle(bodies,{speed:settings.speed});center=group.anchor.slice();course=group.forward.slice();across=DW.fleetGuidance.frame(course).right;time=0;frames=0;flags={};history={};events=[];threats=[];departing=[];nextCover=0;event('Preflight settle: inferred course '+course.map(function(v){return v.toFixed(2);}).join(' / ')+'; '+group.settleShift.toFixed(0)+' m maximum adjustment before time zero');}
        function join(count){for(var i=0;i<count;i++){
            var b=copy(initial[(serial-30)%initial.length]);b.id='join-'+(++serial);b.role='joining';b.position=group.anchor.map(function(v,k){return v+[550+i*65,-650-i*45,100+i*35][k];});b.velocity=course.map(function(v){return v*settings.speed;});b.forward=course.slice();b.packet=(serial-1)%5;bodies.push(b);
        }event(count+' freighters joining from starboard aft');}
        function leave(count){var amount=Math.max(0,Math.min(count,bodies.length-1)),chosen=amount?bodies.slice(-amount):[];chosen.forEach(function(b,i){bodies.splice(bodies.indexOf(b),1);delete group.slots[b.id];b.role='departing';b.departure=group.anchor.map(function(v,k){return v+[-950-i*70,-250-i*80,100+i*50][k];});departing.push(b);});event(chosen.length+' freighters released to a separate destination');}
        function transit(body,goal,speed,dt){
            var delta=goal.map(function(v,k){return v-body.position[k];}),d=Math.hypot.apply(null,delta),demand=delta.map(function(v){return v/(d||1)*Math.min(speed,d*.2);});
            var change=demand.map(function(v,k){return v-body.velocity[k];}),a=Math.hypot.apply(null,change),blend=Math.min(1,dt*(body.role==='escort'?12:1.2)/(a||1));
            body.velocity=body.velocity.map(function(v,k){return v+change[k]*blend;});body.position=body.position.map(function(v,k){return v+body.velocity[k]*dt;});var n=Math.hypot.apply(null,body.velocity);if(n>1)body.forward=body.velocity.map(function(v){return v/n;});
        }
        function advance(seconds,inspect){
            var ticks=Math.round(seconds*60);
            for(var tick=0;tick<ticks;tick++){
                time+=1/60;frames++;
                var turn=(scenario==='turn'||scenario==='combined')&&time>=20;
                if(turn&&!flags.turn){flags.turn=true;event('90° route order; each ship turns through its own local steering');}
                if((scenario==='traffic'||scenario==='combined')&&time>=20&&!flags.leave){flags.leave=true;leave(3);}
                if((scenario==='traffic'||scenario==='combined')&&time>=40&&!flags.join){flags.join=true;join(3);}
                var attack=(scenario==='attack'||scenario==='combined')&&time>=12&&time<75;
                if(attack&&!flags.attack){flags.attack=true;event('Heavy one-sided threat pressure begins (no weapon damage)');}
                if(!attack&&flags.attack&&!flags.quiet&&time>=75){flags.quiet=true;event('Threat pressure removed; recovery');}
                var angle=settings.bearing*Math.PI/180;
                threats=attack?[0,1,2].map(function(i){return {position:group.anchor.map(function(v,k){return v+[Math.cos(angle)*(850+i*90),Math.sin(angle)*(850+i*90),(-1+i)*120][k];}),radius:2500,weight:settings.power};}):[];
                var route=center.map(function(v,k){return v+settings.speed*(turn?course[k]*20+across[k]*(time-20):course[k]*time);});
                DW.fleetGuidance.step(group,bodies,route,(turn?across:course).map(function(v){return v*settings.speed;}),threats,1/60);
                bodies.forEach(function(b){if(b.role==='joining'&&b.neighborIds&&b.neighborIds.length>=3&&(b.cohesionError||0)<40){b.role='freighter';event(b.id+' merged into the local flow');}});
                if(time>=nextCover){nextCover=time+1;goals=DW.fleetGuidance.cover(group,bodies,escorts,threats);}
                escorts.forEach(function(b){if(goals[b.id])transit(b,goals[b.id],70,1/60);});
                departing.forEach(function(b){transit(b,b.departure,35,1/60);});
                if(frames%6===0)bodies.concat(departing,escorts).forEach(function(b){var trail=history[b.id]||(history[b.id]=[]);trail.push(b.position.slice());if(trail.length>240)trail.shift();});
            }
            return inspect===false?null:snapshot();
        }
        function snapshot(){
            var errors=bodies.map(function(b){return b.cohesionError||0;});
            var spans=[0,1,2].map(function(k){return Math.max.apply(null,bodies.map(function(b){return b.position[k];}))-Math.min.apply(null,bodies.map(function(b){return b.position[k];}));});
            var traffic=bodies.concat(departing),overlaps=0;
            var boxes=traffic.map(function(body){var half=body.halfSize||[9,61,7],low=body.hullMin||half.map(function(v){return -v;}),high=body.hullMax||half,axes=DW.fleetGuidance.frame(body.forward||[0,1,0]),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
                for(var mask=0;mask<8;mask++){var corner=[0,1,2].map(function(k){return mask&(1<<k)?high[k]:low[k];});for(var k=0;k<3;k++){var value=body.position[k]+axes.right[k]*corner[0]-axes.back[k]*corner[1]+axes.up[k]*corner[2];min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);}}return {min:min,max:max};
            });
            for(var i=0;i<traffic.length;i++)for(var j=i+1;j<traffic.length;j++)if([0,1,2].every(function(k){return boxes[i].min[k]<boxes[j].max[k]&&boxes[i].max[k]>boxes[j].min[k];}))overlaps++;
            return {time:time,scenario:scenario,settings:settings,bodies:bodies,departing:departing,escorts:escorts,group:group,goals:goals,threats:threats,events:events,history:history,center:center,
                metrics:{overlaps:overlaps,pending:0,maxError:Math.max.apply(null,errors),speed:Math.hypot.apply(null,group.velocity),spans:spans,assigned:new Set(Object.values(group.assignments)).size}};
        }
        event(group.settled?'Established cruise / preflight spacing settled before time zero':'Unsettled launch / watch the startup correction');
        return {advance:advance,snapshot:snapshot,join:join,leave:leave,settle:settleStart};
    }
    DW.convoyGuidanceReview={create:create};
}());
