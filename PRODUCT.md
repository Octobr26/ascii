# Terminal scene prototype

## Platform

A real desktop terminal, initially checked on macOS.

## Stack

Luis requested OpenTUI and the perspective approach discussed while inspecting Senu.
The implementation uses Bun, TypeScript, and OpenTUI Core's cell buffer.

## Scope

A single-player scene to walk around in, with grass, water, and lighting.
Continuous world coordinates and an angled following camera create depth before the result is sampled into terminal cells.
Unicode Braille and block characters are allowed, following Senu's terminal animation approach.
The visual reference is Ansenjeo's dense, animated ASCII world; this prototype does not claim to reproduce its rendering system.
Story, quests, combat, multiplayer, and persistence are outside this version.

## Acceptance

Run with `bun start` in a real terminal.
Keyboard movement, shoreline collision, camera rotation, animated vegetation and water, and visible lighting work in the same scene.
Resizing and quitting restore the terminal cleanly.
