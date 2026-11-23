# Story and Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** the T-Rex story told through an opening, named chases, a three-beat world change and
a world map; device-aware prompts that work.
**Spec:** `docs/superpowers/specs/2026-11-23-story-and-transitions-design.md`.
**Ground rules:** worktree `.claude/worktrees/story` (branch `story`, from `origin/main`); pure
rules in `src/game/`; capitals for every child-facing word; test first; PR against main.

- [ ] **Task 1: The story as data.** `src/game/story.ts`: for a transition (opening, after a
  chase level, after a boss) the villains, the lines (i18n keys and the names put in), the world
  number and the level within the world. Tests over every stage of the run.
- [ ] **Task 2: The words.** New capitalised keys in `src/config/i18n.ts` (villains' names and
  their partitive forms, the story's lines, the world names, the prompt), `tests/i18n.test.ts`.
- [ ] **Task 3: Which button to name.** `src/input/source.ts` (keyboard, pad or touch, last used),
  set by real key presses, the pad's buttons and the touch buttons; the confirm button's name.
  Tests.
- [ ] **Task 4: The world map.** `src/gfx/worldMap.ts`: panel, path, badges, stars, the hero
  walking between two worlds.
- [ ] **Task 5: The cutscene.** `src/scenes/BetweenScene.ts`: the world's sky and hills; the opening,
  the named chase with dots, the reunion / beaten boss / snatch / map; skipping moves to the
  next beat; the prompt only when it works. `CharacterScene` starts the opening; `LevelOverlay`
  and `WinScene` lines.
- [ ] **Task 6: In the browser.** Every kind of transition, keyboard and touch prompts.
