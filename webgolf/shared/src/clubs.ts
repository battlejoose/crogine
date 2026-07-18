/** Club table ported from Super Video Golf Clubs.hpp / Clubs.cpp (casual/mid power row). */

export type ClubId =
  | 'driver'
  | 'wood3'
  | 'wood5'
  | 'iron4'
  | 'iron5'
  | 'iron6'
  | 'iron7'
  | 'iron8'
  | 'iron9'
  | 'pitch'
  | 'lob'
  | 'gap'
  | 'sand'
  | 'putter';

export type ClubDef = {
  id: ClubId;
  name: string;
  /** Launch loft in degrees (SVG stores as radians at runtime). */
  loftDeg: number;
  /** Impulse strength (casual/mid row from ClubStats). */
  power: number;
  /** Nominal carry/target distance in metres. */
  target: number;
};

const DEG = Math.PI / 180;

export const CLUBS: ClubDef[] = [
  { id: 'driver', name: 'Driver', loftDeg: 28.992, power: 47.199, target: 220 },
  { id: 'wood3', name: '3 Wood', loftDeg: 32.315, power: 41.344, target: 180 },
  { id: 'wood5', name: '5 Wood', loftDeg: 34.721, power: 37.172, target: 150 },
  { id: 'iron4', name: '4 Iron', loftDeg: 37.586, power: 35.149, target: 140 },
  { id: 'iron5', name: '5 Iron', loftDeg: 37.128, power: 33.869, target: 130 },
  { id: 'iron6', name: '6 Iron', loftDeg: 36.326, power: 32.85, target: 120 },
  { id: 'iron7', name: '7 Iron', loftDeg: 35.924, power: 31.33, target: 110 },
  { id: 'iron8', name: '8 Iron', loftDeg: 35.924, power: 29.91, target: 100 },
  { id: 'iron9', name: '9 Iron', loftDeg: 35.523, power: 28.4, target: 90 },
  { id: 'pitch', name: 'Pitch Wedge', loftDeg: 56.895, power: 25.491, target: 70 },
  { id: 'lob', name: 'Lob Wedge', loftDeg: 52, power: 21.001, target: 50 },
  { id: 'gap', name: 'Gap Wedge', loftDeg: 62.452, power: 17.691, target: 30 },
  { id: 'sand', name: 'Sand Wedge', loftDeg: 60, power: 10.3, target: 10 },
  { id: 'putter', name: 'Putter', loftDeg: 0, power: 9.11, target: 10 },
];

export const CLUB_BY_ID: Record<ClubId, ClubDef> = Object.fromEntries(
  CLUBS.map((c) => [c.id, c]),
) as Record<ClubId, ClubDef>;

export function clubLoftRad(club: ClubDef): number {
  return club.loftDeg * DEG;
}

/** SVG InputParser: MinPower + MaxPower * easeInSine(power). */
export function swingPowerFactor(uiPower: number): number {
  const p = Math.min(0.99, Math.max(0.01, uiPower));
  const eased = 1 - Math.cos((p * Math.PI) / 2); // easeInSine
  return 0.01 + 0.99 * eased;
}

/** Putter target scales down near the hole (ShortRange / TinyRange). */
export function putterTargetMetres(distanceToPin: number): number {
  const base = 10;
  if (distanceToPin > base) return base * 2.5; // 25 m long putter
  if (distanceToPin < base * (1 / 10) * 0.65) return base / 10;
  if (distanceToPin < base * (1 / 3) * 0.8) return base / 3;
  return base;
}

export function clubPowerForShot(club: ClubDef, distanceToPin: number): number {
  if (club.id === 'putter') {
    const t = putterTargetMetres(distanceToPin);
    // power scales with selected putter range (base power 9.11 @ 10 m)
    return club.power * (t / 10);
  }
  return club.power;
}

export function clubTargetForShot(club: ClubDef, distanceToPin: number): number {
  if (club.id === 'putter') return putterTargetMetres(distanceToPin);
  return club.target;
}

/**
 * Auto-select: walk from sand wedge upward until target * 1.04 >= distance
 * (mirrors SVG club search). On green, force putter.
 */
export function autoSelectClub(
  distanceToPin: number,
  terrain: string,
  allowPutterOffGreen: boolean,
): ClubId {
  if (terrain === 'green' || (allowPutterOffGreen && distanceToPin < 10)) {
    return 'putter';
  }
  if (terrain === 'bunker') {
    // Prefer sand / gap for short bunker shots
    if (distanceToPin < 35) return 'sand';
  }

  // Search longest → shortest for first club that isn't wildly short
  const order = [...CLUBS].filter((c) => c.id !== 'putter').reverse();
  let chosen: ClubId = 'sand';
  for (const c of order) {
    if (c.target * 1.04 >= distanceToPin) {
      chosen = c.id;
      break;
    }
  }
  // If still short of driver, use driver
  if (distanceToPin > CLUB_BY_ID.driver.target) return 'driver';
  return chosen;
}

export function nextClub(id: ClubId, dir: 1 | -1, allowPutter: boolean): ClubId {
  const list = allowPutter ? CLUBS : CLUBS.filter((c) => c.id !== 'putter');
  const idx = list.findIndex((c) => c.id === id);
  const i = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
  return list[i].id;
}

export function isClubId(v: unknown): v is ClubId {
  return typeof v === 'string' && v in CLUB_BY_ID;
}
