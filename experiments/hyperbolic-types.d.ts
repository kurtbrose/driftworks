import type {} from '../src/types';
declare module '../src/types' {
  interface DriftworksNamespace {
    hyperbolic?: {
      dot(a:number[],b:number[]):number;
      mix(a:number[],b:number[],x:number,y:number):number[];
      distance(a:number[],b:number[]):number;
      exp(p:number[],v:number[],s:number):number[];
      bearing(a:HyperFrame,q:number[]):number;
      turn(a:HyperFrame,angle:number):void;
      move(a:HyperFrame,s:number):void;
      segmentDistance(a:HyperFrame,q:number[],length:number):number;
      create(radius?:number):HyperWorld;
      step(w:HyperWorld,dt:number,input:{auto:boolean;turn:number;throttle:number;fire:boolean}):void;
    };
  }
}
export type HyperFrame={p:number[];f:number[];r:number[]};
export type HyperFighter=HyperFrame & {id:number;team:number;hp:number;cool:number;dead:number;speed:number;trail:number[][]};
export type HyperWorld={radius:number;fighters:HyperFighter[];shots:(HyperFrame & {team:number;life:number})[];bursts:{p:number[];life:number}[];score:number[];time:number};
