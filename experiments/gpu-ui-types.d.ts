export type Painter = Pick<CanvasRenderingContext2D, 'fillStyle'|'strokeStyle'|'globalAlpha'|'lineWidth'|'font'|'textAlign'|'shadowBlur'|'shadowColor'|'save'|'restore'|'translate'|'rotate'|'beginPath'|'moveTo'|'lineTo'|'closePath'|'arc'|'stroke'|'fill'|'setLineDash'|'fillRect'|'strokeRect'|'fillText'> & {
    smoothStroke?:()=>void;
    panel:(x:number,y:number,w:number,h:number,r:number)=>void;
    image:(source:HTMLCanvasElement,x:number,y:number,w:number,h:number,slot:number,refresh?:boolean)=>void;
};
export type PaintContext = Omit<Painter, 'panel'|'image'>;
export type State = Pick<Painter,'fillStyle'|'strokeStyle'|'globalAlpha'|'lineWidth'|'font'|'textAlign'|'shadowBlur'|'shadowColor'> & {matrix:number[];dash:number[]};
export type Path = {points:number[][];closed:boolean;circle?:number[]};
export interface GpuUi {painter:Painter;canvas:HTMLCanvasElement;begin:(w:number,h:number)=>void;end:()=>void;dispose:()=>void;stats:()=>{vertices:number;capacity:number;textures:number;drawCalls:number}}
