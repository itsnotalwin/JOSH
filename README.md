# JOSH — Echoes of the Shattered World

A fully playable 2D platformer with narrative quests across five realms. Playable straight out of the box — no build step, no external downloads, no assets required. Open `index.html` in any modern browser.

## How to play

- **Arrows / WASD** — move
- **Space / Up** — jump (double-jump available)
- **E** — talk to NPCs
- **Q** — open the quest log
- **R** — restart the current level

Collect all **Echo Fragments** in each realm to activate the exit, then reach it to progress. Complete every realm to restore the shattered world.

## What's inside

- 5 realms with distinct themes and music-free audio cues
- Glade of Whispers → Crystal Depths → Sky Aerie → Ember Rift → The Core
- 3 fragments per realm (15 total)
- NPC dialogue and per-realm quests with a quest log
- Stompable enemies, spike and lava hazards, checkpoints, particles
- Persistent death counter and progress HUD

## Free online assets (referenced, not bundled)

The game draws all its art procedurally so nothing is required to run. If you want to replace the placeholder sprites with hand-drawn free assets, these are the sources found during setup:

- **Kenney** — kenney.nl / kenney.itch.io — CC0 2D/3D game assets (tiles, sprites, audio)
- **itch.io free platformer assets** — itch.io/game-assets/free/genre-platformer/tag-2d (2,700+ free packs)
- **OpenGameArt** — opengameart.org — free/CC-licensed sprites, tilesets and music

Replace files under `assets/` and update `js/game.js` `generateSprites()` / image loading to use them.

## Tech

Plain HTML5 Canvas + vanilla JavaScript. No frameworks, no build tooling.

## License

CC0 / public domain (matches the free-asset ethos). Art in this repo is procedurally generated at runtime.
