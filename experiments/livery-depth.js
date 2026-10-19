/** Perspective clip-depth coefficients for a forward-positive camera distance.
 * Keep the near plane meaningful at hangar scale; a tiny near plane loses most
 * depth-buffer precision before the models are reached.
 * @param {number} near @param {number} far @returns {[number,number]} */
export function perspectiveDepth(near,far){
 if(!Number.isFinite(near)||!Number.isFinite(far)||near<=0||far<=near)throw new Error('Invalid camera depth range');
 return [(far+near)/(far-near),2*far*near/(far-near)];
}
