import { lerp } from './math.ts';

export interface Point { x: number; z: number }
export interface Grass extends Point { height: number; lean: number; seed: number; reed: boolean }
export type FlowerKind = 'daisy' | 'poppy' | 'lavender';
export interface Flower extends Point { kind: FlowerKind; height: number; seed: number }
export interface SceneryDetail extends Point { size: number; seed: number }
export interface Rock extends Point { radius: number; seed: number }

export const WORLD_EDGE = 42;
export const PLAYER_RADIUS = 0.28;
export const SPAWN: Point = { x: -5, z: 8 };
export const CAMP: Point = { x: -9, z: 3 };
export const POSTS: Point[] = [{ x: -10, z: -12 }, { x: 0, z: 9 }];
export function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), u), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

/** Negative in water; approximately world-unit distance at the bank. */
export function shore(x: number, z: number): number {
  const center = 10 + Math.sin(z * 0.09) * 4 + Math.sin(z * 0.21) * 1.2;
  const stream = Math.abs(x - center) - 2.6 - noise(z * 0.18, 3) * 1.1;
  const pond = (Math.hypot((x - 7) / 12, (z + 9) / 10) - 1) * 9;
  return Math.min(stream, pond);
}

export function pathDistance(x: number, z: number): number {
  return Math.abs(x - (-7 + Math.sin(z * 0.14) * 2.5));
}

export const rocks: Rock[] = [];
export const grass: Grass[] = [];
export const flowers: Flower[] = [];

// Small single-species drifts make each silhouette readable from the path.
const FLOWER_PATCHES: (Point & { kind: FlowerKind })[] = [
  { x: -2.1, z: 8, kind: 'daisy' },
  { x: -8.2, z: 9.5, kind: 'poppy' },
  { x: -1.9, z: 3, kind: 'lavender' },
  { x: -12.8, z: -5, kind: 'daisy' },
  { x: -9.5, z: -16, kind: 'lavender' },
  { x: -12, z: 18, kind: 'poppy' },
];
const FLOWER_HEIGHT = { daisy: 0.88, poppy: 1, lavender: 1.1 };
for (const patch of FLOWER_PATCHES) {
  for (let i = 0; i < 6; i++) {
    const seed = hash(patch.x + i, patch.z);
    const angle = i * 2.4;
    const radius = Math.sqrt(i) * 0.78;
    const x = patch.x + Math.cos(angle) * radius;
    const z = patch.z + Math.sin(angle) * radius;
    if (shore(x, z) < 1.8 || pathDistance(x, z) < 1.65 || Math.hypot(x - CAMP.x, z - CAMP.z) < 2) continue;
    if (POSTS.some(p => Math.hypot(x - p.x, z - p.z) < 0.8)) continue;
    flowers.push({ x, z, kind: patch.kind, height: FLOWER_HEIGHT[patch.kind] * (0.9 + seed * 0.2), seed });
  }
}

// A stable world: resizing, turning the camera, and animation never regenerate scenery.
for (let z = -WORLD_EDGE; z < WORLD_EDGE; z += 0.8) {
  for (let x = -WORLD_EDGE; x < WORLD_EDGE; x += 0.8) {
    const seed = hash(x + 81, z + 27);
    const px = x + seed * 0.65, pz = z + hash(x + 17, z) * 0.65;
    const bank = shore(px, pz);
    if (bank < 0.22 || pathDistance(px, pz) < 1.05 || Math.hypot(px - CAMP.x, pz - CAMP.z) < 1.6) continue;
    if (noise(px * 0.2, pz * 0.2) < 0.24 || seed < 0.12) continue;
    const reed = bank < 1.5;
    if (seed > 0.993 && bank > 2 && Math.hypot(px - SPAWN.x, pz - SPAWN.z) > 3) {
      rocks.push({ x: px, z: pz, radius: 0.35 + hash(z, x) * 0.4, seed });
    }
    const patch = noise(px * 0.28 + 12, pz * 0.28);
    if (!reed && (patch < 0.38 || seed < 0.48)) continue;
    if (reed && seed < 0.35) continue;
    if (flowers.some(f => Math.hypot(px - f.x, pz - f.z) < 0.6)) continue;
    grass.push({ x: px, z: pz, seed, reed,
      height: reed ? 0.95 + seed * 0.55 : 0.38 + patch * 0.25 + seed * 0.12,
      lean: (hash(x, z + 7) - 0.5) * 0.2 });
  }
}

// Rocks are generated above; keep flower stems clear of their collision footprints.
for (let i = flowers.length - 1; i >= 0; i--) {
  if (!walkable(flowers[i].x, flowers[i].z)) flowers.splice(i, 1);
}

// Authored landmarks stay sparse so the flower patches and path retain clear silhouettes.
export const ferns: SceneryDetail[] = [
  { x: -11.5, z: 5.5, size: 1.1, seed: 0.2 },
  { x: -0.5, z: 11, size: 0.9, seed: 0.7 },
  { x: -10.8, z: -3, size: 1, seed: 0.4 },
  { x: -15, z: 14, size: 1.2, seed: 0.8 },
].filter(p => walkable(p.x, p.z) && pathDistance(p.x, p.z) > 1.8);
export const mushrooms: SceneryDetail[] = [
  { x: -10.3, z: 7.5, size: 1, seed: 0.2 },
  { x: -11.1, z: 8, size: 0.7, seed: 0.4 },
  { x: -10.1, z: 8.5, size: 0.65, seed: 0.6 },
  { x: 1.5, z: 5, size: 0.85, seed: 0.8 },
  { x: 2.2, z: 5.5, size: 0.6, seed: 0.9 },
].filter(p => walkable(p.x, p.z) && pathDistance(p.x, p.z) > 1.8);
export const lilyPads: SceneryDetail[] = [
  { x: 2.1, z: -2.5, size: 0.7, seed: 0.2 },
  { x: 3.8, z: -3, size: 0.6, seed: 0.8 },
  { x: 3, z: -5, size: 0.55, seed: 0.4 },
  { x: 5.6, z: -4.1, size: 0.8, seed: 0.9 },
  { x: 7.5, z: -1, size: 0.65, seed: 0.3 },
  { x: 8.4, z: -3.3, size: 0.5, seed: 0.7 },
];
export const pebbles: SceneryDetail[] = [];
for (let z = -WORLD_EDGE; z < WORLD_EDGE; z += 1.1) {
  for (let x = -WORLD_EDGE; x < WORLD_EDGE; x += 1.1) {
    const seed = hash(x + 42, z - 19);
    const px = x + seed * 0.8, pz = z + hash(z, x) * 0.8;
    const bank = shore(px, pz);
    if (bank > 0.15 && bank < 0.95 && seed > 0.4 && pathDistance(px, pz) > 1.5) {
      pebbles.push({ x: px, z: pz, size: 0.05 + seed * 0.09, seed });
    }
  }
}

// Leave room around low plants so their stems do not disappear into grass.
const lowPlants = [...ferns, ...mushrooms];
for (let i = grass.length - 1; i >= 0; i--) {
  if (lowPlants.some(p => Math.hypot(p.x - grass[i].x, p.z - grass[i].z) < p.size * 0.65)) grass.splice(i, 1);
}

export function walkable(x: number, z: number): boolean {
  if (Math.abs(x) > WORLD_EDGE - 1 || Math.abs(z) > WORLD_EDGE - 1) return false;
  // Check the footprint, including diagonals, rather than only the player's center.
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    if (shore(x + Math.cos(a) * PLAYER_RADIUS, z + Math.sin(a) * PLAYER_RADIUS) < 0.05) return false;
  }
  if (Math.hypot(x - CAMP.x, z - CAMP.z) < 0.7) return false;
  if (POSTS.some(p => Math.hypot(x - p.x, z - p.z) < 0.4)) return false;
  return !rocks.some(r => Math.hypot(x - r.x, z - r.z) < r.radius + PLAYER_RADIUS);
}

export function move(player: Point, dx: number, dz: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) {
    if (walkable(player.x + dx / steps, player.z)) player.x += dx / steps;
    if (walkable(player.x, player.z + dz / steps)) player.z += dz / steps;
  }
}
