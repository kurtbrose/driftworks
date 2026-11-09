'use strict';
const assert=require('node:assert/strict');
const {kit,THREE:T}=require('../tools/export-industrial-kit.cjs').loadKit();
for(const name of ['container','mixed','fluid']){
 const root=kit.buildFreighter(name),bounds=new T.Box3().setFromObject(root,true),batch=kit.batchStatic(root),after=new T.Box3().setFromObject(batch,true);
 assert(bounds.min.distanceTo(after.min)+bounds.max.distanceTo(after.max)<1e-5);
 assert(batch.children.length<=9,'shared static material batches');
 assert.equal(root.userData.layout,name==='mixed'?'single spine':'paired cargo lanes');
 assert(bounds.max.z-bounds.min.z>(name==='mixed'?12:26));
 const bays=root.children.filter(o=>o.userData.standardBay);
 assert.equal(bays.length,kit.routePresets[name].length*(name==='mixed'?1:2));
 assert.equal(root.children.filter(o=>o.name==='DW-14 rigid interface').length,2+(kit.routePresets[name].length-1)*(name==='mixed'?1:2),'interior locks follow their cargo lanes');
 for(const treatment of ['sill','rail','lattice'])assert(kit.buildFreighter(name,{treatment}).children.length>0);
}
console.log('Freighter finishes: metre bounds, paired payload lanes, shared terminals and batch reuse pass.');

