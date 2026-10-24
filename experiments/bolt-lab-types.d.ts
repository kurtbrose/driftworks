export type V3 = [number, number, number];
export type Basis = {right:V3;up:V3;back:V3};
export type BallisticShot = {position:V3;velocity:V3;age:number;style:number};
export type BoltRangeModel = {
 basis(yaw:number,pitch:number,roll:number):Basis;
 local(basis:Basis,point:V3):V3;
 advance(shot:BallisticShot,dt:number):void;
 bodyLength(speed:number,interval:number,diameter:number,frames:number):number;
 crossing(distance:number,phase:number):{position:V3;direction:V3};
};
declare module '../src/types' {interface DriftworksNamespace {boltRangeModel?:BoltRangeModel}}
