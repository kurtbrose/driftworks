'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
// Read only primary-bank slot counts; model geometry and hardpoint positions stay in the VP.
function parseBanks(pof){
    if(pof.length<8||pof.toString('ascii',0,4)!=='PSPO')throw Error('Expected retail POF');
    for(let at=8;at<pof.length;){
        if(at+8>pof.length)throw Error('Truncated POF chunk');
        const tag=pof.toString('ascii',at,at+4),length=pof.readInt32LE(at+4),start=at+8,end=start+length;
        if(length<0||end>pof.length)throw Error('Invalid POF chunk length');
        if(tag==='GPNT'){
            if(length<4)throw Error('Truncated GPNT');
            const count=pof.readInt32LE(start),banks=[];let cursor=start+4;
            if(count<1||count>32)throw Error('Invalid primary bank count');
            for(let i=0;i<count;i++){
                if(cursor+4>end)throw Error('Truncated primary bank');
                const slots=pof.readInt32LE(cursor);cursor+=4;
                if(slots<1||slots>128||cursor+slots*24>end)throw Error('Invalid primary slots');
                banks.push(slots);cursor+=slots*24;
            }
            if(cursor!==end)throw Error('Unexpected GPNT bytes');
            return banks;
        }
        at=end;
    }
    throw Error('Missing primary gun points');
}
function openCatalog(archive){
    const fd=fs.openSync(archive,'r');
    try{
        const header=Buffer.alloc(16);fs.readSync(fd,header,0,16,0);
        if(header.toString('ascii',0,4)!=='VPVP'||header.readInt32LE(4)!==2)throw Error('Expected retail VP version 2');
        const count=header.readInt32LE(12),offset=header.readInt32LE(8),size=fs.fstatSync(fd).size;
        if(count<0||offset<16||offset+count*44>size)throw Error('Invalid VP directory');
        const directory=Buffer.alloc(count*44);fs.readSync(fd,directory,0,directory.length,offset);
        const files=new Map();
        for(let i=0;i<count;i++){
            const at=i*44,length=directory.readInt32LE(at+4),position=directory.readInt32LE(at),name=directory.toString('ascii',at+8,at+40).split('\0')[0].toLowerCase();
            if(length>0){if(position<16||position+length>offset)throw Error('Invalid VP member');files.set(name,{position,length});}
        }
        return function read(model){
            const entry=files.get(model.toLowerCase());if(!entry)throw Error('Missing retail model '+model);
            const source=Buffer.alloc(entry.length),handle=fs.openSync(archive,'r');
            try{if(fs.readSync(handle,source,0,source.length,entry.position)!==source.length)throw Error('Truncated model');}finally{fs.closeSync(handle);}
            const primaryBankMounts=parseBanks(source);
            return {gunMounts:primaryBankMounts.reduce((a,b)=>a+b,0),primaryBankMounts,gunMountSource:{model:model.toLowerCase(),sha256:crypto.createHash('sha256').update(source).digest('hex')}};
        };
    }finally{fs.closeSync(fd);}
}
module.exports={parseBanks,openCatalog};
