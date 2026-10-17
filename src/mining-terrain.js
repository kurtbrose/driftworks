(function(root){
  'use strict';
  /** @typedef {import('./types').TerrainFit} TerrainFit */
  /** @param {number[]} a @param {number[]} b */
  const add=(a,b)=>a.map((v,k)=>v+b[k]);
  /** @param {number[]} a @param {number[]} b */
  const sub=(a,b)=>a.map((v,k)=>v-b[k]);
  /** @param {number[]} a @param {number} s */
  const mul=(a,s)=>a.map(v=>v*s);
  /** @param {number[]} a @param {number[]} b */
  const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
  /** @param {number[]} a @param {number[]} b */
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  /** @param {number[]} a */
  const unit=a=>mul(a,1/(Math.hypot(...a)||1));
  const perimeter=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
  // Intersections use the same displaced triangles as the renderer, not a height approximation.
  /** @param {number[][]} points */
  const bounds=points=>[0,1,2].map(k=>[Math.min(...points.map(p=>p[k])),Math.max(...points.map(p=>p[k]))]);
  /** @param {number[][]} a @param {number[][]} b */
  const overlaps=(a,b)=>a.every((r,k)=>r[1]>b[k][0]+1e-7&&b[k][1]>r[0]+1e-7);
  /** @param {number[][]} a @param {number[][]} b */
  function intersects(a,b){
    const ea=[sub(a[1],a[0]),sub(a[2],a[1]),sub(a[0],a[2])],eb=[sub(b[1],b[0]),sub(b[2],b[1]),sub(b[0],b[2])];
    for(const axis of [cross(ea[0],ea[1]),cross(eb[0],eb[1]),...ea.flatMap(e=>eb.map(f=>cross(e,f)))]){const length=Math.hypot(...axis);if(length<1e-10)continue;const x=a.map(p=>dot(p,axis)/length),y=b.map(p=>dot(p,axis)/length);if(Math.max(...x)<=Math.min(...y)+1e-7||Math.max(...y)<=Math.min(...x)+1e-7)return false;}return true;
  }
  /** @param {Float32Array} data @param {number} radius @param {number[]} site */
  function meshSampler(data,radius,site){
    /** @type {{points:number[][];box:number[][]}[]} */
    const triangles=[];
    for(let i=0;i<data.length;i+=18){const p=[0,6,12].map(k=>mul(Array.from(data.slice(i+k,i+k+3)),radius));
      if(Math.max(...p.map(v=>v[0]))<site[0]-45||Math.min(...p.map(v=>v[0]))>site[0]+45||Math.max(...p.map(v=>v[1]))<site[1]-45||Math.min(...p.map(v=>v[1]))>site[1]+45)continue;
      triangles.push({points:p,box:bounds(p)});
    }
    const stats={raycasts:0,rampQueries:0};
    /** @param {number[]} origin @param {number[]} direction */
    function ray(origin,direction){stats.raycasts++;
      /** @type {import('./types').TerrainHit | null} */ let best=null;
      for(const triangle of triangles){const p=triangle.points;const e1=sub(p[1],p[0]),e2=sub(p[2],p[0]),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;
        const s=sub(origin,p[0]),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;
        const distance=dot(e2,q)/det;if(distance<0||best&&distance>=best.distance)continue;
        let normal=unit(cross(e1,e2));if(dot(normal,direction)>0)normal=mul(normal,-1);
        best={point:add(origin,mul(direction,distance)),normal,distance};
      }return best;
    }
    /** @param {number[][]} points */
    function collides(points){stats.rampQueries++;const box=bounds(points);for(const triangle of triangles)if(overlaps(box,triangle.box)&&intersects(points,triangle.points))return true;return false;}
    /** @param {number} x @param {number} y */
    const top=triangles.reduce((z,t)=>Math.max(z,...t.points.map(p=>p[2]+1)),radius*2);
    /** @param {number} x @param {number} y */
    const at=(x,y)=>ray([x,y,top],[0,0,-1]);
    return {stats,ray,collides,at,triangleCount:triangles.length};
  }
  /** @param {number[]} mount @param {number[]} tip */
  function solveKnee(mount,tip){
    const l1=4.8,l2=Math.hypot(3.2,2.6),delta=sub(tip,mount),distance=Math.hypot(...delta),axis=unit(delta);
    const reachable=distance<=l1+l2-.04&&distance>=Math.abs(l1-l2)+.04;
    const d=Math.max(Math.abs(l1-l2)+.001,Math.min(l1+l2-.001,distance)),along=(l1*l1-l2*l2+d*d)/(2*d);
    const pole=unit(sub([0,0,1],mul(axis,axis[2]))),knee=add(mount,add(mul(axis,along),mul(pole,Math.sqrt(Math.max(0,l1*l1-along*along)))));
    return {knee,reachable,distance};
  }
  /** @param {number} x @param {number} y */
  function inside(x,y){let hit=false;for(let i=0,j=7;i<8;j=i++){const a=perimeter[i],b=perimeter[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  /** @param {Pick<import('./types').TerrainSampler,'at'>} sample @param {number[]} site */
  function fit(sample,site){
    const center=sample.at(site[0],site[1]);if(!center)return null;
    const probes=perimeter.map(p=>sample.at(site[0]+p[0],site[1]+p[1])).filter(/** @returns {p is import('./types').TerrainHit} */ p=>p!==null);
    const up=unit(probes.reduce((n,p)=>add(n,p.normal),[0,0,0])),right=unit(cross([0,1,0],up)),forward=cross(up,right),basis=[right,forward,up];
    /** @param {number[]} p */
    const rotate=p=>[0,1,2].map(k=>dot(basis.map(v=>v[k]),p));
    let origin=[site[0],site[1],center.point[2]-1.4];
    /** @param {number[]} p */
    const world=p=>add(origin,rotate(p));
    /** @param {number[]} p */
    const local=p=>basis.map(v=>dot(sub(p,origin),v));
    /** @param {number[]} n */
    const normalLocal=n=>basis.map(v=>dot(n,v));
    // Raise the entire rigid chassis if any sample infringes its reserved underside clearance.
    for(let pass=0;pass<2;pass++){let raise=0;for(let x=-17;x<=15;x+=2)for(let y=-10.5;y<=10.5;y+=1.5){if(!inside(x,y))continue;const p=world([x,y,2.65]),hit=sample.at(p[0],p[1]);if(hit)raise=Math.max(raise,hit.point[2]+.7-p[2]);}origin[2]+=raise;}
    const contacts=perimeter.map((p,i)=>{
      const before=perimeter[(i+7)%8],after=perimeter[(i+1)%8],a=unit(sub([...p,0],[...before,0])),b=unit(sub([...after,0],[...p,0]));
      const out=unit([a[1]+b[1],-a[0]-b[0],0]),mount=[...p,4];
      /** @type {import('./types').TerrainContact | null} */ let best=null;
      for(let reach=9.8;reach>=7.4;reach-=.3){const proposed=world([p[0]+out[0]*reach,p[1]+out[1]*reach,0]),hit=sample.at(proposed[0],proposed[1]);if(!hit)continue;
        const normal=normalLocal(hit.normal),headForward=unit(sub(out,mul(normal,dot(out,normal)))),point=local(hit.point),tip=add(sub(point,mul(headForward,1.8)),mul(normal,1.56)),solved=solveKnee(mount,tip);
        const score=(solved.reachable?0:100)+Math.abs(reach-(9.35+.35*Math.sin(i*2.1)));
        if(!best||score<best.score)best={...solved,tip,normal,point,worldPoint:hit.point,score,out,mount};
      }
      return best||{knee:add(mount,mul(out,4.8)),tip:add(mount,mul(out,8)),normal:[0,0,1],point:mount,worldPoint:world(mount),reachable:false,score:1000,out,mount};
    });
    let clearance=Infinity;for(let x=-17;x<=15;x+=2)for(let y=-10.5;y<=10.5;y+=1.5){if(!inside(x,y))continue;const p=world([x,y,2.65]),hit=sample.at(p[0],p[1]);if(hit)clearance=Math.min(clearance,p[2]-hit.point[2]);}
    return {origin,basis,contacts,clearance,valid:probes.length===8&&up[2]>.7&&contacts.every(c=>c.reachable)&&clearance>=.69,world,local,rotate};
  }
  /** @template {{vertices:Float32Array}} T @param {T} batch @param {{world:(p:number[])=>number[];rotate:(p:number[])=>number[]}} fit */
  function transform(batch,fit){
    // Evaluate the rigid transform once. Per-vertex arrays/closures cause GC stalls,
    // especially when the five detailed crew models appear at touchdown.
    const vertices=new Float32Array(batch.vertices),o=fit.world([0,0,0]),a=fit.rotate([1,0,0]),b=fit.rotate([0,1,0]),c=fit.rotate([0,0,1]);
    const ax=fit.world([1,0,0]).map((v,k)=>v-o[k]),by=fit.world([0,1,0]).map((v,k)=>v-o[k]),cz=fit.world([0,0,1]).map((v,k)=>v-o[k]);
    for(let i=0;i<vertices.length;i+=6){
      const x=vertices[i],y=vertices[i+1],z=vertices[i+2],nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5];
      vertices[i]=o[0]+ax[0]*x+by[0]*y+cz[0]*z;vertices[i+1]=o[1]+ax[1]*x+by[1]*y+cz[1]*z;vertices[i+2]=o[2]+ax[2]*x+by[2]*y+cz[2]*z;
      vertices[i+3]=a[0]*nx+b[0]*ny+c[0]*nz;vertices[i+4]=a[1]*nx+b[1]*ny+c[1]*nz;vertices[i+5]=a[2]*nx+b[2]*ny+c[2]*nz;
    }
    return {...batch,vertices};
  }
  // Sweep the actual thick leaves along their existing two-hinge motion. Cache the result per site.
  /** @param {Pick<import('./types').TerrainSampler,'collides'>} sample @param {Pick<import('./types').TerrainFit,'world'>} fit @param {(t:number)=>Record<string,number[]>} geometry */
  function rampStops(sample,fit,geometry){
    /** @param {number} t */
    function leaves(t){const data=geometry(t).ochre;
      /** @type {number[][][][]} */ const bays=Array.from({length:8},()=>[]);
      for(let i=0;i<160;i++){const offset=i*18,tri=[0,6,12].map(k=>Array.from(data.slice(offset+k,offset+k+3))),bay=Math.floor(i/20);
        bays[bay].push(tri.map(fit.world));
        if(i%10<2)bays[bay].push(tri.map(p=>fit.world(p.map((v,k)=>v-data[offset+3+k]*.22))));
      }return bays;
    }
    /** @param {number[][][]} triangles */
    const hit=triangles=>triangles.some(tri=>sample.collides(tri)),limits=Array.from({length:8},()=>1),stopped=Array.from({length:8},()=>false);
    for(let step=0;step<=100;step++){const t=step/100,bays=leaves(t);
      for(let bay=0;bay<8;bay++)if(!stopped[bay]&&hit(bays[bay])){
        let low=Math.max(0,t-.01),high=t;
        for(let iteration=0;iteration<11;iteration++){const mid=(low+high)/2;if(hit(leaves(mid)[bay]))high=mid;else low=mid;}
        // A tiny separation avoids depth flicker where a steel underside meets rock.
        limits[bay]=Math.max(0,low-.0001);stopped[bay]=true;
      }
      if(stopped.every(Boolean))break;
    }
    return limits;
  }
  /** Rigid asteroid mesh into the fixed rig frame. Cull before storing triangles.
   * @param {Float32Array} data @param {number} radius @param {number[]} site @param {number} heading @param {number} scale */
  function surfaceSampler(data,radius,site,heading,scale){
    const c=Math.cos(heading),s=Math.sin(heading),inverse=1/scale;
    /** @type {number[]} */ const patch=[];
    for(let i=0;i<data.length;i+=18){
      /** @type {number[][]} */ const tri=[];
      for(const j of [0,6,12]){const x=data[i+j]*radius-site[0],y=data[i+j+1]*radius-site[1];tri.push([(x*c+y*s)*inverse,(-x*s+y*c)*inverse,data[i+j+2]*radius*inverse]);}
      if(Math.max(...tri.map(p=>p[0])) < -45 || Math.min(...tri.map(p=>p[0])) > 45 || Math.max(...tri.map(p=>p[1])) < -45 || Math.min(...tri.map(p=>p[1])) > 45)continue;
      for(const p of tri)patch.push(...p,0,0,1);
    }
    return meshSampler(new Float32Array(patch),1,[0,0]);
  }
  /** @param {TerrainFit} fit @param {number} deployment */
  function contactPoses(fit,deployment){
    const d=Math.max(0,Math.min(1,deployment));
    return fit.contacts.map(c=>{
      const reach=1.5+6*d*.55,tipReach=2+6*d;
      const knee=[c.mount[0]+c.out[0]*reach,c.mount[1]+c.out[1]*reach,4],tip=[c.mount[0]+c.out[0]*tipReach,c.mount[1]+c.out[1]*tipReach,1.4+(1-d)*2];
      return {knee:knee.map((v,k)=>v+(c.knee[k]-v)*d),tip:tip.map((v,k)=>v+(c.tip[k]-v)*d),normal:c.normal.map((v,k)=>(k===2?1:0)*(1-d)+v*d)};
    });
  }
  const api={meshSampler,surfaceSampler,solveKnee,fit,transform,rampStops,contactPoses,metresPerModelUnit:36/32};
  /** @type {import('./types').DriftworksNamespace} */
  const DW=(root.Driftworks=root.Driftworks || {});DW.miningTerrain=api;
})(window);
