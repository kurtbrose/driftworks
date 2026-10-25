import type {Ship, Wreck, World, Vec2, Asteroid, Platform, PlatformSurface, AsteroidVisual} from './types';

type Graphics = InstanceType<Window['PIXI']['Graphics']>;
type Container = InstanceType<Window['PIXI']['Container']>;

type ShipStyle = {radius: number; fill: number; stroke: number};
type AsteroidNormal = {x: number; y: number; z: number};
type Plume = {id: string; origin: Vec2; direction: Vec2; side: Vec2; length: number; width: number; alpha: number};

export type ShipArtApi = {
  styles: Record<string, ShipStyle>;
  cargoModuleGeometry: () => { length: number; width: number; };
  craftDetail: (zoom: number) => { machinery: number; fine: number; };
  createMothershipGraphic: () => Container;
  drawCraftBrackets: (g: Graphics, halfX: number, halfY: number, screenScale: number) => void;
  drawEnginePlume: (graphics: Graphics, ship: Ship, radius: number, elapsedSeconds: number) => void;
  drawPlatformWorkers: (graphics: Graphics, workerIds: string[], elapsedSeconds: number, packingUp: boolean, normal?: AsteroidNormal | undefined) => void;
  drumSurfaceAt: (angle: number) => { y: number; depth: number; };
  enginePlumeGeometry: (worldAccelX: number, worldAccelY: number, rotation: number, acceleration: number, radius: number, loadedReturn: boolean, shipType: string) => Plume[];
  mothershipDrumMarkers: (elapsedSeconds: number) => { y: number; halfWidth: number; width: number; alpha: number; visible: boolean; }[];
  mothershipHabitatLampVisibility: (spin: number) => { left: number; right: number; };
  mothershipHabitatUniforms: (elapsedSeconds: number, shipRotation: number, screenScale: number) => { uLight: Float32Array<ArrayBuffer>; uSpin: number; uPixelFootprint: number; };
  mothershipHullHalfWidthAtY: (y: number) => number;
  mothershipLocalLight: (shipRotation: number) => { x: number; y: number; z: number; };
  paintIndustrialPlatform: (g: Graphics, deployment: number, working: boolean, time: number, zoom: number, rotation: number) => void;
  paintRaisedPlatform: (g: Graphics, deployment: number, working: boolean, time: number, zoom: number, rotation: number, normal: AsteroidNormal) => void;
  paintShip: (graphics: Container | Graphics, ship: Ship, selected: boolean, elapsedSeconds: number, towedEntity: Ship | Wreck | undefined, towedScale: number, zoom: number) => void;
  paintTerrainPlatform: (g: Graphics, surface: PlatformSurface, deployment: number, ramps: number, yaw: number, heading: number) => void;
  platformDeployment: (platform: Platform) => number;
  platformIsWorking: (platform: Platform, world: World, asteroid: Asteroid | undefined) => boolean;
  platformProjection: (normal: AsteroidNormal, heading: number, scale: number) => { a: number; b: number; c: number; d: number; compression: number; };
  platformRaisedPoint: (normal: AsteroidNormal, x: number, y: number, height: number) => { x: number; y: number; };
  platformSurfaceNormal: (visual: AsteroidVisual, x: number, y: number) => AsteroidNormal;
  semanticScale: (type: string, zoom: number) => number;
  worldDeltaToShipLocal: (dx: number, dy: number, rotation: number) => { x: number; y: number; };
  worldVectorToShipLocalLine: (position: Vec2, target: Vec2, rotation: number) => { x: number; y: number; };
};
