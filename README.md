# Gigi & Dodo

A pixel-art platformer I build with my kids. They tell me what should happen in the game, I tell Claude, Claude writes the code. Fully hands-off coding — the kids are the designers, Claude is the developer, I'm just the messenger.

Play it: open `index.html` in a browser. No build step, no dependencies — it's a single HTML file.

## How it was made

The workflow is deliberately simple:

1. Kids come up with an idea ("Dad, there should be a pirate king with a monkey", "the water needs to fill the gaps", "add a cat companion").
2. I paste the idea into Claude Code.
3. Claude edits `index.html`.
4. We play the result together and the kids decide what's next.

No hand-written code from me. The commit history is the design doc.

## The game

Two characters, Gigi and Dodo, take turns rescuing each other across chapters:

- **Chapter 1** — the start
- **Chapter 2** — Rise of the Robot King
- **Chapter 3** — The Pirate King's Castle

Features the kids asked for, in roughly the order they asked: a cat companion (based on one of their drawings), a chicken, power-ups, heart drops from crates, a T-Rex boss, a robot king boss, a monkey pirate king boss, pirate ships, castles with torches and banners, water that fills gaps at ground level, and trilingual text (Estonian, English, Italian — we're a mixed-language family).

Plays on desktop (keyboard) and mobile (on-screen d-pad, landscape required).

## Files

- `index.html` — the whole game
- `sprites.html` — sprite viewer the kids use to review characters
- `dino-editor.html` — tool we used to hand-draw the T-Rex boss
- `docs/plans/` — occasional planning notes

## License

MIT — see `LICENSE`.
