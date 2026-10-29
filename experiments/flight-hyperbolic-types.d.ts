import type {Pose,FlightState,FlightView,Craft,Combat,Hit,Weapon,FiringSolution} from './types';
type V=number[];
export interface HyperbolicGeometry {
    hullShader:string;
    prepareHull:(batch:import('./types').Batch)=>import('./types').Batch;
    createCapitals:(options?:{single?:boolean})=>import('./types').AegisFlightRig;
    point:(eye:V,radius:number)=>V;
    chart:(point:V,radius:number)=>V;
    lift:(point:V,vector:V)=>V;
    lower:(point:V,vector:V)=>V;
    path:(from:V,to:V,radius:number)=>{direction:V;distance:number};
    offset:(from:V,displacement:V,radius:number)=>V;
    transport:(from:V,to:V,vector:V,radius:number)=>V;
    travel:(from:V,direction:V,length:number,radius:number)=>{point:V;direction:V};
    move:(pose:FlightState,before:V)=>void;
    lead:(shooter:Pose,target:Pose & {velocity:V},weapon:Weapon,radius:number,launch:number)=>FiringSolution|null;
    hullHit:(craft:Craft,start:V,end:V,radius:number|undefined,flat:(craft:Craft,start:V,end:V,radius?:number)=>Hit|null)=>Hit|null;
    presentation:(view:FlightView)=>FlightView;
    chartPose:(pose:Pose,camera:Pose)=>Pose;
    grid:(camera:Pose,width:number,height:number)=>V[];
    rebase:(combat:Combat,track:(craft:Craft)=>{position:V;velocity:V}|undefined)=>void;
}
