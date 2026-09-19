/** Shared, checkable contracts for the plain-JavaScript simulation. */

export type Vec2 = { x: number; y: number };

export type EntityRef =
  | { kind: 'ship'; id: string }
  | { kind: 'wreck'; id: string }
  | { kind: 'asteroid'; id: string };
export type RecoveryRef = Extract<EntityRef, { kind: 'ship' | 'wreck' }>;

export type Formation = {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity?: number;
  looseness?: number;
  pivoting?: boolean;
  directTravel?: boolean;
  relocating?: boolean;
  memberIds?: string[];
};

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; target: Vec2 }
  | { kind: 'return'; target: Vec2; automatic?: boolean }
  | { kind: 'recover'; recoveryTarget: RecoveryRef; target: Vec2 }
  | { kind: 'retrieve-platform'; platformId: string; target: Vec2 }
  | { kind: 'deploy'; asteroidId: string; platformId: string; target: Vec2; siteAngle: number; siteDepth: number }
  | { kind: 'mine'; asteroidId: string }
  | { kind: 'build'; target: Vec2 }
  | {
      kind: 'defend';
      anchor: Vec2;
      anchorShipId: string | null;
      groupId: number;
      offset?: Vec2;
      side: number;
      leashRadius?: number;
      target?: Vec2;
      formation?: Formation;
    };

export type DefendOrder = Extract<Order, { kind: 'defend' }>;

export type Ship = {
  id: string;
  name: string;
  type: string;
  position: Vec2;
  order: Order;
  disabled: boolean;
  docked: boolean;
  speed: number;
  towTarget: RecoveryRef | null;
  towedBy: string | null;
  velocity: Vec2;
  rotation: number;
  propulsion?: Propulsion;
  physical?: { lengthM: number; dryMassKg: number; thrustN: number };
  cargo: number;
  platformId: string | null;
  carryingSection: boolean;
  turnRate: number;
  acceleration: number;
  burnMassKg?: number;
  previousPosition: Vec2;
  previousVelocity: Vec2;
  previousCargo: number;
  cargoCapacity: number;
  repairRemaining: number;
  launchElapsed: number | null;
  damage: number;
};

export type Propulsion = {
  capacityKg: number;
  fuelKg: number;
  exhaustMps: number;
};

export type World = {
  time?: number;
  nextFormationId: number;
  ships: Ship[];
  asteroids: Asteroid[];
  platforms: Platform[];
  wrecks: Wreck[];
  formations: Record<string, Formation>;
  selectedShipIds: string[];
  camera: Vec2;
  version?: number;
  physicalUnitsVersion?: number;
  seed?: number;
  elapsedSeconds?: number;
  logisticsVersion?: number;
  miningMission: string;
  depot: Depot;
  packets: Packet[];
  nextPacketId: number;
  nextWreckId: number;
  recovery: { salvagedOre: number; repairedShips: number };
  contract: { id: string; name: string; quotaOre: number; reward: number };
  campaign: { timeDays: number; money: number; location: string };
  mothership: MothershipState;
};
export type WorldLike = { ships: Ship[]; wrecks: Wreck[]; platforms?: Platform[]; mothership?: MothershipState };

export type Asteroid = { id: string; name?: string; position: Vec2; radius: number; angularVelocity: number; ore: number; oreInitial: number; rotation: number };
export type Platform = { id: string; state: string; position: Vec2; carrierId: string | null; asteroidId: string | null; siteAngle: number; siteDepth: number; ore: number; packetTimer: number };
export type Wreck = { id: string; position: Vec2; type?: string; rotation?: number; salvageOre?: number; towedBy?: string | null; disabled?: boolean; repairRemaining?: number; launchElapsed?: number | null; previousPosition?: Vec2; physical?: { dryMassKg: number }; massKg?: number; propulsion?: Propulsion; cargo?: number };
export type Depot = { name: string; position: Vec2; builtStages: number; totalStages: number };
export type Packet = { id: number; position: Vec2; velocity: Vec2; ore: number };
export type MothershipState = { storage: { ore: number; constructionMass: number; depotSections: number } };
export type Threat = { position: Vec2; velocity?: Vec2 };
export type FighterStyle = { x: number; y: number; speed: number; acceleration: number };
export type Rng = () => number;

export type PropulsionApi = {
  initialize: (ship: Ship) => void;
  remaining: (ship: Ship, massKg: number) => number;
  burn: (ship: Ship, massKg: number, deltaMps: number) => number;
  canCatch: (position: Vec2, velocity: Vec2, home: { position: Vec2; velocity: Vec2 }, radius: number, unitsToMps: number) => boolean;
  exchangeMps: number;
};

export type DriftworksNamespace = {
  propulsion?: PropulsionApi;
  sim?: SimApi;
  audio?: AudioApi;
  hud?: { create: (host: HTMLElement, actions: HudActions) => HudController; miningControlState: (world: World) => unknown };
  [key: string]: unknown;
};

export type SimApi = {
  remainingDeltaV: (world: World, ship: Ship) => number;
  returnReserve: (ship: Ship, home: Ship) => number;
  canCatch: (ship: Ship, home: Ship) => boolean;
  endMining: (world: World) => World;
  selectShips: (world: World, ids: string[]) => World;
  issueMineOrder: (world: World, asteroidId: string) => World;
  saveWorld: (world: World, storage?: Storage) => void;
  resetWorld: (storage?: Storage) => World;
  loadWorld: (storage?: Storage) => World;
  createInitialWorld: () => World;
  stepWorld: (world: World, dt: number, threats: Threat[]) => World;
  spawnFighter: (world: World) => World;
  damageFighter: (world: World, id: string, amount: number) => World;
  FIGHTER_RANGE: number;
  asteroidPhysicalStats: (asteroid: Asteroid) => { diameterM: number };
  physicalStats: (world: World, ship: Ship) => { lengthM: number; massKg: number; accelerationMps2: number };
  canDeployPlatform: (world: World) => boolean;
  PHYSICAL_SECONDS_PER_SECOND: number;
  DEPOT_FRAME: { lengthM: number; widthM: number };
  DEPOT_SECTION: { lengthM: number; widthM: number };
  [key: string]: unknown;
};
export type AudioApi = { unlock: () => boolean; setSfxEnabled: (enabled: boolean) => void; setSfxVolume: (value: number) => void; setMusicEnabled: (enabled: boolean) => void; setMusicVolume: (value: number) => void; setEngineThrust: (level: number) => void; playSelect: () => void; playMove: () => void; playInvalid: () => void; playMiningTick: () => void; playGunshot: () => void; playImpact: (strength: number) => void; playDock: () => void; playDelivery: () => void; playWarning: () => void; _test?: Record<string, unknown>; status: () => { available: boolean; sfxVolume: number; musicVolume: number } };
export type HudActions = {
  onEndMining: EventListener; onDeployPlatform: EventListener; onSave: EventListener; onLoad: EventListener; onReset: EventListener;
  onStressToggle: EventListener; onSelectShip: (id: string | undefined) => void; onTimeScale: (scale: number) => void;
  onSfxVolume: (value: number) => void; onMusicVolume: (value: number) => void; getTimeScale: () => number;
};
export type HudController = { update: (world: World, stats: GameStats) => void };
export type GameStats = { contacts: string; entityCount: number; fps?: number; stressEnabled: boolean };

declare global {
  namespace PIXI {
    class DisplayObject {
      position: { x: number; y: number; set: (x: number, y: number) => void };
      visible: boolean;
      alpha: number;
      rotation: number;
      scale: { x: number; y: number; set: (x: number, y: number) => void };
      parent: Container | null;
      eventMode: string;
      hitArea: unknown;
      drawnZoom?: number;
      engineScreenScale?: number;
      destroy: () => void;
    }
    class Container extends DisplayObject {
      children: DisplayObject[];
      addChild: (...children: DisplayObject[]) => DisplayObject;
      addChildAt: (child: DisplayObject, index: number) => DisplayObject;
      pivot: { set: (x: number, y: number) => void };
      removeChildren: () => void;
      on: (event: string, handler: (...args: never[]) => void) => void;
    }
    class Graphics extends Container {
      clear: () => this; beginFill: (color: number, alpha?: number) => this; endFill: () => this;
      lineStyle: (width: number, color?: number, alpha?: number) => this;
      drawCircle: (x: number, y?: number, radius?: number) => this;
      drawRect: (x: number, y: number, width: number, height: number) => this;
      moveTo: (x: number, y: number) => this; lineTo: (x: number, y: number) => this;
      arc: (x: number, y: number, radius: number, start: number, end: number) => this;
    }
    class Text extends Container { constructor(text: string, style?: unknown); text: string; style: unknown; }
    class Circle { constructor(x: number, y: number, radius: number); }
    class Application {
      stage: Container; view: HTMLCanvasElement; ticker: { add: (handler: (delta: number) => void) => void };
      renderer: { resize: (width: number, height: number) => void };
      screen: { width: number; height: number };
      constructor(options?: unknown);
    }
  }
  interface Window {
    Driftworks: DriftworksNamespace;
    webkitAudioContext?: typeof AudioContext;
    PIXI: typeof PIXI;
  }
}
