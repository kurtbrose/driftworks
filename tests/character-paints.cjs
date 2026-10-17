// Verify scoped, reversible recoloring without a browser or renderer dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../experiments/character-paints.js'), 'utf8');
  const {createPalette, presets} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  class Color {
    constructor(value, scale=1) { this.value=value; this.scale=scale; }
    clone() { return new Color(this.value,this.scale); }
    copy(other) { this.value=other.value;this.scale=other.scale;return this; }
    set(value) { this.value=value;this.scale=1;return this; }
    multiplyScalar(scale) { this.scale*=scale;return this; }
  }
  const materials = ['SciFi_Light','SciFi_Light_Accent','SciFi_Main','SciFi_MainDark','Grey'].map(name=>({name,color:new Color(name),roughness:.415}));
  const palette=createPalette([...materials,materials[2]]);
  assert(palette.supported);
  for (const preset of presets.slice(1)) {
    palette.apply(preset.primary,preset.accent,true);
    assert.equal(materials[0].color.value,preset.primary);
    assert.equal(materials[1].color.value,preset.accent);
    assert.equal(materials[2].color.scale,.2,'Shared materials are recolored only once');
    assert.equal(materials[3].color.value,'SciFi_MainDark');
    assert.equal(materials[4].color.value,'Grey');
    assert(materials.every(m=>m.roughness===.415));
  }
  palette.apply('#123456','#abcdef',false);
  materials.forEach(m=>{assert.equal(m.color.value,m.name);assert.equal(m.color.scale,1);});
  const mannequin={name:'Mannequin',color:new Color('yellow')};
  const unsupported=createPalette([mannequin]);assert(!unsupported.supported);
  unsupported.apply('#123456','#abcdef',true);assert.equal(mannequin.color.value,'yellow');
  console.log('PASS astronaut palettes preserve hardware, restore source colors and skip unsupported rigs');
})().catch(error=>{console.error(error);process.exitCode=1;});
