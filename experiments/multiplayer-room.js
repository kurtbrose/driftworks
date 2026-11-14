import {pilot} from './multiplayer-model.js';

export const roomProtocol='driftworks-room-v1';
export const capacity=2;
export const expiry=8000;
/** @typedef {import('./multiplayer-model').RemotePilot} Pilot */
/** @typedef {{kind:string, [key:string]:unknown}} Message */
/** @typedef {{id:string,name:string,slot:number,transport:string,lastSeen:number,poseTime:number,packets:number,rejected:number,sequence:number,pilot:Pilot|null}} Member */
/** @param {unknown} raw @returns {Message|null} */
export function message(raw){
  if(typeof raw!=='string'||raw.length>131072)return null;
  try{const v=/** @type {unknown} */(JSON.parse(raw));
    if(!v||typeof v!=='object'||Array.isArray(v))return null;
    const m=/** @type {Record<string,unknown>} */(v);
    return m.protocol===roomProtocol&&typeof m.kind==='string'?/** @type {Message} */(m):null;
  }catch{return null;}
}
/** @param {Message} m */
export const wire=m=>JSON.stringify({...m,protocol:roomProtocol});
/** Server owns membership and forwarding. Simulation remains client-owned co-flight.
 * @param {(id:string,m:Message)=>void} send @param {()=>number} now */
export function createRoom(send,now){
  /** @type {Map<string,Member>} */const members=new Map();
  /** @type {Set<string>} */const banned=new Set();let running=true,revision=0,frame=0;
  /** @param {string} id @param {string} reason */
  function remove(id,reason){
    if(!members.has(id))return;
    send(id,{kind:'removed',reason});members.delete(id);revision++;
    broadcast();
  }
  function broadcast(){
    const time=now();
    for(const member of members.values()){
      const other=[...members.values()].find(p=>p.id!==member.id);
      send(member.id,{kind:'world',revision,frame:frame++,slot:member.slot,
        count:members.size,peer:other?other.name:null,
        pilot:other?.pilot?{...other.pilot,fire:time-other.poseTime<300&&other.pilot.fire,boost:time-other.poseTime<300&&other.pilot.boost}:null});
    }
  }
  return {members,
    /** @param {string} id @param {unknown} raw @param {string} transport */
    receive(id,raw,transport){
      if(!running||!/^[a-zA-Z0-9-]{1,80}$/.test(id))return;
      const m=message(raw);if(!m)return;
      if(banned.has(id)){send(id,{kind:'removed',reason:'Kicked by the server. Open a new client to request another seat.'});return;}
      if(m.kind==='join'){
        if(!members.has(id)){
          if(members.size>=capacity){send(id,{kind:'removed',reason:'Server is full (two pilots). Ask the server operator to free a seat.'});return;}
          const name=typeof m.name==='string'?m.name.trim().slice(0,32):'';
          const slot=[...members.values()].some(p=>p.slot===0)?1:0;
          members.set(id,{id,name:name||'Pilot',slot,transport,lastSeen:now(),poseTime:now(),packets:0,rejected:0,sequence:-1,pilot:null});revision++;
        }
        const member=members.get(id);
        if(member&&typeof m.name==='string')member.name=m.name.trim().slice(0,32)||'Pilot';
        send(id,{kind:'welcome'});broadcast();return;
      }
      const member=members.get(id);if(!member)return;
      if(m.kind==='leave'){remove(id,'Left server.');return;}
      if(m.kind==='ping'){member.lastSeen=now();send(id,{kind:'pong'});return;}
      if(m.kind!=='state')return;
      const p=pilot(m.pilot);
      if(!p||typeof m.seq!=='number'||!Number.isSafeInteger(m.seq)||m.seq<=member.sequence){member.rejected++;return;}
      member.sequence=m.seq;member.pilot=p;member.lastSeen=member.poseTime=now();member.packets++;broadcast();
    },
    tick(){for(const p of members.values())if(now()-p.lastSeen>expiry)remove(p.id,'Client timed out. Rejoin when ready.');broadcast();},
    /** @param {string} id */
    kick(id){banned.add(id);remove(id,'Kicked by the server.');},
    stop(){for(const p of [...members.values()])remove(p.id,'Server stopped.');running=false;},
  };
}
