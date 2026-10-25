export type SkyCameraSource = {direction:number[];radius:number;strength:number;color:number[]};
export type SkyOccluder = {center:number[];radius:number};
export type SkyEnvironmentLighting = {sh:number[][];map:string;image:HTMLImageElement;radiance?:Float32Array};
/** Shared, checkable contracts for the plain-JavaScript simulation. */

export type Vec2 = { x: number; y: number };
export type Camera = Vec2 & { zoom: number };
export type Viewport = { width: number; height: number };

export type StudyViewConfig = {
  id:string; host:HTMLElement; world:World; zoomToTerrain?:boolean; pose:{yaw:number;tilt:number;height?:number};
  fit:(view:StudyView)=>void;
};
export type StudyView = {
  id:string;host:HTMLElement;scene:ReturnType<NonNullable<DriftworksNamespace['scene3d']>['create']>;
  world:()=>World;manual:boolean;fit:()=>void;reset:(pose?:{yaw:number;tilt:number;height?:number})=>void;
  fixedKey?:string;dispose:()=>void;
};

export type ViewerVector = [number, number, number];
export type ViewerPose = {eye: ViewerVector; right: ViewerVector; up: ViewerVector; back: ViewerVector; distance: number; focal: number};
export type ViewerPickBatch = {data:Float32Array;stride:number;origin:ViewerVector;scale:ViewerVector;rotation:number;basis?:Float32Array;spin:number};
export interface ViewerAdapter {
  pose: () => ViewerPose;
  fly: (pose: ViewerPose) => void;
  orbit: (pose: ViewerPose, target: ViewerVector) => void;
  pick: (eye: ViewerVector, direction: ViewerVector) => ViewerVector | null;
  worldUp: ViewerVector;
}
export interface ModelViewer {
  gesture: (event: {buttons:number; button:number; altKey:boolean}, space:boolean) => 'orbit' | 'pan';
  isFlying: () => boolean;
  isPicking: () => boolean;
  reset: () => void;
  dispose: () => void;
}

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
  | { kind: 'shuttle'; platformId: string; target: Vec2; evacuation: boolean }
  | { kind: 'idle' }
  | { kind: 'move'; target: Vec2 }
  | { kind: 'return'; target: Vec2; automatic?: boolean; salvageAll?: boolean }
  | { kind: 'recover'; recoveryTarget: RecoveryRef; target: Vec2; salvageAll?: boolean }
  | { kind: 'salvage-all' }
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
      automatic?: boolean;
      target?: Vec2;
      formation?: Formation;
    };

export type DefendOrder = Extract<Order, { kind: 'defend' }>;

export type Ship = {
  crewIds?: string[];
  passengerIds?: string[];
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
  /** Five-physical-minute dock service: loading/unloading people and cargo, plus refueling. */
  unloadRemainingSeconds?: number;
  cargoOperation?: {
    kind: 'deploy-platform' | 'retrieve-platform' | 'deploy-section' | 'recover' | 'exchange-crew';
    remainingSeconds: number;
    totalSeconds: number;
  } | null;
  cargoCapacity: number;
  repairRemaining: number;
  /** Normal emergence is 0..1 seconds; repaired-fighter clearance is 0..6 seconds. */
  launchElapsed: number | null;
  damage: number;
};

export type Propulsion = {
  capacityKg: number;
  fuelKg: number;
  exhaustMps: number;
};

export type World = {
  staffingEnabled?: boolean;
  returnedPersonIds?: string[];
  combat: CombatState;
  time?: number;
  nextFormationId: number;
  ships: Ship[];
  asteroids: Asteroid[];
  platforms: Platform[];
  wrecks: Wreck[];
  formations: Record<string, Formation>;
  selectedShipIds: string[];
  selectedPlatformId?: string | null;
  camera: Camera;
  version?: number;
  physicalUnitsVersion?: number;
  seed?: number;
  elapsedSeconds: number;
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

export type AsteroidExcavation = { pocketOffset: Vec2; pocketRadius: number; tunnelAngle: number; tunnelTurn: number; depthM: number; level: number };
export type Asteroid = { id: string; name?: string; position: Vec2; radius: number; angularVelocity: number; ore: number; oreInitial: number; rotation: number; excavation?: AsteroidExcavation };
export type Platform = { landingElapsedSeconds?: number; landingReleaseRotation?: number; landingSitePending?: boolean; workerIds?: string[]; shiftStartedSeconds?: number; evacuationRequested?: boolean; setupRemainingSeconds?: number; packRemainingSeconds?: number; id: string; state: string; position: Vec2; carrierId: string | null; asteroidId: string | null; siteAngle: number; siteDepth: number; ore: number; packetTimer: number };
export type Wreck = { id: string; position: Vec2; velocity?: Vec2; type?: string; rotation?: number; salvageOre?: number; towedBy?: string | null; disabled?: boolean; repairRemaining?: number; launchElapsed?: number | null; previousPosition?: Vec2; physical?: { dryMassKg: number }; massKg?: number; propulsion?: Propulsion; cargo?: number };
export type Depot = { name: string; position: Vec2; builtStages: number; totalStages: number };
export type Packet = { id: number; position: Vec2; velocity: Vec2; ore: number };
export type MothershipState = { storage: { ore: number; constructionMass: number; depotSections: number } };
export type Threat = { position: Vec2; velocity?: Vec2 };
export type Drone = { id: string; targetId: string; targetKind: string; position: Vec2; previousPosition: Vec2; velocity: Vec2; speed: number; hp: number; flash: number; underFire: number; fireCooldown: number };
export type CombatEvent = { kind: 'contact-warning' | 'wave-spawned' | 'weapon-fired' | 'ship-damaged' | 'ship-disabled' | 'ship-destroyed'; position: Vec2; velocity?: Vec2; source?: Vec2; sourceId?: string; targetId?: string; amount?: number; final?: boolean };
export type CombatState = {
  drones: Drone[];
  nextDroneId: number;
  rngState: number;
  director: { state: string; timer: number; cooldown: number; wavesSpawned: number };
  weaponTimers: Record<string, number>;
  events: CombatEvent[];
};
export type FighterStyle = { x: number; y: number; speed: number; acceleration: number };
export type Rng = () => number;

export type PropulsionApi = {
  initialize: (ship: Ship) => void;
  remaining: (ship: Ship, massKg: number) => number;
  burn: (ship: Ship, massKg: number, deltaMps: number) => number;
  canCatch: (position: Vec2, velocity: Vec2, home: { position: Vec2; velocity: Vec2 }, radius: number, unitsToMps: number) => boolean;
  exchangeMps: number;
};

export type CombatApi = {
  createCombat: (seed: number) => CombatState;
  spawnHostileWave: (world: World) => World;
  stepDirector: (world: World, dt: number) => void;
  stepHostiles: (world: World, dt: number) => void;
  stepWeapons: (world: World, dt: number) => void;
  stepDefenderWeapon: (escort: Ship, drones: Drone[], timers: Record<string, number>, dt: number) => { target: Drone; paint: boolean } | null;
  operationExposure: (world: World) => number;
  DIRECTOR_MAX_WAVES: number;
  FIGHTER_RANGE: number;
  RAIDER_RANGE: number;
};

export type CombatModule = {
  create: (dependencies: {
    createRng: (seed: number) => Rng;
    clonePlain: <T>(value: T) => T;
    distance: (a: Vec2, b: Vec2) => number;
    findMothership: (world: World) => Ship | undefined;
    normalizeWorld: (world: World) => World;
    appendWreck: (world: World, destroyed: { position: Vec2; velocity: Vec2 }) => void;
    applyFighterDamage: (ship: Ship, amount: number) => void;
  }) => CombatApi;
};

export type LogisticsModule = {
  setupSeconds: number;
  packSeconds: number;
  create: (dependencies: {
    cloneWorld: (world: World) => World;
    clonePlain: <T>(value: T) => T;
    selectedLookup: (world: World, shipIds?: string[]) => Record<string, boolean>;
    findMothership: (world: World) => Ship | undefined;
    findAsteroid: (world: World, asteroidId: string | null | undefined) => Asteroid | undefined;
    surfaceRadius: (asteroid: Asteroid, angle: number) => number;
    distance: (a: Vec2, b: Vec2) => number;
    movementAcceleration: (world: WorldLike, ship: Ship) => number;
    physicalStats: (world: WorldLike, ship: Ship) => { massKg: number };
    stepTowardOrderTarget: (ship: Ship, dt: number, arrivalDistance: number, snapOnArrival: boolean, formationVelocity?: Vec2 | null) => Ship;
    launchShip: (ship: Ship, home: Ship | undefined) => void;
    dockShip: (ship: Ship, home: Ship) => void;
    canCatch: (ship: Ship, home: Ship) => boolean;
    canCatchPacket: (position: Vec2, velocity: Vec2, home: Ship) => boolean;
    exchangeMps: number;
    velocityToMps: number;
    dockDistance: number;
    arrivalDistance: number;
    physicalSecondsPerSecond: number;
    metersPerUnit: number;
    dockServiceSeconds: number;
  }) => {
    createPlatform: (id: string) => Platform;
    migrate: (world: World) => void;
    availablePlatformCarrier: (world: World) => Ship | undefined;
    canDeployPlatform: (world: World) => boolean;
    issuePlatformRecovery: (world: World, id: string, shipIds?: string[]) => World;
    endMining: (world: World) => World;
    stepPlatformCarrier: (ship: Ship, world: World, dt: number) => Ship;
    stepShuttle: (ship: Ship, world: World, dt: number) => Ship;
    step: (world: World, dt: number) => void;
    processConstructionMass: (mothership: MothershipState, depot: Depot) => void;
    stepBuildingShip: (ship: Ship, dt: number, mothership: MothershipState, mothershipShip: Ship | undefined, depot: Depot) => Ship;
  };
};

export type FormationModule = {
  create: (dependencies: {
    cloneWorld: (world: World) => World;
    clonePlain: <T>(value: T) => T;
    createRng: (seed: number) => Rng;
    distance: (a: Vec2, b: Vec2) => number;
    angleDelta: (from: number, to: number) => number;
    stepTowardOrderTarget: (ship: Ship, dt: number, arrivalDistance: number, snapOnArrival: boolean, formationVelocity?: Vec2 | null, guidanceStyle?: FighterStyle) => Ship;
    arrivalDistance: number;
    fighterRange: number;
    raiderRange: number;
  }) => {
    issueDefendOrder: (world: World, target: Vec2, shipId?: string | null, shipIds?: string[]) => World;
    assignFormationSlots: (members: Ship[], formation: Formation, shipId?: string | null) => void;
    stepDefender: (ship: Ship, world: World, threats: Threat[], dt: number) => Ship;
    step: (world: World, dt: number, threats: Threat[]) => void;
    fighterStyle: (ship: Ship) => FighterStyle;
  };
};

export type CameraApi = {
  screenToWorld: (point: Vec2, camera: Camera, viewport: Viewport) => Vec2;
  viewportFromApp: (app: { screen: Viewport }) => Viewport;
  computeSelectionFocus: (world: World, shipIds?: string[]) => Camera | null;
  focusCameraToward: (world: World, target: Camera, dt: number) => World;
  worldToScreen: (point: Vec2, camera: Camera, viewport: Viewport) => Vec2;
  panCamera: (camera: Camera, screenDelta: Vec2) => Camera;
  zoomCameraAt: (camera: Camera, screenPoint: Vec2, viewport: Viewport, wheelDelta: number) => Camera;
  withCamera: (world: World, camera: Camera) => World;
  shipsInsideScreenRect: (world: World, start: Vec2, end: Vec2, viewport: Viewport) => string[];
};

export type AsteroidVisual = {
  seed: number; bulk: number[]; heterogeneity: number;
  fields: { low: number; med: number; blobs: { x: number; y: number; sigma: number; amp: number }[] }[];
  relief: { phase: number; blobs: { x: number; y: number; sigma: number; amp: number }[] };
  surfaceProfile: { roughnessAmp: number; roughnessFreq: number; grazingBoost: number; pittingDensity: number; fractureDensity: number; craterSharpness: number; rimStrength: number; boulderiness: number; smoothing: number; state: string };
  craters: { x: number; y: number; rx: number; ry: number; angle: number; depth: number; age: number; rimScale: number; sizeClass: string }[];
};

export type AsteroidSurfaceSample = {
  height: number; normal: {x: number; y: number; z: number}; composition: number[]; occlusion: number;
};
export type LegacyAsteroidVisual = Omit<AsteroidVisual, 'seed' | 'craters'> & {
  shape: number[];
  cells: {points: number[]; composition: number[]; normal: {x: number; y: number; z: number}; occlusion: number; limb: number; color: number}[];
  craters: {x: number; y: number; rx: number; ry: number; angle: number; depth: number; floor: number; rim: number; shadow: number; age: number; normal?: {x: number; y: number; z: number}; rimMask?: boolean[]}[];
  pits: {x: number; y: number; radius: number; color: number}[];
  fractures: {points: number[]; color: number}[];
  microBumps: {x: number; y: number; radius: number; aspect: number; strength: number; normal: {x: number; y: number; z: number}}[];
};

export type RigLightUniforms = {uRigCount:number;uRigProjected:number;uRigPower:Float32Array;uRigOrigin:Float32Array;uRigX:Float32Array;uRigY:Float32Array;uRigZ:Float32Array};
export type RigLightMount = {id:string;position:number[];target:number[];anchor:number[];range:number;power:number};
export type RigLighting = {origin:number[];right:number[];forward:number[];up:number[];scale:number;power:number};
export type PlatformSurface = {fit:TerrainFit;sample:TerrainSampler;scale:number;site:number[];heading:number;ramps:number[]|null};
export type TerrainHit = {point:number[];normal:number[];distance:number};
export type TerrainSampler = {stats:{raycasts:number;rampQueries:number};ray:(origin:number[],direction:number[])=>TerrainHit|null;at:(x:number,y:number)=>TerrainHit|null;collides:(points:number[][])=>boolean;triangleCount:number};
export type TerrainContact = {knee:number[];tip:number[];normal:number[];point:number[];worldPoint:number[];reachable:boolean;score:number;out:number[];mount:number[];distance?:number};
export type TerrainFit = LandingFit & {contacts:TerrainContact[];clearance:number;valid:boolean;world:(p:number[])=>number[];local:(p:number[])=>number[];rotate:(p:number[])=>number[]};
export type MiningTerrain = {
  metresPerModelUnit:number;
  surfaceSampler:(data:Float32Array,radius:number,site:number[],heading:number,scale:number)=>TerrainSampler;
  contactPoses:(fit:TerrainFit,deployment:number)=>{knee:number[];tip:number[];normal:number[]}[];
  meshSampler:(data:Float32Array,radius:number,site:number[])=>TerrainSampler;
  solveKnee:(mount:number[],tip:number[])=>{knee:number[];reachable:boolean;distance:number};
  fit:(sample:Pick<TerrainSampler,'at'>,site:number[])=>TerrainFit|null;
  transform:<T extends {vertices:Float32Array}>(batch:T,fit:{world:(p:number[])=>number[];rotate:(p:number[])=>number[]})=>T;
  rampStops:(sample:Pick<TerrainSampler,'collides'>,fit:Pick<TerrainFit,'world'>,geometry:(t:number)=>Record<string,number[]>)=>number[];
};
export type LandingFit = {origin:number[]; basis:number[][]};
export type LandingOptions = {unitsPerMetre?:number; spin?:number};
export type LandingSample = {time:number; altitude:number; deployment:number; ramps:number; match:number; travel:number; offset:number[]; headingOffset:number; contact:boolean; done:boolean; phase:string};
export type LandingPose = LandingSample & {angle:number; world:(p:number[])=>number[]; rotate:(p:number[])=>number[]; ground:(p:number[])=>number[]};
export interface DriftworksNamespace {
  shipArt?: import('./ship-art-types').ShipArtApi;
  skyEffects?: {
    fromFeatures:(features:{asset:string;yaw:number;pitch:number;widthDeg:number;gain:number}[],assets:Record<string,{diskFraction:number;strength:number;color:number[]}>)=>SkyCameraSource[];
    create:(host:HTMLElement)=>{setSources:(sources:SkyCameraSource[])=>void;setOccluders:(occluders:SkyOccluder[])=>void;setEnabled:(enabled:boolean)=>void;render:(pose:{eye?:number[];right:number[];up:number[];back:number[]},focal:number,seconds:number,empty:boolean)=>number;dispose:()=>void};
    visibility:(source:SkyCameraSource,eye:number[],occluders:SkyOccluder[])=>{fraction:number;direction:number[]};
    adapt:(current:number,target:number,dt:number)=>number;
  };
  explosions?: {fragmentSize:(index:number,variation:number)=>number;shaderSource:string;build:(blast:{position:[number,number,number];velocity?:[number,number,number];age:number;size:number;seed:number},right:[number,number,number],up:[number,number,number])=>{vertices:Float32Array;color:[number,number,number];finish:number;age:number}[]};
  assetUrl?: (value: string, base?: string) => string;
  meshBuilder?: {create:(groups:Record<string,number[]>)=>{block:(material:string,center:number[],size:number[],basis?:number[][])=>void;link:(material:string,a:number[],b:number[],width:number,depth?:number)=>void;plate:(material:string,points:number[][])=>void;barrel:(material:string,a:number[],b:number[],radius:number)=>void};boxMesh:()=>Float32Array};
  miningRig?: {ramps:(panelOpen?:number,rampLimits?:number[])=>Record<string,number[]>;infill:()=>Record<string,number[]>;legs:(deployment:number,contactPoses?:{knee:number[],tip:number[],normal:number[]}[])=>Record<string,number[]>;geometry:(deployment:number,time:number,working:boolean,panelOpen?:number,interiorCut?:string,legsOnly?:boolean,infillOnly?:boolean,contactPoses?:{knee:number[],tip:number[],normal:number[]}[],rampLimits?:number[],rampsOnly?:boolean)=>Record<string,number[]>;lights:()=>Record<string,number[]>};
  miningLights?:{visual:(groups:Record<string,number[]>,pose?:{world:(p:number[])=>number[];rotate:(p:number[])=>number[]},scale?:number)=>import('../experiments/types').Batch[];placedLights:(batches:import('../experiments/types').Batch[])=>RigLighting[];bakeDocking:(data:ArrayLike<number>)=>Float32Array;fields:{id:string;center:number[];radii:number[];power:number;color:number[]}[];fixtureCounts:Record<string,number>;model:RigLighting;irradiance:(rig:RigLighting,point:number[],normal:number[])=>number[];shaderSource:string;uniforms:(rigs:RigLighting[],origin:number[],angle:number,scale:number)=>RigLightUniforms;mounts:RigLightMount[];basis:(direction:number[])=>number[][];rig:(pose:{world:(p:number[])=>number[];rotate:(p:number[])=>number[]},scale:number,power?:number)=>RigLighting};
  miningTerrain?: MiningTerrain;
  miningLanding?: {duration:number; sample:(time:number)=>LandingSample; pose:(fit:LandingFit,time:number,options?:LandingOptions)=>LandingPose};
  asteroidArt?: {
    describe: (asteroid: Asteroid, bulkOverride?: number[]) => AsteroidVisual;
    reliefAt: (visual: AsteroidVisual, x: number, y: number) => number;
    surfaceSample: (visual: AsteroidVisual, x: number, y: number) => AsteroidSurfaceSample;
    legacyDescribe: (asteroid: Asteroid) => LegacyAsteroidVisual;
    color: (rgb: number[], lightness: number) => number;
    compositionColor: (composition: number[], lightness: number) => number;
    light: {x: number; y: number; z: number};
    craterTextureWidth: number;
    uniforms: (visual: AsteroidVisual) => { uLight: Float32Array; uBulk: Float32Array; uFieldLow: Float32Array; uFieldMed: Float32Array; uProfile: Float32Array; uRelief: Float32Array; uFieldBlobs: Float32Array; uBlobMaterial: Float32Array; uCraterCount: number; uHeterogeneity: number; uSeed: number; uPixelFootprint: number };
    craterBytes: (visual: AsteroidVisual) => Uint8Array;
    shaderSource: string;
  };
  studyViewer?: {
    createView:(config:StudyViewConfig)=>StudyView;
    referenceFighter:(length:number,units:number,origin:ViewerVector,yaw?:number)=>import('../experiments/types').Batch[];
  };
  modelViewer?: {create: (host: HTMLElement, adapter?: ViewerAdapter) => ModelViewer};
  scene3d?: {
    rockSurfaceShader: () => string;
    workLightFrame: (asteroid: Asteroid, lamp: {position:number[]; direction:number[]; range:number}, camera: Camera, height:number) => {position:number[]; direction:number[]; right:number[]; up:number[]; focal:number; near:number};
    surfaceSpotlight: (asteroid: Asteroid) => {position:number[]; direction:number[]; range:number};
    surfaceFrame: (asteroid: Asteroid, direction: [number, number, number]) => {point: [number, number, number]; normal: [number, number, number]};
    setStudyParameters: (asteroid: Asteroid, parameters: {bulk?: number[]; roughness?: number; craterDepth?: number; heterogeneity?: number}) => AsteroidVisual;
    impactsFor: (asteroid: Asteroid) => {center: [number, number, number]; normal: [number, number, number]; radius: number; depth: number; rim: number}[];
    craterDistance: (impact: {center: [number, number, number]; normal: [number, number, number]; radius: number}, point: [number, number, number]) => number;
    impactBytes: (asteroid: Asteroid) => Uint8Array;
    globeRelief: (asteroid: Asteroid, direction: [number, number, number]) => number;
    miningPlatformLights:()=>Record<string,number[]>;
    miningPlatformRampGeometry:(panelOpen:number)=>Record<string,number[]>;
    platformSurface:(platform:Platform,asteroid:Asteroid,open?:boolean)=>PlatformSurface|null;
    platformSurfaceGeometry:(surface:PlatformSurface,deployment:number,ramps:number)=>Record<string,number[]>;
    platformSurfacePose:(surface:PlatformSurface,platform:Platform,asteroid:Asteroid)=>{world:(p:number[])=>number[];rotate:(p:number[])=>number[]};
    miningPlatformInfillGeometry: () => Record<string, number[]>;
    miningPlatformContactGeometry: (deployment:number, panelOpen:number, interiorCut:string, poses:{knee:number[],tip:number[],normal:number[]}[], rampLimits?:number[]) => Record<string,number[]>;
    miningPlatformLegGeometry: (deployment: number) => Record<string, number[]>;
    miningPlatformGeometry: (deployment: number, time: number, working: boolean, panelOpen?: number, interiorCut?: string) => Record<string, number[]>;
    mothershipHardware: (detail?: number) => Record<string, number[]>;
    studyBatchVisible: (batch:import('../experiments/types').Batch, target:ViewerVector, camera:{right:ViewerVector;up:ViewerVector;back:ViewerVector;distance:number;focal:number}, aspect:number) => boolean;
    pickStudyBatches: (eye:ViewerVector, direction:ViewerVector, batches:ViewerPickBatch[]) => ViewerVector | null;
    pickStudySurface: (eye: [number,number,number], direction: [number,number,number], meshes: ArrayLike<number>[]) => [number,number,number] | null;
    habitatLod: (radiusPixels: number) => number;
    habitatMesh: (segments?: number) => Float32Array;
    roundedHullMesh: (width: number, length: number, depth: number, radius: number) => Float32Array;
    visualFor: (asteroid: Asteroid) => AsteroidVisual;
    surfaceHeight: (asteroid: Asteroid, x: number, y: number, lower?: boolean) => number;
    project: (point: [number, number, number], camera: Camera, viewport: Viewport, orbit: { yaw: number; tilt: number; height?: number }) => Vec2 & { depth: number };
    unproject: (point: Vec2, camera: Camera, viewport: Viewport, orbit: { yaw: number; tilt: number; height?: number }, z?: number) => Vec2 | null;
    view: (camera: Camera, viewport: Viewport, orbit: { yaw: number; tilt: number }) => { right: [number, number, number]; up: [number, number, number]; back: [number, number, number]; distance: number; focal: number };
    rockField: (asteroid: Asteroid, point: [number, number, number], cutaway?: boolean) => number;
    asteroidMesh: (asteroid: Asteroid, resolution?: number, cutaway?: boolean) => Float32Array;
    pickAsteroid: (point: Vec2, asteroid: Asteroid, camera: Camera, viewport: Viewport, orbit: { yaw: number; tilt: number; height?: number }) => { position: [number, number, number]; depth: number } | null;
    platformHeight: (platform: Platform, asteroid: Asteroid | undefined) => number;
    inspectionHeight: (world: World) => number;
    create: (host: HTMLElement, getWorld: () => World, setWorld: (world: World) => void, options?: {study?: boolean; viewer?: boolean; zoomToTerrain?:boolean}) => {
      setStudyBridge:(enabled:boolean)=>void;
      setStudyBridgeRevision:(revision:string|null)=>void;
      setStudyDiagnostics: (settings: {mode: string; flat: boolean; scale: number; mothership: boolean; actors: boolean}) => void;
      getRenderStats: () => {bridgeObjectPaths?:number;bridgeObjectPatches?:number;bridgeObjectError?:number;bridgeObjectBad?:number;bridgeHistoryValid?:number;bridgeCaptures?:number;bridgeCpuMs?:number;drawCalls: number; triangles: number; lines: number; meshes: number; materials: number; width: number; height: number; pixelRatio: number; cpuMs: number};
      setStudyLightRigs:(rigs:RigLighting[])=>void;
    setRigLightsEnabled:(enabled:boolean)=>void;
    prepareStudyTextures: (images: HTMLImageElement[]) => Promise<void>;
    setStudyActors: (batches: {projected?:boolean;lensRadius?:number;lensCenter?:number[];region?:number;vertices: Float32Array; bakedDocking?:Float32Array; rigLights?:RigLighting[]; color: [number,number,number]; opacity?: number; origin?: [number,number,number]; rotation?: number; staticGeometry?: boolean; basis?: Float32Array; scale?: number}[]) => void;
      setStudyEffects: (batches: {projected?:boolean;lensRadius?:number;lensCenter?:number[];region?:number;vertices: Float32Array; color: [number,number,number]}[]) => void;
      setStudyExplosions: (blasts: {region?:number;position:[number,number,number];velocity?:[number,number,number];age:number;size:number;seed:number}[]) => void;
      getOrbit: () => {yaw: number; tilt: number; height?: number};
      setSurfaceCamera: (pose: {region?:number;eye: [number, number, number]; right: [number, number, number]; up: [number, number, number]; back: [number, number, number]} | null) => void;
      setOrbit: (value: {yaw: number; tilt: number; height?: number}) => void;
      sync: (world: World) => void;
      render: (world: World, alpha: number, dt: number, wallDt: number) => void;
      consumeCombatEvents: (events: CombatEvent[]) => void;
      resetCombat: () => void;
      applyCameraFocus: (world: World, dt: number) => World;
      setStressEnabled: (enabled: boolean) => void;
      setBackground: (settings: { image: string; brightness: number }) => void;
      getStats: () => { fps: number; stressEnabled: boolean; entityCount: number; contacts: string };
    };
  };
  population?: PopulationApi;
  session?: SessionApi;
  propulsion?: PropulsionApi;
  combat?: CombatModule;
  logistics?: LogisticsModule;
  formations?: FormationModule;
  sim?: SimApi;
  camera?: CameraApi;
  engineAudio?: import('./engine-types').EngineTools;
  audioMixer?: import('./audio-types').MixerTools;
  audio?: AudioApi;
  hud?: { create: (host: HTMLElement, actions: HudActions) => HudController; miningControlState: (world: World) => unknown };
  [key: string]: unknown;
}

export type SimApi = {
  createShip: (id: string, name: string, type: string, x: number, y: number, speed: number) => Ship;
  serializeWorld: (world: World) => string;
  deserializeWorld: (text: string) => World;
  remainingDeltaV: (world: World, ship: Ship) => number;
  returnReserve: (ship: Ship, home: Ship) => number;
  canCatch: (ship: Ship, home: Ship) => boolean;
  endMining: (world: World) => World;
  selectShips: (world: World, ids: string[]) => World;
  selectPlatform: (world: World, platformId: string | null) => World;
  issueMineOrder: (world: World, asteroidId: string, shipIds?: string[]) => World;
  saveWorld: (world: World, storage?: Storage) => void;
  resetWorld: (storage?: Storage) => World;
  loadWorld: (storage?: Storage) => World;
  createInitialWorld: (seed?: number) => World;
  stepWorld: (world: World, dt: number, threats?: Threat[]) => World;
  spawnHostileWave: (world: World) => World;
  DIRECTOR_MAX_WAVES: number;
  spawnFighter: (world: World) => World;
  damageFighter: (world: World, id: string, amount: number) => World;
  RAIDER_RANGE: number;
  createRng: (seed: number) => Rng;
  randomBetween: (rng: Rng, min: number, max: number) => number;
  surfaceRadius: (asteroid: Asteroid, angle: number) => number;
  toggleAsteroidExcavation: (world: World, asteroidId: string) => World;
  cloneWorld: (world: World) => World;
  addWreck: (world: World, destroyed: { position: Vec2; velocity: Vec2 }) => World;
  issueReturnOrder: (world: World, shipIds?: string[]) => World;
  issuePlatformRecovery: (world: World, platformId: string, shipIds?: string[]) => World;
  issueDefendOrder: (world: World, target: Vec2, shipId?: string | null, shipIds?: string[]) => World;
  issueRecoveryOrder: (world: World, target: RecoveryRef, shipIds?: string[]) => World;
  issueSalvageAllOrder: (world: World, shipIds?: string[]) => World;
  issueBuildOrder: (world: World, shipIds?: string[]) => World;
  issueMoveOrder: (world: World, target: Vec2, shipIds?: string[]) => World;
  issueContextOrder: (world: World, target: Vec2, shipIds?: string[]) => World;
  FIGHTER_RANGE: number;
  asteroidPhysicalStats: (asteroid: Asteroid) => { diameterM: number };
  physicalStats: (world: World, ship: Ship) => { lengthM: number; massKg: number; accelerationMps2: number };
  canDeployPlatform: (world: World) => boolean;
  PHYSICAL_SECONDS_PER_SECOND: number;
  METERS_PER_UNIT: number;
  DOCK_SERVICE_SECONDS: number;
  DEPOT_FRAME: { lengthM: number; widthM: number };
  DEPOT_SECTION: { lengthM: number; widthM: number };
  [key: string]: unknown;
};
export type AudioApi = { createOhioMusic: () => {isAnnouncing: () => boolean; resume: () => void; pause: () => void; update: () => void; mount: (host: HTMLElement) => void}; getMix: () => import('./engine-types').FlightMix; setMix: (value: Partial<import('./engine-types').FlightMix>) => void; setCommsActive: (active: boolean) => void; commsChannel: () => {context: AudioContext; output: GainNode} | null; mountMixer: (host: HTMLElement) => void; engine: import('./engine-types').EngineTools; flightFeedback: (dt: number, throttle: number, boost: boolean, active: boolean) => {load: number; boost: number}; setFlightEngine: (dt: number, throttle: number, boost: boolean, active: boolean, detail?: {damage?: number; maneuver?: number; thrust?: number; acceleration?: number}) => {load: number; boost: number}; unlock: () => boolean; setSfxEnabled: (enabled: boolean) => void; setSfxVolume: (value: number) => void; setMusicEnabled: (enabled: boolean) => void; setMusicVolume: (value: number) => void; setEngineThrust: (level: number) => void; playSelect: () => void; playMove: () => void; playInvalid: () => void; playMiningTick: () => void; playGunshot: () => void; playImpact: (strength: number) => void; playDock: () => void; playDelivery: () => void; playWarning: () => void; playWormhole:(kind:'enter'|'cross'|'exit')=>void; _test?: Record<string, unknown>; status: () => { available: boolean; sfxVolume: number; musicVolume: number } };
export type HudActions = {
  getPopulation?: () => PopulationState;
  onEndMining: EventListener; onDeployPlatform: EventListener; onSalvageAll: EventListener; onReturnHome: EventListener; onSave: EventListener; onExport: EventListener; onLoad: EventListener; onReset: EventListener;
  onStressToggle: EventListener; onToggleExcavation: EventListener; onSelectShip: (id: string | undefined) => void; onTimeScale: (scale: number) => void;
  onSfxVolume: (value: number) => void; onMusicVolume: (value: number) => void; getTimeScale: () => number;
  getBackgroundOptions: () => { id: string; label: string; url: string; credit: string; contrast: number }[];
  getBackgroundSettings: () => { image: string; brightness: number };
  onBackgroundImage: (image: string) => void; onBackgroundBrightness: (brightness: number) => void;
};
export type HudController = { update: (world: World, stats: GameStats) => void };
export type GameStats = { contacts: string; entityCount: number; fps?: number; stressEnabled: boolean };

export type Person = {
  id: string; name: string; role: string; joinedSeconds: number; alive: boolean;
  location: string; assignment: string | null; preferredAssignment: string | null;
  dutyStartedSeconds: number | null; dutySeconds: number; overtimeSeconds: number;
  history: PopulationEvent[];
};
export type PopulationEvent = {
  id: number; personId: string; kind: 'deployment' | 'arrival' | 'duty-completed' | 'recovery' | 'death';
  atSeconds: number; location: string; assignment: string | null; missionId: string;
};
export type PopulationState = {
  version: 1; seed: number; total: number; civilianShare: number; operationalCapacity: number;
  nextPersonId: number; lastEventId: number; timeSeconds: number; people: Record<string, Person>;
};
export type PopulationApi = {
  create: (seed?: number, total?: number, civilianShare?: number) => PopulationState;
  assign: (state: PopulationState, role: string, assignment: string, count: number) => string[];
  consume: (state: PopulationState, events: PopulationEvent[]) => void;
  advanceTo: (state: PopulationState, seconds: number) => void;
  serialize: (state: PopulationState) => string;
  deserialize: (text: string) => PopulationState;
};
export type Session = { version: 1; world: World; population: PopulationState; nextEventId: number; campaignOffsetSeconds: number };
export type SessionApi = {
  create: (world?: World, legacy?: boolean) => Session;
  transition: (session: Session, command: (world: World) => World) => Session;
  step: (session: Session, dt: number) => Session;
  advanceCampaign: (session: Session, days: number) => Session;
  serialize: (session: Session) => string;
  deserialize: (text: string) => Session;
  save: (session: Session, storage?: Storage) => void;
  load: (storage?: Storage) => Session;
};

declare global {
  namespace PIXI {
    class Matrix {
      constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number);
    }
    interface FederatedPointerEvent {
      global: Vec2;
      button: number;
      stopPropagation: () => void;
    }
    class DisplayObject {
      transform: { setFromMatrix: (matrix: Matrix) => void };
      x: number;
      y: number;
      cursor: string;
      engineResponse?: { time: number; levels: Record<string, number> } | null;
      position: { x: number; y: number; set: (x: number, y?: number) => void };
      visible: boolean;
      alpha: number;
      rotation: number;
      scale: { x: number; y: number; set: (x: number, y?: number) => void };
      parent: Container | null;
      eventMode: string;
      hitArea: unknown;
      drawnZoom?: number;
      engineScreenScale?: number;
      destroy: () => void;
    }
    class Container extends DisplayObject {
      children: DisplayObject[];
      mothershipParts?: { base: Graphics; habitat: Mesh; shader: Shader; overlay: Graphics };
      addChild: (...children: DisplayObject[]) => DisplayObject;
      addChildAt: (child: DisplayObject, index: number) => DisplayObject;
      pivot: { set: (x: number, y?: number) => void };
      removeChildren: () => void;
      on: (event: string, handler: (event: FederatedPointerEvent) => void) => void;
    }
    class Graphics extends Container {
      closePath: () => this;
      drawPolygon: (points: number[]) => this;
      drawEllipse: (x: number, y: number, width: number, height: number) => this;
      drawRoundedRect: (x: number, y: number, width: number, height: number, radius?: number) => this;
      clear: () => this; beginFill: (color: number, alpha?: number) => this; endFill: () => this;
      lineStyle: (width: number, color?: number, alpha?: number) => this;
      drawCircle: (x: number, y?: number, radius?: number) => this;
      drawRect: (x: number, y: number, width: number, height: number) => this;
      moveTo: (x: number, y: number) => this; lineTo: (x: number, y: number) => this;
      arc: (x: number, y: number, radius: number, start: number, end: number) => this;
    }
    class Texture {
      static WHITE: Texture;
      static from(source: unknown): Texture;
      static fromBuffer(buffer: Uint8Array, width: number, height: number): Texture;
      baseTexture: { scaleMode: number; alphaMode: number; update: () => void };
    }
    class Filter {
      uniforms: Record<string, unknown>;
      padding: number;
      constructor(vertex?: string, fragment?: string, uniforms?: Record<string, unknown>);
    }
    class Sprite extends Container {
      anchor: { set: (x: number, y?: number) => void };
      width: number;
      height: number;
      filters: Filter[];
      constructor(texture?: Texture);
    }
    class Geometry {
      addAttribute: (name: string, data: number[], size: number) => this;
      addIndex: (data: number[]) => this;
    }
    class Shader {
      uniforms: Record<string, unknown>;
      static from(vertex: string, fragment: string, uniforms?: Record<string, unknown>): Shader;
    }
    class Mesh extends Container {
      constructor(geometry: Geometry, shader: Shader);
    }
    class Text extends Container { anchor: { set: (x: number, y?: number) => void }; constructor(text: string, style?: unknown); text: string; style: unknown; }
    class Circle { constructor(x: number, y: number, radius: number); }
    class Application {
      stage: Container; view: HTMLCanvasElement; ticker: { add: (handler: (delta: number) => void) => void };
      renderer: { resize: (width: number, height: number) => void };
      screen: { width: number; height: number };
      constructor(options?: unknown);
    }
  }
  interface Window {
    THREE: import('./three-types').Three;
    DRIFTWORKS_TEST_MODE?: boolean;
    Driftworks: DriftworksNamespace;
    webkitAudioContext?: typeof AudioContext;
    PIXI: typeof PIXI;
  }
}
