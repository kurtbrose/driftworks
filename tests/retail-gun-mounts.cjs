'use strict';
const assert=require('node:assert/strict'),{parseBanks}=require('../tools/retail-gun-mounts.cjs');
function pof(banks){
    const body=Buffer.alloc(4+banks.reduce((n,count)=>n+4+24*count,0));body.writeInt32LE(banks.length);let cursor=4;
    for(const count of banks){body.writeInt32LE(count,cursor);cursor+=4+24*count;}
    const head=Buffer.alloc(16);head.write('PSPO');head.writeInt32LE(2117,4);head.write('GPNT',8);head.writeInt32LE(body.length,12);
    return Buffer.concat([head,body]);
}
for(const banks of [[2,2],[4,2],[2,3],[6,2,3],[1],[7]])assert.deepEqual(parseBanks(pof(banks)),banks);
assert.throws(()=>parseBanks(Buffer.alloc(8)),/Expected retail POF/);
assert.throws(()=>parseBanks(pof([])),/bank count/);
assert.throws(()=>parseBanks(pof([0])),/primary slots/);
assert.throws(()=>parseBanks(pof([2]).subarray(0,-1)),/chunk length/);
const corrupt=pof([2]);corrupt.writeInt32LE(1000,20);assert.throws(()=>parseBanks(corrupt),/primary slots/);
assert.throws(()=>parseBanks(Buffer.from('PSPO1234')),/Missing primary/);
console.log('PASS retail gun counts: numeric POF bank import, odd/even counts and corrupt input rejection');
