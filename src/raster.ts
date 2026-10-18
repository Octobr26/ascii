import { RGBA, type OptimizedBuffer } from '@opentui/core';
import type { Camera, Projection } from './camera.ts';
import { lerp } from './math.ts';

const DOT_BITS = [[1, 8], [2, 16], [4, 32], [64, 128]];
const BRAILLE = Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x2800 + i));

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


/**
 * Reusable terminal rasterizer. Nearer dots hide farther dots and whole-cell accents.
 * Call clear(), fill the ground bg/fg/glyphs/wet layers, draw, then flush once per frame.
 */
export class DotBuffer {
  readonly width: number;
  readonly height: number;
  readonly depth: Float32Array;
  readonly colors: Int32Array;
  readonly wet: Uint8Array;
  readonly bg: Int32Array;
  readonly fg: Int32Array;
  readonly glyphs: string[];
  readonly accents: (string | undefined)[];
  readonly accentDepth: Float32Array;
  readonly accentColors: Int32Array;

  constructor(readonly cols: number, readonly rows: number) {
    this.width = cols * 2;
    this.height = rows * 4;
    this.depth = new Float32Array(this.width * this.height);
    this.colors = new Int32Array(this.width * this.height);
    this.wet = new Uint8Array(cols * rows);
    this.bg = new Int32Array(cols * rows);
    this.fg = new Int32Array(cols * rows);
    this.glyphs = new Array(cols * rows);
    this.accents = new Array(cols * rows);
    this.accentDepth = new Float32Array(cols * rows);
    this.accentColors = new Int32Array(cols * rows);
  }

  clear() {
    this.depth.fill(Infinity); this.colors.fill(-1);
    this.accents.fill(undefined); this.accentDepth.fill(Infinity);
  }

  accent(p: Projection | null, glyph: string, color: number) {
    if (!p) return;
    const x = Math.floor(p.x / 2), y = Math.floor(p.y / 4);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    if (p.depth > this.accentDepth[i]) return;
    this.accents[i] = glyph; this.accentDepth[i] = p.depth; this.accentColors[i] = color;
  }

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
      let bits = 0, r = 0, g = 0, b = 0, count = 0, nearest = Infinity;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        const color = this.colors[(y * 4 + dy) * this.width + x * 2 + dx];
        if (color < 0) continue;
        nearest = Math.min(nearest, this.depth[(y * 4 + dy) * this.width + x * 2 + dx]);
        bits |= DOT_BITS[dy][dx];
        r += color >> 16; g += (color >> 8) & 255; b += color & 255; count++;
      }
      const i = y * this.cols + x;
      // A whole-cell accent yields to any foreground dot, including the traveler.
      if (this.accents[i] && this.accentDepth[i] <= nearest) {
        buffer.setCell(x, y, this.accents[i]!, rgba(this.accentColors[i]), rgba(this.bg[i]));
        continue;
      }
      const color = count ? (Math.round(r / count) << 16) | (Math.round(g / count) << 8) | Math.round(b / count) : this.fg[i];
      buffer.setCell(x, y, bits ? BRAILLE[bits] : this.glyphs[i], rgba(color), rgba(this.bg[i]));
    }
  }

  sprite(camera: Camera, x: number, y: number, z: number, pattern: readonly string[], colors: Readonly<Record<string, number>>, pixel: number) {
    const c = camera, d = this;
    const top = c.project(x, y + pattern.length * pixel * 0.5, z);
    const bottom = c.project(x, y - pattern.length * pixel * 0.5, z);
    if (!top || !bottom) return;
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

}
