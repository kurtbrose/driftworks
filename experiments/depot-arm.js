// Two equal rigid links reach the wrist; a gimballed coupling supplies attitude.
// Dimensions are metres, angles radians, Z up. Limits keep the elbow off singularity.
/** @param {number} reach @param {number} height @param {number} yaw @param {number} tilt */
export function solveDepotArm(reach, height, yaw, tilt) {
    const distance = Math.hypot(reach, height);
    const bounded = Math.max(8, Math.min(62, distance));
    const r = reach * bounded / Math.max(.001, distance);
    const z = height * bounded / Math.max(.001, distance);
    const shoulder = Math.atan2(z, r) + Math.acos(bounded / 64);
    const direction = [Math.sin(yaw), Math.cos(yaw)];
    const elbow = [direction[0] * 32 * Math.cos(shoulder), direction[1] * 32 * Math.cos(shoulder), 32 * Math.sin(shoulder)];
    const wrist = [direction[0] * r, direction[1] * r, z];
    const aim = [direction[0] * Math.cos(tilt), direction[1] * Math.cos(tilt), Math.sin(tilt)];
    return {elbow, wrist, aim, clamped: Math.abs(distance - bounded) > .001};
}
