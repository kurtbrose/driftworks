export type TargetStatus = {id: string; shield: number; hull: number; shieldTrail: number; hullTrail: number; shieldAge: number; hullAge: number; flash: number; time: number};
import type { Asteroid, Ship, World, DriftworksNamespace } from '../src/types';
/** Scene-space positions; velocities and engine targets are metres per second. */
export type Vector = number[];
export type Pose = {
    eye: Vector;
    right: Vector;
    up: Vector;
    back: Vector;
};
export type FlightState = Pose & {
    velocity: Vector;
    rates: Vector;
    ramp: Vector;
    throttle: number;
};
export type Profile = {
    name: string;
    role: string;
    damp: number;
    rotdamp: number;
    maxVelocity: Vector;
    rotationTime: Vector;
    rearVelocity: number;
    forwardAccel: number;
    forwardDecel: number;
    slideAccel: number;
    slideDecel: number;
    overclockSpeed: number;
    afterburnerVelocity: Vector;
    afterburnerAccel: number;
    species?: string;
    hull?: number;
    shield?: number;
    powerOutput?: number;
    defaultWeapons?: string[];
    afterburnerFuel?: number;
    afterburnerBurnRate?: number;
    afterburnerRecoveryRate?: number;
    gunMounts?: number;
    primaryBankMounts?: number[];
    gunMountSource?: {model: string; sha256: string};
};
export type FlightInput = {
    side?: number;
    vertical?: number;
    pitch?: number;
    yaw?: number;
    roll?: number;
    boost?: boolean;
};
export type Demand = FlightInput & {
    throttle: number | null;
    throttleRate: number;
    stop?: boolean;
    fire: boolean;
};
/** Complete legal control request shared by evaluation pilots and replay. */
export type PilotInput = Required<FlightInput> & { throttle: number; fire: boolean };
export type OpponentStyle = 'baseline'|'aggressor'|'interceptor'|'passer'|'fso-pursuit'|'fso-breaker';
export type DuelOptions = {
    allyHull?: string; enemyHull?: string;
    opponentStyle?: OpponentStyle;
    start?: 'headOn'|'crossing'|'tail'|'turning'|'opening';
    category?: 'perfect'|'human';
    flavor?: 'novice'|'practiced'|'expert';
    seed?: number;
    skill?: number;
    duration?: number;
    profile?: number;
    opponentProfile?: number;
    weapon?: number;
    opponentWeapon?: number;
    unshielded?: boolean;
};
export type DuelReplay = {
    version:number; policy:string; observation:string; cadence:number;
    options:Required<DuelOptions>; inputs:PilotInput[];
};
export type Duel = {
    advance:(elapsed:number, inputStream?:PilotInput[])=>DuelSummary;
    summary:()=>DuelSummary;
    replay:DuelReplay; player:FlightState; enemy:Craft; combat:Combat; guns:Guns;
};
export type DuelSummary = {
    ticks:number; seconds:number; done:boolean; outcome:string;
    category:string; flavor:string; skill:number; start:string; seed:number; profile:string; weapon:string;
    playerHull:number; playerShield:number; opponentHull:number; opponentShield:number;
    playerMaxHull:number; playerMaxShield:number; opponentMaxHull:number; opponentMaxShield:number;
    opponentProfile:string; opponentWeapon:string; unshielded:boolean; opponentStyle:OpponentStyle;
    allyHull:string; enemyHull:string;
    playerShots:number; opponentShots:number; longestDry:number;
    metrics:{playerOpportunities:number;opponentOpportunities:number;playerDamageSteps:number;opponentDamageSteps:number;modeChanges:number;minRange:number;maxRange:number;rangeIntegral:number;attackSeconds:number;extendSeconds:number;rearThreatSeconds:number;separations:number;progressEscapes:number};
};
export type StudyConfig = {
    styles?:OpponentStyle[];ships:number[];weapons:number[];starts:NonNullable<DuelOptions['start']>[];pilots:('perfect'|'novice'|'practiced'|'expert')[];skills:number[];
    seeds:number;seed:number;duration:number;pairing:'mirror'|'all'|'anchor';defenses:'retail'|'unshielded'|'paired';
};
export type StudyCase = {id:string;options:DuelOptions};
export type StudyRow = {id:string;options:Required<DuelOptions>;summary:DuelSummary};
export type StudyManifest = {policy:string;cadence:number;replaySchema:number;hashes:Record<string,string>};
export type StudyMessage = {kind:'ready';total:number;manifest:StudyManifest}|{kind:'rows';rows:StudyRow[]}|{kind:'done'}|{kind:'error';message:string};
export type StudyWorkerScope = {window:unknown;DRIFTWORKS_TEST_MODE:boolean;importScripts:(...files:string[])=>void;onmessage:((event:MessageEvent<StudyConfig>)=>void)|null;postMessage:(message:StudyMessage)=>void};
export type Weapon = {
    flags?: string[];
    name: string;
    speed: number;
    fireWait: number;
    lifetime: number;
    damage: number;
    shieldFactor: number;
    armorFactor: number;
    length: number;
    headRadius: number;
    tailRadius: number;
    energyConsumed: number;
    color: Vector;
    color2: Vector;
};
export type Bolt = {
    position: Vector;
    direction: Vector;
    weapon: Weapon;
    age: number;
    team?: string;
};
export type Impact = {
    position: Vector;
    age: number;
    scale?: number;
};
export type Guns = {
    bolts: Bolt[];
    impacts: Impact[];
    cooldown: number;
    fired: number;
    hits: number;
};
export type TerrainHit = (start: Vector, end: Vector) => Vector | null;
export type Hit = {
    fraction: number;
    point: Vector;
    model?: Model;
    local?: Vector;
    normal?: Vector;
};
export type HullHit = Hit & {
    model: Model;
    local: Vector;
    normal: Vector;
};
export type Scorch = {
    modelId: string;
    layers: number[][];
};
export type ArtCraft = {
    index: number;
    pose: Pose & {
        velocity: Vector;
        throttle: number;
    };
    team?: string;
    artWave?: number;
    scorches?: Scorch[];
    hp?: number;
    age?: number;
};
export type CollisionShape = { kind: 'sphere'; radiusM: number } | { kind: 'model'; modelId: string };
export type Craft = ArtCraft & {
    controller: 'input' | 'ai';
    collision: CollisionShape;
    hitFlash?: number;
    id: string;
    callsign: string;
    pose: FlightState;
    profile: Profile;
    hp: number;
    maxHp: number;
    shield?: number;
    maxShield?: number;
    weaponIndex?: number;
    pilot: string;
    skill: number;
    mode: string;
    opponentStyle?: OpponentStyle;
    extensionGoal?: Vector;
    gunGoal?: Vector;
    gunValid?: boolean;
    reentryGoal?: Vector;
    opportunityHold?: number;
    noProgress?: number;
    maneuverAt?: number;
    breakCooldown?: number;
    breakReason?: string;
    separations?: number;
    progressEscapes?: number;
    decision: number;
    until: number;
    goal: Vector;
    guns: Guns;
    damagedAt: number;
    fire: boolean;
    targetId: string | null;
    retarget: number;
    nearMissAt?: number;
};
export type Wreck = ArtCraft & {
    id: string;
    axis: Vector;
    spin: number;
    age: number;
};
export type RadioEvent = {
    kind: string;
    victim: string;
    team: string;
    index?: number;
    killer?: string | null;
    serial: number;
    time: number;
    wave: number;
};
export type Combat = {
    opponentStyle?: OpponentStyle;
    player: Craft;
    configured: boolean;
    useHullModels?: boolean;
    hullModels?: { ally: string; enemy: string };
    mode: string;
    roundOver: boolean;
    enabled: boolean;
    time: number;
    wave: number;
    countdown: number;
    enemies: Craft[];
    wrecks: Wreck[];
    kills: number;
    shield: number;
    hull: number;
    maxHull?: number;
    maxShield?: number;
    lastHit: number;
    hitFlash: number;
    dead: boolean;
    targetId: string | null;
    targetLocked?: boolean;
    slots: string[];
    slotTimer: number;
    flashes: Impact[];
    radioEvents: RadioEvent[];
    radioSerial: number;
    playerKills: number;
    nearMissAt?: number;
    terrainScorches?: Vector[];
    onTerrainImpact?: (point: Vector) => void;
};
export type Model = {
    id: string;
    name: string;
    triangles: number;
    vertices: number[];
    texturedVertices?: number[];
    texture?: string;
};
export type Pack = {
    id: string;
    author: string;
    license: string;
    url: string;
    models: Model[];
};
export type Batch = {
    basis?: Float32Array;
    scale?: number;
    origin?: [number,number,number];
    rotation?: number;
    staticGeometry?: boolean;
    asteroidId?: string;
    vertices: Float32Array;
    bakedDocking?: Float32Array;
    rigLights?: import('../src/types').RigLighting[];
    color: [
        number,
        number,
        number
    ];
    opacity?: number;
    finish?: number;
    texture?: HTMLImageElement;
    stride?: number;
    paint?: Vector;
};
export type Images = Map<string, HTMLImageElement>;
export type Appearance = {
    allyArt: string;
    enemyArt: string;
    shipImages: Images;
    paint: Record<string, Vector | undefined>;
};
export type Comparison = {
    mode: string;
    flat: boolean;
    scale: number;
    mothership: boolean;
    actors: boolean;
};
export type Scene = ReturnType<NonNullable<DriftworksNamespace['scene3d']>['create']>;
export type RenderStats = {
    scene: ReturnType<Scene['getRenderStats']>;
    sky: {
        drawCalls: number;
        triangles: number;
        points: number;
        meshes: number;
        materials: number;
    };
};
export type FlightView = {
    world: World;
    state: FlightState;
    combat: Combat;
    guns: Guns;
    /** Presentation-only observer camera and own craft; never passed to combat. */
    camera?: Pose;
    observerCraft?: ArtCraft;
};
export type HudView = FlightView & Appearance & {
    asteroid: Asteroid;
    mothership: Ship;
    units: number;
    paused: boolean;
    mouse: number[];
    inputMode: string;
    showMouseStick: boolean;
    stickRange: number;
    speakerId: string | null;
    weapon: Weapon;
};
export type Frame = {
    t: number;
    cap: number;
    started: number;
    actualElapsed: number;
    elapsed: number;
};
export type Measurements = {
    frames: number[];
    cpu: number[];
    worst: number;
};
export type Pacer = {
    next: number | null;
};
export type Mapping = Record<'pitch' | 'yaw' | 'roll' | 'throttle' | 'fire' | 'boost' | 'bank' | 'lock' | 'pause' | 'up' | 'down' | 'deadzone', number> & Record<'pitchInvert' | 'yawInvert' | 'rollInvert' | 'throttleInvert', boolean>;
export type PadDemand = {
    pitch: number;
    yaw: number;
    roll: number;
    throttle: number | null;
    throttleRate: number;
    fire: boolean;
    boost: boolean;
    bank: boolean;
    lock: boolean;
    pause: boolean;
};
export type ControlActions = {
    pause: () => void;
    resume: () => void;
    captureFailure: (error?: unknown) => void;
    isPaused: () => boolean;
    isDead: () => boolean;
    nextWeapon: () => void;
    nextTarget: () => void;
    toggleTargetLock: () => void;
    nextRadarRange: () => void;
    selectProfile: (index: number) => void;
    toggleDiagnostics: () => void;
    togglePerformance: () => void;
};
export type ControlEnvironment = {
    document: Document;
    window: Window;
    navigator: Navigator;
};
export type SessionEnvironment = {
    /** Optional seed for a reproducible mission asteroid. */
    seed?: number;
    terrainHit: TerrainHit;
    /** Direction and returned normalized point are in the asteroid body frame. */
    surfaceFrame: (asteroid: Asteroid, direction: Vector) => {
        point: Vector;
    };
    onGunshot: () => void;
    onImpact: () => void;
};
export type Snapshot = FlightView & {
    asteroid: Asteroid;
    mothership: Ship;
    contact: boolean;
};
export type RadarContact = {
    point: Vector;
    color: string;
    selected?: boolean;
    speaking?: boolean;
    landmark?: boolean;
};
export type Voice = Record<'pitch' | 'resonance' | 'formant1' | 'formant2' | 'formant3' | 'brightness' | 'nasality' | 'creak' | 'clipping' | 'contour' | 'roughness' | 'tremor' | 'breath' | 'speed' | 'pauseScale' | 'enunciation' | 'variation' | 'volume' | 'seed', number> & {
    compactWords: boolean;
    emotion: string;
};
export type Cue = {
    kind: 'pause';
    start: number;
    duration: number;
    from: number;
    to: number;
};
export type Syllable = Omit<Cue, 'kind'> & {
    kind: 'syllable';
    vowel: string;
    vowelEnd: string;
    closed: boolean;
    pitch: number;
    sourceFrom: number;
    sourceTo: number;
    attack: boolean;
    pitchCurve?: Vector;
};
export type SpeechPlan = {
    text: string;
    voice: Voice;
    events: (Cue | Syllable)[];
    duration: number;
};
export type RadioNoise = {
    edgeScale: number; sampleRate: number; speechSamples: number; lead: number; duration: number; effects: number;
    openLatch: RadioLatch; closeLatch: RadioLatch;
    bursts: {start: number; end: number; gain: number}[];
};
export type RadioLatch = {delay: number; duration: number; frequency: number; steps: {until: number; gain: number}[]};
export type TransmissionOptions = {
    mode?: string;
    speechDuration?: number;
    volume?: number;
    effects?: number;
    seed?: number;
    staticBursts?: boolean;
    noise?: RadioNoise;
    edgeScale?: number;
};
export type Speaker = Partial<Craft> & {
    id: string;
    team?: string;
    mode: string;
};
export type Identity = {
    id?: string;
    callsign?: string;
    index?: number;
};
export type Emotion = {
    current: string;
    intensity: number;
    stress: number;
    recoverAfter: number;
    modifier: {
        current: string;
        intensity: number;
        until: number;
    } | null;
    announced?: string | null;
};
export type Feeling = Pick<Emotion, 'current' | 'intensity'> & {
    stress?: number;
};
export type Contact = {
    distance: number;
    range: number;
    bearing: string;
    direction: string;
    height: string;
    vertical: boolean;
    sector: string;
};
export type LineData = Record<string, string | number | boolean | undefined>;
export type Choices = string[] & {
    templateKeys?: string[];
};
export type Candidate = {
    craft: Speaker;
    event: string;
    data?: LineData;
    texts?: Choices;
    expires?: number;
    wave?: number;
    contactId?: string;
};
export type SituationCraft = {
    inContact: boolean;
    passHit: boolean;
    firedPass: boolean;
    hp: number;
    pursued: boolean;
    fire: boolean;
    targetId: string | null;
    targetHp: number | null;
    mode: string;
    closing: number;
};
export type CommsState = {
    wait: number;
    serial: number;
    last: string;
    recentLines: {
        text: string;
        key: string;
    }[];
    danger: boolean;
    quiet: number;
    time: number;
    modes: Record<string, string>;
    activity: Record<string, {
        fire: boolean;
        targetId: string | null;
    }>;
    spoken: Record<string, number>;
    quietGap: number;
    lastCraft: string | null;
    recentActivities: string[];
    activitySpoken: Record<string, number>;
    conversation: {
        caller: string;
        threat: string;
        expires: number;
    } | null;
    situation: {
        wave: number;
        craft: Record<string, SituationCraft>;
        allies: number;
        enemies: number;
        playerKills: number;
    } | null;
    radioSerial: number;
    facts: Candidate[];
    contactReports: Record<string, {
        time: number;
        sector: string;
        range: number;
    }>;
    emotions: Record<string, Emotion>;
    emotionWave: number | null;
    acknowledgment: { caller: string; responder: string; kind: string; expires: number; wave: number } | null;
    emotionalConversation: {
        caller: string;
        emotion: string;
        expires: number;
    } | null;
};
export type Line = {
    portraitIndex?: number;
    text: string;
    speaker: string;
    voice: string;
    hostile: boolean;
    seed: number;
    craftId?: string;
    mode?: string;
    event?: string;
    replyTo?: string;
    voiceSettings: Partial<Voice> & {
        seed: number;
    };
    radioSeed: number;
    emotion?: Feeling;
};
export type CommsDisplayOptions = {breakup?: number; palette?: string; scanlines?: number; reduced?: boolean};
export type ExperimentModules = {
    commsDisplay: {create: (target: HTMLCanvasElement) => {draw: (source: CanvasImageSource, noise: RadioNoise | null, elapsed: number, speechDuration: number, options?: CommsDisplayOptions) => number}};
    flightPortraits: {
        mount: (panel: HTMLElement) => {
            show: (line: Line) => void;
            play: (plan: SpeechPlan, context: AudioContext, time: number, speechOffset: number, noise?: RadioNoise) => void;
            finish: () => void;
            decay: (progress: number) => void;
            stop: () => void;
            clear: () => void;
            update: (live?: Feeling, force?: boolean) => void;
        };
        slot: (line: Line) => number;
        expression: (feeling?: Feeling) => string;
    };
    flightStudy:{plan:(config:StudyConfig)=>StudyCase[];analyze:(rows:StudyRow[])=>{
        total:number;wins:number;losses:number;timeouts:number;medianKill:number|null;flagged:StudyRow[];
        groups:{separations:number;progressEscapes:number;style:OpponentStyle;meanRange:number;attackFraction:number;extendFraction:number;rearThreatFraction:number;opportunityFraction:number;label:string;pilot:string;skill:number;weapons:string;unshielded:boolean;n:number;wins:number;losses:number;timeouts:number;medianKill:number|null;observedMean:number;longestDry:number}[];
        shieldPairs:number;pairsCensored:number;observedShieldDelta:number|null;
    };watchUrl:(options:DuelOptions)=>string};
    flightWatch:{create:(scenery:Pick<ReturnType<ExperimentModules['flightSession']['create']>, 'snapshot' | 'advanceScenery'>, options:DuelOptions)=>{
        advance:(elapsed:number,speed:number)=>DuelSummary;
        snapshot:(chase:boolean)=>Snapshot;
        summary:()=>DuelSummary;replay:DuelReplay;
    }};
    flightDuel: {create:(options?:DuelOptions)=>Duel;run:(options?:DuelOptions)=>Duel;replay:(record:DuelReplay)=>Duel;readWatchSearch:(search:string)=>Required<DuelOptions>|null;styles:OpponentStyle[];starts:string[];dt:number};
    flightAI: {
        version: string;
        flavors: Record<'novice'|'practiced'|'expert', {reaction:number;sample:number;noise:number;gain:number;damping:number;lead:number}>;
        create: (category:'perfect'|'human', flavor?:'novice'|'practiced'|'expert', seed?:number) => {
            category:'perfect'|'human'; flavor:string; version:string; observation:string;
            step:(time:number, own:FlightState, target:Pick<FlightState,'eye'|'velocity'>, profile:Profile, weapon:Weapon)=>PilotInput;
        };
        validate:(input:PilotInput)=>PilotInput;
        solution:(own:FlightState, position:Vector, velocity:Vector, weapon:Weapon)=>{point:Vector;range:number;dot:number;time:number;valid:boolean};
        copy:(state:FlightState)=>FlightState;
    };
    flightDialogue: Pick<ExperimentModules['flightComms'], 'compose' | 'numberWords' | 'contactData' | 'pickLine' | 'voiceOptions' | 'pilotVoice'> & {
        lines: Record<string, string[]>;
        calls: Record<string, string[]>;
        emotionalLines: Record<string, string[]>;
        emotionalReplies: Record<string, string[]>;
        acknowledgments: Record<string, string[]>;
        emotionStrength: Record<string, number>;
        pilotCast: number[][];
        templates: Record<string, string[]>;
    };
    flightRadio: {
        mount: ExperimentModules['flightComms']['mount'];
    };
    experimentDom: (document: Document) => ElementsGetter;
    arcade: {
        profiles: Profile[];
        create: (radius: number) => FlightState;
        createSortie: (radius: number, profile: Profile) => FlightState;
        step: (state: FlightState, profile: Profile, input: FlightInput, dt: number) => FlightState;
        contact: (state: FlightState, point: Vector, radius: number) => boolean;
    };
    flightGuns: {
        create: () => Guns;
        step: (guns: Guns, pose: Pose, weapon: Weapon, trigger: boolean, dt: number, hitTest?: (start: Vector, end: Vector, bolt: Bolt) => Vector | null, aimPoint?: () => Vector | null, mountCount?: number, anchors?: Vector[]) => void;
        intersect: (start: Vector, end: Vector, radius: number, field: (point: Vector) => number) => Vector | null;
        geometry: (guns: Pick<Guns, 'bolts' | 'impacts'>, pose: Pose) => Batch[];
    };
    training: {
        stepControlled: (combat: Combat, controls: Demand, weapon: Weapon, dt: number, radius: number, terrainHit?: TerrainHit, afterCombat?: () => void) => {playerDamaged: boolean; fired: boolean; impact: boolean};
        stepInput: (craft: Craft, controls: Demand, dt: number) => void;
        damageCraft: (combat: Combat, craft: Craft, weapon: Weapon, shooter?: Craft | string | null) => void;
        createCraft: (id: string, pose: FlightState, team: string) => Craft;
        participants: (combat: Combat) => Craft[];
        gunAnchors: (craft: Craft) => Vector[] | undefined;
        configureHulls: (combat: Combat, ally: string, enemy: string) => void;
        bindPlayer: (combat: Combat, pose: FlightState) => Craft;
        hullHit: (craft: Craft, start: Vector, end: Vector, boltRadius?: number) => Hit | null;
        convergencePoint: (combat: Combat, shooter: Craft, weapon: Weapon, terrainHit?: TerrainHit) => Vector | null;
        defaultWeapon:(profile:Profile)=>number;
        configure:(combat:Combat,profile:Profile,unshielded?:boolean)=>void;
        equip:(craft:Craft,profile:Profile,weaponIndex:number,unshielded?:boolean)=>void;
        callsign: (craft?: Identity | null) => string;
        create: (mode: string) => Combat;
        alive: (combat: Pick<Combat, 'enemies'>) => Craft[];
        spawn: (combat: Combat, player: FlightState, radius: number) => void;
        stepWrecks: (combat: Combat, dt: number, terrainHit?: TerrainHit) => void;
        steer: (pose: Pose, goal: Vector) => FlightInput;
        intercept: (origin: Vector, position: Vector, velocity: Vector, speed: number) => {
            point: Vector;
            time: number;
        };
        sphereHit: (start: Vector, end: Vector, center: Vector, radius: number) => Hit | null;
        damageEnemy: (combat: Combat, craft: Craft, weapon: Weapon, shooter?: Craft | string | null) => void;
        damagePlayer: (combat: Combat, weapon: Weapon) => void;
        trace: (combat: Combat, start: Vector, end: Vector, bolt: Bolt, team: Craft | string, terrainHit: TerrainHit | undefined, player: FlightState) => Vector | null;
        step: (combat: Combat, player: FlightState, dt: number, radius: number, terrainHit?: TerrainHit) => void;
        cycle: (combat: Combat) => void;
        acquireTarget: (combat: Combat, state: FlightState) => void;
        toggleTargetLock: (combat: Combat) => void;
        geometry: (combat: {
            enemies: (ArtCraft & {
                hp: number;
            })[];
        }) => Batch[];
        allGuns: (combat: Combat, playerGuns: Guns) => Pick<Guns, 'bolts' | 'impacts'>;
    };
    shipPackModels: {
        find: (id: string) => {
            pack: Pack;
            model: Model;
        } | null;
        geometry: (model: Pick<Model, 'vertices'>, poses: Pose[], units: number) => Batch[];
        detailedGeometry: (model: Model, poses: Pose[], units: number) => Batch[];
        mixedModel: (index: number, wave: number) => Model | null;
        fleetGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number) => Batch[];
        sourceDraw: (model: Model, pose: Pose, units: number, texture?: HTMLImageElement, paint?: Vector) => Batch;
        sourceGeometry: (model: Model, poses: Pose[], units: number, texture?: HTMLImageElement, paint?: Vector) => Batch;
        sourceFleetGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number, images: Images, paint?: Vector, transforms?: boolean) => Batch[];
        loadTextures: () => Promise<Images>;
        gunAnchors: (model: Model) => Vector[];
        engineAnchors: (model: Model) => number[][];
        engineGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number, view: Pose, time: number) => Batch;
        craftModel: (craft: ArtCraft, selection: string, wave: number) => Model;
        hullHit: (model: Model, pose: Pose, start: Vector, end: Vector, units: number, boltRadius?: number) => HullHit | null;
        addScorch: (craft: ArtCraft, hit: HullHit) => void;
        scorchGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number) => Batch[];
        populate: (select: HTMLSelectElement, blockout?: boolean) => void;
        paintColor: (hex: string) => Vector | undefined;
    };
    flightInput: {
        deadzone: (value: number, zone: number) => number;
        moveStick: (position: number[], dx: number, dy: number, range: number, sensitivity: number) => number[];
        stickDemand: (position: number[], zone: number, exponent?: number) => number[];
        defaults: (standard: boolean, deviceId?: string) => Mapping;
        read: (pad: Gamepad, map: Mapping) => PadDemand;
    };
    flightPerformance: {
        pacer: () => Pacer;
        due: (clock: Pacer, now: number, fps: number) => boolean;
        create: () => Measurements;
        record: (stats: Measurements, interval: number, cpu: number) => void;
        summary: (stats: Measurements) => {
            fps: number;
            frame: number;
            p95: number;
            worst: number;
            cpu: number;
        };
    };
    flightSkybox: {
        stars: () => Float32Array;
        project: (direction: Vector, pose: Pose, aspect: number) => {
            x: number;
            y: number;
        } | null;
        create: (host: HTMLElement) => {
            getRenderStats: () => RenderStats['sky'];
            render: (pose: Pose, renderScale: number, empty: boolean) => void;
        };
    };
    flightRadar: {
        project: (state: Pose, point: Vector, units: number, range: number) => {
            x: number;
            y: number;
            altitude: number;
            distance: number;
        } | null;
        speakerHalo: (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => void;
        draw: (ctx: CanvasRenderingContext2D, state: Pose, contacts: RadarContact[], units: number, range: number, w: number, h: number, paused: boolean) => void;
    };
    flightControls: {
        mount: (host: HTMLElement, actions: ControlActions, environment?: ControlEnvironment) => {
            haptics: (dt: number, feedback: {boost?: boolean; hit?: boolean; shieldBreak?: boolean; fire?: boolean; contact?: boolean}) => void;
            sample: () => Demand;
            view: () => {
                mouse: number[];
                inputMode: string;
                showMouseStick: boolean;
                stickRange: number;
            };
            clear: () => void;
            resetButtons: () => void;
            capture: () => void;
            release: () => void;
        };
    };
    flightSession: {
        rotateVector: (vector: number[], angle: number) => number[];
        create: (environment: SessionEnvironment) => {
            snapshot: () => Snapshot;
            reset: (config: {
                mode: string;
                enabled: boolean;
                profile: Profile;
            }) => Snapshot;
            setCombat: (mode: string, enabled: boolean) => Snapshot;
            setAsteroidDiameter: (meters: number) => boolean;
            setStartPosition: (eye: number[]) => void;
            setOpponentStyle: (style: OpponentStyle) => void;
            configureHulls: (ally: string, enemy: string) => void;
            acquireTarget: () => void;
            toggleTargetLock: () => void;
            nextTarget: () => void;
            advanceScenery: (elapsed: number) => void;
            advance: (elapsed: number, controls: Demand, config: {
                profile: Profile;
                weapon: Weapon;
            }) => Snapshot;
            setWorld: (world: World) => void;
        };
    };
    miningStudyCrew?: {
        poses: Record<'standing' | 'servicing', {vertices: number[]; color: [number,number,number]}[]> | null;
        error: string | null;
    };
    flightPresentation: {
        tetherSpin: (lengthKm: number, mode: string) => {tipSpeed: number; angularSpeed: number; periodSeconds: number; tipG: number};
        tetherGeometry: (lengthKm: number) => Batch[];
        model: (craft: ArtCraft, wave: number, appearance: Pick<Appearance, 'allyArt' | 'enemyArt'>) => Model;
        mount: (host: HTMLElement, getWorld: () => World, setWorld: (world: World) => void, environment?: {
            document: Document;
        }) => {
            appearance: () => Appearance;
            pose: (state: Pose) => void;
            render: (view: FlightView, appearance: Appearance, comparison: Comparison, elapsed: number) => void;
            renderStats: () => RenderStats;
        };
    };
    flightDiagnostics: {
        mount: (environment?: {
            document: Document;
            performance: Pick<Performance, 'now'>;
        }) => {
            beginFrame: (t: number, paused: boolean) => Frame | null;
            endFrame: (frame: Frame, paused: boolean, comparison: Comparison, readStats: () => RenderStats) => void;
            settings: () => Comparison;
            reset: () => void;
            resetSimulationClock: () => void;
            toggleDiagnostics: () => void;
            togglePerformance: () => void;
        };
    };
    flightTargetCamera: {
        radius: (model: Model) => number;
        mount: (host: HTMLElement) => {
            update: (target: Craft, selection: string, wave: number, units: number, images: Images, paint: Vector | undefined, view: Pose, time: number) => void;
        };
    };
    flightHud: {
        paintTargetBearing: (ctx: CanvasRenderingContext2D, w: number, h: number, angle: number) => void;
        targetStatus: (previous: TargetStatus | null, target: {id: string; shield?: number; maxShield?: number; hp: number; maxHp: number} | undefined, time: number) => TargetStatus | null;
        paintTargetStatus: (ctx: CanvasRenderingContext2D, x: number, y: number, status: TargetStatus) => void;
        mount: (host: HTMLElement) => {
            render: (view: HudView) => void;
            cycleRadarRange: () => void;
        };
    };
    mumble: {
        defaults: Voice;
        presets: Record<string, Partial<Voice>>;
        analyze: (text: string, options?: Partial<Voice>) => SpeechPlan;
        render: (plan: SpeechPlan, sampleRate?: number, options?: {
            style?: string;
        }) => Float32Array;
        radioNoise: (speechSamples: number, sampleRate: number, options?: TransmissionOptions) => RadioNoise;
        radioNoiseAt: (pattern: RadioNoise, time: number) => {strength: number; squelch: number; burst: number; chirp: number; carrier: number};
        transmit: (samples: Float32Array, sampleRate: number, options?: TransmissionOptions) => {
            samples: Float32Array;
            speechOffset: number;
            duration: number;

        };
    };
    flightComms: {
        create: () => CommsState;
        step: (state: CommsState, dt: number, combat: Combat, busy: boolean, random?: () => number, player?: FlightState) => Line | null;
        compose: (kind: string, data: LineData) => Choices;
        numberWords: (value: unknown) => string;
        contactData: (player: Pose | undefined, point: Vector) => Contact | null;
        pickLine: (state: CommsState, choices: Choices, random: () => number) => string;
        voiceOptions: (preset: Partial<Voice>, emotion?: Feeling) => Partial<Voice>;
        pilotVoice: (craft?: Identity | null) => Partial<Voice> & {
            seed: number;
        };
        mount: (panel: HTMLElement, toggle: HTMLElement) => {
            speakerId: () => string | null;
            unlock: () => void;
            pause: () => void;
            reset: () => void;
            update: (dt: number, combat: Combat, player: FlightState) => void;
        };
    };
};
export type Elements = {
    'watch-profile':HTMLSelectElement;
    'watch-opponent-profile':HTMLSelectElement;
    'watch-weapon':HTMLSelectElement;
    'watch-defense':HTMLSelectElement;
    'watch-art':HTMLSelectElement;
    'watch-enemy-art':HTMLSelectElement;
    'watch-pilot': HTMLSelectElement;
    'watch-start': HTMLSelectElement;
    'watch-style': HTMLSelectElement;
    'watch-skill': HTMLSelectElement;
    'watch-seed': HTMLInputElement;
    'watch-speed': HTMLSelectElement;
    'watch-camera': HTMLSelectElement;
    'watch-panel': HTMLElement;
    'watch-play': HTMLButtonElement;
    'watch-restart': HTMLButtonElement;
    'watch-readout': HTMLElement;
    'controller-layout': HTMLElement;
    'steering-preset': HTMLSelectElement;
    'volume': HTMLInputElement;
    'breath': HTMLInputElement;
    'tremor': HTMLInputElement;
    'roughness': HTMLInputElement;
    'variation': HTMLInputElement;
    'enunciation': HTMLInputElement;
    'speed': HTMLInputElement;
    'contour': HTMLInputElement;
    'clipping': HTMLInputElement;
    'creak': HTMLInputElement;
    'nasality': HTMLInputElement;
    'brightness': HTMLInputElement;
    'formant3': HTMLInputElement;
    'formant2': HTMLInputElement;
    'formant1': HTMLInputElement;
    'resonance': HTMLInputElement;
    'pitch': HTMLInputElement;
    'ally-art': HTMLSelectElement;
    'ally-color': HTMLInputElement;
    'ally-credit': HTMLElement;
    'art-credit': HTMLElement;
    'bindings': HTMLElement;
    'channel': HTMLSelectElement;
    'combat-mode': HTMLSelectElement;
    'combat-status': HTMLElement;
    'combat-toggle': HTMLInputElement;
    'comms': HTMLElement;
    'comms-history': HTMLElement;
    'comms-voice': HTMLButtonElement;
    'controls': HTMLElement;
    'deadzone': HTMLInputElement;
    'rumble': HTMLInputElement;
    'device': HTMLSelectElement;
    'device-live': HTMLElement;
    'device-status': HTMLElement;
    'dialogue-size': HTMLInputElement;
    'diameter': HTMLInputElement;
    'draw-enemies': HTMLInputElement;
    'draw-mothership': HTMLInputElement;
    'emotion': HTMLSelectElement;
    'enemy-art': HTMLSelectElement;
    'enemy-color': HTMLInputElement;
    'face': HTMLElement;
    'faction-paint': HTMLInputElement;
    'flat-materials': HTMLInputElement;
    'fly': HTMLButtonElement;
    'fps-cap': HTMLSelectElement;
    'gun': HTMLSelectElement;
    'gun-stats': HTMLElement;
    'hud-help': HTMLElement;
    'hull-meter': HTMLMeterElement;
    'input-mode': HTMLSelectElement;
    'instruments': HTMLElement;
    'integrity': HTMLElement;
    'launch': HTMLElement;
    'metadata': HTMLElement;
    'military-paints': HTMLElement;
    'mouth': HTMLElement;
    'paint-color': HTMLInputElement;
    'paint-enabled': HTMLInputElement;
    'perf-enabled': HTMLInputElement;
    'perf-overlay': HTMLElement;
    'perf-reset': HTMLButtonElement;
    'play': HTMLButtonElement;
    'preset': HTMLSelectElement;
    'profile': HTMLSelectElement;
    'provenance': HTMLAnchorElement;
    'radio-effects': HTMLInputElement;
    'radio-effects-value': HTMLOutputElement;
    'rear-view': HTMLButtonElement;
    'render-mode': HTMLSelectElement;
    'render-scale': HTMLSelectElement;
    'reset': HTMLButtonElement;
    'reset-view': HTMLButtonElement;
    'restart-training': HTMLButtonElement;
    'reticle': HTMLElement;
    'sample': HTMLButtonElement;
    'seed': HTMLInputElement;
    'sensitivity': HTMLInputElement;
    'shield-meter': HTMLMeterElement;
    'ship-model': HTMLSelectElement;
    'show-engines': HTMLInputElement;
    'source': HTMLAnchorElement;
    'speaker': HTMLElement;
    'speed-value': HTMLElement;
    'spin': HTMLButtonElement;
    'stats': HTMLElement;
    'status': HTMLElement;
    'stop': HTMLButtonElement;
    'subtitle': HTMLElement;
    'target-camera': HTMLElement;
    'target-detail': HTMLElement;
    'target-hull': HTMLMeterElement;
    'target-shield': HTMLMeterElement;
    'target-info': HTMLElement;
    'target-label': HTMLElement;
    'telemetry': HTMLElement;
    'test-radio': HTMLButtonElement;
    'text': HTMLTextAreaElement;
    'thrust-meter': HTMLMeterElement;
    'thrust-value': HTMLElement;
    'viewer': HTMLElement;
    'wave': HTMLCanvasElement;
    'weapon-name': HTMLElement;
    'weapons': HTMLElement;
};
export type ElementsGetter = <K extends keyof Elements>(id: K) => Elements[K];
export type VoiceNumberKey = Exclude<keyof Voice, "compactWords" | "emotion">;
declare module '../src/types' {
    interface DriftworksNamespace extends Partial<ExperimentModules> {
        fighterCockpit?: {crew:{vertices:number[];color:[number,number,number];name:string}[];chair:{vertices:number[];color:[number,number,number];name:string}[]};
        retailFlightProfiles?: Profile[];
        retailWeapons?: Weapon[];
        shipPacks?: Pack[];
        originalShipModels?: {id:string;name:string;author:string;provenance:string;study:string;geometry:(units:number)=>Batch[]}[];
    }
}
