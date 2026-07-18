/** Shared 1-hole par-3 layout. Units are metres. Y is up. */

export type Vec3 = { x: number; y: number; z: number };

/** Constants aligned with Super Video Golf GameConsts / BallSystem / Terrain. */
export const BALL_RADIUS = 0.0215;
export const HOLE_RADIUS = 0.058;
export const ATTRACT_RADIUS = HOLE_RADIUS * 1.35;
export const ATTRACT_STRENGTH = 30;
export const CUP_DEPTH = BALL_RADIUS * 2 * 2.1;
export const GRAVITY = -9.8;
export const MIN_VELOCITY_SQR = 0.001;
export const MIN_ROLL_VY = -0.15;
export const BALL_TURN_DELAY = 2.5;
export const GIMME_RADIUS = 0.65; // leather gimme
export const MAX_STROKES = 12;

export const RESTITUTION: Record<string, number> = {
  tee: 0.33,
  fairway: 0.33,
  green: 0.28,
  rough: 0.23,
  bunker: 0,
  water: 0,
  oob: 0,
};

/** Per-frame velocity multiply while rolling (SVG BallSystem). */
export const FRICTION_MUL: Record<string, number> = {
  tee: 0.96,
  fairway: 0.96,
  green: 0.986,
  rough: 0.1,
  bunker: 0.1,
  water: 0.001,
  oob: 0.001,
};

/** Strike dampening from Terrain.hpp. */
export const STRIKE_DAMPENING: Record<string, number> = {
  tee: 1,
  fairway: 1,
  green: 1,
  rough: 0.95,
  bunker: 0.94,
  water: 1,
  oob: 1,
};

export const COURSE = {
  name: 'Placeholder Links — Hole 1',
  par: 3,
  strokeCap: MAX_STROKES,
  tee: { x: 0, y: 0.05, z: 0 } as Vec3,
  pin: { x: 0, y: 0.15, z: -95 } as Vec3,
  holeRadius: HOLE_RADIUS,
  green: {
    center: { x: 0, y: 0, z: -95 } as Vec3,
    radius: 10,
    height: 0.15,
  },
  fairway: {
    minX: -12,
    maxX: 12,
    minZ: -110,
    maxZ: 8,
  },
  rough: {
    minX: -28,
    maxX: 28,
    minZ: -120,
    maxZ: 18,
  },
  bunker: {
    center: { x: 8, y: 0, z: -72 } as Vec3,
    radius: 4.5,
  },
  water: {
    minX: -18,
    maxX: -4,
    minZ: -55,
    maxZ: -40,
    surfaceY: -0.35,
  },
  bounds: {
    minX: -40,
    maxX: 40,
    minZ: -130,
    maxZ: 25,
  },
} as const;

export type TerrainKind = 'tee' | 'fairway' | 'green' | 'rough' | 'bunker' | 'water' | 'oob';

export function horizontalDist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function pointInRect(
  x: number,
  z: number,
  r: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function terrainAt(x: number, z: number): TerrainKind {
  const { green, fairway, rough, bunker, water, bounds, tee } = COURSE;

  if (!pointInRect(x, z, bounds)) return 'oob';
  if (pointInRect(x, z, water)) return 'water';

  const toBunker = Math.hypot(x - bunker.center.x, z - bunker.center.z);
  if (toBunker <= bunker.radius) return 'bunker';

  const toGreen = Math.hypot(x - green.center.x, z - green.center.z);
  if (toGreen <= green.radius) return 'green';

  const toTee = Math.hypot(x - tee.x, z - tee.z);
  if (toTee < 3) return 'tee';

  if (pointInRect(x, z, fairway)) return 'fairway';
  if (pointInRect(x, z, rough)) return 'rough';
  return 'oob';
}

/** Shared height field — client mesh must use the same formula. */
export function groundHeight(x: number, z: number): number {
  const t = terrainAt(x, z);
  if (t === 'water') return COURSE.water.surfaceY;
  if (t === 'green') {
    // Cup well: drop inside hole radius so the ball can fall in
    const d = Math.hypot(x - COURSE.pin.x, z - COURSE.pin.z);
    if (d < HOLE_RADIUS) {
      return COURSE.green.height - CUP_DEPTH;
    }
    // Slight lip around cup
    if (d < HOLE_RADIUS * 1.8) {
      const u = (d - HOLE_RADIUS) / (HOLE_RADIUS * 0.8);
      return COURSE.green.height - CUP_DEPTH * (1 - u) * 0.15;
    }
    return COURSE.green.height;
  }
  if (t === 'bunker') return -0.08;
  if (t === 'tee') return 0.05;
  if (t === 'oob') return 0.02;
  // Fairway / rough undulation (must match Course.ts mesh)
  const along = Math.max(0, -z) / 100;
  return 0.02 + Math.sin(x * 0.15) * 0.04 * (1 - along) + along * 0.08;
}

export function terrainLabel(t: TerrainKind): string {
  switch (t) {
    case 'tee':
      return 'Tee';
    case 'fairway':
      return 'Fairway';
    case 'green':
      return 'Green';
    case 'rough':
      return 'Rough';
    case 'bunker':
      return 'Bunker';
    case 'water':
      return 'Water';
    case 'oob':
      return 'Out of bounds';
  }
}
