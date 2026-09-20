# Phaser Migration, Plan 5: Level One's Full Cast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Everything level 1 contains that the port still lacks — the pickups, the blocks
you hit from below, the three silly power-ups, the bow, the cat, and the cape.

**Architecture:** Unchanged from Plans 2 and 4. Behaviour is pure functions in
`src/game/` with no Phaser import, verified frame by frame against the live game.

**Tech Stack:** TypeScript, Vitest, the `driveLiveGame` harness in
`next/tests/helpers/liveGame.ts`.

---

## Keep it lean

Same discipline as Plan 4, and for the same reason:

- **No mutation testing** unless a test's value is genuinely in doubt.
- **No unit tests for drawing.** Rendering is verified in a browser.
- **No test-per-item.** One assertion over a collection beats sixty over sixty items.
- The trace comparison is the real safety net. Lean on it rather than duplicating it.

`npm run build && npm test` runs once before each commit — `vitest` does not type-check.

## What is in scope

Exactly Plan 4's "deliberately out" list, minus the enemies:

bow and super pickups, stars, the `?` and rainbow blocks, the three silly power-ups
(fart jump, big head, chicken ray), arrows and the chicken conversion, the cat companion,
the cape, invincibility frames, and score.

## What is deliberately out

- **Every enemy level 1 does not use** — ghost, cannon, penguin, icebat — **and the boss.**
  Plan 6.
- **Particles.** The port has never had them and this plan does not add them. They are
  presentation: nothing reads a particle back. See the note below on why omitting them is
  safe for the traces, which is not obvious.
- **Sound.** The audio engine exists from Plan 1 but is not wired to gameplay. Its own
  plan, alongside the HUD.
- **The HUD**, including the lives and score display and the power-up popup. Score is
  *tracked* here because pickups and stomps write to it; it is not *drawn* here.
- **Learn mode**, which changes what the blocks do.

## Particles, and why leaving them out is safe

`spawnParticles` (`index.html:1157`) calls `Math.random()` four times per particle, and
this plan ports code that sits directly between those calls. In the live game those draws
advance the RNG stream, so you might expect that skipping them desynchronises every
subsequent random draw and wrecks the comparison.

It does not, because `tests/helpers/liveGame.ts` stubs `Math.random` to a **constant**
0.5 rather than seeding a generator. A constant has no stream position, so how many times
either side calls it is irrelevant. This is the same property Plan 4 relied on for the
bat's `sineOffset`.

Worth knowing rather than rediscovering: it means particles can be added later, in any
order, without touching a single trace.

---

## Task 1: Pickups and stars

**Files:** `next/src/game/world.ts`, `types.ts`; `next/tests/trace.test.ts`

**Spawn (`index.html:1183-1191`).** `initLevel` builds three collections from the level
record and the map:

```js
cat=null;
if(lvl.catPosition!=null){
  const cx=lvl.catPosition;
  catPickup={x:cx*TILE,y:findGroundY(cx)-spriteH(CAT_S,2),collected:false};
}else{catPickup=null;}
```

```js
stars=[]; questionBlocks=[]; arrows=[]; enemyProjectiles=[]; rainbowBlocks=[]; powerupPopup=null;
...
else if(map[y][x]===5) rainbowBlocks.push({x,y,hit:false});
```

`bowPositions` and `superPositions` are per-level arrays (`index.html:897` onward);
level 1 is `bowPositions:[35,70], superPositions:[22,85], catPosition:50`.

**But the record is not the answer.** `index.html:1173-1179`:

```js
let bowPos=lvl.bowPositions||[], superPos=lvl.superPositions||[];
if(dc.enemySkipChance){
  const extra=[];for(let i=10;i<lvl.width-10;i+=20)extra.push(i);
  superPos=[...superPos,...extra];
  bowPos=[...bowPos,...extra.map(x=>x+5)];
}
```

The field that makes enemies spawn less often *also injects extra pickups every 20 tiles*,
supers at `i` and bows at `i+5`. There is no dedicated flag; `enemySkipChance` being truthy
is the whole condition. On an easy difficulty level 1 has a dozen more pickups than its
record lists. Derive the positions, never hardcode them.

Every trace runs at `normal`, which has no `enemySkipChance`, so **no test will exercise
this branch.** It has to be right by reading, not by going green. Same blind spot the
`super_easy`-only difficulty fields had in Plan 1.

**Collection (`index.html:1447-1448`, `:1519`).**

```js
bowPickups.forEach(b=>{if(!b.collected&&rectOverlap({x:p.x,y:p.y,w:p.w,h:p.h},{x:b.x,y:b.y,w:16,h:16})){b.collected=true;p.hasBow=true;p.bowCharges=dc.bowCharges;sfxPickup();...}});
superPickups.forEach(s=>{if(!s.collected&&rectOverlap({x:p.x,y:p.y,w:p.w,h:p.h},{x:s.x,y:s.y,w:16,h:16})){s.collected=true;p.hasCape=true;sfxPickup();...}});
```

```js
stars.forEach(s=>{if(s.collected)return;if(s.vy){s.vy+=.1;s.y+=s.vy;if(s.vy>0)s.vy=0;}
  if(rectOverlap({x:p.x,y:p.y,w:p.w,h:p.h},{x:s.x,y:s.y,w:10,h:10})){s.collected=true;score+=Math.round(100*dc.scoreMultiplier);...}});
```

Four things to preserve:

- **Pickup hitboxes are literals, not sprite sizes.** 16×16 for bow and super, 10×10 for
  a star, 16×22 for the cat. The sprites are drawn at other sizes; do not derive one from
  the other.
- **A star's rise is a one-way ramp.** `s.vy+=.1` then `if(s.vy>0)s.vy=0` — it drifts up
  from the block, decelerates, and stops dead. It never falls back. And the guard is
  `if(s.vy)`, so a star with `vy === 0` skips the whole block: stars freeze permanently
  where they stop.
- **`bowCharges` comes from the difficulty record**, not a constant: 8 on `super_easy`
  down to 2 on the hardest.
- **Score is `Math.round(100 * dc.scoreMultiplier)`** — rounded per award, not
  accumulated and rounded at the end. Port the rounding site exactly or totals drift.

`score` is currently absent from `World`. Add it, initialised in `createWorld`. It
**survives death**: `score=0` appears only at run start (`index.html:1347`) and the debug
level jump, never on the respawn path, which is `initLevel(currentLevel)` at `:1348`. So
`respawnLevel` must leave it alone.

**Test.** One trace that walks the player over level 1's first bow at tile 35 and first
super at tile 22, asserting `hasBow`, `bowCharges`, `hasCape` and `score` against the live
game frame by frame. Stars are covered by Task 3, which is what creates one.

---

## Task 2: The three silly power-ups

**Files:** `next/src/game/player.ts`, `enemy.ts`, `random.ts` (new), `types.ts`

**The source (`index.html:1148-1156`).**

```js
function giveRandomSillyPowerup(){
  const types=['fart','bighead','chicken'];
  const type=types[Math.floor(Math.random()*types.length)];
  if(type==='fart'){player.fartTimer=900;}
  else if(type==='bighead'){player.bigHeadTimer=1200;}
  else{player.chickenRayCharges=8;player.hasBow=true;}
  powerupPopup={type:type,timer:120,maxTimer:120};
  sfxPickup();sfxWin();padRumble(0,0.35,80);
}
```

**Timers and the fart stun (`index.html:1432-1443`).**

```js
if(p.fartTimer>0)p.fartTimer--;
if(p.bigHeadTimer>0)p.bigHeadTimer--;
...
if(p.fartTimer>0){
  enemies.forEach(e=>{if(!e.alive)return;
    const edx=e.x+e.w/2-(p.x+p.w/2),edy=e.y+e.h/2-(p.y+p.h/2);
    if(Math.sqrt(edx*edx+edy*edy)<50){e.stunTimer=(e.stunTimer||0)+120;...}
  });
}
```

**Fart jump (`index.html:1383`).** The jump force is multiplied in place:

```js
p.vy=p.fartTimer>0?dc.jumpForce*1.5:dc.jumpForce;
```

**Big head changes the stomp (`index.html:1542-1546`).**

```js
const shm=(dc.stompHitbox||1)*(p.bigHeadTimer>0?1.5:1);
const bhx=p.bigHeadTimer>0?8:0;
if(p.invincible<=0&&rectOverlap({x:p.x+2-bhx,y:p.y,w:p.w-4+bhx*2,h:p.h},{x:e.x,y:e.y,w:e.w,h:e.h})){
  if(!e.noStomp&&p.vy>0&&p.y+p.h-4<e.y+e.h*shm/2){...
    if(p.bigHeadTimer>0){e.squashTimer=45;...}}
  else{playerHit();return;}}
```

Four traps:

- **`stompHitbox` and the big-head multiplier compound.** `super_easy` has
  `stompHitbox: 2.0`, and big head makes it 3.0. The `||1` fallback is load-bearing: most
  difficulty records have no `stompHitbox` at all.
- **Big head widens the collision box on both sides** (`-bhx` on x, `+bhx*2` on w) but
  leaves height alone. It makes you easier to hit as well as easier to stomp with.
- **The fart stun is unbounded and cumulative.** `e.stunTimer = (e.stunTimer||0) + 120`
  every frame you stand within 50px. After a second in range an enemy is stunned for
  minutes. That is the live behaviour; keep it.
- **`chicken` sets `hasBow` too.** The chicken ray shares the bow's firing path, so
  `hasBow` and `chickenRayCharges` are both consulted. Do not model them as one flag.

**The random seam.** `enemy.ts` already owns a module-level `randomSource` with a
`setRandom` setter (added for the bat's `sineOffset`). This task adds a second consumer,
and `world.ts:214` already calls `Math.random()` directly for `enemySkipChance` — a third.
Move the seam into a new `src/game/random.ts`, re-export or re-point the two existing
callers at it, and use it here. One seam, three callers. Keep `setRandom`'s name so the
existing tests do not churn.

Do not seed a PRNG. Match the driver's stub, which is a constant.

**Test.** `Math.floor(0.5 * 3) === 1`, so under the harness `giveRandomSillyPowerup`
always yields `bighead`. That means a trace exercises exactly one of the three branches.
Cover fart and chicken with direct unit tests on the function, pinning the injected random
to 0.1 and 0.9. This is the one place in this plan where a unit test earns its keep,
because the trace physically cannot reach the other two branches.

---

## Task 3: Blocks you hit from below

**Files:** `next/src/game/player.ts`, `world.ts`, `types.ts`

**The source (`index.html:1417-1421`).** This sits inside the head-hit branch of the Y
sweep, which the port already has:

```js
else if(p.vy<0){const hY=p.y;if(isSolid(getTile(pL2,hY))||isSolid(getTile(pR2,hY))){p.y=Math.floor(hY/TILE)*TILE+TILE;p.vy=0;
  const h1=Math.floor(pL2/TILE),h2=Math.floor(pR2/TILE),hy=Math.floor(hY/TILE);
  [h1,h2].forEach(hx=>{const qb=questionBlocks.find(q=>q.x===hx&&q.y===hy&&!q.hit);if(qb){qb.hit=true;map[qb.y][qb.x]=2;stars.push({x:qb.x*TILE,y:qb.y*TILE-TILE,vy:-2,collected:false});...}});
  [h1,h2].forEach(hx=>{const rb=rainbowBlocks.find(q=>q.x===hx&&q.y===hy&&!q.hit);if(rb){rb.hit=true;map[rb.y][rb.x]=2;...;giveRandomSillyPowerup();}});
}}
```

Five things to preserve:

- **`hy` is computed from `hY`, which is `p.y` *before* the snap.** The snap on the line
  above reassigns `p.y`, but `hY` was captured first. Read the wrong one and you look up
  the tile below the block.
- **A `?` block is tile 3 and a rainbow is tile 5**, and both are already solid
  (`isSolid` is `t===1||t===2||t===3||t===5`). Bumping one turns it into tile 2, another
  solid, so the change is cosmetic to collision and total to the block lists.
- **The map is mutated, and respawn rebuilds it.** `initLevel` starts with
  `map=lvl.generate(dc)` (`index.html:1165`) and re-derives both block lists from the
  fresh map, so dying restores every bumped block. `respawnLevel` in the port must
  regenerate rather than reuse — the opposite of `score`, one line above it.
- **Both columns are checked, and both lists are swept separately.** A wide player
  straddling two blocks pops both. A `?` and a rainbow in adjacent columns both fire.
- **The star spawns one tile *above* the block** (`qb.y*TILE - TILE`) with `vy:-2`, which
  is what Task 1's one-way ramp then decelerates.
- **The rainbow block calls `giveRandomSillyPowerup()`**, which is why Task 2 comes first.

**Test.** Level 1's `?` blocks are at tiles `[12,16] [32,13] [55,15] [72,14] [90,15]
[102,16]` and its single rainbow block is at `[43,12]` (`index.html:891-892`). One trace
that jumps into the block at 12,16: assert the map cell changed, a star exists at the
right place, and the star's `y`/`vy` track the live game's for the frames after. A second
that jumps into 43,12 and asserts the power-up landed. Both are reachable on foot, so
neither needs `mutateMap`.

---

## Task 4: The bow, arrows, and the chicken ray

**Files:** `next/src/game/player.ts`, `world.ts`, `enemy.ts`, `types.ts`

**Firing (`index.html:1391-1398`).**

```js
if(p.arrowCooldown>0)p.arrowCooldown--;
if(((p.hasBow&&p.bowCharges>0)||p.chickenRayCharges>0)&&(justPressed['KeyX']||justPressed['KeyZ']||justPressed['ShiftRight']||justPressed['ControlRight'])&&p.arrowCooldown<=0){
  const isChicken=p.chickenRayCharges>0;
  arrows.push({x:p.facing>0?p.x+p.w:p.x-12,y:p.y+p.h/2-2,vx:p.facing*6,life:60,isChicken:isChicken});
  if(isChicken){p.chickenRayCharges--;sfxCluck();}else{p.bowCharges--;sfxShoot();}
  if(p.bowCharges<=0&&p.chickenRayCharges<=0)p.hasBow=false;
  p.arrowCooldown=15;
}
```

**Flight and hits (`index.html:1503-1516`).**

```js
arrows.forEach(a=>{a.x+=a.vx;a.life--;if(isSolid(getTile(a.x,a.y))||isSolid(getTile(a.x+10,a.y)))a.life=0;
  enemies.forEach(e=>{if(!e.alive)return;if(rectOverlap({x:a.x,y:a.y,w:12,h:4},{x:e.x,y:e.y,w:e.w,h:e.h})){
    if(a.isChicken&&!e.isChicken){
      e.isChicken=true;e.type='chicken';e.vx=(Math.random()>.5?1:-1)*1.5;
      e.noGravity=false;e.noStomp=false;e.stunTimer=0;
      e.w=spriteW(CHICKEN_S,ENEMY_SCALE);e.h=spriteH(CHICKEN_S,ENEMY_SCALE);
      a.life=0;score+=Math.round(100*dc.scoreMultiplier);
      ...
      return;
    }
    e.alive=false;e.squashTimer=30;a.life=0;score+=Math.round(200*dc.scoreMultiplier);...
  }});
});
arrows=arrows.filter(a=>a.life>0);
```

Five traps:

- **`justPressed`, not held.** The port's `InputState` must expose edge-triggered fire.
  Check how Plan 2 modelled jump's `justPressed` and reuse it; do not add a second
  mechanism.
- **Chicken ray takes priority whenever charges exist**, even with bow charges in hand.
- **The arrow's collision box (12×4) is not its flight probe.** Tiles are tested at `a.x`
  and `a.x+10`, enemies against a 12-wide rect. Two different widths, both deliberate.
- **Chicken conversion rewrites the enemy in place** — type, size, gravity, stomp, stun,
  and a random direction. A converted bat becomes a ground-walking chicken. `noGravity`
  and `noStomp` going false is what makes that work.
- **The `return` inside the inner `forEach` skips the kill branch for that enemy only**,
  so a chicken arrow converts rather than kills. The outer loop continues, and `a.life=0`
  means the arrow is spent either way. This is the same `return`-in-`forEach` shape Plan 4
  got wrong once already: it is a `continue`, not a `break`.

**Test.** A trace with a fire input after collecting the bow: arrow position, `life`,
`bowCharges` and `score` frame by frame, through at least one enemy hit. Conversion is
reachable in a trace only via the rainbow block's `bighead` — so cover it by seeding
`chickenRayCharges` in `beforeRun` instead.

---

## Task 5: The cat

**Files:** `next/src/game/world.ts`, `types.ts`

**Pickup (`index.html:1450-1454`).**

```js
if(catPickup&&!catPickup.collected&&rectOverlap({x:p.x,y:p.y,w:p.w,h:p.h},{x:catPickup.x,y:catPickup.y,w:16,h:22})){
  catPickup.collected=true;
  cat={x:p.x-20,y:p.y,vx:0,vy:0,facing:1,frame:0,frameTimer:0,scratchTimer:0,scratchTarget:null,hitsLeft:3,bounceDir:1,baseY:0,onGround:true};
  ...
}
```

**The companion (`index.html:1457-1499`).** Reproduce verbatim; the whole block is listed
in the source at those lines. The shape:

```js
cat.x+=cat.bounceDir*2.5;
if(cat.x>playerCenterX+bounceRange){cat.bounceDir=-1;cat.facing=-1;}
else if(cat.x<playerCenterX-bounceRange){cat.bounceDir=1;cat.facing=1;}
const groundY=p.y+p.h-catH;
if(cat.onGround){cat.vy=-5.5;cat.onGround=false;cat.baseY=groundY;}
cat.vy+=0.35;cat.y+=cat.vy;
if(cat.y>=cat.baseY){cat.y=cat.baseY;cat.vy=0;cat.onGround=true;}
cat.baseY=groundY;
```

Five traps, and this task has the most of them:

- **The cat has its own gravity constant, 0.35**, not the world's `GRAVITY`. And its own
  jump force, −5.5.
- **`baseY` is assigned twice per frame** — once inside the `onGround` branch, then again
  unconditionally two lines later. The second write is what makes the cat track a player
  who is climbing. Drop it and the cat sinks into the floor.
- **It bounces continuously.** `onGround` is set true on landing and immediately consumed
  next frame by the `if(cat.onGround)` jump. There is no rest state.
- **The cat ignores the map entirely.** Its floor is `p.y + p.h - catH` — the *player's*
  feet. It walks on air over pits, at whatever height the player is.
- **`hitsLeft` reaching zero removes the cat on the *following* frame**, via the `else if`
  at `:1497`, not inside the scratch. The frame it spends its last scratch, it is still
  there.

Scratch range is 45px, measured from `cat.x+8, cat.y+8` — a fixed inset, not the cat's
centre. `scratchTimer` is a 30-frame cooldown. Each scratch is worth
`Math.round(300 * dc.scoreMultiplier)`.

**Test.** One trace: walk to level 1's cat at tile 50, then keep walking into the bat at
tile 48 and assert the cat's position, `hitsLeft` and the enemy's `alive`/`squashTimer`
against the live game. `catH` depends on `spriteH(CAT_S, 2)`, which the port has from
Plan 3 — use it rather than a literal.

---

## Task 6: The cape, and invincibility

**Files:** `next/src/game/player.ts`, `world.ts`

**Absorbing a hit (`index.html:1646`).**

```js
function playerHit(){const p=player,dc=DC(),iTime=dc.invincibleTime||60;if(p.hasCape){p.hasCape=false;p.invincible=iTime;p.vy=-4;...;return;}playerDie();}
```

**The pit (`index.html:1423`).**

```js
if(p.y>lvl.height*TILE+32){if(DC().capeSavesPit&&p.hasCape){p.hasCape=false;p.invincible=60;p.vy=-10;p.y=lvl.height*TILE-32;...}else{playerDie();}return;}
```

Four traps:

- **The port already has `playerHit`; this changes its first branch.** Plan 4 deliberately
  left the cape out, so `playerHit` currently goes straight to death. This is an edit, not
  a new function.
- **The player can spawn wearing one.** `initLevel` sets `hasCape:dc.startWithCape`
  (`index.html:1169`), so on `super_easy` the cape exists before any pickup and the first
  contact hit is survivable from frame 0. It is the only difficulty where that is true.
  Every existing trace runs at `normal`, where it is `false`, so **this task will not
  break Plan 4's death traces** — but it does mean `super_easy` has an entire spawn state
  no trace covers.
- **The two paths use different invincibility.** A contact hit uses
  `dc.invincibleTime||60`; the pit save hardcodes 60. They are not the same number on
  every difficulty.
- **`capeSavesPit` is a difficulty flag that only some records carry**, and it calls
  `DC()` freshly rather than using the local `dc`. Behaviourally identical, but do not
  "tidy" it into something that reads a stale record.
- **The pit save teleports** to `lvl.height*TILE-32` with `vy:-10`. It is a rescue, not a
  bounce: you reappear above the floor of the world.

`p.invincible` is already decremented at `index.html:1430` and the stomp branch already
tests `p.invincible<=0` — both are in the port from Plan 4. Only the setting side is new.

**Test.** Extend the existing death trace: the same script with a cape gives a survived
hit, an invincibility window, and a second hit once it lapses. Assert `invincible`
counting down, not just its peak.

---

## Task 7: Draw it, and look at it

**Files:** `next/src/scenes/SliceScene.ts`

Pickups, stars, arrows and the cat all have sprites in the data ported in Plan 1 and the
texture pipeline from Plan 3: `BOW_S`, `SUPER_S`, `CAT_S`, `STAR_S`, `ARROW_S`, `CHICKEN_S`.
Draw them the way Plan 3 draws enemies — a pooled image per entity, synced each frame.

Two visible details worth matching:

- **The cape draws behind the player and wobbles**
  (`index.html:1839`): `Math.sin(animFrame*.15)*2` on y, offset −8 or +`p.w`−4 by facing.
- **The rainbow block cycles colour from `animFrame`** (`index.html:1693`), which Plan 3
  already handles. Confirm it still cycles after a bump turns it into tile 2 — it should
  stop, because the tile is no longer 5.

Then run it in a browser and play level 1 start to finish: collect both pickups, bump a
block, use all three power-ups, shoot something, convert something into a chicken, and
watch the cat spend its three scratches.

No unit tests for any of this.

---

## Done when

- [ ] Every trace still matches, with enemies live.
- [ ] A trace covering pickups, a block bump, shooting and the cat matches.
- [ ] The three power-up branches are each covered, by trace or by unit test.
- [ ] `npm test` and `npm run build` green.
- [ ] `src/game/` still imports no Phaser.
- [ ] Level 1 plays with its full cast in a browser.
- [ ] `index.html` untouched.

## What comes next

Plan 6: the other levels' enemies and the boss. Then scenes and the HUD, which is the
largest single remaining piece and the one this plan keeps deferring score and lives into.
