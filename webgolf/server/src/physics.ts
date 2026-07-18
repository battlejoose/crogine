import {
  ATTRACT_RADIUS,
  ATTRACT_STRENGTH,
  BALL_RADIUS,
  COURSE,
  CUP_DEPTH,
  FRICTION_MUL,
  GIMME_RADIUS,
  GRAVITY,
  HOLE_RADIUS,
  MIN_ROLL_VY,
  MIN_VELOCITY_SQR,
  RESTITUTION,
  STRIKE_DAMPENING,
  clubPowerForShot,
  clubLoftRad,
  groundHeight,
  horizontalDist,
  isClubId,
  pointInRect,
  swingPowerFactor,
  terrainAt,
  type ClubId,
  type TerrainKind,
  type Vec3,
  CLUB_BY_ID,
} from '@webgolf/shared';

const DT = 1 / 60;
const MAX_SIM_TIME = 22;

export type SimSample = {
  position: Vec3;
  velocity: Vec3;
  t: number;
};

export type SimResult = {
  samples: SimSample[];
  finalPosition: Vec3;
  terrain: TerrainKind;
  holed: boolean;
  waterHazard: boolean;
  foul: boolean;
  penaltyStrokes: number;
  gimme: boolean;
};

type BallState = 'flight' | 'roll' | 'putt';

function vlen2(v: Vec3) {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

function findDrop(from: Vec3, toward: Vec3): Vec3 {
  const dx = toward.x - from.x;
  const dz = toward.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const stepX = dx / len;
  const stepZ = dz / len;

  for (let d = 1; d <= 40; d += 1) {
    const x = from.x + stepX * d;
    const z = from.z + stepZ * d;
    const t = terrainAt(x, z);
    if (t === 'fairway' || t === 'rough' || t === 'tee' || t === 'green') {
      // nudge inland off water edge
      const nx = x + stepX * 1.5;
      const nz = z + stepZ * 1.5;
      const nt = terrainAt(nx, nz);
      const px = nt === 'water' || nt === 'oob' ? x : nx;
      const pz = nt === 'water' || nt === 'oob' ? z : nz;
      return { x: px, y: groundHeight(px, pz) + BALL_RADIUS, z: pz };
    }
  }
  return {
    x: COURSE.tee.x,
    y: groundHeight(COURSE.tee.x, COURSE.tee.z) + BALL_RADIUS,
    z: COURSE.tee.z,
  };
}

function oobFoul(pos: Vec3, start: Vec3): SimResult {
  const drop = findDrop(pos, start);
  return {
    samples: [],
    finalPosition: drop,
    terrain: terrainAt(drop.x, drop.z),
    holed: false,
    waterHazard: false,
    foul: true,
    penaltyStrokes: 1,
    gimme: false,
  };
}

/**
 * Authoritative stroke sim — clubs, restitution/friction tables, cup attract,
 * water/OOB foul drops (SVG BallSystem spirit).
 */
export function simulateShot(
  start: Vec3,
  yaw: number,
  uiPower: number,
  clubId: ClubId,
): SimResult {
  const club = isClubId(clubId) ? CLUB_BY_ID[clubId] : CLUB_BY_ID.iron7;
  const lie = terrainAt(start.x, start.z);
  const distPin = horizontalDist(start, COURSE.pin);
  const clubPower = clubPowerForShot(club, distPin);
  const powerPct = swingPowerFactor(uiPower);
  const damp = STRIKE_DAMPENING[lie] ?? 1;
  const bunkerExtra = lie === 'bunker' ? 0.8 : 1;
  const impulse = clubPower * powerPct * damp * bunkerExtra;
  const loft = clubLoftRad(club);

  let pos: Vec3 = {
    x: start.x,
    y: Math.max(start.y, groundHeight(start.x, start.z) + BALL_RADIUS),
    z: start.z,
  };

  // Impulse along aim: pitch = loft, yaw around Y (0 = -Z)
  let vel: Vec3 = {
    x: Math.sin(yaw) * Math.cos(loft) * impulse,
    y: Math.sin(loft) * impulse,
    z: -Math.cos(yaw) * Math.cos(loft) * impulse,
  };

  // Putter is nearly pure roll
  if (club.id === 'putter') {
    vel = {
      x: Math.sin(yaw) * impulse,
      y: 0.05,
      z: -Math.cos(yaw) * impulse,
    };
  }

  const samples: SimSample[] = [{ position: { ...pos }, velocity: { ...vel }, t: 0 }];
  let t = 0;
  let state: BallState = club.id === 'putter' ? 'putt' : 'flight';
  let settledFrames = 0;
  let overCupFrames = 0;

  const push = () => {
    samples.push({ position: { ...pos }, velocity: { ...vel }, t });
  };

  while (t < MAX_SIM_TIME) {
    t += DT;
    vel.y += GRAVITY * DT;

    // Cup attraction while putting / rolling on green
    if ((state === 'putt' || state === 'roll') && terrainAt(pos.x, pos.z) === 'green') {
      const dx = COURSE.pin.x - pos.x;
      const dz = COURSE.pin.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4 && d < ATTRACT_RADIUS) {
        const pull = ATTRACT_STRENGTH * DT * (1 - d / ATTRACT_RADIUS);
        vel.x += (dx / d) * pull;
        vel.z += (dz / d) * pull;
      }
    }

    pos = {
      x: pos.x + vel.x * DT,
      y: pos.y + vel.y * DT,
      z: pos.z + vel.z * DT,
    };

    // Hard OOB → foul (no soft wall bounce)
    if (!pointInRect(pos.x, pos.z, COURSE.bounds)) {
      const foul = oobFoul(pos, start);
      foul.samples = samples;
      samples.push({
        position: { ...foul.finalPosition },
        velocity: { x: 0, y: 0, z: 0 },
        t,
      });
      return foul;
    }

    let terrain = terrainAt(pos.x, pos.z);

    if (terrain === 'water') {
      const splash = { x: pos.x, y: COURSE.water.surfaceY, z: pos.z };
      samples.push({ position: splash, velocity: { x: 0, y: 0, z: 0 }, t });
      const drop = findDrop(splash, start);
      samples.push({ position: { ...drop }, velocity: { x: 0, y: 0, z: 0 }, t: t + 0.4 });
      return {
        samples,
        finalPosition: drop,
        terrain: terrainAt(drop.x, drop.z),
        holed: false,
        waterHazard: true,
        foul: true,
        penaltyStrokes: 1,
        gimme: false,
      };
    }

    const gh = groundHeight(pos.x, pos.z);
    const groundY = gh + BALL_RADIUS;

    // Cup fall-in
    const distCup = horizontalDist(pos, COURSE.pin);
    if (terrain === 'green' && distCup < HOLE_RADIUS * 1.05) {
      overCupFrames += 1;
      // Fall into cup well
      if (pos.y <= COURSE.green.height - CUP_DEPTH * 0.35 + BALL_RADIUS || overCupFrames > 8) {
        if (vlen2(vel) < 12 || overCupFrames > 20 || pos.y < COURSE.green.height - CUP_DEPTH * 0.5) {
          pos = {
            x: COURSE.pin.x,
            y: COURSE.green.height - CUP_DEPTH,
            z: COURSE.pin.z,
          };
          push();
          return {
            samples,
            finalPosition: pos,
            terrain: 'green',
            holed: true,
            waterHazard: false,
            foul: false,
            penaltyStrokes: 0,
            gimme: false,
          };
        }
      }
      // Soften horizontal speed over the cup (lip / capture)
      vel.x *= 0.92;
      vel.z *= 0.92;
    } else {
      overCupFrames = 0;
    }

    if (pos.y <= groundY) {
      pos.y = groundY;
      terrain = terrainAt(pos.x, pos.z);
      const rest = RESTITUTION[terrain] ?? 0.3;

      if (state === 'flight') {
        if (terrain === 'bunker') {
          vel = { x: 0, y: 0, z: 0 };
          push();
          return {
            samples,
            finalPosition: { ...pos },
            terrain: 'bunker',
            holed: false,
            waterHazard: false,
            foul: false,
            penaltyStrokes: 0,
            gimme: false,
          };
        }

        if (vel.y < 0) {
          vel.y = -vel.y * rest;
        }

        // Enter roll / putt when impact is soft enough (SVG MinRollVelocity)
        if (vel.y > MIN_ROLL_VY || rest === 0) {
          if (terrain === 'green') {
            state = 'putt';
            const h = Math.hypot(vel.x, vel.z);
            if (h > 0.01) {
              const boost = Math.min(h * 1.15, h + 1.2);
              vel.x = (vel.x / h) * boost;
              vel.z = (vel.z / h) * boost;
            }
            vel.y = 0;
          } else {
            state = 'roll';
            const h = Math.hypot(vel.x, vel.z);
            if (h > 0.01) {
              const boost = Math.min(h * 1.35, h + 2);
              vel.x = (vel.x / h) * boost;
              vel.z = (vel.z / h) * boost;
            }
            vel.y = 0;
          }
        }
      } else {
        // Rolling / putting: stick to ground, apply friction multiply
        vel.y = 0;
        const mul = FRICTION_MUL[terrain] ?? 0.96;
        vel.x *= mul;
        vel.z *= mul;

        // Rough / bunker kill speed hard
        if (terrain === 'rough' || terrain === 'bunker') {
          vel.x *= 0.85;
          vel.z *= 0.85;
        }
      }

      if (vlen2(vel) < MIN_VELOCITY_SQR) {
        settledFrames += 1;
        if (settledFrames > 10) {
          vel = { x: 0, y: 0, z: 0 };
          const finalTerrain = terrainAt(pos.x, pos.z);
          const pinDist = horizontalDist(pos, COURSE.pin);
          const gimme = finalTerrain === 'green' && pinDist <= GIMME_RADIUS;

          push();
          return {
            samples,
            finalPosition: gimme
              ? {
                  x: COURSE.pin.x,
                  y: COURSE.green.height - CUP_DEPTH,
                  z: COURSE.pin.z,
                }
              : { ...pos },
            terrain: finalTerrain,
            holed: gimme,
            waterHazard: false,
            foul: false,
            penaltyStrokes: 0,
            gimme,
          };
        }
      } else {
        settledFrames = 0;
      }
    }

    if (samples.length % 2 === 0 || t < 0.8 || state !== 'flight') {
      if (samples.length === 0 || t - samples[samples.length - 1].t >= DT * 1.5) {
        push();
      }
    }
  }

  const finalTerrain = terrainAt(pos.x, pos.z);
  return {
    samples,
    finalPosition: {
      x: pos.x,
      y: groundHeight(pos.x, pos.z) + BALL_RADIUS,
      z: pos.z,
    },
    terrain: finalTerrain,
    holed: false,
    waterHazard: false,
    foul: false,
    penaltyStrokes: 0,
    gimme: false,
  };
}
