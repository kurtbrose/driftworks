// One downloaded neutral sheet; eight paint jobs occupy previously blank atlas space.
export const cargoPalette=[
  ['oxide',[157,63,43]],['ochre',[191,125,37]],['navy',[43,72,105]],
  ['teal',[45,116,119]],['olive',[104,117,64]],['cream',[199,194,164]],
  ['orange',[201,88,35]],['charcoal',[66,73,80]]
];
export const cargoOperators=[
  ['NORTHRIDGE','SHIPPING CO.','NRC'],['CEDARLINE','INTERMODAL','CDL'],
  ['ARGOS','FREIGHT SYSTEMS','ARG'],['HELIX','BULK LOGISTICS','HLX'],
  ['RIFTLINE','CARGO NETWORK','RFT'],['VECTOR','TRANSPORT GROUP','VTR'],
  ['CROWN','CONSOLIDATED FREIGHT','CRN'],['WAYPOINT','CONTAINER LEASING','WPT']
];
function decals(ctx,x,y,variant){
  const [name,subtitle,code]=cargoOperators[(variant*3)%cargoOperators.length];
  ctx.save();ctx.translate(x,y);ctx.fillStyle=variant===5?'#283033':'#f0eee4';
  const logo=(variant*3)%cargoOperators.length;
  const polygon=points=>{ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fill();};
  ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=3;
  // Mountain, cedar, eye, helix, rift, arrow, crown and compass.
  if(logo===0){polygon([[26,78],[41,44],[57,78],[46,78],[41,63],[36,78]]);}
  else if(logo===1){for(let k=0;k<3;k++)polygon([[40,43+k*10],[26-k*2,59+k*10],[54+k*2,59+k*10]]);ctx.fillRect(37,72,6,10);}
  else if(logo===2){polygon([[24,62],[40,46],[58,62],[40,78]]);ctx.beginPath();ctx.arc(40,62,4,0,Math.PI*2);ctx.stroke();}
  else if(logo===3){ctx.beginPath();ctx.moveTo(27,46);ctx.bezierCurveTo(66,45,17,78,55,79);ctx.moveTo(55,46);ctx.bezierCurveTo(17,45,66,78,27,79);ctx.stroke();}
  else if(logo===4){polygon([[38,43],[25,62],[37,81],[42,67],[34,62],[43,48]]);polygon([[46,43],[59,62],[47,81],[42,67],[50,62],[41,48]]);}
  else if(logo===5){polygon([[25,46],[58,62],[25,79],[33,63],[45,62],[33,60]]);}
  else if(logo===6){polygon([[25,50],[34,60],[41,44],[49,60],[58,50],[53,76],[30,76]]);ctx.fillRect(30,79,23,3);}
  else{polygon([[41,43],[46,58],[60,63],[46,68],[41,83],[36,68],[22,63],[36,58]]);}
  ctx.font='bold 19px sans-serif';ctx.fillText(name,70,61,177);
  ctx.font='bold 10px sans-serif';ctx.fillText(subtitle,70,78,177);
  ctx.font='bold 12px monospace';ctx.fillText(code+' '+String(684020+variant*7919),365,55,134);
  ctx.font='9px monospace';ctx.fillText('DW-10 / HEAVY FREIGHT',365,71,134);
  ctx.restore();
}
export const tankerOperators=[
 ['SOLSTAR ENERGY','#d8bd9e','#a3412b'],['VERDANT FUELS','#a9c5ac','#285d4e'],
 ['POLAR TRANSFER','#a9c4d9','#315d84'],['MERIDIAN CHEMICAL','#c6bdce','#665473']
];
export function tankerOperator(seed,pod){const owner=cargoVariant(seed,0)%4;return pod===3&&cargoVariant(seed,11)===7?(owner+1)%4:owner;}
export const tankerBands=[
 {heads:[],barrel:[]},
 {heads:[[474,32]],barrel:[[82,72]]},
 {heads:[[450,12],[474,12]],barrel:[[82,20],[126,20],[170,20]]},
 {heads:[[474,44]],barrel:[[60,100],[936,16],[968,16]]}
];
// Only warm, light, low-chroma paint is replaced; printed details retain RGB.
export function tankerPaintPixel(r,g,b,color){
 const l=(r+g+b)/3,chroma=Math.max(r,g,b)-Math.min(r,g,b);
 const clamp=v=>Math.max(0,Math.min(1,v));
 const mask=clamp((r+g-2*b-1)/10)*clamp((l-75)/45)*clamp((250-l)/15)*(1-clamp((chroma-95)/25));
 return [r,g,b].map((v,c)=>Math.round(v*(1-mask)+Math.min(255,color[c]*l/198)*mask));
}
function replaceTankPaint(ctx,x,y,w,h,color){
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),pixels=ctx.getImageData(x,y,w,h),cache=new Map();
 for(let i=0;i<pixels.data.length;i+=4){const p=pixels.data,key=p[i]*65536+p[i+1]*256+p[i+2];let result=cache.get(key);if(!result){result=tankerPaintPixel(p[i],p[i+1],p[i+2],rgb);cache.set(key,result);}p[i]=result[0];p[i+1]=result[1];p[i+2]=result[2];}
 ctx.putImageData(pixels,x,y);
}
function tankerPaint(ctx,image){
 tankerOperators.forEach(([name,paint,stripe],i)=>{
  const x=2048+(i%2)*1024,y=Math.floor(i/2)*1024;
  ctx.drawImage(image,2048,0,2048,2048,x,y,1024,1024);
  replaceTankPaint(ctx,x,y,1024,1024,paint);
  ctx.strokeStyle=stripe;tankerBands[i].heads.forEach(([radius,width])=>{ctx.lineWidth=width;ctx.beginPath();ctx.arc(x+512,y+512,radius,0,Math.PI*2);ctx.stroke();});
  ctx.fillStyle=stripe;ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText(name,x+512,y+345,620);
  // Keep the inspection disk and its stencils clear below the operator name.
  ctx.save();ctx.translate(0,20);ctx.beginPath();
  if(i===0){for(let k=0;k<10;k++){const a=k*Math.PI/5-Math.PI/2,r=k%2?20:45;const px=x+512+Math.cos(a)*r,py=y+260+Math.sin(a)*r;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}}
  else if(i===1){ctx.moveTo(x+470,y+280);ctx.quadraticCurveTo(x+475,y+210,x+550,y+220);ctx.quadraticCurveTo(x+545,y+290,x+470,y+280);}
  else if(i===2){ctx.moveTo(x+465,y+280);ctx.lineTo(x+512,y+215);ctx.lineTo(x+560,y+280);ctx.lineTo(x+532,y+265);ctx.lineTo(x+510,y+245);ctx.lineTo(x+493,y+280);}
  else{ctx.moveTo(x+465,y+250);ctx.lineTo(x+512,y+215);ctx.lineTo(x+560,y+250);ctx.lineTo(x+512,y+285);}
  ctx.closePath();ctx.fill();ctx.restore();
  const bx=(i%2)*1024,by=2048+Math.floor(i/2)*512;
  ctx.drawImage(image,0,2048,2048,1024,bx,by,1024,512);
  // Remove the two baked registry/service rows using unlettered paint from the
  // same barrel. Circumferential welds remain aligned through the label zones.
  for(const row of [96,352])ctx.drawImage(image,0,2080,2048,100,bx,by+row,1024,84);
  replaceTankPaint(ctx,bx,by,1024,512,paint);
  ctx.fillStyle=stripe;tankerBands[i].barrel.forEach(([offset,width])=>ctx.fillRect(bx+offset,by,width,512));
  for(const row of [0,256]){
    ctx.font='bold 25px monospace';ctx.fillText('FLUID / 04',bx+275,by+133+row,138);
    ctx.font='14px monospace';ctx.fillText('DW TRANSPORT',bx+275,by+155+row,138);
    ctx.font='bold 30px sans-serif';ctx.fillText(name,bx+660,by+133+row,520);
    ctx.font='16px monospace';ctx.fillText('FLEET '+String(i+1).padStart(2,'0')+' / TRANSFER SERVICE',bx+660,by+157+row,510);
  }
  ctx.textAlign='start';
 });
}
const prepared=new WeakMap();
export function prepareCargoAtlas(image){
  if(prepared.has(image))return prepared.get(image);
  const started=performance.now();
  const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=3072;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const neutral=ctx.getImageData(2048,2048,512,512);
  // Replace baked branding with unlettered corrugation from the same source.
  const original=new Uint8ClampedArray(neutral.data);
  for(let y=38;y<102;y++)for(let x=24;x<505;x++)if(x<253||x>357){
    const from=( (140+(y-38)%48)*512+(x<253?x:125+(x%100)) )*4;
    const to=(y*512+x)*4;
    for(let c=0;c<4;c++)neutral.data[to+c]=original[from+c];
  }
  cargoPalette.forEach(([name,color],variant)=>{
    const tile=ctx.createImageData(512,512),src=neutral.data,dst=tile.data;
    for(let i=0;i<src.length;i+=4){
      const pixel=i/4,px=pixel%512,py=Math.floor(pixel/512);
      // Reuse an unlettered corrugation strip at several pitches.
      const pitch=[1,.75,1.35,.85,1.6,1.15,.65,1.45][variant];
      const sample=py>102&&py<232&&px>8&&px<350?(py*512+256+Math.floor((px*pitch)%80))*4:i;
      const l=(src[sample]+src[sample+1]+src[sample+2])/3;
      const ink=Math.max(0,Math.min(1,(l-190)/50));
      const metal=Math.max(0,Math.min(1,(55-l)/25));
      for(let c=0;c<3;c++){
        let paint=Math.min(255,color[c]*l/128);
        // A few older finishes are faded; newer leases retain richer paint.
        if(variant===0||variant===4)paint=paint*.91+18;
        if(py>210&&py<244&&variant===7)paint*=.86;
        dst[i+c]=Math.round((paint*(1-ink)+l*ink)*(1-metal)+l*metal);
      }
      dst[i+3]=255;
    }
    const x=2048+(variant%4)*512,y=2048+Math.floor(variant/4)*512;
    ctx.putImageData(tile,x,y);
    ctx.save();ctx.translate(x,y);
    // Broad company liveries remain visible when a box is only a few pixels tall.
    if(variant===1){
      ctx.fillStyle='rgba(30,34,32,.65)';ctx.fillRect(8,224,496,5);
    }else if(variant===2){
      ctx.fillStyle='rgba(238,237,219,.88)';ctx.fillRect(8,145,496,43);ctx.fillRect(260,350,248,54);ctx.fillRect(4,420,248,35);
    }else if(variant===3){
      ctx.fillStyle='rgba(230,235,220,.8)';
      ctx.beginPath();ctx.moveTo(245,8);ctx.lineTo(306,8);ctx.lineTo(202,248);ctx.lineTo(141,248);ctx.closePath();ctx.fill();
      ctx.fillRect(345,260,42,248);
    }else if(variant===7){
      ctx.fillStyle='#ccaa45';ctx.fillRect(8,230,496,5);ctx.fillRect(4,478,248,5);
    }
    if(variant===0||variant===4||variant===7){
      ctx.fillStyle=variant===0?'#764e43':variant===4?'#858779':'#8e9694';
      const patchX=variant===4?210:278;
      ctx.fillRect(patchX,158,47,35);ctx.strokeStyle='rgba(25,30,30,.45)';ctx.lineWidth=1;ctx.strokeRect(patchX,158,47,35);
      ctx.fillStyle='#d8d5c8';ctx.font='8px monospace';ctx.fillText('P-'+(17+variant),patchX+7,180);
    }
    ctx.restore();decals(ctx,x,y,variant);
  });
  tankerPaint(ctx,image);console.info('Fleet paint preparation: '+(performance.now()-started).toFixed(1)+' ms (cargo and tanker variants, once)');
  prepared.set(image,canvas);return canvas;
}
// Flight batches use the established HTMLImageElement texture contract.
export async function prepareCargoImage(image){
  const canvas=prepareCargoAtlas(image),painted=new Image();
  await new Promise((resolve,reject)=>{painted.onload=resolve;painted.onerror=reject;painted.src=canvas.toDataURL('image/png');});
  prepared.delete(image);return painted;
}

// Small integer arithmetic matches the vertex-stage atlas selection exactly.
export function cargoSeed(id){let seed=17;for(const c of String(id))seed=(seed*31+c.charCodeAt(0))%4093;return seed;}
export function cargoVariant(seed,slot){let h=((seed%4093+slot*127)*53+17)%4093;h=(h*109+89)%4093;h=(h*h+slot*17)%4093;return h%8;}
