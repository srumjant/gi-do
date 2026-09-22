# Phaser Migration, Plan 4: Level One, Finishable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make level 1 a game you can lose and win. Enemies that can kill you, the two enemy types it still lacks, and the rescue that ends the level.

**Architecture:** More of what Plan 2 established — behaviour as pure functions in `src/game/`, verified frame by frame against the live game.

**Read first:** `docs/superpowers/specs/2026-09-20-phaser-migration-design.md`

---

## Keep it lean

Rigour goes where drift is invisible and consequential. That means:

- **No mutation testing** unless a test's value is genuinely in doubt.
- **No unit tests for drawing.** Rendering is verified in a browser.
- **No test-per-item.** One assertion over a collection beats sixty over sixty items.
- The trace comparison is the real safety net. Lean on it rather than duplicating it.

`npm run build && npm test` still runs once before each commit — `vitest` does not type-check.

## The payoff

Right now every player-focused trace runs with `suppressEnemies: true`, because contact
damage is not implemented: the live game kills the player on contact and the port walks
through. That suppression is the largest caveat in the whole validation story.

**Task 1 removes it.** Once contact damage exists, the traces can run with enemies live,
and the comparison covers the thing it has been deliberately avoiding. That is worth more
than any of the individual entities in this plan.

## What is in scope

Level 1's cast is `doll`, `car`, `bat`, `dino`, `bouncer`. The first three are done. So:
**bat**, **bouncer**, **contact damage**, **death and respawn**, and the **rescue that ends
the level**.

## What is deliberately out

The cat, the bow and arrows, the three silly power-ups, the `?` and rainbow block bumps
and their stars, score, lives display, and every enemy type level 1 does not use (ghost,
cannon, penguin, icebat) plus the boss. Those are a later plan.

Two of those exclusions have a reason worth stating:

- **The rainbow block calls `giveRandomSillyPowerup()`** (`index.html:1412`), so bumping
  one cannot be ported before the power-ups are. Both block types wait together.
- **The cape is what invincibility is for.** `playerHit` (`index.html:1646`) only sets
  `p.invincible` on the cape branch; with no cape it goes straight to `playerDie`. So
  contact damage lands in this plan and invincibility frames wait for the cape.

---

## Task 1: Contact damage, death and respawn

**Files:** `next/src/game/player.ts`, `enemy.ts`, `world.ts`, `types.ts`; `next/tests/trace.test.ts`

**The live source.**

`playerHit` (`index.html:1646`) — note the whole invincibility path is the cape's:

```js
function playerHit(){
  const p=player,dc=DC(),iTime=dc.invincibleTime||60;
  if(p.hasCape){p.hasCape=false;p.invincible=iTime;p.vy=-4;...;return;}
  playerDie();
}
```

`playerDie` (`:1647`):

```js
function playerDie(){lives--;gameState='dead';stateTimer=90;...}
```

The dead branch of `update()` (`:1348`), which is also the respawn:

```js
if(gameState==='dead'){stateTimer--;
  if(stateTimer<=0){
    if(lives>0)initLevel(currentLevel);
    else{gameState='gameover';stateTimer=180;startBGM(BGM_GAMEOVER);}
  }
  return;}
```

And the side-contact branch of the stomp check (`:1546`) — the `else` the port currently
leaves empty:

```js
else{playerHit();return;}
```

Note that `return` — a hit ends the whole enemy loop for that frame, it does not continue
to the next enemy.

**What to build.**

- `World` gains `lives: number` and `stateTimer: number`. `lives` starts from
  `dc.lives` — which is `Infinity` on `super_easy`, so it is a `number`, not an integer
  count, and `lives--` on `Infinity` stays `Infinity`. Do not "fix" that.
- Side contact calls a `playerHit` that, with no cape in scope, goes straight to death.
- Death sets `dead`, `stateTimer = 90`, and decrements `lives`.
- The dead branch counts `stateTimer` down and then **rebuilds the level** — the port's
  equivalent of `initLevel(currentLevel)`. Note what the live `initLevel` does NOT reset:
  `lives` and `score` survive a respawn (`index.html:1163`); everything else is rebuilt.
- Out of lives goes to a game-over state. The slice has no game-over screen, so model the
  state and leave it terminal; say so in a comment.

**Then remove the suppression.** Drop `suppressEnemies: true` from the player traces in
`trace.test.ts` and let them run with enemies live. Expect scripts to start dying — that
is the point. Two things follow:

- Scripts that previously ran long now hit the doll (frame 59 running right, frame 240
  standing still). Either they still match through death and respawn, in which case leave
  them long, or they need bounding — decide per script and say which you did.
- The 90-frame respawn is now implemented, so scripts may run past it. Check that a script
  crossing a respawn still matches; that is the strongest evidence this task works.

If a trace diverges and you cannot explain it, **report it rather than making it pass**.

---

## Task 2: The bat

**Files:** `next/src/game/enemy.ts`

**The live source.** Spawn (`index.html:1217`):

```js
if(def.type==='bat'||def.type==='icebat'){
  e.y=gy-h-60;e.originY=e.y;e.vx=-1.2*dc.enemySpeed;e.noGravity=true;
  e.sineOffset=Math.random()*Math.PI*2;}
```

Movement (`:1535`):

```js
else if(e.type==='bat'||e.type==='icebat'){
  e.x+=e.vx;
  e.y=e.originY+Math.sin(animFrame*.06+e.sineOffset)*30;
  if(e.x<0||e.x>lvl.width*TILE)e.vx*=-1;}
```

**`sineOffset` is `Math.random()`, and that breaks determinism.** The trace driver already
stubs the live game's `Math.random` to a constant 0.5, so the live bat always gets
`0.5 * PI * 2 = PI`. The port must draw from the same source or every bat trace diverges
immediately.

Give the port an injectable random — a module-level function defaulting to `Math.random`,
with a setter the tests use to pin it to the same constant. Do not seed a PRNG; match the
driver's stub exactly, which is a constant.

Three things to preserve:

- **`noGravity`.** The bat writes `y` from a sine each frame; it is not a physics body.
  `EnemyState` needs `originY` and `sineOffset`, and the gravity branch must skip it.
- **The sine reads `animFrame`, not a per-enemy timer.** All bats share a clock and differ
  only by their offset.
- **It turns at the world edges, not at walls or ledges.** `e.x < 0 || e.x > width*TILE`.

Level 1 has bats at tiles 48 and 95.

---

## Task 3: The bouncer

**Files:** `next/src/game/enemy.ts`

Spawn (`index.html:1219`): `e.vx=-1.0*dc.enemySpeed; e.bounceTimer=0;`

Movement (`:1537`):

```js
else if(e.type==='bouncer'){
  e.bounceTimer++;
  if(e.bounceTimer>40&&e.vy===0){
    e.vy=dc.bouncerJumpForce;e.bounceTimer=0;
    e.vx=(p.x>e.x?1.5:-1.5)*dc.enemySpeed;}
  e.x+=e.vx;
  const ef=e.vx>0?e.x+e.w:e.x;
  if(isSolid(getTile(ef,e.y+e.h/2)))e.vx*=-1;}
```

Unlike the ground patrollers it **does** use gravity (no `noGravity`), re-aims at the
player on every hop, and turns at walls but **not at ledges** — so it can hop off into a
pit. That is live behaviour.

`EnemyState` needs `bounceTimer`. `dc.bouncerJumpForce` is **−6** on normal (−3 on
super_easy, −7 on hard).

Level 1 has one, at tile 73.

---

## Task 4: The rescue, and winning

**Files:** `next/src/game/world.ts`, `types.ts`

The live check (`index.html:1630`):

```js
const canRescue=!boss||bossDefeated;
if(canRescue&&rectOverlap({x:p.x,y:p.y,w:p.w,h:p.h},{x:rX,y:rY,w:16,h:rDH})){
  gameState='levelcomplete';stateTimer=200;score+=...;}
```

There is no boss on level 1, so `canRescue` is always true here — but port the condition
rather than dropping it, and note the boss is a later plan.

The geometry, from `index.html:1629`:

```js
const rs=getRescueSprites(),rTX=lvl.rescuePos[0],rGY=findGroundY(rTX),
      rDH=spriteH(rs.sprite,2),rX=rTX*TILE,rY=rGY-rDH;
```

So the height comes from the rescued character's sprite at scale 2 — it depends on who is
being rescued, which is the *other* character, and Gigi and Dodo are different heights (28
and 24 at scale 2). The overlap box's **width is hardcoded 16**, not taken from the sprite.
`getRescueSprites` and `findGroundY` are both already ported.

`World` gains a `won: boolean` (or a small state enum alongside `dead`, if that reads
better — your call, say which). Winning freezes the world the way dying does: the live
`levelcomplete` branch does not run the playing branch.

Level 1's rescue is at tile (115, 20).

Add a trace script that runs to the rescue and wins. It is long — roughly 115 tiles — so
check how many frames that takes and whether the gaps need jumping. If a single scripted
input cannot reliably cross the level, say so and test the win condition directly instead
of through a trace; do not spend an afternoon choreographing jumps.

---

## Task 5: Draw them, and look at it

**Files:** `next/src/scenes/SliceScene.ts`

The bat and bouncer already have textures registered — `registerTextures` covers every
enemy type. They should draw with no scene changes at all. Confirm that rather than
assuming it.

Verify in a browser, and remember **an unfocused tab throttles `requestAnimationFrame` to
zero** in this environment. Stepping Phaser's loop by hand works around it:

```js
let t = 0; const step = (n) => { for (let i=0;i<n;i++){ t += 16.667; game.step(t, 16.667); } };
```

Check: bats fly and bob, the bouncer hops and re-aims, walking into any enemy kills you,
the level restarts after about a second and a half, and touching the rescue ends it.

Screenshot it.

---

## Done when

- [ ] The player traces run with enemies **live** — no `suppressEnemies` — and match.
- [ ] A trace crossing a death and respawn matches.
- [ ] `npm test` and `npm run build` green.
- [ ] `src/game/` still imports no Phaser.
- [ ] Level 1 can be lost and won in a browser.
- [ ] `index.html` untouched.

## What comes next

The cat, the bow and arrows, the power-ups and the block bumps; then the enemy types level
1 does not use, and the boss; then the scenes and HUD; learn mode; input unification;
cutover. And the felt shader whenever it is wanted.
