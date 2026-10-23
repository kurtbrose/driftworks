'use strict';

// Flat, JSON-safe dense network. No TensorFlow dependency at deployment time.
const INPUTS = 12, HIDDEN = 12, OUTPUTS = 5;
const COUNT = INPUTS * HIDDEN + HIDDEN + HIDDEN * OUTPUTS + OUTPUTS;
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
function validate(weights) {
  if (!Array.isArray(weights) || weights.length !== COUNT || weights.some(x => !Number.isFinite(x))) {
    throw new Error('Invalid pilot weights');
  }
}
function predict(weights, observation) {
  let k = 0;
  const hidden = new Array(HIDDEN).fill(0);
  for (let i = 0; i < INPUTS; i++) for (let j = 0; j < HIDDEN; j++) hidden[j] += observation[i] * weights[k++];
  for (let j = 0; j < HIDDEN; j++) hidden[j] = Math.tanh(hidden[j] + weights[k++]);
  const output = new Array(OUTPUTS).fill(0);
  for (let i = 0; i < HIDDEN; i++) for (let j = 0; j < OUTPUTS; j++) output[j] += hidden[i] * weights[k++];
  for (let j = 0; j < OUTPUTS; j++) output[j] = Math.tanh(output[j] + weights[k++]);
  return output;
}
function observe(DW, own, target, weapon) {
  const shot = DW.flightAI.solution(own, target.eye, target.velocity, weapon);
  const delta = shot.point.map((x, i) => x - own.eye[i]);
  const length = Math.hypot(...delta) || 1;
  const dot = axis => delta.reduce((sum, x, i) => sum + x * axis[i], 0) / length;
  const relative = target.velocity.map((x, i) => (x - own.velocity[i]) / 500);
  const speed = axis => clamp(relative.reduce((sum, x, i) => sum + x * axis[i], 0));
  return {shot, input: [dot(own.right), dot(own.up), -dot(own.back),
    clamp(shot.range / 1000, 0, 2) - 1, speed(own.right), speed(own.up), speed(own.back),
    ...own.rates.map(x => clamp(x / 3)), own.throttle, shot.valid ? 1 : -1]};
}
function controls(DW, weights, own, target, weapon) {
  const {shot, input} = observe(DW, own, target, weapon), output = predict(weights, input);
  // The net learns residual steering, throttle, fire tolerance and boost intent.
  // It gets pose/velocity only: no enemy intent, health or future simulation.
  return {pitch: clamp(Math.atan2(input[1], input[2]) * 1.8 - own.rates[0] * .23 + output[0]),
    yaw: clamp(-Math.atan2(input[0], input[2]) * 1.8 - own.rates[1] * .23 + output[1]),
    roll: 0, side: 0, vertical: 0,
    throttle: clamp((shot.range < 250 ? .65 : 1) + output[2] * .5, 0, 1),
    fire: shot.valid && shot.dot > .997 + output[3] * .002,
    boost: shot.range > 600 && shot.dot > .97 && output[4] > .25};
}
module.exports = {INPUTS, HIDDEN, OUTPUTS, COUNT, validate, predict, observe, controls};
