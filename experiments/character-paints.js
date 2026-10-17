/** Reversible suit palettes; source materials and animation data stay untouched. */
/** @typedef {{ clone(): PaintColor, copy(color: PaintColor): unknown, set(hex: string): PaintColor, multiplyScalar(scale: number): unknown }} PaintColor */
/** @typedef {{ name: string, color: PaintColor }} PaintMaterial */
export const presets = [
  {id:'original',name:'Original',primary:'#a19793',accent:'#93542b'},
  {id:'navy',name:'Flight crew · navy / ivory',primary:'#415d7d',accent:'#e0d5b4'},
  {id:'rescue',name:'Rescue · orange / ivory',primary:'#bd713f',accent:'#e5e0cd'},
  {id:'security',name:'Security · green / gold',primary:'#607451',accent:'#d8b85d'},
  {id:'engineering',name:'Engineering · ivory / yellow',primary:'#c9cec6',accent:'#d5a632'}
];
/** @param {PaintMaterial[]} materials */
export function createPalette(materials) {
  const unique = [...new Set(materials)];
  const originals = new Map(unique.map(material => [material, material.color.clone()]));
  const supported = unique.some(material => material.name === 'SciFi_Light') && unique.some(material => material.name === 'SciFi_Light_Accent');
  return {
    supported,
    /** @param {string} primary @param {string} accent @param {boolean} enabled */
    apply(primary, accent, enabled) {
      for (const material of unique) {
        const original = originals.get(material);
        if (original) material.color.copy(original);
        if (!enabled || !supported) continue;
        if (material.name === 'SciFi_Light') material.color.set(primary);
        // Preserve the darker suit panel contrast beneath the armor plates.
        if (material.name === 'SciFi_Main') material.color.set(primary).multiplyScalar(.2);
        if (material.name === 'SciFi_Light_Accent') material.color.set(accent);
      }
    }
  };
}
