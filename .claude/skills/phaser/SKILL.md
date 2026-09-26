---
name: phaser
description: Use when writing, reviewing or debugging Phaser code in next/ (the Phaser 4 port), or unsure how a Phaser 4 API works - game config, scenes, scaling and fullscreen, input, loading, sound, cameras, tweens, timers, particles, filters and glow, tint, text, tilemaps, Arcade physics, textures - or about to use a Phaser 3 API from memory.
---

# Phaser

## Overview

The port in `next/` runs on Phaser 4, and Phaser ships its own guides for agents inside
the npm package: one folder per topic, written for the version installed. Phaser 4 renamed
or emptied many Phaser 3 APIs (FX became filters, pipelines became render nodes, and
`setTintFill()` is still there but does nothing), so an API remembered from Phaser 3 can
fail silently. Read the matching guide before writing Phaser code.

For one method's signature, the types are quickest (`next/node_modules/phaser/types/phaser.d.ts`).
For how a feature is meant to be used, its gotchas and what changed in v4, read the guide.

## Where the guides are

- `next/node_modules/phaser/skills/<topic>/SKILL.md`, matching the Phaser in
  `next/package.json` (4.2.1 now). Some topics add `references/REFERENCE.md`, the fuller
  API tables. Guides link each other as `../<topic>/SKILL.md`.
- Which guide covers an API: `grep -rln "setTintMode" next/node_modules/phaser/skills`.
- No `node_modules`: run `npm install` in `next/`, or read the same file on GitHub at the
  matching tag, `https://raw.githubusercontent.com/phaserjs/phaser/v4.2.1/skills/<topic>/SKILL.md`.
  `master` may describe a newer Phaser than the one installed.
- A guide and the code disagree: the installed code wins. Source in
  `next/node_modules/phaser/src/` (each guide names its files), types in
  `next/node_modules/phaser/types/phaser.d.ts`.

## Topics

| Topic | For |
|---|---|
| game-setup-and-config | `new Phaser.Game`, GameConfig, renderer, pixelArt, fps, boot |
| scale-and-responsive | ScaleManager, FIT and other modes, centring, fullscreen, orientation |
| scenes | lifecycle, start and stop, parallel scenes, sleep, pause |
| loading-assets | `this.load`: images, audio, fonts, atlases, progress |
| input-keyboard-mouse-touch | keys, pointer, drag, hit areas, gamepad |
| audio-and-sound | SoundManager, play, volume, markers, autoplay unlock |
| cameras | zoom, bounds, follow, fade, flash, shake, pan |
| tweens | tweens, chains, easing, stagger, yoyo |
| time-and-timers | delayedCall, TimerEvent, Clock, Timeline |
| particles | emitters, zones, gravity wells, explode |
| filters-and-postfx | Glow, blur, bloom, colour matrix, shaders |
| sprites-and-images | Sprite and Image, frames, tint and tint modes |
| game-object-components | Transform, Alpha, Tint, Origin, Depth, Mask, bounds |
| graphics-and-shapes | Graphics, shapes, generated textures |
| text-and-bitmaptext | Text, web fonts, BitmapText, word wrap |
| render-textures | RenderTexture, DynamicTexture, snapshot, stamp |
| tilemaps | Tilemap, layers, tile collision |
| physics-arcade | bodies, velocity, collide and overlap |
| physics-matter | Matter.js bodies and constraints |
| groups-and-containers | Group, Container, Layer, pooling |
| animations | spritesheet animations |
| events-system | EventEmitter, game and scene events |
| data-manager | setData, getData, registry |
| actions-and-utilities | Phaser.Actions, align, grid |
| geometry-and-math | Vector2, Rectangle, random, angles |
| curves-and-paths | curves, paths, PathFollower |
| v3-to-v4-migration | everything that changed from Phaser 3 |
| v4-new-features | filters, render nodes, Gradient, Noise, GPU layers |

That is Phaser 4.2.1's list; after an upgrade, `ls next/node_modules/phaser/skills`.

## What the guides do not know about this project

- Phaser's own features first; our own code only for a strong reason (the owner's rule,
  `docs/superpowers/specs/2026-09-23-learn-tower-design.md`, Decisions).
- `next/src/game/**` stays free of Phaser, because Vitest cannot import it
  (`next/tests/world.test.ts` checks).
- Sharp text and sprites come from `RENDER_SCALE` (`next/src/gfx/render.ts`): the canvas is
  2 to 4 times the 640x400 layout and every camera is zoomed to match. Not `scale.zoom`,
  which only stretches the canvas.
- Arcade runs with `customUpdate: true`, stepped by the scenes on a fixed 60 Hz
  (`next/src/main.ts`).
- The order of the `scene` list in `main.ts` is the draw order; read its comment first.
- The game boots with `Phaser.AUTO`, so it can fall back to the Canvas renderer, where
  WebGL-only features do nothing: filters such as Glow are null, and tints are ignored (the
  source tags them `@webglOnly`; the guides do not always say). Effects must still read
  without them.
