// Deterministic presentation timeline. No renderer, timers or mission rules.
/** @typedef {'approach'|'settle'|'connect'|'fueling'|'disconnect'|'clearance'|'depart'|'complete'} RefuelingPhase */
/** @typedef {{phase:RefuelingPhase, elapsed:number, manualHold:boolean, release:boolean}} RefuelingCycle */
/** @type {RefuelingPhase[]} */
const phases=['approach','settle','connect','fueling','disconnect','clearance','depart','complete'];
const durations={approach:12,settle:4,connect:4,fueling:10,disconnect:4,clearance:4,depart:10,complete:Infinity};
/** @param {boolean} [manualHold] @returns {RefuelingCycle} */
export function createRefuelingCycle(manualHold=false){return {phase:'approach',elapsed:0,manualHold,release:false};}
/** Only a connected, fueling ship accepts a completion trigger.
 * @param {RefuelingCycle} state */
export function finishRefueling(state){if(state.phase!=='fueling')return false;state.release=true;return true;}
/** @param {RefuelingCycle} state @param {number} seconds */
export function stepRefuelingCycle(state,seconds){
 if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid refueling timestep');
 let remaining=seconds;
 while(state.phase!=='complete'){
  const held=state.phase==='fueling'&&state.manualHold&&!state.release;
  if(held){state.elapsed=Math.min(10,state.elapsed+remaining);break;}
  const duration=state.phase==='fueling'&&state.release?state.elapsed:durations[state.phase];
  const consume=Math.min(remaining,Math.max(0,duration-state.elapsed));
  state.elapsed+=consume;remaining-=consume;
  if(state.elapsed+1e-9<duration)break;
  state.phase=phases[phases.indexOf(state.phase)+1];state.elapsed=0;
  if(remaining<=0)break;
 }
 return sampleRefuelingCycle(state);
}
/** @param {number} t */
function ease(t){t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);}
/** @param {RefuelingCycle} state */
export function sampleRefuelingCycle(state){
 const phase=state.phase,t=ease(state.elapsed/durations[phase]);
 const index=phases.indexOf(phase);
 return {phase,progress:t,
  approach:phase==='approach'?t:1,
  settle:index<1?0:phase==='settle'?t:1,
  arm:phase==='connect'?t:phase==='fueling'?1:phase==='disconnect'?1-t:0,
  clearance:phase==='clearance'?t:index>5?1:0,
  departure:phase==='depart'?t:phase==='complete'?1:0,
  connected:phase==='fueling',fuel:phase==='fueling'?Math.min(1,state.elapsed/10):index>3?1:0};
}
