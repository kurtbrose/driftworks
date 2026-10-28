// Review-page-only adapter. Production scene3d and its shader variants stay intact.
(function(){
 const T=window.THREE,BaseMaterial=T.RawShaderMaterial,BaseRenderer=T.WebGLRenderer;
 const api=window.AegisNormalRenderer={renderers:[]};
 T.RawShaderMaterial=class extends BaseMaterial{
  constructor(options){
   if(options?.fragmentShader?.includes('vec3 n=normalize(vNormal);')){
    const fragmentShader=options.fragmentShader.replace('vec3 n=normalize(vNormal);','vec3 n=normalize(vNormal);\n#ifdef AEGIS_BAKED_NORMAL\nn=normalize(texture2D(uShipTexture,vUV).xyz*2.-1.);\n#endif\n').replace('if(uTextured>.5){vec4 tex=', 'if(uTextured>.5&&uFinish>-2.5){vec4 tex=');
    super({...options,fragmentShader});this.userData.aegisNormalStudy=true;
   }else super(options);
  }
 };
 T.WebGLRenderer=class extends BaseRenderer{
  constructor(options){super(options);api.renderers.push(this);const render=this.render.bind(this);this.render=(scene,camera)=>{
   scene.traverse(o=>{const m=o.material;if(!m?.userData?.aegisNormalStudy)return;this.studyMaterial=m;const enabled=m.uniforms.uFinish?.value===-3;if(!!m.defines.AEGIS_BAKED_NORMAL!==enabled){m.defines={...m.defines};if(enabled)m.defines.AEGIS_BAKED_NORMAL=1;else delete m.defines.AEGIS_BAKED_NORMAL;m.needsUpdate=true;}});
   render(scene,camera);
  };}
 };
 api.timer=function(renderer){
  const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {available:!!ext,device:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
   begin(){if(!ext)return null;const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);return q;},
   end(){if(ext)gl.endQuery(ext.TIME_ELAPSED_EXT);},
   disjoint(){return ext?gl.getParameter(ext.GPU_DISJOINT_EXT):false;},
   poll(q){if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))return null;const n=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);return n;},
   discard(q){gl.deleteQuery(q);}
  };
 };
})();
