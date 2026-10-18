import type { Point } from './world.ts';

export interface Projection { x: number; y: number; depth: number }

/** Pinhole projection in Braille-dot coordinates: two across, four down per cell. */
export class Camera {
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  readonly right: Point;
  private readonly sinPitch = Math.sin(0.72);
  private readonly cosPitch = Math.cos(0.72);
  private readonly forward: Point;
  private readonly eye: { x: number; y: number; z: number };

  constructor(cols: number, rows: number, focus: Point, yaw: number, zoom: number) {
    this.width = cols * 2;
    this.height = rows * 4;
    this.focal = Math.min(this.width * 0.92, this.height * 1.8) * zoom;
    this.right = { x: Math.cos(yaw), z: Math.sin(yaw) };
    this.forward = { x: Math.sin(yaw), z: -Math.cos(yaw) };
    const distance = 28;
    this.eye = {
      x: focus.x - this.forward.x * distance * this.cosPitch,
      y: distance * this.sinPitch,
      z: focus.z - this.forward.z * distance * this.cosPitch,
    };
  }

  project(x: number, y: number, z: number): Projection | null {
    const dx = x - this.eye.x, dy = y - this.eye.y, dz = z - this.eye.z;
    const along = dx * this.forward.x + dz * this.forward.z;
    const depth = along * this.cosPitch - dy * this.sinPitch;
    if (depth <= 0.5) return null;
    const sx = dx * this.right.x + dz * this.right.z;
    const sy = along * this.sinPitch + dy * this.cosPitch;
    return { x: this.width / 2 + sx * this.focal / depth, y: this.height * 0.57 - sy * this.focal / depth, depth };
  }

  ground(screenX: number, screenY: number): (Point & { depth: number }) | null {
    const sx = (screenX - this.width / 2) / this.focal;
    const sy = (this.height * 0.57 - screenY) / this.focal;
    const rayY = -this.sinPitch + sy * this.cosPitch;
    if (rayY >= -0.02) return null;
    const depth = -this.eye.y / rayY;
    const along = this.cosPitch + sy * this.sinPitch;
    return {
      x: this.eye.x + depth * (this.forward.x * along + this.right.x * sx),
      z: this.eye.z + depth * (this.forward.z * along + this.right.z * sx),
      depth,
    };
  }
}
