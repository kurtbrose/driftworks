import type {Asteroid, AsteroidVisual, Platform, PlatformSurface} from './types';

type V3 = [number, number, number];
type Impact = {center: V3; normal: V3; radius: number; depth: number; rim: number};

export type AsteroidTerrainApi = {
  asteroidMesh: (asteroid: Asteroid, resolution?: number | undefined, cutaway?: boolean | undefined) => Float32Array<ArrayBuffer>;
  contactMesh: (asteroid: Asteroid) => { key: string; visual: AsteroidVisual; data: Float32Array<ArrayBufferLike>; sites: Map<string, PlatformSurface | null>; };
  craterDistance: (impact: Pick<Impact, "normal" | "center" | "radius">, point: V3) => number;
  globeRelief: (asteroid: Asteroid, direction: V3) => number;
  impactBytes: (asteroid: Asteroid) => Uint8Array<ArrayBuffer>;
  impactsFor: (asteroid: Asteroid) => Impact[];
  platformSurface: (platform: Platform, asteroid: Asteroid, open?: boolean | undefined) => PlatformSurface | null;
  platformSurfaceGeometry: (surface: PlatformSurface, deployment: number, ramps: number) => Record<string, number[]>;
  platformSurfacePose: (surface: PlatformSurface, platform: Platform, asteroid: Asteroid) => { world: (p: number[]) => number[]; rotate: (p: number[]) => number[]; };
  rockField: (asteroid: Asteroid, p: V3, cutaway?: boolean | undefined) => number;
  setStudyParameters: (asteroid: Asteroid, parameters: { bulk?: number[] | undefined; roughness?: number | undefined; craterDepth?: number | undefined; heterogeneity?: number | undefined; }) => AsteroidVisual;
  surfaceFrame: (asteroid: Asteroid, direction: V3) => { point: V3; normal: V3; };
  surfaceHeight: (asteroid: Asteroid, x: number, y: number, lower?: boolean | undefined) => number;
  visualFor: (asteroid: Asteroid) => AsteroidVisual;
  release: (id: string) => void;
};
