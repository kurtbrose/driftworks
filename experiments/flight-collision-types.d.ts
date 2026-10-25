import type {Bolt, Combat, Craft, Vector} from './types';

export type CollisionMode = 'legacy' | 'grid' | 'tree' | 'grid-events' | 'tree-events';
// Read-only view used by narrow-phase tracing; positions/radii use scene units.
// Indices and queues stay private.
export type CollisionCandidate = Readonly<{craft: Craft; x: number; y: number; z: number; r: number}>;
export type FlightCollisionApi = {
    // Returned radius is the projectile head radius in metres.
    query: (combat: Combat, start: Vector, end: Vector, bolt: Bolt, team: Craft | string) => {
        candidates: CollisionCandidate[]; shooter: Craft | undefined; faction: string; radius: number;
    };
    nearby: (candidate: CollisionCandidate, start: Vector, end: Vector, margin: number) => boolean;
    // Craft hull bound in scene units, matching candidate coordinates.
    radius: (craft: Craft) => number;
    setMode: (combat: Combat, mode: CollisionMode) => void;
    batch: <T>(combat: Combat, work: () => T) => T;
    changed: (combat: Combat, craft?: Craft) => void;
    moved: (combat: Combat, craft: Craft) => void;
    stats: (combat: Combat) => {
        mode: string; queued: number; syncs: number; moves: number; queries: number;
        reuses: number; popped: number; wakes: number;
    };
};
