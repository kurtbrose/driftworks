import type {FlightState,FlightInput} from './types';
export type Frame={p:number[];axes:number[][]};
export type Actor=Frame & {id:number;team:number;flight:FlightState;hp:number;dead:number;cool:number;trail:number[][]};
export type HyperWorld={radius:number;actors:Actor[];bolts:{p:number[];v:number[];team:number;owner:number;life:number}[];bursts:{p:number[];age:number;large:boolean}[];time:number;score:number[];shots:number;hits:number;landmarks:number[][];stars:number[][]};
export type Input=FlightInput & {auto:boolean;fire?:boolean;throttleRate?:number;stop?:boolean};
export type Lead={direction:number[];point:number[];time:number;range:number};
declare module '../src/types' {interface DriftworksNamespace {hyperbolicFlight?:{
  dot(a:number[],b:number[]):number;
  mix(a:number[],b:number[],x:number,y:number):number[];
  distance(a:number[],b:number[]):number;
  exp(p:number[],v:number[],s:number):number[];
  transport(p:number[],v:number[],w:number[],s:number):number[];
  tangent(a:Frame,xyz:number[]):number[];
  relative(a:Frame,q:number[]):number[];
  move(a:Frame,offset:number[],radius:number):void;
  normalize(a:Frame):void;
  create(radius?:number):HyperWorld;
  step(w:HyperWorld,dt:number,input:Input):void;
  segmentDistance(p:number[],v:number[],q:number[],length:number):number;
  aim(w:HyperWorld,a:Actor,target:Actor):FlightInput & {fire:boolean};
  lead(w:HyperWorld,a:Actor,target:Actor):Lead|null;
};}}
