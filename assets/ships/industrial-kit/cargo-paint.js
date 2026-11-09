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
  console.info('Cargo paint preparation: '+(performance.now()-started).toFixed(1)+' ms (eight variants, once)');
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
