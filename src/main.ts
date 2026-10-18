import { FrameBufferRenderable, RGBA, createCliRenderer, type KeyEvent } from '@opentui/core';
import { Scene } from './scene.ts';
import { clamp } from './world.ts';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run bun start inside an interactive terminal.');
  process.exit(1);
}

const FPS = 30;
const HUD_ROWS = 3;
const MIN_COLS = 64;
const MIN_ROWS = 22;
const BG = RGBA.fromHex('#080f16');
const INK = RGBA.fromHex('#c7d6cc');
const MUTED = RGBA.fromHex('#829b99');
const GOLD = RGBA.fromHex('#eac38a');

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  useMouse: false,
  targetFps: FPS,
  maxFps: FPS,
  backgroundColor: BG,
  useKittyKeyboard: { events: true, allKeysAsEscapes: true },
});

const scene = new Scene();
const canvas = new FrameBufferRenderable(renderer, { id: 'shore', width: renderer.width, height: renderer.height });
renderer.root.add(canvas);
const pressed = new Map<string, { until: number; shift: boolean }>();
const movementKeys = new Set(['w', 'a', 's', 'd', 'up', 'down', 'left', 'right', 'q', 'e']);
let frames = 0, measuredFps = FPS, measuredAt = performance.now();

function keyDown(key: KeyEvent) {
  if (key.name === 'escape' || key.name === 'c' && key.ctrl) { renderer.destroy(); return; }
  if (movementKeys.has(key.name)) {
    // Kitty supplies releases. Legacy terminals only supply key repeats, so expire their pulses.
    pressed.set(key.name, { until: key.source === 'kitty' ? Infinity : performance.now() + 180, shift: key.shift });
    return;
  }
  if (key.repeated) return;
  if (key.name === 'l') scene.lantern = !scene.lantern;
  if (key.name === 'n') scene.night = !scene.night;
  if (key.name === 'r') { scene.reset(); pressed.clear(); }
  if (['+', '=', 'add'].includes(key.name) || key.sequence === '+') scene.zoom = clamp(scene.zoom + 0.1, 0.65, 1.65);
  if (['-', '_', 'subtract'].includes(key.name)) scene.zoom = clamp(scene.zoom - 0.1, 0.65, 1.65);
}

renderer.keyInput.on('keypress', keyDown);
renderer.keyInput.on('keyrelease', key => pressed.delete(key.name));
renderer.on('blur', () => pressed.clear());

function text(value: string, x: number, y: number, color = MUTED) {
  const available = Math.max(0, canvas.frameBuffer.width - x - 1);
  if (available && y >= 0 && y < canvas.frameBuffer.height) canvas.frameBuffer.drawText(value.slice(0, available), x, y, color, BG);
}

renderer.setFrameCallback(async deltaMs => {
  const now = performance.now();
  for (const [key, value] of pressed) if (value.until < now) pressed.delete(key);
  const active = (...keys: string[]) => keys.some(key => pressed.has(key)) ? 1 : 0;
  scene.update(deltaMs / 1000,
    active('d', 'right') - active('a', 'left'),
    active('w', 'up') - active('s', 'down'),
    active('e') - active('q'), [...pressed.values()].some(v => v.shift));
  frames++;
  if (now - measuredAt >= 1000) {
    measuredFps = Math.round(frames * 1000 / (now - measuredAt)); frames = 0; measuredAt = now;
  }
  const cols = renderer.width, rows = renderer.height;
  if (canvas.width !== cols) canvas.width = cols;
  if (canvas.height !== rows) canvas.height = rows;
  const fb = canvas.frameBuffer;
  if (fb.width !== cols || fb.height !== rows) return; // Native layout applies a resize before the next paint.
  fb.clear(BG);
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    text('Make the terminal a little larger.', 2, 2, INK);
    text(`At least ${MIN_COLS} columns x ${MIN_ROWS} rows. Current: ${cols} x ${rows}.`, 2, 4);
    text('Esc to quit', 2, 6);
  } else {
    scene.paint(fb, cols, rows - HUD_ROWS);
    const title = 'SHORE STUDY';
    text(title, 2, 1, GOLD);
    text(`${scene.night ? 'moonlight' : 'daylight'}  /  ${scene.lantern ? 'lantern on' : 'lantern off'}`, 2, 2);
    const y = rows - HUD_ROWS;
    fb.fillRect(0, y, cols, HUD_ROWS, BG);
    text('WASD / arrows move   Q E turn   + - zoom   L lantern', 2, y + 1, INK);
    const right = `N day/night   R reset   Esc quit`;
    if (cols >= 106) text(right, cols - right.length - 3, y + 1);
    else text(right, 2, y + 2);
    if (cols >= 106) text(`${measuredFps} fps`, cols - 9, 1);
  }
});

renderer.once('destroy', () => { pressed.clear(); renderer.keyInput.off('keypress', keyDown); });
renderer.start();
