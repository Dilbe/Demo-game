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

## Publishing

The whole point of this milestone is to try the full pipeline once — design to code to a real URL — not to add game features.

- **Where:** GitHub Pages, since the project is already 100% static with no build step (per Tech decision #1/#4).
- **How:** repo Settings → Pages → Deploy from a branch → `main`, root folder. No workflow file, no code changes needed — the existing `index.html`/`style.css`/`game.js` at the repo root are already servable as-is.
- **Note:** enabling Pages is a repo-admin setting change, not something doable via a commit/PR — it's a manual one-time toggle for the repo owner.

### Publishing milestones

1. Merge the current playable version into `main`.
2. Enable GitHub Pages on `main` (root folder) in repo settings.
3. Confirm the published URL loads and is playable, same as local.

## v3 scope — skills & always-on health

Picking up the remaining ideas: a Skills tab with unlockable/slottable active skills, an always-visible health bar with passive regen instead of full-heal-per-fight, and a shared data-object pattern for stats/skills so each one can carry its own formula.

- **Data-object pattern:** every stat and skill gets a config object (base value, XP cost, cost growth, per-level effect, etc.) instead of bespoke code per stat — makes adding new stats/skills mostly a matter of adding data, not new logic.
- **Health bar:** moves out of the Fight tab into a persistent bar visible on every tab.
- **Healing model change:** no more full heal at the end of a fight — HP instead regenerates passively at 1 HP/minute. Base Max HP raised from 10 to 20 to compensate for no longer starting every fight topped up.
- **New stats:** Health Regen (speeds up passive regen), Skill Slots (how many skills can be active at once), Skill Points (a budget spent by equipping skills — each skill costs some skill points while slotted, on top of taking a slot).
- **Skills:** unlocked permanently with XP (like today's stats), then equipped/unequipped into a limited action bar. Starting skill: Basic Attack (today's only ability, migrated into this system). New skills: Strong Attack (more damage, longer cooldown than Basic Attack) and Heal.

### v3 milestones

1. Refactor the three existing stats (Max HP, Attack Damage, Attack Speed) into data objects (base value, cost, cost growth, per-level effect) — no behavior change, just a foundation for everything below.
2. Always-visible health bar — move HP display out of the Fight tab into a bar shown on every tab.
3. New healing model — remove full-heal-on-fight-end, add passive regen at 1 HP/minute, raise base Max HP to 20.
4. Health Regen stat — upgradeable, increases the passive regen rate from milestone 3.
5. Skills tab shell — new tab, navigable, empty/placeholder content for now.
6. Define skills as data — Basic Attack (migrated from the hardcoded attack button), Strong Attack, and Heal, each unlockable with XP using the milestone-1 data-object pattern.
7. Skill Slots stat + loadout UI — stat sets max active skills; add/remove unlocked skills to/from the action bar.
8. Skill Points stat + per-skill cost — spendable budget stat; each skill has a skill-point cost while slotted, capped by this stat.
9. Wire the Fight tab to the equipped skill bar — replace the hardcoded Attack button with buttons generated from the current loadout.
