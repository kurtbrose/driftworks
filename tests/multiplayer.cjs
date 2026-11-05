'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../experiments/multiplayer-model.js'), 'utf8');
  const m = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const a = m.createArena(), b = m.createArena();
  for(let i=0;i<3600;i++) {
    const inputs = [{turn:Math.sin(i),thrust:1},{turn:-1,thrust:-1}];
    m.step(a,inputs); m.step(b,inputs);
    assert(m.validArena(a), 'finite, bounded state during sustained thrust and wrapping');
  }
  assert.deepEqual(a,b,'identical input streams produce identical states');
  const idle = m.createArena(); m.step(idle,[{turn:Infinity,thrust:1},null]);
  assert.equal(idle.pilots[0].x,300); assert.equal(idle.pilots[0].y,300);
  for(const raw of ['{','null','[]','x'.repeat(4097),JSON.stringify({protocol:'other'})]) assert.equal(m.decode(raw),null);
  assert(m.decode(JSON.stringify({protocol:m.protocol,type:'input'})));
  for(const input of [null,{}, {turn:2,thrust:0},{turn:0,thrust:NaN},{turn:'1',thrust:0}]) assert(!m.validInput(input));
  for(const bad of [{...a,tick:-1},{...a,pilots:[]},{...a,pilots:[{...a.pilots[0],x:NaN},a.pilots[1]]}]) assert(!m.validArena(bad));
  console.log('Multiplayer model: deterministic stepping, wrapping, speed cap and malformed-message checks passed.');
})().catch(error => {console.error(error);process.exitCode=1;});
