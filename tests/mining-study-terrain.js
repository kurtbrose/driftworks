(function(root){
  'use strict';
  const add=(a,b)=>a.map((v,k)=>v+b[k]), sub=(a,b)=>a.map((v,k)=>v-b[k]), mul=(a,s)=>a.map(v=>v*s);
  const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
  const perimeter=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
  // Intersections use the same displaced triangles as the renderer, not a height approximation.
  const bounds=points=>[0,1,2].map(k=>[Math.min(...points.map(p=>p[k])),Math.max(...points.map(p=>p[k]))]);
  const overlaps=(a,b)=>a.every((r,k)=>r[1]>b[k][0]+1e-7&&b[k][1]>r[0]+1e-7);
  function intersects(a,b){
    const ea=[sub(a[1],a[0]),sub(a[2],a[1]),sub(a[0],a[2])],eb=[sub(b[1],b[0]),sub(b[2],b[1]),sub(b[0],b[2])];
    for(const axis of [cross(ea[0],ea[1]),cross(eb[0],eb[1]),...ea.flatMap(e=>eb.map(f=>cross(e,f)))]){const length=Math.hypot(...axis);if(length<1e-10)continue;const x=a.map(p=>dot(p,axis)/length),y=b.map(p=>dot(p,axis)/length);if(Math.max(...x)<=Math.min(...y)+1e-7||Math.max(...y)<=Math.min(...x)+1e-7)return false;}return true;
  }
  function meshSampler(data,radius,site){
    const triangles=[];
    for(let i=0;i<data.length;i+=18){const p=[0,6,12].map(k=>mul(Array.from(data.slice(i+k,i+k+3)),radius));
      if(Math.max(...p.map(v=>v[0]))<site[0]-45||Math.min(...p.map(v=>v[0]))>site[0]+45||Math.max(...p.map(v=>v[1]))<site[1]-45||Math.min(...p.map(v=>v[1]))>site[1]+45)continue;
      triangles.push({points:p,box:bounds(p)});
    }
    const stats={raycasts:0,rampQueries:0};
    function ray(origin,direction){stats.raycasts++;let best=null;
      for(const triangle of triangles){const p=triangle.points;const e1=sub(p[1],p[0]),e2=sub(p[2],p[0]),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;
        const s=sub(origin,p[0]),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;
        const distance=dot(e2,q)/det;if(distance<0||best&&distance>=best.distance)continue;
        let normal=unit(cross(e1,e2));if(dot(normal,direction)>0)normal=mul(normal,-1);
        best={point:add(origin,mul(direction,distance)),normal,distance};
      }return best;
    }
    function collides(points){stats.rampQueries++;const box=bounds(points);for(const triangle of triangles)if(overlaps(box,triangle.box)&&intersects(points,triangle.points))return true;return false;}
    return {stats,ray,collides,at:(x,y)=>ray([x,y,radius*2],[0,0,-1]),triangleCount:triangles.length};
  }
  function solveKnee(mount,tip){
    const l1=4.8,l2=Math.hypot(3.2,2.6),delta=sub(tip,mount),distance=Math.hypot(...delta),axis=unit(delta);
    const reachable=distance<=l1+l2-.04&&distance>=Math.abs(l1-l2)+.04;
    const d=Math.max(Math.abs(l1-l2)+.001,Math.min(l1+l2-.001,distance)),along=(l1*l1-l2*l2+d*d)/(2*d);
    const pole=unit(sub([0,0,1],mul(axis,axis[2]))),knee=add(mount,add(mul(axis,along),mul(pole,Math.sqrt(Math.max(0,l1*l1-along*along)))));
    return {knee,reachable,distance};
  }
  function inside(x,y){let hit=false;for(let i=0,j=7;i<8;j=i++){const a=perimeter[i],b=perimeter[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  function fit(sample,site){
    const center=sample.at(site[0],site[1]);if(!center)return null;
    const probes=perimeter.map(p=>sample.at(site[0]+p[0],site[1]+p[1])).filter(Boolean);
    const up=unit(probes.reduce((n,p)=>add(n,p.normal),[0,0,0])),right=unit(cross([0,1,0],up)),forward=cross(up,right),basis=[right,forward,up];
    const rotate=p=>[0,1,2].map(k=>dot(basis.map(v=>v[k]),p));
    let origin=[site[0],site[1],center.point[2]-1.4];
    const world=p=>add(origin,rotate(p)),local=p=>basis.map(v=>dot(sub(p,origin),v)),normalLocal=n=>basis.map(v=>dot(n,v));
    // Raise the entire rigid chassis if any sample infringes its reserved underside clearance.
    for(let pass=0;pass<2;pass++){let raise=0;for(let x=-17;x<=15;x+=2)for(let y=-10.5;y<=10.5;y+=1.5){if(!inside(x,y))continue;const p=world([x,y,2.65]),hit=sample.at(p[0],p[1]);if(hit)raise=Math.max(raise,hit.point[2]+.7-p[2]);}origin[2]+=raise;}
    const contacts=perimeter.map((p,i)=>{
      const before=perimeter[(i+7)%8],after=perimeter[(i+1)%8],a=unit(sub([...p,0],[...before,0])),b=unit(sub([...after,0],[...p,0]));
      const out=unit([a[1]+b[1],-a[0]-b[0],0]),mount=[...p,4];let best=null;
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
  function transform(batch,fit){const vertices=new Float32Array(batch.vertices);for(let i=0;i<vertices.length;i+=6){vertices.set(fit.world(Array.from(vertices.slice(i,i+3))),i);vertices.set(fit.rotate(Array.from(vertices.slice(i+3,i+6))),i+3);}return {...batch,vertices};}
  // Sweep the actual thick leaves along their existing two-hinge motion. Cache the result per site.
  function rampStops(sample,fit,geometry){
    function leaves(t){const data=geometry(t).ochre,bays=Array.from({length:8},()=>[]);
      for(let i=0;i<160;i++){const offset=i*18,tri=[0,6,12].map(k=>Array.from(data.slice(offset+k,offset+k+3))),bay=Math.floor(i/20);
        bays[bay].push(tri.map(fit.world));
        if(i%10<2)bays[bay].push(tri.map(p=>fit.world(p.map((v,k)=>v-data[offset+3+k]*.22))));
      }return bays;
    }
    const hit=triangles=>triangles.some(tri=>sample.collides(tri)),limits=Array(8).fill(1),stopped=Array(8).fill(false);
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
  const api={meshSampler,solveKnee,fit,transform,rampStops};
  if(typeof module!=='undefined')module.exports=api;else root.Driftworks.miningStudyTerrain=api;
})(typeof window==='undefined'?globalThis:window);
