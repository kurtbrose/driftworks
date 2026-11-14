import type {ConvoyAsset,ConvoyState,Craft,Combat,Model,HullHit,Pose,Batch,Weapon,RenderPlacement} from '../experiments/types';
export type Box={center:number[];half:number[];axes:number[][]};
export type Spring={attachment:number[];strength:number;velocity:number[];spin:number[];duration:number};
export type Range={batch:number;first:number;count:number};
export type ComponentDef={id:string;type:'container'|'tank'|'engine'|'rcs'|'command';label:string;center:number[];half:number[];maxHealth:number;engineIndex?:number;ranges:Range[]};
export type Obstacle={center:number[];half:number[];range:Range};
export type ModuleAsset=ConvoyAsset & {variants:Record<string,ConvoyAsset['variants'][string]&{components?:ComponentDef[];moduleMap?:{offset:number;count:number};obstacles?:Obstacle[]}>};
export type PartBatch={vertices:Float32Array;color:[number,number,number];textured:boolean;finish:number;wear?:boolean};
export type Part={batches:PartBatch[];model:Model;added:number};
export type ModuleHit=HullHit & {triangleOffset?:number;rootLocal?:number[]};
export type Mark={local:number[];normal:number[];serial:number};
export type Debris={pose:Pose&{velocity:number[]};spin:number[];spring:Spring;age:number;mounts:number[];serial:number};
export type ComponentState={id:string;health:number;maxHealth:number;damage:number|null;damagePoint?:number[];damageNormal?:number[];marks:Mark[];leaks:{local:number[];normal:number[];age:number}[];debris:Debris|null};
export type Systems={version:1;revision:number;serial:number;modules:ComponentState[]};
export type Entity=ConvoyState['ships'][number]&{modules?:Systems};
export type Catalog={defs:ComponentDef[];owners:Int16Array;obstacles:Obstacle[];batches:PartBatch[];base:Model;mouths:number[][]};
export type FilteredHullHit=(model:Model,pose:Pose,start:number[],end:number[],units:number,radius?:number,accept?:(offset:number)=>boolean)=>ModuleHit|null;
export interface Physics {
 releaseKick:(id:string,center:number[],half:number[],moving?:boolean)=>Spring;
 springFraction:(age:number,dt:number,duration:number)=>number;
 respondContact:(velocity:number[],spin:number[],normal:number[],lever:number[],half:number[])=>{velocity:number[];spin:number[]};
 contact:(a:Box,b:Box)=>{normal:number[];depth:number}|null;
}
export interface Geometry {
 deform:(batches:PartBatch[],point:number[],normal:number[],variant:number)=>Part;
 model:(batches:PartBatch[],id:string)=>Model;
}
export interface Simulation {
 install:(meta:ModuleAsset,bytes:ArrayBuffer,bases:Record<string,{model:Model}>)=>void;
 catalog:(model:string)=>Catalog|undefined;
 ensure:(ship:Entity)=>Systems;
 bind:(craft:Craft,ship:Entity)=>void;
 trace:(ship:Entity,pose:Pose,start:number[],end:number[],units:number,radius?:number)=>ModuleHit|null;
 hitCraft:(craft:Craft,start:number[],end:number[],units:number,radius?:number)=>ModuleHit|null;
 damage:(ship:Entity,weapon:Weapon,point:number[],time:number)=>void;
 step:(combat:Combat,dt:number)=>void;
 dirty:(ship:Entity)=>boolean;
 part:(ship:Entity,index:number)=>Part;
 engines:(ship:Entity)=>number[];
}
export interface Visual {
 geometry:(combat:Combat)=>Batch[];
 effects:(combat:Combat,view:Pose)=>Batch[];
 stats:()=>{changedShips:number;debris:number;ventParticles:number;preparedMs:number};
}
declare module './types' {
 interface DriftworksNamespace {
  freighterPhysics?:Physics;
  freighterGeometry?:Geometry;
  freighterSim?:Simulation;
  freighterVisual?:Visual;
 }
}
