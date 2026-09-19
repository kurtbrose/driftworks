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
  physical?: { lengthM: number; dryMassKg: number; thrustN: number };
  cargo?: number;
  platformId?: string | null;
  carryingSection?: boolean;
  turnRate: number;
  acceleration: number;
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
  asteroids: Asteroid[];
  platforms: Platform[];
  wrecks: Wreck[];
  mothership?: { storage: { ore: number; constructionMass: number; depotSections: number } };
  formations: Record<number, Formation>;
};

export type Asteroid = { id: string; position: Vec2; radius: number; angularVelocity?: number };
export type Platform = { id: string; state: string; position: Vec2; asteroidId?: string | null };
export type Wreck = { id: string; position: Vec2; physical?: { dryMassKg: number }; massKg?: number; propulsion?: Propulsion; cargo?: number };

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
