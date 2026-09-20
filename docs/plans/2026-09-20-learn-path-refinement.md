# Learn path refinement — design

Date: 2026-09-20
Status: approved, ready for implementation plan

## Problem

Learn mode works (the last two commits fixed dead controls and unwinnable
towers) but it does not feel good to play. Playtesting with the kids produced:
"seems too simple and complicated at the same time, need to select correct
letter and hard to reach ones make it almost always fail first".

Reading the code confirms all three complaints and locates them precisely.

### The platforming decides the answer, not the letter

Gate blocks are laid out at `gateW=120`, `gateGap=(640-360)/4=70`, so they sit
at x = 70, 260, 450. The launch pad centres the player at x = 320.

To land on the left block the player must travel 320 - 190 = 130px horizontally
(to its nearest edge) during a single jump. A full jump is airborne for roughly
46 frames at `spd=3.5` px/frame with `airAcc=0.55` ramp-up, giving about
140-150px of travel — and overshooting misses just as badly as undershooting.

So the middle answer is free and the outer two are near frame-perfect. A child
who knows the letter still fails; a child who does not can win by picking the
middle. The difficulty lives in the wrong place.

### The lesson is one question per tower climb

Each round is: 4 stepping platforms, 1 gate, 1 finish platform, a 90-frame
celebration, a result screen, and a SPACE press. That whole apparatus delivers
a single multiple-choice pick, repeated 8 times. Lots of jumping, very little
learning, and 8 interruptions.

### It is shape-matching, not letter learning

The target is only ever rendered. `LEIA TÄHT: A` above a block marked `A` can
be solved by matching glyph shapes with no letter knowledge at all. For the
actual audience — a pre-reader of 4-5 — this teaches nothing.

## Goals

Gameplay is smooth and fun: the challenge comes from knowing the letter, the
platforming is pure reward, and a wrong answer never costs progress.

## Non-goals

- Italian localisation. The README claims trilingual but `LANG_KEYS` is
  `['et','en']` only. Out of scope.
- New letter/syllable/word content. Existing pools stay.
- Any change to adventure-mode level design or combat.

---

## 1. The gate becomes a full-width ledge with three doorways

Replace the three separated jump-target blocks with **one platform spanning the
full screen width** (`x=0, w=BASE_W`). Combined with the existing horizontal
wrap (`px < -10` wraps to the right edge), the player **cannot fall off while
deciding**.

The floor is partitioned into three equal zones of `BASE_W/3` ≈ 213.33px:

```
        ╔══╗          ╔══╗          ╔══╗
        ║ K║          ║ A║          ║ S║
        ╚══╝          ╚══╝          ╚══╝
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   │  zone 0    │   zone 1    │   zone 2  │
   0          213           427         640
```

An arch is drawn centred in each zone (centres at 106.7, 320, 533.3). Because
the zones tile the full width, the player is **always** under exactly one arch.
There is no gap to miss and no precision requirement.

- Active zone: `clamp(floor((px + 8) / (BASE_W/3)), 0, 2)` — `px + 8` is the
  player centre for a 16px-wide sprite.
- The arch over the active zone highlights so the choice is visible before
  committing. This is essential for a pre-reader.
- Pressing jump while **grounded on a gate floor** submits that zone as the
  answer. It is not also a normal jump.

### The gate cannot be skipped — by physics, not geometry

The platform above a gate floor sits **135px** up. Derived from the existing
learn-mode constants (`jump = -9.0`, `g = 0.38`, apex hang halves g to 0.19
while `|pvy| < 2.0`):

| | Phase 1 (v → 2) | Phase 2 (2 → 0) | Total |
|---|---|---|---|
| Normal jump (`-9.0`) | (81-4)/(2·0.38) = 101.3px | 4/(2·0.19) = 10.5px | **111.8px** |
| Rocket (`-11.0`) | (121-4)/(2·0.38) = 153.9px | 10.5px | **164.4px** |

135px is 23px above normal reach and 29px below rocket reach. Comfortable
margin both ways, and no invisible ceiling geometry is needed.

### Two implementation traps

1. **Jump buffer must be cleared on gate-floor landing.** `pJumpBuf` is 12
   frames; landing with a buffered jump would instantly fire an unintended
   answer. Set `pJumpBuf = 0` when landing on a gate floor.
2. **The rocket must be exempt from the jump-cut.** The existing
   `if(!jk && pvy < -3.6) pvy = -3.6` would cap the rocket to a normal hop for
   any child who taps rather than holds jump, silently breaking the feature and
   trapping them under the gate. Set a `rocketing` flag on launch, skip the cut
   while it is set, clear it once `pvy >= 0`.

### Solved gates stay usable

A solved arch remains open and still launches. Otherwise a player who falls
back down onto a solved gate floor would be permanently stuck beneath it.

---

## 2. Correct answers rocket; wrong answers cost nothing

**Correct:** arch bursts open, `pvy = -11` with `rocketing = true`, particles,
`sfxCoin()`, voice speaks the letter plus a cheer, short rumble.

**Wrong:** arch shakes red, low tone (`playTone(150,.15,'triangle',.08,100)`),
the target is **re-spoken**, and a small hop (`pvy = -4`, reusing the existing
wrong-answer bounce value, *without* the `rocketing` flag so the jump-cut still
applies) plays so the press visibly registered. The player lands back on the
same floor. No fall, no reset, no lost progress. Duller rumble.

**Hint escalation:** after 2 wrong attempts on the same gate, the correct arch
begins a soft pulse. The child is never stuck and never needs an adult.

This removes the current behaviour where a wrong block goes non-collidable for
30 frames and drops the player through it — which reads as a punishment for a
*learning* mistake, exactly the wrong signal.

---

## 3. Voice is the prompt

This is what converts shape-matching into letter learning. Uses
`speechSynthesis` — no audio files, no build step, single-HTML-file constraint
preserved.

### Voice selection

Chosen once, cached, by fallback chain: **`et-EE` → `fi-FI` → `it-IT` → system
default**. Estonian voices are not installed by default on macOS or iOS;
Italian is widely available and renders Estonian vowels closely, which suits a
mixed-language family. `getVoices()` is asynchronous in Chrome, so the pick must
also run on the `voiceschanged` event.

If no voice is available the whole feature silently no-ops and the game plays
exactly as it does today. Existing WebAudio tones are unaffected.

### When it speaks

- Round start
- Landing on a gate floor
- Wrong answer (re-speak)
- Correct answer (letter + cheer)
- **On demand via `X`** — already the 🏹 button on mobile, so no new control

Rate 0.8 and pitch 1.1: slower and brighter for a small child.

### Language

Letters and words are **always spoken in Estonian**, independent of the `L`
toggle. The toggle changes UI chrome only. The content pools are Estonian;
pronouncing `KASS` with an English voice would teach the wrong sound.

In words mode, speak the whole word then the target letter ("KASS. K.") to
support blending.

---

## 4. Pacing: one tower = 4 gates = one result screen

Today: 8 separate climbs, each with an in-world celebration *and* a result
screen *and* a SPACE press.

New: one continuous climb through **4 gates**, celebrating in-world at each,
with a single result screen at the top. The arbitrary `totalRounds = 8` goes
away; at the top, SPACE starts a fresh tower and ESC returns to the menu, so
the kids stop when they are done rather than at a fixed count.

This unifies the three modes: **every word in `LEARN_WORDS` is exactly 4
letters**, so words mode is one word per tower, one letter per gate — the same
shape as 4 letters or 4 syllables.

### Tower layout per gate section

- 3 stepping platforms, 45px apart, horizontal positions constrained by the
  existing `MAX_HOP = 100` reachability rule
- gate floor, 50px above the last step, full width
- next landing platform, 135px above the gate floor

≈320px per section, ≈1280px per tower. Above the 4th gate sits the finish
platform and the star.

---

## 5. Readability, respawn, i18n, mobile

- **Progress readout:** four stars showing gates solved, replacing
  `Punktid: 350`. A number is meaningless to a pre-reader. Score is still kept
  internally and shown on the result screen.
- **Soft respawn:** falling more than 200px below the last solved gate floor
  fades the player back onto it, rather than the current instant teleport-snap.
- **i18n:** `LEIA TÄHT:`, `KIRJUTA SÕNA:`, `Punktid:`, `ESC = tagasi`, the menu
  strings and the cheer list are hardcoded Estonian today and ignore the `L`
  toggle entirely. All move into `TRANSLATIONS`.
- **Mobile back button:** a new `btn-back` mapped to `Escape`. There is
  currently no Escape on mobile at all, so kids cannot leave learn mode without
  reloading the page.

---

## 6. Global back navigation and pause menu

`Escape` is handled in only 7 of 15 game states. It is missing from `select`,
`intro`, `playing`, `dead`, `between`, `levelcomplete`, `gameover` and `win`.

Once past the difficulty screen the player is locked into the adventure
permanently. On keyboard the only exit is reloading the page; **on a controller
there is no exit at all**, even though the gamepad already maps button 8 to
`Escape`. The states simply never listen.

### Centralised back handling

Replace the scattered inline `justPressed['Escape']` checks with one
`BACK_TARGET` map and a single `handleBack()` consulted early in the update
loop. One place to reason about, and no state can be forgotten again.

| From | Back goes to |
|---|---|
| `title` | — (root) |
| `modeselect` | `title` |
| `difficulty` | `modeselect` |
| `select` | `difficulty` *(new)* |
| `intro` | `select` *(new)* |
| `playing`, `dead`, `between`, `levelcomplete` | `paused` *(new)* |
| `gameover`, `win` | `modeselect` *(new)* |
| `debug` | `title` |
| `learnmenu` | `modeselect` |
| `learnletters`, `learnresult` | `learnmenu` |
| `paused` | resume |

### Pause overlay, not instant quit

Select/Back is easy to hit by accident and binning a run instantly would be its
own kind of clunky. A new `paused` state freezes the game, renders the frozen
world beneath (via a stored `pausePrev`), and overlays three choices navigated
with ←/→ and confirmed with Space/OK:

> **JÄTKA** (continue) · **VAHETA MÄNGU** (switch mode) · **PEAMENÜÜ** (main menu)

Escape resumes, so a mis-press costs nothing. BGM continues.

**Start (button 9) also opens pause during play**, since Start is the
conventional pause button and some controllers have no comfortable Select. It
remains confirm in menus.

---

## 7. Controller-aware glyphs and sane bindings

Three strings hardcode `Ⓐ` (Ⓐ) — Xbox nomenclature. On the DualSense in use
that button is **✕**.

Worse, the current map is:

```js
0:'Space', 1:'KeyX', 2:'KeyX', 3:'KeyL',
```

**Button 3 is △ on a DualSense and it toggles the game language.** A prime face
button, exactly where a child mashes, silently flipping the entire UI language
mid-play with no confirmation. This is a bug, not a labelling issue.

### Detection

There is no official controller-type API, but `gamepad.id` carries USB
vendor/product IDs in two formats:

- **Chrome/Edge:** `DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)`
- **Firefox:** `054c-0ce6-DualSense Wireless Controller`
- **Safari:** name only, no IDs — hence the keyword fallback

Resolution order: parse vendor from either format (`054c` Sony, `045e`
Microsoft, `057e` Nintendo) → keyword match
(`/dualsense|dualshock|playstation|sony/i`, `/nintendo|switch|joy-?con/i`) →
default to Xbox, since the "standard gamepad" mapping is Xbox-shaped anyway.
Detected once on connect and cached.

### Glyphs

| Action | Index | Xbox | PlayStation | Nintendo |
|---|---|---|---|---|
| Jump / confirm | 0 | Ⓐ | ✕ | Ⓑ |
| Back / cancel | 1 | Ⓑ | ○ | Ⓐ |
| Shoot | 2 | Ⓧ | □ | Ⓨ |
| Pause | 9 | ☰ | OPTIONS | + |

Nintendo genuinely swaps A/B and X/Y against Xbox positions at the same
indices. The three `Ⓐ` literals become a `{A}` placeholder substituted at
draw time.

### Binding fixes

1. **Button 1 becomes Back in menus**, staying Shoot during gameplay. ○ and Ⓑ
   are universally cancel on both platforms — matching thumb expectation and
   adding a second route out of the §6 dead ends.
2. **Language toggle only works in menu states.** No more accidental mid-run
   language flips from △/Ⓨ.

Context-dependent mapping means a button held across a state change could
release the wrong key code. Store the *code* that was pressed per index in
`gpPrev` and release using the stored code, not a freshly computed one.

### Rumble

`gamepad.vibrationActuator.playEffect('dual-rumble', …)`, wrapped in try/catch
and no-oping on pads that do not support it:

- Correct answer: `{duration:120, strongMagnitude:0, weakMagnitude:0.6}`
- Wrong answer: `{duration:200, strongMagnitude:0.35, weakMagnitude:0}`

---

## Build order

§6 and §7 first: both are small, self-contained, game-wide fixes, and together
they make learn mode far easier to test — no page reloads to get back out, and
correct button prompts while testing on the DualSense.

Then §1-2 (the gate), §3 (voice), §4 (pacing), §5 (polish).

## Verification

Physics margins (111.8px normal vs 135px gap vs 164.4px rocket) are derived
from constants, so they must be confirmed in play, not assumed:

- A held jump from a gate floor cannot reach the platform above.
- A **tapped** jump on a correct arch still clears it — this is the jump-cut
  trap and the single most likely silent failure.
- Landing on a gate floor with jump held does not auto-submit an answer.
- Falling back onto a solved gate floor can re-launch through the open arch.
- All three zones are reachable by walking, including via the wrap.
- Back works from all 15 states, on keyboard, DualSense and touch.
- With no Estonian voice installed, the game is silent but fully playable.
