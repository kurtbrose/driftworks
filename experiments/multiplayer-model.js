/** Transport-independent model for the two-pilot connection experiment. */
/** @typedef {{turn:number,thrust:number}} PilotInput */
/** @typedef {{x:number,y:number,vx:number,vy:number,angle:number}} Pilot */
/** @typedef {{tick:number,pilots:Pilot[]}} Arena */
export const protocol = 'driftworks-arena-v1';
export const tickSeconds = 1 / 30;
export const neutral = () => ({turn: 0, thrust: 0});
export function createArena() {
  return {tick: 0, pilots: [300, 660].map(x => ({x, y: 300, vx: 0, vy: 0, angle: -Math.PI / 2}))};
}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
/** @param {unknown} value @returns {boolean} */
function array(value) { return Array.isArray(value); }
/** Reject malformed or oversized messages before they reach the model.
 * @param {unknown} raw @returns {Record<string,unknown>|null} */
export function decode(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const value = /** @type {unknown} */ (JSON.parse(raw));
    return record(value) && value.protocol === protocol ? value : null;
  } catch { return null; }
}
/** @param {unknown} value @returns {value is PilotInput} */
export function validInput(value) {
  return record(value) && typeof value.turn === 'number' && typeof value.thrust === 'number' &&
    Number.isFinite(value.turn) && Math.abs(value.turn) <= 1 && Number.isFinite(value.thrust) && Math.abs(value.thrust) <= 1;
}
/** @param {unknown} value @returns {value is Arena} */
export function validArena(value) {
  return record(value) && Number.isSafeInteger(value.tick) && Number(value.tick) >= 0 &&
    array(value.pilots) && (/** @type {unknown[]} */ (value.pilots)).length === 2 && (/** @type {unknown[]} */ (value.pilots)).every(p =>
      record(p) && ['x','y','vx','vy','angle'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])) &&
      Number(p.x) >= 0 && Number(p.x) < 960 && Number(p.y) >= 0 && Number(p.y) < 600 &&
      Math.hypot(Number(p.vx), Number(p.vy)) <= 241);
}
/** @param {Arena} arena @param {PilotInput[]} inputs */
export function step(arena, inputs) {
  arena.tick++;
  arena.pilots.forEach((p, i) => {
    const input = validInput(inputs[i]) ? inputs[i] : neutral();
    p.angle = (p.angle + input.turn * 3 * tickSeconds) % (Math.PI * 2);
    p.vx += Math.cos(p.angle) * input.thrust * 150 * tickSeconds;
    p.vy += Math.sin(p.angle) * input.thrust * 150 * tickSeconds;
    const speed = Math.hypot(p.vx, p.vy), scale = speed > 240 ? 240 / speed : 1;
    p.vx *= scale * 0.995; p.vy *= scale * 0.995;
    p.x = (p.x + p.vx * tickSeconds + 960) % 960;
    p.y = (p.y + p.vy * tickSeconds + 600) % 600;
  });
}
