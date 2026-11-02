'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {build,apply,render} = require('../tools/mission-workshop/catalog.cjs');
const model = require('../tools/mission-workshop/model.js');
const root = path.resolve(__dirname,'..'), catalog = build(root), state = model.fresh();
assert.equal(fs.readFileSync(path.join(root,'tools/mission-workshop/catalog.js'),'utf8'),render(catalog),'catalog matches current mission source');
assert.equal(catalog.lines.filter(l => l.id.startsWith('evacuation-')).length,19);
assert.equal(catalog.lines.filter(l => l.id.startsWith('convoy-')).length,19);
assert.equal(new Set(catalog.lines.map(l => l.id)).size,catalog.lines.length);
for (const line of catalog.lines) {
  assert(catalog.characters.some(c => c.id === line.character));
  assert(catalog.scenes.some(s => s.id === line.scene));
  const text = fs.readFileSync(path.join(root,line.source.file),'utf8').replace(/\r\n/g,'\n');
  assert.equal(require('node:vm').runInNewContext(text.slice(line.source.start,line.source.end)),line.text);
}
assert(catalog.dynamic.some(c => c.expression.includes('alive.length')));
assert.equal(catalog.lines.find(l => l.id === 'convoy-chat-0-line-0').character,'daniel-okafor');
const line = catalog.lines[0];
model.edit(catalog,state,line.id,'A shorter line.','Reassure the pilot.');
assert.equal(model.text(catalog,state,line.id),'A shorter line.');
assert(model.stale({text:line.text},model.text(catalog,state,line.id)));
assert(!model.stale({text:'A shorter line.'},model.text(catalog,state,line.id)));
const revision = model.revision(catalog,state);
assert.equal(revision.edits[0].original,line.text);
assert.equal(revision.edits[0].sourceHash,line.source.hash);
model.edit(catalog,state,line.id,'Another take.','Quietly.');
assert.equal(model.revision(catalog,state).edits[0].original,line.text,'editing twice retains source baseline');
assert.equal(model.validate(state),state);
assert.throws(() => model.validate({...state,takes:[{id:'bad'}]}),/Invalid take/);
// Isolated fixture stays under ignored scratch; never mutate real mission scripts.
const fixture = path.join(root,'.scratch/mission-workshop/test-'+process.pid);
for (const file of ['experiments/evacuation-mission.js','src/convoy-mission.js']) {
  fs.mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true}); fs.copyFileSync(path.join(root,file),path.join(fixture,file));
}
assert.throws(() => apply({...revision,edits:[...revision.edits,{...revision.edits[0],id:'unknown'}]},fixture),/Source conflict/);
assert.equal(build(fixture).lines[0].text,line.text,'invalid batch writes nothing');
assert.throws(() => apply({...revision,edits:[revision.edits[0],revision.edits[0]]},fixture),/Duplicate/);
apply(revision,fixture);
assert.equal(build(fixture).lines[0].text,'A shorter line.');
assert.throws(() => apply(revision,fixture),/Source conflict/,'old revisions cannot overwrite newer source');
assert(!fs.readFileSync(path.join(fixture,line.source.file),'utf8').includes('\r'));
console.log('Mission workshop catalog, revision safety and stale-take checks passed.');
