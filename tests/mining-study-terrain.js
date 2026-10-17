// Compatibility adapter: the study and gameplay use the production terrain solver.
(function(root){
  if(typeof module!=='undefined')module.exports=root.Driftworks.miningTerrain;
  else root.Driftworks.miningStudyTerrain=root.Driftworks.miningTerrain;
})(typeof window==='undefined'?globalThis:window);
