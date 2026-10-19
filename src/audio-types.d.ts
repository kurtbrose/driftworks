
type FlightMix = import('./engine-types').FlightMix;
export type MixerOptions = {getMaster: () => number; setMaster: (value: number) => void};
export type AudioMixer = {
  get: () => FlightMix; set: (value: Partial<FlightMix>) => void;
  setCommsActive: (value: boolean) => void; impact: () => void;
  mount: (host: HTMLElement) => void;
  attach: (context: AudioContext, effects: GainNode, master: GainNode, destination: AudioNode) => void;
  normalize: (value: Partial<FlightMix>) => FlightMix;
  levels: (value: FlightMix, speech: boolean, hit: boolean) => {engine:number; weapons:number; impacts:number; comms:number};
  channel: (name: 'engine'|'weapons'|'impacts'|'comms') => GainNode | null;
};
export type MixerTools = {create: (options: MixerOptions) => AudioMixer};
