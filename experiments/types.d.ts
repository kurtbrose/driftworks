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
export type Weapon = {
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
export type Craft = ArtCraft & {
    id: string;
    callsign: string;
    pose: FlightState;
    profile: Profile;
    hp: number;
    maxHp: number;
    pilot: string;
    skill: number;
    mode: string;
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
    lastHit: number;
    hitFlash: number;
    dead: boolean;
    targetId: string | null;
    slots: string[];
    slotTimer: number;
    flashes: Impact[];
    radioEvents: RadioEvent[];
    radioSerial: number;
    playerKills: number;
    nearMissAt?: number;
    hullHit?: (craft: Craft, start: Vector, end: Vector) => Hit | null;
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
    vertices: Float32Array;
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
};
export type HudView = FlightView & Appearance & {
    asteroid: Asteroid;
    mothership: Ship;
    units: number;
    paused: boolean;
    mouse: number[];
    inputMode: string;
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
export type Mapping = Record<'pitch' | 'yaw' | 'roll' | 'throttle' | 'fire' | 'boost' | 'bank' | 'pause' | 'up' | 'down' | 'deadzone', number> & Record<'pitchInvert' | 'yawInvert' | 'rollInvert' | 'throttleInvert', boolean>;
export type PadDemand = {
    pitch: number;
    yaw: number;
    roll: number;
    throttle: number | null;
    throttleRate: number;
    fire: boolean;
    boost: boolean;
    bank: boolean;
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
    hullHit: NonNullable<Combat['hullHit']>;
    terrainHit: TerrainHit;
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
export type TransmissionOptions = {
    mode?: string;
    speechDuration?: number;
    volume?: number;
    effects?: number;
    seed?: number;
    staticBursts?: boolean;
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
    emotionalConversation: {
        caller: string;
        emotion: string;
        expires: number;
    } | null;
};
export type Line = {
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
export type ExperimentModules = {
    flightDialogue: Pick<ExperimentModules['flightComms'], 'compose' | 'numberWords' | 'contactData' | 'pickLine' | 'voiceOptions' | 'pilotVoice'> & {
        lines: Record<string, string[]>;
        calls: Record<string, string[]>;
        emotionalLines: Record<string, string[]>;
        emotionalReplies: Record<string, string[]>;
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
        step: (guns: Guns, pose: Pose, weapon: Weapon, trigger: boolean, dt: number, hitTest?: (start: Vector, end: Vector, bolt: Bolt) => Vector | null) => void;
        intersect: (start: Vector, end: Vector, radius: number, field: (point: Vector) => number) => Vector | null;
        geometry: (guns: Pick<Guns, 'bolts' | 'impacts'>, pose: Pose) => Batch[];
    };
    training: {
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
        sourceGeometry: (model: Model, poses: Pose[], units: number, texture?: HTMLImageElement, paint?: Vector) => Batch;
        sourceFleetGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number, images: Images, paint?: Vector) => Batch[];
        loadTextures: () => Promise<Images>;
        engineAnchors: (model: Model) => number[][];
        engineGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number, view: Pose, time: number) => Batch;
        craftModel: (craft: ArtCraft, selection: string, wave: number) => Model;
        hullHit: (model: Model, pose: Pose, start: Vector, end: Vector, units: number) => HullHit | null;
        addScorch: (craft: ArtCraft, hit: HullHit) => void;
        scorchGeometry: (craft: ArtCraft[], selection: string, wave: number, units: number) => Batch[];
        populate: (select: HTMLSelectElement, blockout?: boolean) => void;
        paintColor: (hex: string) => Vector | undefined;
    };
    flightInput: {
        deadzone: (value: number, zone: number) => number;
        moveStick: (position: number[], dx: number, dy: number, range: number, sensitivity: number) => number[];
        stickDemand: (position: number[], zone: number) => number[];
        defaults: (standard: boolean) => Mapping;
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
            sample: () => Demand;
            view: () => {
                mouse: number[];
                inputMode: string;
                stickRange: number;
            };
            clear: () => void;
            resetButtons: () => void;
            capture: () => void;
            release: () => void;
        };
    };
    flightSession: {
        create: (environment: SessionEnvironment) => {
            snapshot: () => Snapshot;
            reset: (config: {
                mode: string;
                enabled: boolean;
                profile: Profile;
            }) => Snapshot;
            setCombat: (mode: string, enabled: boolean) => Snapshot;
            advance: (elapsed: number, controls: Demand, config: {
                profile: Profile;
                weapon: Weapon;
            }) => Snapshot;
            setWorld: (world: World) => void;
        };
    };
    flightPresentation: {
        model: (craft: ArtCraft, wave: number, appearance: Pick<Appearance, 'allyArt' | 'enemyArt'>) => Model;
        mount: (host: HTMLElement, getWorld: () => World, setWorld: (world: World) => void, environment?: {
            document: Document;
        }) => {
            appearance: () => Appearance;
            hullHit: (craft: Craft, start: Vector, end: Vector, wave: number) => HullHit | null;
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
        retailFlightProfiles?: Profile[];
        retailWeapons?: Weapon[];
        shipPacks?: Pack[];
    }
}
