
export type EngineTuning = Record<'bass'|'whine'|'roar'|'texture'|'burner'|'pitch'|'spool'|'flutter'|'volume', number> & { perspective: 'cockpit'|'exterior' };
export type EngineDemand = { throttle: number; thrust?: number; acceleration?: number; afterburner?: boolean; damage?: number; maneuver?: number; active?: boolean };
export type EngineState = { spool: number; surge?: number; boost: number; ignition: boolean; held?: boolean; active: boolean };
export type EngineVoice = { update: (dt: number, demand: EngineDemand) => EngineState; tune: (tuning: Partial<EngineTuning>) => void; stop: () => void; dispose: () => void };
export type EnginePreset = { name: string; description: string; tuning: EngineTuning };
export type EngineTools = {
  presets: EnginePreset[];
  normalize: (value: Partial<EngineTuning>) => EngineTuning;
  step: (state: EngineState, dt: number, demand: EngineDemand, tuning: EngineTuning) => EngineState;
  create: (ctx: AudioContext, destination: AudioNode, tuning?: Partial<EngineTuning>) => EngineVoice;
  load: () => EngineTuning;
  save: (tuning: EngineTuning) => boolean;
};

export type FlightMix = { engine: number; weapons: number; impacts: number; comms: number; ducking: boolean };
