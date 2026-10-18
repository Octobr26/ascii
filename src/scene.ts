import { RGBA, type OptimizedBuffer } from '@opentui/core';
import { Camera, type Projection } from './camera.ts';
import { CAMP, POSTS, SPAWN, WORLD_EDGE, clamp, flowers, grass, hash, lerp, move, noise, pathDistance, rocks, shore, type Point } from './world.ts';

// Experience: a moonlit shore fills the terminal; the controls stay at its edge.
// World: blue water, dense green glyphs, amber local light, a pale travelling figure.
// Interaction: continuous movement and an angled pinhole camera, sampled only at drawing time.
// Finish: inspect actual terminal output, input, resizing, and shutdown before delivery.

const BACKGROUND = 0x080f16;
const DOT_BITS = [[1, 8], [2, 16], [4, 32], [64, 128]];
const BRAILLE = Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x2800 + i));
const PLAYER = [
  '    hhh    ',
  '   hHHHh   ',
  '   hfffh   ',
  '   hfffh   ',
  '    sss    ',
  '   ccscc   ',
  '  ccccccc  ',
  ' ccccccccc ',
  ' ccccccccc ',
  '  ccccccc  ',
  '  ccccccc  ',
  '  ccccccc  ',
  '   ccccc   ',
  '   bb bb   ',
  '   bb bb   ',
  '  bbb bbb  ',
];
// Petal silhouettes share the same projected dot/depth buffer as the traveler.
const FLOWER_HEADS = {
  daisy: ['   p   ', ' p p p ', '  pop  ', 'ppooopp', '  pop  ', ' p p p ', '   p   '],
  poppy: [' pp pp ', 'ppppppp', 'ppppppp', ' pdddp ', '  ddd  '],
  lavender: ['  p  ', ' ppp ', '  d  ', ' ppp ', 'ppppp', '  d  ', ' ppp ', 'ppppp', '  d  '],
};
const FLOWER_COLORS = {
  daisy: { p: 0xf2e8c7, o: 0xe8b84e, d: 0xb5a675 },
  poppy: { p: 0xee806e, o: 0xe8b84e, d: 0x9d454f },
  lavender: { p: 0xb5a0df, o: 0xe8b84e, d: 0x7969a4 },
};
const SPRITE_COLORS: Record<string, number> = { h: 0xb7baab, H: 0xe3ddbe, f: 0xc9a489, s: 0xb77948, c: 0x55938b, b: 0x434c48 };

function mix(a: number, b: number, k: number): number {
  k = clamp(k);
  return (Math.round(lerp(a >> 16, b >> 16, k)) << 16) |
    (Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k)) << 8) |
    Math.round(lerp(a & 255, b & 255, k));
}

const colorCache = new Map<number, RGBA>();
function rgba(rgb: number): RGBA {
  // Quantization bounds the native color cache during continuous lighting changes.
  const key = rgb & 0xfcfcfc;
  let out = colorCache.get(key);
  if (!out) {
    out = RGBA.fromInts(key >> 16, (key >> 8) & 255, key & 255);
    colorCache.set(key, out);
  }
  return out;
}

interface Light extends Point { y: number; radius: number; strength: number; color: number }

/** A small software depth buffer. Each eight-dot mask becomes one real terminal glyph. */
class Dots {
  readonly width: number;
  readonly height: number;
  readonly depth: Float32Array;
  readonly colors: Int32Array;
  readonly wet: Uint8Array;
  readonly bg: Int32Array;
  readonly fg: Int32Array;
  readonly glyphs: string[];

  constructor(readonly cols: number, readonly rows: number) {
    this.width = cols * 2;
    this.height = rows * 4;
    this.depth = new Float32Array(this.width * this.height);
    this.colors = new Int32Array(this.width * this.height);
    this.wet = new Uint8Array(cols * rows);
    this.bg = new Int32Array(cols * rows);
    this.fg = new Int32Array(cols * rows);
    this.glyphs = new Array(cols * rows);
  }

  clear() { this.depth.fill(Infinity); this.colors.fill(-1); }

  dot(p: Projection | null, color: number, reflection = false) {
    if (!p) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (reflection && !this.wet[(y >> 2) * this.cols + (x >> 1)]) return;
    const i = y * this.width + x;
    if (p.depth > this.depth[i]) return;
    this.depth[i] = p.depth;
    this.colors[i] = color;
  }

  line(a: Projection | null, b: Projection | null, color: number, reflection = false) {
    if (!a || !b) return;
    if (Math.max(a.x, b.x) < 0 || Math.min(a.x, b.x) >= this.width || Math.max(a.y, b.y) < 0 || Math.min(a.y, b.y) >= this.height) return;
    const steps = Math.min(60, Math.ceil(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))));
    for (let i = 0; i <= steps; i++) {
      const k = steps ? i / steps : 0;
      this.dot({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), depth: lerp(a.depth, b.depth, k) }, color, reflection);
    }
  }

  flush(buffer: OptimizedBuffer) {
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      let bits = 0, r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        const color = this.colors[(y * 4 + dy) * this.width + x * 2 + dx];
        if (color < 0) continue;
        bits |= DOT_BITS[dy][dx];
        r += color >> 16; g += (color >> 8) & 255; b += color & 255; count++;
      }
      const i = y * this.cols + x;
      const color = count ? (Math.round(r / count) << 16) | (Math.round(g / count) << 8) | Math.round(b / count) : this.fg[i];
      buffer.setCell(x, y, bits ? BRAILLE[bits] : this.glyphs[i], rgba(color), rgba(this.bg[i]));
    }
  }
}

export class Scene {
  player: Point = { ...SPAWN };
  focus: Point = { ...SPAWN };
  yaw = -0.12;
  zoom = 1;
  lantern = true;
  night = true;
  time = 0;
  distance = 0;
  moving = false;
  private lightSources: Light[] = [];
  private dots: Dots | null = null;
  private camera!: Camera;

  update(dt: number, horizontal: number, vertical: number, turn: number, sprint: boolean) {
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    this.yaw += turn * dt * 1.2;
    const n = Math.hypot(horizontal, vertical);
    const speed = sprint ? 6.2 : 3.8;
    const x = this.player.x, z = this.player.z;
    if (n) {
      const right = horizontal / n, forward = vertical / n;
      move(this.player, (Math.cos(this.yaw) * right + Math.sin(this.yaw) * forward) * speed * dt,
        (Math.sin(this.yaw) * right - Math.cos(this.yaw) * forward) * speed * dt);
    }
    const travelled = Math.hypot(this.player.x - x, this.player.z - z);
    this.distance += travelled;
    this.moving = travelled > 0.0001;
    const follow = 1 - Math.exp(-dt * 7);
    this.focus.x = lerp(this.focus.x, this.player.x, follow);
    this.focus.z = lerp(this.focus.z, this.player.z, follow);
  }

  reset() {
    this.player = { ...SPAWN }; this.focus = { ...SPAWN };
    this.yaw = -0.12; this.zoom = 1; this.distance = 0;
  }

  private lights() {
    const flicker = 0.88 + Math.sin(this.time * 11) * 0.07 + Math.sin(this.time * 17) * 0.05;
    this.lightSources = [
      { ...CAMP, y: 0.7, radius: 6.5, strength: flicker, color: 0xffa75b },
      ...POSTS.map(p => ({ ...p, y: 1.7, radius: 4.8, strength: 0.8, color: 0xffcc80 })),
    ];
    if (this.lantern) this.lightSources.push({ x: this.player.x + this.camera.right.x * 0.55, z: this.player.z + this.camera.right.z * 0.55, y: 0.9, radius: 5.8, strength: 0.95, color: 0xffd48b });
  }

  private shade(base: number, x: number, y: number, z: number, depth = 20): number {
    const ambient = this.night ? 0.38 : 0.95;
    let r = (base >> 16) * ambient * (this.night ? 0.76 : 1);
    let g = ((base >> 8) & 255) * ambient;
    let b = (base & 255) * ambient * (this.night ? 1.24 : 1);
    for (const light of this.lightSources) {
      const d2 = (x - light.x) ** 2 + (z - light.z) ** 2 + (y - light.y) ** 2;
      const k = Math.max(0, 1 - d2 / light.radius ** 2) ** 2 * light.strength * (this.night ? 1 : 0.25);
      r += (base >> 16) * (light.color >> 16) / 190 * k;
      g += ((base >> 8) & 255) * ((light.color >> 8) & 255) / 190 * k;
      b += (base & 255) * (light.color & 255) / 190 * k;
    }
    const lit = (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
    return mix(lit, this.night ? 0x121f2b : 0x819b9d, clamp((depth - 33) / 100) * 0.75);
  }

  private ground() {
    const d = this.dots!, c = this.camera, t = this.time;
    const reflections = this.lightSources.map(l => ({ light: l, at: c.project(l.x, -l.y, l.z) }));
    for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.cols; col++) {
      const i = row * d.cols + col;
      const at = c.ground(col * 2 + 1, row * 4 + 2);
      d.wet[i] = 0;
      if (!at || Math.abs(at.x) > WORLD_EDGE + 6 || Math.abs(at.z) > WORLD_EDGE + 6) {
        d.bg[i] = BACKGROUND; d.fg[i] = 0x283b42; d.glyphs[i] = ' '; continue;
      }
      const { x, z, depth } = at;
      const bank = shore(x, z), n = noise(x * 0.8, z * 0.8);
      const water = bank < 0;
      d.wet[i] = water ? 1 : 0;
      if (water) {
        const wave = Math.sin(x * 2.1 + z * 1.5 + t * 1.8) + Math.sin(z * 4.3 - t * 2.3 + x * 0.7);
        let color = mix(0x153c50, 0x416c76, (wave + 2) / 4 * 0.55);
        color = this.shade(color, x, 0, z, depth);
        // Mirror the lights below the water plane; ripples stretch and break their image.
        for (const { light, at: image } of reflections) {
          if (!image) continue;
          const scale = c.focal / image.depth;
          const dx = (col * 2 - image.x + Math.sin(row * 1.7 + t * 2) * 2) / (scale * 0.65);
          const dy = (row * 4 - image.y) / (scale * 3.5);
          const glow = Math.exp(-dx * dx - dy * dy) * (0.25 + 0.35 * (wave + 2) / 4);
          color = mix(color, light.color, glow * (this.night ? 0.7 : 0.2));
        }
        const moon = Math.exp(-(((x - 10 + Math.sin(z * 1.6 + t) * 0.6) / 1.8) ** 2)) * clamp((-z - 2) / 18) * clamp((wave + 0.8) / 2.5);
        color = mix(color, this.night ? 0x9ebbbb : 0xc5d6b6, moon * 0.4);
        d.bg[i] = mix(color, 0x0b1c2c, this.night ? 0.3 : 0.12);
        d.fg[i] = mix(color, this.night ? 0x7eaaa7 : 0xc7d3b8, 0.23);
        d.glyphs[i] = wave > 1.1 ? '─' : wave > 0.2 ? '~' : wave > -0.6 ? '·' : ' ';
      } else {
        const path = pathDistance(x, z) < 1.25 || Math.hypot(x - CAMP.x, z - CAMP.z) < 1.65;
        const shoreBlend = clamp(1 - bank / 1.3);
        let base = path ? mix(0x635b44, 0x8a7958, n) : mix(0x294937, 0x4b6d45, n);
        base = mix(base, 0x716a47, shoreBlend * 0.6);
        let color = this.shade(base, x, 0, z, depth);
        const shadow = Math.exp(-((x - this.player.x - 0.2) ** 2 / 0.25 + (z - this.player.z - 0.25) ** 2 / 0.12));
        color = mix(color, 0x071015, shadow * 0.75);
        d.bg[i] = mix(color, BACKGROUND, path ? 0.38 : 0.51);
        d.fg[i] = mix(color, d.bg[i], path ? 0.1 : 0.48);
        const grain = hash(Math.floor(x * 7), Math.floor(z * 7));
        d.glyphs[i] = path ? (grain > 0.82 ? '·' : ' ') : grain > 0.93 ? ',' : ' ';
      }
    }
  }

  private vegetation() {
    const c = this.camera, d = this.dots!, t = this.time;
    for (const tuft of grass) {
      const root = c.project(tuft.x, 0, tuft.z);
      if (!root || root.depth > 80 || root.x < -8 || root.x > d.width + 8 || root.y < -6 || root.y > d.height + 18) continue;
      // Shared gusts move a whole patch; small variation keeps neighboring tufts organic.
      const wind = Math.sin(t * 1.3 + tuft.x * 0.19 + tuft.z * 0.25) * 0.11 + Math.sin(t * 2.1 + tuft.seed * 9) * 0.025;
      const separation = Math.hypot(tuft.x - this.player.x, tuft.z - this.player.z);
      const flatten = 1 - clamp(1 - separation / 0.85) * 0.65;
      const height = tuft.height * flatten;
      const lean = tuft.lean + wind;
      const base = tuft.reed ? mix(0x70865a, 0x9aab70, tuft.seed) : mix(0x3e7252, 0x79975c, tuft.seed);
      const color = this.shade(base, tuft.x, height * 0.5, tuft.z, root.depth);
      const rootColor = mix(color, this.shade(0x345b40, tuft.x, 0, tuft.z, root.depth), 0.45);
      const projectedHeight = height * c.focal / root.depth;
      // Distant plants keep one stalk instead of merging three blades into bright noise.
      const blades = projectedHeight < 3 ? [0] : [-1, 0, 1];
      for (const side of blades) {
        const spread = side * (tuft.reed ? 0.23 : 0.28);
        const bladeHeight = height * (side === 0 ? 1 : 0.65 + tuft.seed * 0.12);
        const tipX = tuft.x + lean + c.right.x * spread;
        const tipZ = tuft.z + wind * 0.25 + c.right.z * spread;
        const mid = c.project(tuft.x + lean * 0.25 + c.right.x * spread * 0.3, bladeHeight * 0.6,
          tuft.z + c.right.z * spread * 0.3);
        const tip = c.project(tipX, bladeHeight, tipZ);
        d.line(root, mid, rootColor); d.line(mid, tip, color);
        if (tuft.reed && side === 0 && tuft.seed > 0.55) {
          // Warm seed heads separate the tall bank reeds from the low meadow grass.
          d.line(c.project(tipX, bladeHeight * 0.78, tipZ), tip,
            this.shade(0xc2a175, tipX, bladeHeight, tipZ, root.depth));
        }
      }
      if (tuft.reed && tuft.seed > 0.55) {
        const reflected = c.project(tuft.x + lean, -height * 0.8, tuft.z);
        if (reflected) reflected.x += Math.sin(t * 2 + reflected.y * 0.3) * 1.3;
        d.line(root, reflected, mix(color, 0x163d4e, 0.65), true);
      }
    }
    for (const flower of flowers) {
      const root = c.project(flower.x, 0, flower.z);
      if (!root || root.depth > 75 || root.x < -10 || root.x > d.width + 10 || root.y < -8 || root.y > d.height + 32) continue;
      const sway = Math.sin(t * 1.3 + flower.x * 0.19 + flower.z * 0.25) * 0.08;
      const x = flower.x + sway, z = flower.z + sway * 0.25;
      const stem = this.shade(0x679468, x, flower.height * 0.5, z, root.depth);
      const mid = c.project(flower.x + sway * 0.4, flower.height * 0.45, flower.z);
      d.line(root, mid, mix(stem, 0x224331, 0.25));
      d.line(mid, c.project(x, flower.height, z), stem);
      for (const side of [-1, 1]) {
        const leaf = c.project(flower.x + c.right.x * side * 0.24, flower.height * (side < 0 ? 0.56 : 0.38),
          flower.z + c.right.z * side * 0.24);
        d.line(mid, leaf, stem);
      }
      this.sprite(x, flower.height, z, FLOWER_HEADS[flower.kind], FLOWER_COLORS[flower.kind], flower.kind === 'lavender' ? 0.09 : 0.115);
    }
  }

  private sprite(x: number, y: number, z: number, pattern: string[], palette: Record<string, number>, pixel: number) {
    const c = this.camera, d = this.dots!;
    const top = c.project(x, y + pattern.length * pixel * 0.5, z);
    const bottom = c.project(x, y - pattern.length * pixel * 0.5, z);
    if (!top || !bottom) return;
    const colors = Object.fromEntries(Object.entries(palette).map(([key, value]) =>
      [key, this.shade(value, x, y, z, (top.depth + bottom.depth) / 2)]));
    // Rasterize the billboard at its projected size so zooming never leaves holes.
    for (let sy = Math.max(0, Math.ceil(top.y)); sy <= Math.min(d.height - 1, Math.floor(bottom.y)); sy++) {
      const v = (sy - top.y) / (bottom.y - top.y);
      const row = pattern[Math.min(pattern.length - 1, Math.floor(v * pattern.length))];
      const depth = lerp(top.depth, bottom.depth, v);
      const center = lerp(top.x, bottom.x, v);
      const width = row.length * pixel * c.focal / depth;
      for (let sx = Math.max(0, Math.ceil(center - width / 2)); sx <= Math.min(d.width - 1, Math.floor(center + width / 2)); sx++) {
        const u = (sx - center + width / 2) / width;
        const ch = row[Math.min(row.length - 1, Math.floor(u * row.length))];
        if (ch !== ' ') d.dot({ x: sx, y: sy, depth }, colors[ch]);
      }
    }
  }

  private stone(x: number, z: number, radius: number, seed: number) {
    const c = this.camera, d = this.dots!;
    const p = c.project(x, 0, z);
    if (!p || p.depth > 75 || p.x < -15 || p.x > d.width + 15 || p.y < -10 || p.y > d.height + 15) return;
    const steps = Math.max(4, Math.ceil(radius * c.focal / p.depth));
    for (let row = 0; row <= steps; row++) for (let col = -steps; col <= steps; col++) {
      const u = col / steps, v = row / steps;
      if (u * u + v * v > 1) continue;
      const wx = x + c.right.x * u * radius, wz = z + c.right.z * u * radius;
      const base = mix(0x465b58, 0x91a194, clamp(v * 0.65 - u * 0.2 + seed * 0.2));
      d.dot(c.project(wx, v * radius * 0.8, wz), this.shade(base, wx, v * radius, wz, p.depth));
    }
  }

  private lamps() {
    const c = this.camera, d = this.dots!, t = this.time;
    for (const post of POSTS) {
      d.line(c.project(post.x, 0, post.z), c.project(post.x, 1.6, post.z), this.shade(0x8c7852, post.x, 1, post.z));
      for (let y = 0; y < 4; y++) for (let x = -1; x <= 1; x++) {
        const p = c.project(post.x + c.right.x * x * 0.085, 1.55 + y * 0.08, post.z + c.right.z * x * 0.085);
        d.dot(p, x === 0 ? 0xffedb2 : 0xd5a45b);
      }
      d.line(c.project(post.x - c.right.x * 0.22, 1.92, post.z - c.right.z * 0.22), c.project(post.x + c.right.x * 0.22, 1.92, post.z + c.right.z * 0.22), 0x738481);
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) this.stone(CAMP.x + Math.cos(a) * 0.52, CAMP.z + Math.sin(a) * 0.4, 0.13, 0.5);
    for (let i = 0; i < 16; i++) {
      const side = (i / 15 - 0.5) * 0.65;
      const height = (1 - Math.abs(side) * 1.9) * (0.6 + Math.sin(t * 9 + i * 2) * 0.15);
      const x = CAMP.x + side;
      d.line(c.project(x, 0.1, CAMP.z), c.project(x + Math.sin(t * 4 + i) * 0.1, height, CAMP.z), mix(0xff6b32, 0xffeaa0, 1 - Math.abs(side) * 2));
    }
    for (let i = 0; i < 10; i++) {
      const phase = (t * 0.5 + hash(i, 4)) % 1;
      const p = c.project(CAMP.x + Math.sin(i * 9 + t) * phase * 0.65, 0.7 + phase * 1.6, CAMP.z + Math.cos(i) * 0.2);
      d.dot(p, mix(0xffc477, 0x473d30, phase));
    }
  }

  private character() {
    const c = this.camera, d = this.dots!, p = this.player;
    const step = this.moving ? Math.sin(this.distance * 7) : 0;
    const bob = this.moving ? Math.abs(step) * 0.04 : Math.sin(this.time * 2) * 0.012;
    for (let row = 0; row < PLAYER.length; row++) for (let col = 0; col < PLAYER[row].length; col++) {
      const ch = PLAYER[row][col];
      if (ch === ' ') continue;
      const ox = (col - 5) * 0.095;
      const y = (PLAYER.length - row) * 0.1 + bob + (ch === 'b' ? step * (col < 5 ? 0.08 : -0.08) : 0);
      const wx = p.x + c.right.x * ox, wz = p.z + c.right.z * ox;
      const lit = this.shade(SPRITE_COLORS[ch], wx, y, wz);
      d.dot(c.project(wx, y, wz), mix(lit, SPRITE_COLORS[ch], this.night ? 0.28 : 0));
    }
    const lx = p.x + c.right.x * 0.55, lz = p.z + c.right.z * 0.55;
    d.line(c.project(p.x + c.right.x * 0.3, 1, p.z + c.right.z * 0.3), c.project(lx, 0.9, lz), this.shade(0xc7ac86, lx, 1, lz));
    const at = c.project(lx, 0.8 + bob, lz);
    if (at) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      d.dot({ ...at, x: at.x + x, y: at.y + y }, this.lantern ? (x === 0 ? 0xffefb4 : 0xd8994a) : 0x647171);
    }
  }

  paint(buffer: OptimizedBuffer, cols: number, rows: number) {
    if (!this.dots || this.dots.cols !== cols || this.dots.rows !== rows) this.dots = new Dots(cols, rows);
    this.camera = new Camera(cols, rows, this.focus, this.yaw, this.zoom);
    this.dots.clear(); this.lights(); this.ground(); this.vegetation();
    for (const rock of rocks) this.stone(rock.x, rock.z, rock.radius, rock.seed);
    this.lamps(); this.character(); this.dots.flush(buffer);
  }
}
