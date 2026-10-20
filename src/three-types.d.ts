export type UniformValue = number | number[] | Float32Array | Texture | null;
export interface Attribute {}
export interface Interleaved extends Attribute {array:Float32Array;stride:number;needsUpdate:boolean}
export interface Geometry {
 setAttribute(name:string,attribute:Attribute):void;
 deleteAttribute(name:string):void;
 setDrawRange(start:number,count:number):void;
 dispose():void;
}
export interface Texture {needsUpdate:boolean;flipY:boolean;wrapS:number;minFilter:number;dispose():void}
export interface RenderTarget {texture:Texture;dispose():void}
export interface Material {uniforms:Record<string,{value:UniformValue}>;blending:number;depthWrite:boolean;dispose():void}
export interface Object3D {frustumCulled:boolean;geometry?:Geometry}
export interface Scene {add(object:Object3D):void;remove(object:Object3D):void}
export interface Renderer {
 autoClear:boolean;sortObjects:boolean;
 setSize(width:number,height:number,style:boolean):void;
 setRenderTarget(target:RenderTarget|null):void;
 setClearColor(color:number,alpha:number):void;clear():void;
 render(scene:Scene,camera:Object3D):void;dispose():void;
}
export interface Three {
 WebGLRenderer:new(options:{canvas:HTMLCanvasElement;antialias:boolean;alpha:boolean;premultipliedAlpha:boolean})=>Renderer;
 Scene:new()=>Scene;Camera:new()=>Object3D;
 RawShaderMaterial:new(options:{vertexShader:string;fragmentShader:string;uniforms:Record<string,{value:UniformValue}>;side:number;transparent:boolean;depthWrite:boolean;blending:number;defaultAttributeValues:Record<string,number[]>})=>Material;
 BufferGeometry:new()=>Geometry;
 InterleavedBuffer:new(data:Float32Array,stride:number)=>Interleaved;
 InterleavedBufferAttribute:new(buffer:Attribute,size:number,offset:number)=>Attribute;
 BufferAttribute:new(data:Float32Array,size:number)=>Attribute;
 Mesh:new(geometry:Geometry,material:Material)=>Object3D;
 LineSegments:new(geometry:Geometry,material:Material)=>Object3D;
 Texture:new(image:HTMLImageElement)=>Texture;
 DataTexture:new(data:Uint8Array,width:number,height:number)=>Texture;
 WebGLRenderTarget:new(width:number,height:number,options:{minFilter:number;magFilter:number})=>RenderTarget;
 NoBlending:number;NormalBlending:number;AdditiveBlending:number;DoubleSide:number;NearestFilter:number;LinearFilter:number;RepeatWrapping:number;LinearMipmapLinearFilter:number;
}

