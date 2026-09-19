/** Shared, checkable contracts for the plain-JavaScript simulation. */

export type Vec2 = { x: number; y: number };

export type EntityRef =
  | { kind: 'ship'; id: string }
  | { kind: 'wreck'; id: string }
  | { kind: 'asteroid'; id: string };

export type Formation = {
  spacing: number;
  looseness: number;
  rotation: number;
};

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; target: Vec2 }
  | { kind: 'return'; target: Vec2; automatic?: boolean }
  | { kind: 'recover'; recoveryTarget: EntityRef; target: Vec2 }
  | { kind: 'retrieve-platform'; platformId: string; target: Vec2 }
  | { kind: 'deploy'; asteroidId: string; platformId: string; target: Vec2; siteAngle: number; siteDepth: number }
  | { kind: 'mine'; asteroidId: string }
  | { kind: 'build'; target: Vec2 }
  | {
      kind: 'defend';
      anchor: Vec2;
      anchorShipId: string | null;
      groupId: number;
      offset: Vec2;
      side: number;
      formation?: Formation;
    };

export type Ship = {
  id: string;
  name: string;
  type: string;
  position: Vec2;
  order: Order;
  disabled: boolean;
  docked: boolean;
  speed: number;
  towTarget: EntityRef | null;
  velocity: Vec2;
  propulsion?: Propulsion;
};

export type Propulsion = {
  capacityKg: number;
  fuelKg: number;
  exhaustMps: number;
};

export type World = {
  time: number;
  nextFormationId: number;
  ships: Ship[];
  asteroids: unknown[];
  platforms: unknown[];
  wrecks: unknown[];
  formations: Record<number, Formation>;
};

export type PropulsionApi = {
  initialize: (ship: Ship) => void;
  remaining: (ship: Ship, massKg: number) => number;
  burn: (ship: Ship, massKg: number, deltaMps: number) => number;
  canCatch: (position: Vec2, velocity: Vec2, home: { position: Vec2; velocity: Vec2 }, radius: number, unitsToMps: number) => boolean;
  exchangeMps: number;
};

export type DriftworksNamespace = {
  propulsion?: PropulsionApi;
  [key: string]: unknown;
};

declare global {
  interface Window {
    Driftworks: DriftworksNamespace;
  }
}
