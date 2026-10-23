// Adapter for our offline depot GLB profile, not a general glTF loader.
// Flight consumes unindexed Z-up batches; Three's study uses GLTFLoader directly.
/** @typedef {{group:string;material:string;positions:Float32Array;normals:Float32Array;uvs?:Float32Array}} DepotBatch */
/** @typedef {{materials:Record<string,[number,number,number]>;batches:DepotBatch[]}} DepotAsset */
/** @param {ArrayBuffer} bytes @returns {DepotAsset} */
export function decodeDepot(bytes) {
    const view=new DataView(bytes);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw Error('Invalid depot GLB');
    const length=view.getUint32(12,true),start=28+length;
    /** @type {{extras:Omit<DepotAsset,'batches'>;nodes:{name:string;children?:number[];mesh?:number}[];meshes:{primitives:{attributes:Record<string,number>;indices:number;material:number}[]}[];materials:{name:string}[];accessors:{bufferView:number;componentType:number;count:number;type:string}[];bufferViews:{byteOffset:number;byteLength:number}[]}} */
    const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
    /** @param {number} id */
    function read(id){const a=doc.accessors[id],b=doc.bufferViews[a.bufferView],width=a.type==='VEC3'?3:a.type==='VEC2'?2:1;
        if(a.componentType===5126)return new Float32Array(bytes,start+b.byteOffset,a.count*width);
        if(a.componentType===5123)return new Uint16Array(bytes,start+b.byteOffset,a.count);
        if(a.componentType===5125)return new Uint32Array(bytes,start+b.byteOffset,a.count);
        throw Error('Unsupported depot accessor');
    }
    /** @type {DepotBatch[]} */const batches=[];
    for(const groupId of doc.nodes[0].children||[]){const group=doc.nodes[groupId];for(const childId of group.children||[]){
        const mesh=doc.nodes[childId].mesh;if(mesh===undefined)continue;
        for(const primitive of doc.meshes[mesh].primitives){
            const indices=read(primitive.indices);
            /** @param {string} name @param {number} width */
            function expand(name,width){const source=read(primitive.attributes[name]),out=new Float32Array(indices.length*width);
                for(let i=0;i<indices.length;i++)for(let a=0;a<width;a++)out[i*width+a]=source[indices[i]*width+a];return out;}
            const batch={group:group.name,material:doc.materials[primitive.material].name,positions:expand('POSITION',3),normals:expand('NORMAL',3)};
            /** @type {DepotBatch} */const result=batch;
            if(primitive.attributes.TEXCOORD_0!==undefined){result.uvs=expand('TEXCOORD_0',2);for(let i=1;i<result.uvs.length;i+=2)result.uvs[i]=1-result.uvs[i];}
            batches.push(result);
        }
    }}
    return Object.assign({},doc.extras,{batches});
}
