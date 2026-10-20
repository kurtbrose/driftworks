(function(){
  'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
  /** @param {string} id */
  function input(id){return /** @type {HTMLInputElement} */ (document.getElementById(id));}
  /** @param {string} id */
  function select(id){return /** @type {HTMLSelectElement} */ (document.getElementById(id));}
  /** @param {string} id */
  function canvas(id){return /** @type {HTMLCanvasElement} */ (document.getElementById(id));}
  /** @param {HTMLCanvasElement} c */
  function context(c){return /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));}
  var api=/** @type {Required<import('../../../src/types').DriftworksNamespace>} */ (window.Driftworks).faceBlend;
  /** @type {Record<string, HTMLImageElement>} */ var images={};
  /** @type {import('./types').FaceRenderer | null} */ var renderer=null;
  var target=canvas('blend'),expression=select('expression'),region=select('region'),eyes=select('eyes');
  var animate=input('animate'),amount=input('amount');
  animate.checked=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var presets=api.presets,keys=['cx','cy','rx','ry','feather'];
  function controls(){keys.concat(['amount']).forEach(function(key){var output=document.getElementById(key+'-value');if(output)output.textContent=input(key).value+'%';});}
  function preset(){var values=presets[region.value];keys.forEach(function(key,i){input(key).value=String(values[i]);});controls();}
  region.onchange=preset;
  expression.onchange=function(){
    region.value=expression.value==='blink'||expression.value==='wide'?'eyes':expression.value==='angry'||expression.value==='smile'?'face':expression.value==='eh'?'mouth':'lower';
    /** @type {HTMLImageElement} */ (document.getElementById('raw')).src=assetUrl(expression.value+'.png');preset();
  };
  keys.concat(['amount']).forEach(function(key){input(key).oninput=controls;});
  var frameCount=0;
  /** @param {number} now */
  function draw(now){
    var phase=(now%2400)/2400, weight=1;
    if(animate.checked)weight=select('transition').value==='step'?(phase>.35?1:0):Math.max(0,Math.min(1,(phase-.15)/.2,(.95-phase)/.2));
    weight*=Number(amount.value)/100;
    if(renderer){
      var shape=keys.map(function(key){return Number(input(key).value);});
      var layers=[{image:expression.value,shape:shape,alpha:weight}];
      if(eyes.value!=='none')layers.push({image:eyes.value,shape:presets.eyes,alpha:weight});
      renderer.draw(layers);renderer.drawMask(canvas('mask'),shape);
      if(frameCount++%40===0)/** @type {HTMLElement} */ (document.getElementById('proof')).textContent='Protected area check: '+renderer.protectedChanges()+' changed pixels outside the face permission mask · blend '+Math.round(weight*100)+'%';
    }
    requestAnimationFrame(draw);
  }
  Promise.all(['master','eh','blink','wide','shout','smile','angry'].map(function(name){return new Promise(function(resolve,reject){var image=new Image();image.onload=function(){images[name]=image;resolve(image);};image.onerror=reject;image.src=assetUrl(name+'.png');});})).then(function(){renderer=api.create(target,images);preset();requestAnimationFrame(draw);}).catch(function(){/** @type {HTMLElement} */ (document.getElementById('proof')).textContent='An expression image failed to load.';});
}());
