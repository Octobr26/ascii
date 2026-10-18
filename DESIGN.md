# Terminal shore design

## Experience

This is a single-player terminal scene for moving through a moonlit shore landscape.
It is an experience-first view with no story, quests, combat, multiplayer, or persistence.
The world fills the viewport, while the title, current lighting state, frame rate, and controls sit at its edges.

## Visual system

The image is a dense projected glyph landscape rendered as native colored terminal cells.
The night palette uses cool green and blue terrain, deep navy distance, and amber light from the campfire, lamp posts, and the traveler's lantern.
The traveler is a pale, readable figure with muted teal clothing and a grounded shadow.
Grass, reeds, stones, paths, rippling water, reflections, and local lights give the scene depth and motion.
Daylight and lantern toggles expose the lighting system without changing the scene's purpose.

## Rendering

World objects use continuous coordinates and an angled following pinhole camera.
Projection happens onto a grid of two by four Braille dots for each terminal cell.
A software depth buffer resolves overlapping terrain details, vegetation, objects, and the traveler before cell output.
Each eight-dot Braille mask shares one foreground color; the dots are not independent RGB pixels.
Ground colors and conventional glyphs sit beneath the Braille detail layer.

## Layout and interaction

The scene adapts to the current terminal size and reserves three rows for the bottom control HUD.
Terminals below 64 columns by 22 rows show a clear size prompt instead of the scene.
WASD or arrow keys move, Shift runs, Q and E turn, plus and minus zoom, L toggles the lantern, N toggles day and night, R resets, and Escape or Ctrl+C quits.
Resize handling updates the framebuffer to keep the world and edge HUD aligned.

## Verification boundary

The finish review disposition was SHIP with no findings.
Native-frame preview confirmed the terminal composition, but terminal font metrics, true-color support, and keyboard release behavior can still vary by terminal.
