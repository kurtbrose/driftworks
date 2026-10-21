(function(){
  'use strict';
  /** @typedef {import('./face-blend-types').FaceLayer} FaceLayer */
  /** @type {{canvas: HTMLCanvasElement; pixels: ImageData} | null} */ var cachedGuard=null;
  /** @param {HTMLCanvasElement} c */
  function context(c){return /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));}
  /** @param {CanvasRenderingContext2D} ctx @param {import('./face-blend-types').FaceSource} source */
  function drawSource(ctx,source){
    if('image' in source){var r=source.rect;ctx.drawImage(source.image,r[0],r[1],r[2],r[3],0,0,512,512);}
    else ctx.drawImage(source,0,0,512,512);
  }
  /** @param {HTMLCanvasElement} target @param {Record<string, import('./face-blend-types').FaceSource>} images */
  function create(target,images){
  target.width=target.height=512;
  var out=context(target), layer=document.createElement('canvas'), mask=document.createElement('canvas'), guard=document.createElement('canvas');
  [layer,mask,guard].forEach(function(c){c.width=c.height=512;});
  var paint=context(layer),m=context(mask),g=context(guard);
  /** @type {ImageData} */ var guardPixels;
  if(cachedGuard){g.drawImage(cachedGuard.canvas,0,0);guardPixels=cachedGuard.pixels;}
  else {
  // Conservative inner-face polygon: source edits never own hair, ears or collar.
  var boundary=[[49,29],[57,29],[62,33],[66,38],[66,47],[64,54],[60,62],[56,69],[49,73],[43,70],[37,63],[34,54],[30.5,48],[30.5,40],[33,37],[44,36]];
  g.beginPath();boundary.forEach(function(p,i){if(i)g.lineTo(p[0]*5.12,p[1]*5.12);else g.moveTo(p[0]*5.12,p[1]*5.12);});g.closePath();g.fill();
  // Feather inward so the fixed permission boundary cannot form a hard seam.
  guardPixels=g.getImageData(0,0,512,512);
  var original=new Uint8ClampedArray(guardPixels.data);
  for(var y=0;y<512;y++)for(var x=0;x<512;x++){
    var k=(y*512+x)*4;if(!original[k+3])continue;
    var nearest=12;
    for(var dy=-12;dy<=12;dy+=2)for(var dx=-12;dx<=12;dx+=2){
      var px=x+dx,py=y+dy;
      if(px<0||py<0||px>=512||py>=512||!original[(py*512+px)*4+3])nearest=Math.min(nearest,Math.hypot(dx,dy));
    }
    guardPixels.data[k+3]=Math.round(255*Math.min(1,nearest/12));
  }
  g.putImageData(guardPixels,0,0);
  cachedGuard={canvas:guard,pixels:guardPixels};
  }
  /** @param {number[]} shape */
  function makeMask(shape){
    m.clearRect(0,0,512,512);m.save();m.translate(shape[0]*5.12,shape[1]*5.12);m.scale(shape[2]*5.12,shape[3]*5.12);
    var gradient=m.createRadialGradient(0,0,0,0,0,1), core=1-shape[4]/100;
    gradient.addColorStop(0,'#fff');gradient.addColorStop(core,'#fff');gradient.addColorStop(1,'transparent');m.fillStyle=gradient;m.fillRect(-1,-1,2,2);m.restore();
    m.globalCompositeOperation='destination-in';m.drawImage(guard,0,0);m.globalCompositeOperation='source-over';
  }
  /** @param {string} name @param {number[]} shape @param {number} alpha */
  function composite(name,shape,alpha){
    makeMask(shape);paint.clearRect(0,0,512,512);drawSource(paint,images[name]);
    paint.globalCompositeOperation='destination-in';paint.drawImage(mask,0,0);paint.globalCompositeOperation='source-over';
    out.globalAlpha=alpha;out.drawImage(layer,0,0);out.globalAlpha=1;
  }

  // Resample the master once. Both the reference and every displayed frame
  // must use these exact pixels, rather than separate GPU/CPU image resampling.
  var frozen=document.createElement('canvas');frozen.width=frozen.height=512;
  var frozenContext=context(frozen);drawSource(frozenContext,images.master);
  var frozenPixels=frozenContext.getImageData(0,0,512,512);frozenContext.putImageData(frozenPixels,0,0);
  var base=frozenPixels.data;
  return {
    /** @param {FaceLayer[]} layers */
    draw:function(layers){out.clearRect(0,0,512,512);out.drawImage(frozen,0,0);layers.forEach(function(item){if(item.alpha>0)composite(item.image,item.shape,item.alpha);});},
    /** @param {HTMLCanvasElement} target @param {number[]} shape */
    drawMask:function(target,shape){var view=context(target);makeMask(shape);view.clearRect(0,0,512,512);drawSource(view,images.master);view.globalAlpha=.55;view.drawImage(mask,0,0);view.globalAlpha=1;},
    protectedChanges:function(){var pixels=out.getImageData(0,0,512,512).data,changed=0;for(var i=0;i<pixels.length;i+=4)if(!guardPixels.data[i+3]&&(pixels[i]!==base[i]||pixels[i+1]!==base[i+1]||pixels[i+2]!==base[i+2]))changed++;return changed;},
    dispose:function(){[layer,mask,frozen].forEach(function(c){c.width=c.height=0;});if(!cachedGuard||guard!==cachedGuard.canvas)guard.width=guard.height=0;}
  };
  }
  /** @param {import('./types').SpeechPlan} plan @param {number} elapsed */
  function speechCue(plan,elapsed){
    var revealed=0, image='eh',alpha=0;
    plan.events.forEach(function(event){
      if(event.start>elapsed)return;
      revealed=event.to;
      if(event.kind!=='syllable')return;
      var duration=Math.min(event.duration*.72,.075)*(1-plan.voice.clipping*.55),t=elapsed-event.start;
      if(t<duration+.035){
        image=/[ou]/.test(event.vowel)?'oo':event.vowel==='a'?'ah':'eh';
        alpha=Math.max(0,Math.min(1,t/.008,(duration+.035-t)/.035));
      }
    });
    return {revealed:revealed,image:image,alpha:alpha};
  }
  window.Driftworks=window.Driftworks||{};
  window.Driftworks.faceBlend={create:create,speechCue:speechCue,presets:{mouth:[48,61,10,6,35],lower:[48,63,18,15,35],eyes:[48,41,22,14,15],face:[48,50,24,28,15]}};
}());
