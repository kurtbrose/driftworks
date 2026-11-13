import type {Craft, Combat, Vector, Weapon, TerrainHit, ShotSpace, Demand} from './types';
export type MissileWeapon = Weapon & {
    flags:string[]; homing: string; turnTime: number; viewCone: number; minLockTime: number;
    lockPixelsPerSec:number; catchupPixelsPerSec:number; catchupPenalty:number;
    cargoSize:number; innerRadius:number; outerRadius:number; blastForce:number; shockwaveSpeed:number; swarm:number;
};
export type MissileBank = {name:string;ammo:number;capacity:number};
export type MissileRack = {
    fired:number; profile:string; banks:MissileBank[]; bank:number; countermeasures:number; cooldown:number; cmCooldown:number;
    targetId:string|null; lock:number; locked:boolean; indicator:Vector|null; catching:boolean; penalty:number;
    secondary:boolean; decoy:boolean; cycle:boolean; cycleHeld:boolean; salvo:number; salvoWait:number; salvoTarget:string|null;
};
export type Missile = {
    trailClock?:number;
    trail?:{position:Vector;region:number;age:number}[];
    curvature?:number;id:string;owner:string;team:string;targetId:string|null;originalTarget:string|null;weapon:MissileWeapon;
    position:Vector;direction:Vector;region:number;age:number;life:number;speed:number;locked:boolean;seen:string[];zigAt:number;zig:Vector;
};
export type Decoy = {curvature?:number;id:string;owner:string;team:string;position:Vector;velocity:Vector;region:number;age:number;life:number;pulses:number};
export type MissileState = {serial:number;rng:number;missiles:Missile[];decoys:Decoy[];shockwaves:{missile:Missile;radius:number;hitIds:string[]}[]};
export type MissileProfile = {name:string;defaultBanks:string[];allowed:string[];capacities:number[];countermeasures:number};
export type RetailMissiles = {missiles:MissileWeapon[];profiles:MissileProfile[];countermeasure:{name:string;lifetimeMin:number;lifetimeMax:number}};
export type MissileApi = {
    rack(craft:Craft):MissileRack;
    equipBank(craft:Craft,index:number,name:string):boolean;
    weapon(craft:Craft):MissileWeapon|null;
    reset(craft:Craft):void;
    input(craft:Craft,controls:Demand):void;
    step(combat:Combat,dt:number,terrain?:TerrainHit,space?:ShotSpace):void;
    state(combat:Combat):MissileState;
    incoming(combat:Combat,craft:Craft):Missile[];
};
