# Assets

This folder is intentionally empty. The game uses procedurally-generated pixel art (drawn to offscreen canvases in `js/game.js` `generateSprites()`), so it runs immediately with zero external asset downloads.

If you want to swap in real free art, here are the sources found online during project setup:

| Source | URL | Notes |
|--------|-----|-------|
| Kenney Game Assets | https://kenney.nl | CC0, 60,000+ assets incl. 2D sprites, tiles, audio |
| itch.io free platformer assets | https://itch.io/game-assets/free/genre-platformer/tag-2d | 2,700+ free 2D platformer packs |
| OpenGameArt | https://opengameart.org | Free / CC-licensed sprites, tilesets, music |

To use them: drop replacement PNGs into this folder, then update `generateSprites()` in `js/game.js` to load the images instead of drawing procedural shapes. Keep licenses compatible with CC0.
