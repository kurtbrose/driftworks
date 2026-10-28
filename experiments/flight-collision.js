(function () {
    'use strict';
    // Broad-phase candidates and scheduling only; no damage, narrow-phase hits or pilot rules.
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Combat} Combat */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Bolt} Bolt */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), U = DW.sim.METERS_PER_UNIT;

    /** @typedef {{craft:Craft, x:number,y:number,z:number,r:number,key:string,shape:string,team:string,alive:boolean,order:number}} CollisionEntry */
    /** @typedef {{entries:CollisionEntry[],cells:Map<string,CollisionEntry[]>,large:CollisionEntry[],motion:number,epoch:number,time:number}} CollisionIndex */
    /** @type {WeakMap<Combat,CollisionIndex>} */var collisionIndices=new WeakMap();
    /** @type {WeakMap<Bolt,{index:CollisionIndex,epoch:number,motion:number,point:Vector,radius:number,faction:string}>} */var collisionSleeps=new WeakMap();
    var collisionCell=128/U, sleepClearance=100/U;
    /** @typedef {'legacy'|'grid'|'tree'|'grid-events'|'tree-events'} CollisionMode */
    /** @typedef {{min:number[],max:number[]}} CollisionBox */
    /** @template T @typedef {{box:CollisionBox,value:T|null,parent:SpaceNode<T>|null,left:SpaceNode<T>|null,right:SpaceNode<T>|null,height:number,keys:string[]}} SpaceNode */
    /** @template T @typedef {{root:SpaceNode<T>|null,cells:Map<string,Set<SpaceNode<T>>>,large:Set<SpaceNode<T>>,tree:boolean}} Space */
    /** @typedef {{entry:CollisionEntry,node:SpaceNode<CollisionEntry>}} ShipProxy */
    /** @typedef {{at:number,active:boolean,epoch:number,faction:string,radius:number,raw:CollisionBox,node:SpaceNode<CollisionEvent>|null,candidates:CollisionEntry[]}} CollisionEvent */
    /** @typedef {{mode:CollisionMode,index:CollisionIndex,ships:Space<CollisionEntry>,corridors:Space<CollisionEvent>,proxies:Map<Craft,ShipProxy>,events:WeakMap<Bolt,CollisionEvent>,heap:CollisionEvent[],activeEvents:number,depth:number,epoch:number,stats:{syncs:number,moves:number,queries:number,reuses:number,popped:number,wakes:number}}} CollisionEngine */
    /** @type {WeakMap<Combat,CollisionMode>} */var collisionModes=new WeakMap();
    /** @type {WeakMap<Combat,CollisionEngine>} */var collisionEngines=new WeakMap();
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxesOverlap(a,b){return a.min[0]<=b.max[0]&&a.max[0]>=b.min[0]&&a.min[1]<=b.max[1]&&a.max[1]>=b.min[1]&&a.min[2]<=b.max[2]&&a.max[2]>=b.min[2];}
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxContains(a,b){return a.min[0]<=b.min[0]&&a.max[0]>=b.max[0]&&a.min[1]<=b.min[1]&&a.max[1]>=b.max[1]&&a.min[2]<=b.min[2]&&a.max[2]>=b.max[2];}
    /** @param {Vector} a @param {Vector} b @param {number} padding @returns {CollisionBox} */
    function segmentBox(a,b,padding){return {min:[Math.min(a[0],b[0])-padding,Math.min(a[1],b[1])-padding,Math.min(a[2],b[2])-padding],max:[Math.max(a[0],b[0])+padding,Math.max(a[1],b[1])+padding,Math.max(a[2],b[2])+padding]};}
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxUnion(a,b){return {min:[Math.min(a.min[0],b.min[0]),Math.min(a.min[1],b.min[1]),Math.min(a.min[2],b.min[2])],max:[Math.max(a.max[0],b.max[0]),Math.max(a.max[1],b.max[1]),Math.max(a.max[2],b.max[2])]};}
    /** @param {CollisionBox} a */
    function boxArea(a){var x=a.max[0]-a.min[0],y=a.max[1]-a.min[1],z=a.max[2]-a.min[2];return x*y+y*z+z*x;}
    /** @template T @param {boolean} tree @returns {Space<T>} */
    function makeSpace(tree){return {root:null,cells:new Map(/** @type {[string,Set<SpaceNode<T>>][]} */([])),large:new Set(/** @type {SpaceNode<T>[]} */([])),tree:tree};}
    /** @param {CollisionBox} box @returns {string[]|null} */
    function boxKeys(box){
        var lo=box.min.map(function(v){return Math.floor(v/collisionCell);}),hi=box.max.map(function(v){return Math.floor(v/collisionCell);});
        if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>512)return null;
        var keys=/** @type {string[]} */([]);for(var x=lo[0];x<=hi[0];x++)for(var y=lo[1];y<=hi[1];y++)for(var z=lo[2];z<=hi[2];z++)keys.push(x+','+y+','+z);return keys;
    }
    /** @template T @param {SpaceNode<T>} n */
    function refitNode(n){if(n.left&&n.right){n.box=boxUnion(n.left.box,n.right.box);n.height=1+Math.max(n.left.height,n.right.height);}}
    /** AVL rotations keep insertion orders from producing a linear tree.
     * @template T @param {Space<T>} space @param {SpaceNode<T>|null} node */
    function refitSpace(space,node){
        while(node){
            refitNode(node);var left=node.left,right=node.right;
            if(left&&right&&Math.abs(left.height-right.height)>1){
                var heavy=left.height>right.height?left:right,isLeft=heavy===left;
                var inner=isLeft?heavy.right:heavy.left,outer=isLeft?heavy.left:heavy.right;
                if(inner&&outer&&inner.height>outer.height){
                    // First rotate the heavy child toward its taller inner grandchild.
                    var transfer=isLeft?inner.left:inner.right;
                    if(isLeft){heavy.right=transfer;inner.left=heavy;node.left=inner;}else{heavy.left=transfer;inner.right=heavy;node.right=inner;}
                    if(transfer)transfer.parent=heavy;heavy.parent=inner;inner.parent=node;refitNode(heavy);refitNode(inner);heavy=inner;
                }
                var parent=node.parent,bridge=isLeft?heavy.right:heavy.left;
                if(isLeft){node.left=bridge;heavy.right=node;}else{node.right=bridge;heavy.left=node;}
                if(bridge)bridge.parent=node;node.parent=heavy;heavy.parent=parent;
                if(!parent)space.root=heavy;else if(parent.left===node)parent.left=heavy;else parent.right=heavy;
                refitNode(node);refitNode(heavy);node=heavy;
            }
            node=node.parent;
        }
    }
    /** @template T @param {Space<T>} space @param {CollisionBox} box @param {T} value @returns {SpaceNode<T>} */
    function spaceInsert(space,box,value){
        var leaf=/** @type {SpaceNode<T>} */({box:box,value:value,parent:null,left:null,right:null,height:0,keys:[]});
        if(!space.tree){var keys=boxKeys(box);if(!keys)space.large.add(leaf);else {leaf.keys=keys;keys.forEach(function(key){var bucket=space.cells.get(key);if(!bucket){bucket=new Set(/** @type {SpaceNode<T>[]} */([]));space.cells.set(key,bucket);}bucket.add(leaf);});}return leaf;}
        if(!space.root){space.root=leaf;return leaf;}
        var sibling=space.root;
        while(sibling.left&&sibling.right){var l=sibling.left,r=sibling.right;sibling=boxArea(boxUnion(l.box,box))-boxArea(l.box)<boxArea(boxUnion(r.box,box))-boxArea(r.box)?l:r;}
        var parent=sibling.parent,branch=/** @type {SpaceNode<T>} */({box:boxUnion(box,sibling.box),value:null,parent:parent,left:sibling,right:leaf,height:1,keys:[]});
        sibling.parent=branch;leaf.parent=branch;if(!parent)space.root=branch;else if(parent.left===sibling)parent.left=branch;else parent.right=branch;
        refitSpace(space,branch);return leaf;
    }
    /** @template T @param {Space<T>} space @param {SpaceNode<T>} leaf */
    function spaceRemove(space,leaf){
        if(!space.tree){space.large.delete(leaf);leaf.keys.forEach(function(key){var bucket=space.cells.get(key);if(bucket){bucket.delete(leaf);if(!bucket.size)space.cells.delete(key);}});return;}
        var parent=leaf.parent;if(!parent){space.root=null;return;}var sibling=parent.left===leaf?parent.right:parent.left,grand=parent.parent;
        if(!sibling)return;sibling.parent=grand;if(!grand)space.root=sibling;else if(grand.left===parent)grand.left=sibling;else grand.right=sibling;
        leaf.parent=null;refitSpace(space,grand);
    }
    /** @template T @param {Space<T>} space @param {CollisionBox} box @returns {T[]} */
    function spaceQuery(space,box){
        var result=/** @type {T[]} */([]);
        if(space.tree){var stack=/** @type {SpaceNode<T>[]} */([]);if(space.root)stack.push(space.root);while(stack.length){var node=stack.pop();if(!node||!boxesOverlap(node.box,box))continue;if(node.value!==null)result.push(node.value);else {if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}}return result;}
        var keys=boxKeys(box),seen=new Set(/** @type {SpaceNode<T>[]} */([]));
        /** @param {SpaceNode<T>} leaf */function visit(leaf){if(!seen.has(leaf)){seen.add(leaf);if(leaf.value!==null&&boxesOverlap(leaf.box,box))result.push(leaf.value);}}
        if(keys)keys.forEach(function(key){var bucket=space.cells.get(key);if(bucket)bucket.forEach(visit);});else space.cells.forEach(function(bucket){bucket.forEach(visit);});
        space.large.forEach(visit);return result;
    }
    /** @param {CollisionEngine} engine @param {CollisionEvent} event */
    function wakeCollision(engine,event){if(!event.active)return;event.active=false;engine.activeEvents--;if(event.node)spaceRemove(engine.corridors,event.node);event.node=null;engine.stats.wakes++;}
    /** @param {CollisionEngine} engine @param {CollisionEvent} event */
    function pushCollisionEvent(engine,event){var heap=engine.heap,i=heap.length;heap.push(event);while(i){var p=(i-1)>>1;if(heap[p].at<=event.at)break;heap[i]=heap[p];i=p;}heap[i]=event;}
    /** @param {CollisionEngine} engine @param {number} time */
    function drainCollisionEvents(engine,time){
        var heap=engine.heap;
        while(heap.length&&heap[0].at<=time){var event=heap[0],last=heap.pop();if(heap.length&&last){var i=0;while(i*2+1<heap.length){var c=i*2+1;if(c+1<heap.length&&heap[c+1].at<heap[c].at)c++;if(heap[c].at>=last.at)break;heap[i]=heap[c];i=c;}heap[i]=last;}engine.stats.popped++;wakeCollision(engine,event);}
        // Direction changes and teleports can leave stale events before their deadlines.
        if(heap.length>engine.activeEvents*2+256){var live=heap.filter(function(e){return e.active;});heap.length=0;live.forEach(function(e){pushCollisionEvent(engine,e);});}
    }
    /** @param {Combat} t @param {CollisionMode} mode */
    function setCollisionMode(t,mode){if(['legacy','grid','tree','grid-events','tree-events'].indexOf(mode)<0)throw new Error('Unknown collision mode');collisionModes.set(t,mode);collisionEngines.delete(t);collisionIndices.delete(t);}
    /** @param {Combat} t */
    function getCollisionEngine(t){
        var mode=collisionModes.get(t)||'grid-events';if(mode==='legacy')return null;
        var engine=collisionEngines.get(t);
        if(!engine){engine={mode:mode,index:{entries:[],cells:new Map(/** @type {[string,CollisionEntry[]][]} */([])),large:[],motion:0,epoch:0,time:t.time},ships:makeSpace(mode.indexOf('tree')===0),corridors:makeSpace(mode.indexOf('tree')===0),proxies:new Map(/** @type {[Craft,ShipProxy][]} */([])),events:new WeakMap(),heap:[],activeEvents:0,depth:0,epoch:0,stats:{syncs:0,moves:0,queries:0,reuses:0,popped:0,wakes:0}};collisionEngines.set(t,engine);}
        return engine;
    }
    /** @param {CollisionEngine} engine @param {Craft} craft @param {number} order */
    function moveCollisionProxy(engine,craft,order){
        var shape=craft.collision,signature=!shape?'sphere:9':shape.kind==='sphere'?'sphere:'+shape.radiusM:'model:'+shape.modelId;
        var proxy=engine.proxies.get(craft),entry=proxy?proxy.entry:null,p=craft.pose.eye,team=craft.team||'enemy';
        if(!entry||entry.shape!==signature){if(proxy)spaceRemove(engine.ships,proxy.node);entry={craft:craft,x:p[0],y:p[1],z:p[2],r:collisionRadius(craft),key:'',shape:signature,team:team,alive:craft.hp>0,order:order};proxy=undefined;engine.epoch++;}
        if(entry.team!==team||entry.alive!==(craft.hp>0)||entry.order!==order){engine.epoch++;entry.team=team;}entry.alive=craft.hp>0;entry.order=order;entry.x=p[0];entry.y=p[1];entry.z=p[2];
        var actual=segmentBox(p,p,entry.r);
        if(!proxy||!boxContains(proxy.node.box,actual)){
            if(proxy)spaceRemove(engine.ships,proxy.node);
            var padded=segmentBox(p,p,entry.r+32/U);
            // Unknown bounds remain global; their envelope overlaps every corridor.
            spaceQuery(engine.corridors,padded).forEach(function(event){wakeCollision(engine,event);});
            proxy={entry:entry,node:spaceInsert(engine.ships,padded,entry)};engine.proxies.set(craft,proxy);engine.stats.moves++;
        }
        return entry;
    }
    /** Full observation is retained for public direct queries; managed batches notify movement explicitly.
     * @param {Combat} t @param {CollisionEngine} engine */
    function syncCollisionEngine(t,engine){
        if(engine.depth)return;engine.stats.syncs++;
        if(t.time<engine.index.time){engine.heap.forEach(function(event){wakeCollision(engine,event);});engine.heap.length=0;engine.epoch++;}engine.index.time=t.time;
        var seen=new Set(/** @type {Craft[]} */([])),entries=engine.index.entries;
        for(var i=0;i<=t.enemies.length;i++){var craft=i?t.enemies[i-1]:t.player;seen.add(craft);entries[i]=moveCollisionProxy(engine,craft,i);}
        if(entries.length!==t.enemies.length+1)engine.epoch++;entries.length=t.enemies.length+1;
        engine.proxies.forEach(function(proxy,craft){if(!seen.has(craft)){spaceRemove(engine.ships,proxy.node);engine.proxies.delete(craft);engine.epoch++;}});
        drainCollisionEvents(engine,t.time);
    }
    /** @template T @param {Combat} t @param {() => T} work @returns {T} */
    function collisionBatch(t,work){var engine=getCollisionEngine(t);if(!engine)return work();syncCollisionEngine(t,engine);engine.depth++;try{return work();}finally{engine.depth--;}}
    /** Notify an in-batch movement; omit craft after arbitrary roster/state edits.
     * @param {Combat} t @param {Craft} [craft] */
    function collisionChanged(t,craft){var engine=getCollisionEngine(t);if(!engine)return;var proxy=craft&&engine.proxies.get(craft);if(craft&&proxy){moveCollisionProxy(engine,craft,proxy.entry.order);return;}var depth=engine.depth;engine.depth=0;try{syncCollisionEngine(t,engine);}finally{engine.depth=depth;}}
    /** @param {Combat} t */
    function collisionStats(t){var engine=getCollisionEngine(t);return engine?Object.assign({mode:engine.mode,queued:engine.heap.length},engine.stats):{mode:'legacy',queued:0,syncs:0,moves:0,queries:0,reuses:0,popped:0,wakes:0};}
    /** @param {Combat} t @param {CollisionEngine} engine @param {Vector} start @param {Vector} end @param {Bolt} bolt @param {string} faction @param {Craft|undefined} shooter */
    function eventCollisionCandidates(t,engine,start,end,bolt,faction,shooter){
        var radius=bolt.weapon.headRadius||0,margin=Math.max(30,radius)/U,raw=segmentBox(start,end,0),event=engine.events.get(bolt),scheduled=engine.mode.indexOf('-events')>=0;
        if(scheduled&&event&&event.active&&event.epoch===engine.epoch&&event.faction===faction&&event.radius===radius&&t.time<event.at&&boxContains(event.raw,raw)){engine.stats.reuses++;return event.candidates;}
        if(event)wakeCollision(engine,event);
        // Legacy direct callers may supply a damage-only bolt without ballistic metadata.
        var remaining=bolt.weapon.lifetime-bolt.age,horizon=Number.isFinite(remaining)&&Number.isFinite(bolt.weapon.speed)&&bolt.weapon.speed>0?Math.min(.25,Math.max(0,remaining)):0,span=Math.hypot(end[0]-start[0],end[1]-start[1],end[2]-start[2]);
        if(scheduled&&horizon>0&&span>0){var travel=bolt.weapon.speed*horizon/U,future=end.map(function(v,k){return v+(end[k]-start[k])/span*travel;});raw=segmentBox(start,future,0);}
        var query={min:raw.min.map(function(v){return v-margin;}),max:raw.max.map(function(v){return v+margin;})};engine.stats.queries++;
        var candidates=spaceQuery(engine.ships,query).filter(function(e){return e.craft.hp>0&&e.craft!==shooter&&e.team!==faction;}).sort(function(a,b){return a.order-b.order;});
        if(scheduled&&horizon>0){event={at:t.time+horizon,active:true,epoch:engine.epoch,faction:faction,radius:radius,raw:raw,node:null,candidates:candidates};event.node=spaceInsert(engine.corridors,query,event);engine.events.set(bolt,event);engine.activeEvents++;pushCollisionEvent(engine,event);}
        return candidates;
    }
    /** @param {Craft} craft */
    function collisionRadius(craft){
        var shape=craft.collision;
        if(!shape||shape.kind==='sphere')return (shape?shape.radiusM:9)/U;
        // Minimal test adapters without a bound API retain the exhaustive path.
        if(!DW.shipPackModels||!DW.shipPackModels.hullRadius)return Infinity;
        var model=DW.shipPackModels.find(shape.modelId);
        var geometry=model?model.model:DW.shipPackModels.craftModel(craft,'',1);
        if(geometry.id!==shape.modelId)throw new Error('Unknown collision model '+shape.modelId);
        return DW.shipPackModels.hullRadius(geometry)/U;
    }
    /** Refresh against actual poses on EVERY query, including interleaved movement within a step.
     * The cumulative displacement budget makes sleeping safe under acceleration and teleports.
     * No speed prediction, frame-order assumption or delayed damage is needed.
     * @param {Combat} t */
    function collisionIndex(t){
        var engine=getCollisionEngine(t);if(engine){syncCollisionEngine(t,engine);return engine.index;}
        var index=collisionIndices.get(t);
        if(!index){index={entries:[],cells:new Map(/** @type {[string,CollisionEntry[]][]} */([])),large:[],motion:0,epoch:0,time:t.time};collisionIndices.set(t,index);}
        var rebuild=index.entries.length!==t.enemies.length+1;
        if(t.time<index.time){index.epoch++;}index.time=t.time;
        for(var i=0;i<=t.enemies.length;i++){
            var craft=i?t.enemies[i-1]:t.player,entry=index.entries[i],p=craft.pose.eye;
            var shape=craft.collision,signature=!shape?'sphere:9':shape.kind==='sphere'?'sphere:'+shape.radiusM:'model:'+shape.modelId;
            var team=craft.team||'enemy',living=craft.hp>0;
            if(!entry||entry.craft!==craft||entry.shape!==signature){
                entry={craft:craft,x:p[0],y:p[1],z:p[2],r:collisionRadius(craft),key:'',shape:signature,team:team,alive:living,order:i};
                index.entries[i]=entry;index.epoch++;rebuild=true;
            }
            if(entry.team!==team||entry.alive!==living){entry.team=team;entry.alive=living;index.epoch++;}
            if(!entry.key||p[0]!==entry.x||p[1]!==entry.y||p[2]!==entry.z){
                index.motion+=Math.hypot(p[0]-entry.x,p[1]-entry.y,p[2]-entry.z);
                entry.x=p[0];entry.y=p[1];entry.z=p[2];
                var key=Math.floor(p[0]/collisionCell)+','+Math.floor(p[1]/collisionCell)+','+Math.floor(p[2]/collisionCell);
                if(key!==entry.key){entry.key=key;rebuild=true;}
            }
        }
        if(index.entries.length>t.enemies.length+1){index.entries.length=t.enemies.length+1;index.epoch++;}
        if(rebuild){index.cells.clear();index.large.length=0;for(var j=0;j<index.entries.length;j++){var e=index.entries[j];
            if(e.r>collisionCell){index.large.push(e);continue;}
            var bucket=index.cells.get(e.key);if(!bucket){bucket=[];index.cells.set(e.key,bucket);}bucket.push(e);
        }}
        return index;
    }
    /** @param {CollisionIndex} index @param {Vector} a @param {Vector} b @param {number} margin */
    function collisionCandidates(index,a,b,margin){
        // A handful of scalar box checks beats hash lookups for a small encounter.
        if(index.entries.length<=24)return index.entries;
        var lo=[0,0,0],hi=[0,0,0];for(var k=0;k<3;k++){lo[k]=Math.floor((Math.min(a[k],b[k])-margin-collisionCell)/collisionCell);hi[k]=Math.floor((Math.max(a[k],b[k])+margin+collisionCell)/collisionCell);}
        // Long diagonal traces must not enumerate an unbounded volume of empty cells.
        if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>4096)return index.entries;
        var result=index.large.slice();
        for(var x=lo[0];x<=hi[0];x++)for(var y=lo[1];y<=hi[1];y++)for(var z=lo[2];z<=hi[2];z++){
            var bucket=index.cells.get(x+','+y+','+z);if(bucket)for(var j=0;j<bucket.length;j++)result.push(bucket[j]);
        }
        return result.sort(function(a,b){return a.order-b.order;});
    }
    /** @param {import('./flight-collision-types').CollisionCandidate} e @param {Vector} a @param {Vector} b @param {number} margin */
    function collisionNearby(e,a,b,margin){
        var r=e.r+margin;
        return e.x>=Math.min(a[0],b[0])-r&&e.x<=Math.max(a[0],b[0])+r&&e.y>=Math.min(a[1],b[1])-r&&e.y<=Math.max(a[1],b[1])+r&&e.z>=Math.min(a[2],b[2])-r&&e.z<=Math.max(a[2],b[2])+r;
    }
    /** Query caches are derived state, never stored in combat saves.
     * @param {Combat} t @param {Vector} start @param {Vector} end
     * @param {Bolt} bolt @param {Craft | string} team
     * @returns {{candidates: import('./flight-collision-types').CollisionCandidate[], shooter: Craft | undefined, faction: string, radius: number}} */
    function query(t, start, end, bolt, team) {
        var index=collisionIndex(t);
        var shooter = typeof team === 'object' ? team : index.entries.find(function (e) { return e.craft.id === team; })?.craft;
        var faction = shooter ? shooter.team || 'enemy' : team === 'player' ? 'ally' : 'enemy';
        if(t.player.pose.curvature)return {candidates:index.entries,shooter:shooter,faction:faction,radius:bolt.weapon.headRadius||0};
        var radius=bolt.weapon.headRadius||0,margin=Math.max(30,radius)/U,sleep=collisionSleeps.get(bolt);
        var sleeping=sleep&&sleep.index===index&&sleep.epoch===index.epoch&&sleep.radius===radius&&sleep.faction===faction&&
            Math.max(Math.hypot(start[0]-sleep.point[0],start[1]-sleep.point[1],start[2]-sleep.point[2]),Math.hypot(end[0]-sleep.point[0],end[1]-sleep.point[1],end[2]-sleep.point[2]))+index.motion-sleep.motion<sleepClearance;
        var engine=getCollisionEngine(t);
        var candidates=engine?eventCollisionCandidates(t,engine,start,end,bolt,faction,shooter):sleeping?[]:collisionCandidates(index,start,end,margin+sleepClearance).filter(function(entry){
            return entry.craft.hp>0&&entry.craft!==shooter&&entry.team!==faction&&collisionNearby(entry,start,end,margin+sleepClearance);
        });
        if(!engine&&!sleeping&&!candidates.length)collisionSleeps.set(bolt,{index:index,epoch:index.epoch,motion:index.motion,point:end.slice(),radius:radius,faction:faction});
        return {candidates: candidates, shooter: shooter, faction: faction, radius: radius};
    }
    /** Preserve the in-step proxy update without exposing engines to training.
     * @param {Combat} t @param {Craft} e */
    function moved(t, e) {
        var engine=getCollisionEngine(t);if(engine){var proxy=engine.proxies.get(e);moveCollisionProxy(engine,e,proxy?proxy.entry.order:0);}
    }
    DW.flightCollision = {query: query, nearby: collisionNearby, radius: collisionRadius,
        setMode: setCollisionMode, batch: collisionBatch, changed: collisionChanged,
        moved: moved, stats: collisionStats};
}());
