/** Validated wire format for production flight co-op. */
/** @typedef {import('./types').FlightState} FlightState */
/** @typedef {{pose:FlightState,profile:number,weapon:number,model:string,fire:boolean,boost:boolean,rotation:number}} RemotePilot */
export const protocol = 'driftworks-flight-v2';
export const connectionTimeout = 20000;
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
/** @param {unknown} v @returns {boolean} */
function array(v) { return Array.isArray(v); }
/** @param {unknown} v @param {number} limit @returns {v is number[]} */
function vector(v,limit) {
  return array(v) && (/** @type {unknown[]} */(v)).length===3 &&
    (/** @type {unknown[]} */(v)).every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit);
}
/** @param {unknown} raw @param {number} [limit] @returns {Record<string,unknown>|null} */
export function decode(raw,limit=8192) {
  if(typeof raw!=='string'||raw.length>limit)return null;
  try {const v=/** @type {unknown} */(JSON.parse(raw));return record(v)&&v.protocol===protocol?v:null;}catch{return null;}
}
/** Rebuild only known fields; never import arbitrary remote world/combat data.
 * @param {unknown} value @returns {RemotePilot|null} */
export function pilot(value) {
  if(!record(value)||!record(value.pose))return null;
  const p=value.pose;
  if(!vector(p.eye,1e7)||!vector(p.velocity,1e5)||!vector(p.rates,100)||!vector(p.ramp,1e5)||
     !vector(p.right,1.001)||!vector(p.up,1.001)||!vector(p.back,1.001)||
     typeof p.throttle!=='number'||!Number.isFinite(p.throttle)||Math.abs(p.throttle)>1)return null;
  const dot=(/** @type {number[]} */a,/** @type {number[]} */b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  if([p.right,p.up,p.back].some(v=>Math.abs(Math.hypot(...v)-1)>.01)||
     Math.abs(dot(p.right,p.up))>.01||Math.abs(dot(p.right,p.back))>.01||Math.abs(dot(p.up,p.back))>.01)return null;
  if(typeof value.profile!=='number'||!Number.isInteger(value.profile)||value.profile<0||value.profile>255||
     typeof value.weapon!=='number'||!Number.isInteger(value.weapon)||value.weapon<0||value.weapon>255||
     typeof value.model!=='string'||value.model.length>100||typeof value.fire!=='boolean'||typeof value.boost!=='boolean'||
     typeof value.rotation!=='number'||!Number.isFinite(value.rotation)||Math.abs(value.rotation)>Math.PI*2)return null;
  return {pose:{eye:p.eye.slice(),right:p.right.slice(),up:p.up.slice(),back:p.back.slice(),velocity:p.velocity.slice(),rates:p.rates.slice(),ramp:p.ramp.slice(),throttle:p.throttle},
    profile:value.profile,weapon:value.weapon,model:value.model,fire:value.fire,boost:value.boost,rotation:value.rotation};
}
/** Monotonic sequence filter; each connection owns a fresh instance. */
export function receiver() {
  let sequence=-1;
  return {read(/** @type {unknown} */raw) {
    const m=decode(raw);if(!m||typeof m.seq!=='number'||!Number.isSafeInteger(m.seq)||m.seq<=sequence)return null;
    const p=pilot(m.pilot);if(!p)return null;sequence=m.seq;return p;
  }};
}
