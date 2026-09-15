# Demo Game — Design Doc (v0.1)

## Purpose of this project

This is a **learning/throwaway project**, not a product:

- Goal is to go from nothing to a finished, playable thing — front to back — at least once.
- Not trying to make a *good* game, or a game anyone else will play.
- Accepting up front that it'll likely end up "crap" — that's fine, that's the point of a first project.
- Success = finishing it, not quality.

## Tech decisions

1. **100% client-side web.** HTML/CSS/JavaScript only. No backend/server logic — the only "server" involved is static file hosting.
2. **Hosting: undecided, decide later.** Develop and playtest by just opening the HTML file locally / running a local dev server. Pick real hosting (GitHub Pages, itch.io, etc.) once there's something worth hosting.
3. **Editor: VS Code suggested** for the JS/HTML/CSS work (lighter weight, better web tooling/extensions than full Visual Studio) — but Visual Studio works fine too if familiarity matters more right now. Not a blocking decision either way.
4. **No frameworks/build tooling for v1.** Plain HTML/CSS/JS, no npm/bundler/React/etc. Keeps focus on finishing rather than tooling. Can be revisited later if the project grows.
5. Chose plain JS over Blazor/Unity specifically to get the huge amount of beginner web-game tutorials/examples, even though it means learning a new language rather than staying in C#.

## Core concept — v1 scope

One screen, one fight:

- A **Player** and a **Monster**, each with HP.
- Player has **one ability**: an "Attack" button. Pressing it deals 1 damage to the monster, then goes on **cooldown** for X seconds (button disabled / shows cooldown state while waiting).
- Monster **auto-attacks** the player every Y seconds for 1 damage — no input needed from the player for this.
- Fight ends when either HP reaches 0 → show **Win** or **Lose** state.
- Restartable (reset HP, fight again).

That's the entire v1. No more, no less.

## Explicitly out of scope for v1

(Ideas for *after* v1 exists and works — not to be pulled in early)

- Rewards for kills (loot, XP, currency)
- Multiple monsters, monster selection, difficulty progression
- Save/persistence between sessions
- Real art, sound, animation polish
- Any server/backend component

## Suggested project structure

```
index.html
style.css
game.js
```

Single JS file is fine at this size — split it later only if it actually gets unwieldy.

## Milestones (small, each one individually finishable)

1. Static page: Player HP display, Monster HP display, Attack button — no logic yet.
2. Attack button reduces monster HP by 1 when clicked.
3. Cooldown added to the attack button (disabled + visible timer/countdown).
4. Monster auto-attacks player on its own timer.
5. Win/Lose detection + a restart action.
6. (Optional) small polish pass — only if v1 already feels done and it's still fun to keep going.

## Definition of done for v1

You can open `index.html` in a browser, fight the monster from full HP to a win or a loss, and restart — entirely playable start to finish, with no missing pieces.

**v1 status: done.** All 5 milestones complete and playable.

## v2 scope — character progression

Picking up two of the ideas originally parked in "out of scope for v1": rewards for kills, and (later, separately) tougher monsters.

- **Tabs:** "Fight" and "Character", plain show/hide of two sections via tab buttons — no router/framework needed.
- **XP:** each win grants 1 XP.
- **Stats (bought with XP, on the Character tab):**
  - **Max HP** — +2 HP per level.
  - **Attack Damage** — +1 damage per level (base 1 dmg/hit).
  - **Attack Speed** — -0.2s off the attack cooldown per level, floored at 0.5s.
- **Cost:** flat 5 XP per level, same for all three stats. (Arnoud expects to want to tweak XP gain and Attack Speed's formula once it's playable — that's expected and fine, these are just constants.)
- **Persistence:** `localStorage`, storing only XP balance + stat levels (the Character-side meta progression). The in-progress fight itself does not persist — reloading always starts the next fight fresh at current (upgraded) max HP.
- **Fight flow change:** the fight no longer auto-starts. A **Start** button appears on the Fight tab; the monster's attack timer doesn't begin until it's pressed. Restart also requires pressing Start again.
- Tougher/multiple monsters stays parked as the next thing after this milestone list, not part of it.

### v2 milestones

1. Tab navigation shell — Fight/Character tabs that switch visibility; Character tab shows placeholder stats for now.
2. Start button on the Fight tab — monster's attack loop doesn't begin until pressed (Restart also requires pressing Start again).
3. Kills award 1 XP — XP total shown on Character tab.
4. Upgrade buttons per stat on Character tab — spend XP per the cost rule, stat levels update in memory.
5. Wire stats into actual combat — Max HP/Attack Damage/Attack Speed levels actually affect the fight.
6. Persistence — save/load XP + stat levels via `localStorage`.
