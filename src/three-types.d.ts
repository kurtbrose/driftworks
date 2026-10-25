export type UniformValue = number | number[] | Float32Array | Texture | null;
export interface Attribute {}
export interface Interleaved extends Attribute {array:Float32Array;stride:number;needsUpdate:boolean}
export interface Geometry {
 setAttribute(name:string,attribute:Attribute):void;
 deleteAttribute(name:string):void;
 setDrawRange(start:number,count:number):void;
 dispose():void;
}
export interface Texture {needsUpdate:boolean;flipY:boolean;wrapS:number;minFilter:number;magFilter:number;colorSpace:string;mapping:number;clone():Texture;dispose():void}
export interface Matrix {elements:number[];fromArray(values:number[]|Float32Array):Matrix;copy(matrix:Matrix):Matrix;invert():Matrix;makePerspective(left:number,right:number,top:number,bottom:number,near:number,far:number):Matrix}
export interface RenderTarget {texture:Texture;depthTexture?:Texture;dispose():void}
export interface Material {uniforms:Record<string,{value:UniformValue}>;blending:number;depthWrite:boolean;dispose():void}
export interface StandardMaterial extends Material {map:Texture|null;envMap:Texture|null;envMapIntensity:number;color:{setRGB(r:number,g:number,b:number,space?:string):void};opacity:number;transparent:boolean;needsUpdate:boolean;onBeforeCompile:(shader:{uniforms:Record<string,{value:UniformValue}>;vertexShader:string;fragmentShader:string})=>void}
export interface Object3D {visible:boolean;frustumCulled:boolean;geometry?:Geometry;matrixAutoUpdate:boolean;matrix:Matrix;matrixWorld:Matrix;matrixWorldInverse:Matrix;projectionMatrix:Matrix;projectionMatrixInverse:Matrix}
export interface Scene {add(object:Object3D):void;remove(object:Object3D):void}
export interface Renderer {
 autoClear:boolean;sortObjects:boolean;
 setSize(width:number,height:number,style:boolean):void;
 setViewport(x:number,y:number,width:number,height:number):void;setScissor(x:number,y:number,width:number,height:number):void;setScissorTest(value:boolean):void;
 setRenderTarget(target:RenderTarget|null):void;
 setClearColor(color:number,alpha:number):void;clear():void;
 initTexture(texture:Texture):void;
 render(scene:Scene,camera:Object3D):void;dispose():void;
}
export interface Three {
 WebGLRenderer:new(options:{canvas:HTMLCanvasElement;antialias:boolean;alpha:boolean;premultipliedAlpha:boolean})=>Renderer;
 Scene:new()=>Scene;Camera:new()=>Object3D;
 AmbientLight:new(color:number,intensity:number)=>Object3D;
 RawShaderMaterial:new(options:{glslVersion?:string;vertexShader:string;fragmentShader:string;uniforms:Record<string,{value:UniformValue}>;side:number;transparent:boolean;depthTest?:boolean;depthWrite:boolean;forceSinglePass?:boolean;blending:number;defaultAttributeValues:Record<string,number[]>})=>Material;
 MeshStandardMaterial:new(options:{metalness:number;roughness:number;side:number;alphaTest:number})=>StandardMaterial;
 PMREMGenerator:new(renderer:Renderer)=>{fromEquirectangular(texture:Texture):RenderTarget;dispose():void};
 ShaderChunk:Record<string,string>;
 GLSL3:string;SRGBColorSpace:string;EquirectangularReflectionMapping:number;
 BufferGeometry:new()=>Geometry;
 InterleavedBuffer:new(data:Float32Array,stride:number)=>Interleaved;
 InterleavedBufferAttribute:new(buffer:Attribute,size:number,offset:number)=>Attribute;
 BufferAttribute:new(data:Float32Array,size:number)=>Attribute;
 Mesh:new(geometry:Geometry,material:Material)=>Object3D;
 LineSegments:new(geometry:Geometry,material:Material)=>Object3D;
 Texture:new(image:HTMLImageElement|HTMLCanvasElement)=>Texture;
 DataTexture:new(data:Uint8Array|Float32Array,width:number,height:number,format?:number,type?:number)=>Texture;
 RGBAFormat:number;FloatType:number;LinearSRGBColorSpace:string;
 WebGLRenderTarget:new(width:number,height:number,options:{minFilter:number;magFilter:number})=>RenderTarget;
 DepthTexture:new(width:number,height:number,type:number)=>Texture;UnsignedIntType:number;
 NoBlending:number;NormalBlending:number;AdditiveBlending:number;DoubleSide:number;NearestFilter:number;LinearFilter:number;RepeatWrapping:number;LinearMipmapLinearFilter:number;
}

