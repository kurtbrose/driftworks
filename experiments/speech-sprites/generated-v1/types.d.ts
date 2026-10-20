export type FaceLayer = {image: string; shape: number[]; alpha: number};
export type FaceRenderer = {
  draw: (layers: FaceLayer[]) => void;
  drawMask: (target: HTMLCanvasElement, shape: number[]) => void;
  protectedChanges: () => number;
};
export type FaceBlendApi = {
  create: (target: HTMLCanvasElement, images: Record<string, CanvasImageSource>) => FaceRenderer;
  speechCue: (plan: import('../../types').SpeechPlan, elapsed: number) => {revealed: number; image: string; alpha: number};
  presets: Record<string, number[]>;
};
declare module '../../../src/types' {
  interface DriftworksNamespace {faceBlend?: FaceBlendApi;}
}
