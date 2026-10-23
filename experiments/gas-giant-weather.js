// Deterministic, independent lightning cells in source-card UV coordinates.
export const gasGiantCells = [
    [.63,.164,.074,.041], [.80,.25,.048,.040],
    [.63,.36,.071,.047], [.85,.45,.047,.043],
    [.775,.555,.048,.040], [.80,.68,.050,.047],
    [.51,.70,.061,.039], [.64,.80,.051,.039]
];
/** @param {number} cell @param {number} cycle */
function noise(cell,cycle){const n=Math.sin((cell+1)*127.1+(cycle+1)*311.7)*43758.5453;return n-Math.floor(n);}
/** Keep each burst still while it lights, then relocate the next burst within
 * the same neighborhood. Only illumination moves; the underlying planet does not.
 * @param {number} time @param {number} cell */
export function gasGiantDrift(time,cell){
    const period=4.3+cell*.619,cycle=Math.floor((Math.max(0,time)+cell*1.713)/period);
    return [(noise(cell+31,cycle)*2-1)*.036,(noise(cell+71,cycle)*2-1)*.021];
}
/** Absolute time sampling makes pauses, seeking and frame rates reproducible.
 * @param {number} time @param {number} cell */
export function gasGiantFlash(time,cell){
    const period=4.3+cell*.619, shifted=Math.max(0,time)+cell*1.713;
    const cycle=Math.floor(shifted/period), phase=shifted-cycle*period;
    const start=.4+noise(cell,cycle)*(period-1.8),age=phase-start;
    const pulse=(/** @type {number} */ t,/** @type {number} */ duration)=>t<0?0:(1-Math.exp(-t/.022))*Math.exp(-t/duration);
    return Math.min(1,(pulse(age,.21)+.7*pulse(age-.19,.12)+.42*pulse(age-.43,.20))*(.6+.4*noise(cell+17,cycle)));
}
