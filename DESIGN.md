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
  - **Max HP** — +5 HP per level.
  - **Attack Damage** — +1 damage per level (base 1 dmg/hit).
  - **Attack Speed** — divides the 2s base cooldown by `1 + 0.2 × level`, so levels give diminishing returns and the cooldown approaches 0 without ever reaching it. (Originally specced as -0.2s per level floored at 0.5s; changed to a divisor during v2, and the floor was dropped as unnecessary once the formula could no longer bottom out.)
- **Cost:** starts at 5 XP and compounds per level by each stat's own `costGrowth` (currently 1.4 for Max HP, 1.5 for Attack Damage and Attack Speed). All tuning lives in `formulas.js` and is expected to keep changing — treat the numbers here as a description of the current state, not a fixed decision.
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
- **How:** deployed via a GitHub Actions workflow rather than the no-code "Deploy from a branch" toggle — see the CI/CD section below. Slightly more setup for a project this small, but that's the point: it's the learning target, and it mirrors an Azure DevOps-style release pipeline instead of a plain static hand-off.
- **Note:** enabling Pages itself (picking "GitHub Actions" as the source) is a repo-admin setting change, not something doable via a commit/PR — it's a manual one-time toggle for the repo owner.
- **Custom domain:** `mygame.dilbe.eu`, via a subdomain CNAME record pointing at `dilbe.github.io` — chosen over the apex `dilbe.eu` domain so the existing email (MX) setup on the apex is never touched. A `CNAME` file at the repo root (containing `mygame.dilbe.eu`) tells GitHub Pages which domain to serve.

### Publishing milestones

1. Merge the current playable version into `main`.
2. Make the repo public — Settings → General → Danger Zone → Change repository visibility. (Currently private; GitHub Pages is free for public repos but needs a paid plan on a private one, and nothing in this repo is sensitive.)
3. Enable GitHub Pages in repo settings with source set to "GitHub Actions" (rather than "Deploy from a branch" — see CI/CD section for the workflow that does the actual deploying).
4. Confirm the published URL (`dilbe.github.io/Demo-game`) loads and is playable, same as local.
5. At the DNS provider for `dilbe.eu`: add a CNAME record, name `mygame`, value `dilbe.github.io`.
6. In GitHub Pages settings, set the custom domain to `mygame.dilbe.eu` and wait for GitHub to verify DNS + provision HTTPS.
7. Confirm `https://mygame.dilbe.eu` loads and is playable.

**Publishing status: done.** All 7 milestones complete. The game is live at `https://mygame.dilbe.eu`, served by GitHub Pages over a GitHub-issued certificate and deployed by the Actions pipeline; `dilbe.github.io/Demo-game` redirects to it.

Three things learned doing it, worth remembering if the domain ever changes:

- **Setting the custom domain is not enough — the Pages deployment must be re-run afterwards.** Until then GitHub returns "Site not found" for the new hostname even though the DNS check passes.
- **`*.dilbe.eu` has a wildcard record at the registrar**, so any subdomain resolves whether or not a real record exists. Never treat "it resolves" as proof; check the record type (`nslookup -type=CNAME`) — a real record returns the CNAME, the wildcard returns the SOA.
- **A stale wildcard answer outlives the new record's TTL**, because it was cached under the wildcard's own (much longer) TTL. Expect the new hostname to work everywhere else while the local network still lands on the old address. `curl --resolve <host>:443:<ip>` tests the real server regardless of local DNS.

## CI/CD (learning GitHub Actions)

Not really necessary for a project this size — the point is to learn how GitHub's equivalent of Azure DevOps Pipelines works, end to end: a PR check that gates merges into `main`, and a release-style pipeline that publishes on push to `main`.

- **CI (PR check):** a workflow that runs on every pull request into `main`, executing a small test suite. Combined with a branch protection rule on `main` requiring that check to pass — the GitHub equivalent of an Azure DevOps build-validation branch policy. (The branch protection rule itself is another repo-admin setting, like enabling Pages.)
- **Tests:** genuinely not much to test in a plain HTML page, so the plan is to pull a couple of existing formulas out of `game.js` into small named functions — the XP-cost-per-level rule, the damage calculation — and write real (if small) tests against those with Node's **built-in test runner** (`node --test` + `assert`, no dependencies, no config needed). This also naturally grows once the v3 data-object refactor (stats/skills as config objects) lands — those become easy, obvious things to test.
- **CD (release pipeline):** a separate workflow, triggered on push to `main`, that deploys to GitHub Pages using the official actions (`actions/checkout`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) — this is the actual "publish to a service" pipeline, and replaces the plain "Deploy from a branch" Pages mode.

### CI/CD milestones

1. Extract 1–2 pure functions from `game.js` (e.g. XP cost for a stat level, attack damage calculation) so there's something concrete and meaningful to test.
2. Add a minimal test file using Node's built-in test runner (`node --test`), with a handful of cases covering the extracted functions.
3. Add `.github/workflows/ci.yml` — runs on pull requests into `main`, executing `node --test`.
4. Turn on branch protection for `main` (manual Settings step) with two settings, both needed:
   - **Require a pull request before merging** — this is what actually blocks direct pushes to `main`; without it, "require status checks" alone doesn't stop a direct push.
   - **Require status checks to pass before merging**, with the CI workflow selected — blocks merging the PR until `node --test` passes.
   - Optional: **Do not allow bypassing the above settings** — without this, the repo owner can still push directly/merge without checks; check it only if the point is to enforce the process on yourself too, not just collaborators.
5. Add `.github/workflows/deploy.yml` — runs on push to `main`, builds and deploys to GitHub Pages via the official Pages actions.
6. Confirm the loop end to end: open a PR with a deliberately failing test, see the check fail and block merge; fix it, merge, and see the deploy workflow publish automatically.

**CI/CD status: done.** All 6 milestones complete. The three balance formulas live in `formulas.js` (a plain `<script>` in the browser, `require`-able by Node via a guarded `module.exports`, so the no-build-tooling constraint holds), covered by `formulas.test.js` under `node --test`. `ci.yml` runs the suite on every PR into `main`; `deploy.yml` publishes to Pages on push to `main`. Enforcement is a **ruleset** named "tests" rather than classic branch protection — worth knowing, because the legacy `branches/main` API reports `protected` for classic rules only and looks empty even when a ruleset is active. It requires a PR (0 approvals, so a solo dev isn't deadlocked by being unable to approve their own PR), requires the `test` check, blocks force pushes and deletion, and has no bypass actors — so it applies to the repo owner too. Verified by opening a deliberately failing PR and confirming the merge was refused.

## v3 scope — skills & always-on health

Picking up the remaining ideas: a Skills tab with unlockable/slottable active skills, an always-visible health bar with passive regen instead of full-heal-per-fight, and a shared data-object pattern for stats/skills so each one can carry its own formula.

- **Data-object pattern:** every stat and skill gets a config object (base value, XP cost, cost growth, per-level effect, etc.) instead of bespoke code per stat — makes adding new stats/skills mostly a matter of adding data, not new logic.
- **Health bar:** moves out of the Fight tab into a persistent bar visible on every tab.
- **Healing model change:** no more full heal at the end of a fight — HP instead regenerates passively at 1 HP/minute. Base Max HP raised from 10 to 20 to compensate for no longer starting every fight topped up.
- **New stats:** Health Regen (speeds up passive regen), Skill Slots (how many skills can be active at once), Skill Points (a budget spent by equipping skills — each skill costs some skill points while slotted, on top of taking a slot).
- **Skills:** unlocked permanently with XP (like today's stats), then equipped/unequipped into a limited action bar. Starting skill: Basic Attack (today's only ability, migrated into this system). New skills: Strong Attack (more damage, longer cooldown than Basic Attack), Heal, and Auto Attack (low damage, high cooldown, triggers itself automatically whenever its cooldown is up — no click needed).
- **Per-skill upgrades:** Attack Damage and Attack Speed stop being global Character-tab stats and instead become an upgrade track on each individual skill (so Basic Attack, Strong Attack, Heal, and Auto Attack each level up their own damage/speed independently, XP-funded the same way as before).

### v3 milestones

1. Refactor the three existing stats (Max HP, Attack Damage, Attack Speed) into data objects (base value, cost, cost growth, per-level effect) — no behavior change, just a foundation for everything below.
2. Always-visible health bar — move HP display out of the Fight tab into a bar shown on every tab.
3. New healing model — remove full-heal-on-fight-end, add passive regen at 1 HP/minute, raise base Max HP to 20.
4. Health Regen stat — upgradeable, increases the passive regen rate from milestone 3.
5. Skills tab shell — new tab, navigable, empty/placeholder content for now.
6. Define skills as data — Basic Attack (migrated from the hardcoded attack button), Strong Attack, Heal, and Auto Attack, each unlockable with XP using the milestone-1 data-object pattern.
7. Wire the Fight tab to your unlocked skills — replace the hardcoded Attack button with buttons generated from every unlocked skill; Auto Attack triggers itself on cooldown instead of waiting for a click. Skills are also usable with number keys, bound to position in the bar (1 for the first, 2 for the second) so the binding stays correct however the bar is filled.
8. Skill Slots stat + loadout UI — stat sets max active skills; add/remove unlocked skills to/from the action bar, narrowing the fight bar from "everything unlocked" to the equipped subset.
9. Skill Points stat + per-skill cost — spendable budget stat; each skill has a skill-point cost while slotted, capped by this stat.
10. Move Attack Damage and Attack Speed off the Character tab — replace the two global stats with a per-skill Damage and Speed upgrade track on the Skills tab, funded by XP the same way the old stats were.

**Note on ordering:** wiring the fight to skills was originally milestone 9, after the slot and skill-point systems. It moved ahead of them because those two build machinery with no visible effect until the fight actually uses skills — three milestones of invisible work. Doing it first means a skill does something the moment it is bought, and slots and skill points then become constraints on something already playable. The cost of the swap is that milestone 7 wires the fight to *unlocked* skills and milestone 8 narrows that to the equipped ones.

**Dormant stats:** from milestone 7 until milestone 10, Attack Damage and Attack Speed were still buyable but no longer affected anything, because skills carry their own damage and cooldowns. Milestone 10 removed them from the Character tab and replaced them with per-skill Damage/Healing and Speed tracks.

**v3 status: done.** All 10 milestones complete. Stats and skills are both data objects with their own formulas and costs; the Character tab and the Skills tab are generated from that data, so adding either is a data entry rather than new markup and logic. Skills are unlocked with XP, equipped against two independent limits (Skill Slots for how many, Skill Points for how strong a combination), usable by click or number key, and each carries its own upgrade tracks.

## v4 scope — monster selection & multi-monster fights

Instead of always fighting the same fixed monster, the player picks an opponent (or two) before starting. Reuses the same data-object pattern from v3 milestone 1, applied to monsters instead of stats.

- **Monster template:** a monster becomes a data object (name, max HP, attack damage, attack cooldown) instead of hardcoded values — same reasoning as the stat/skill data-object pattern.
- **Three monsters:** Small (today's existing stats, unchanged), Medium, and Big — Medium/Big just need higher numbers for now, exact balance isn't the point yet.
- **Selection before a fight:** the Fight tab requires picking a monster before Start becomes available, instead of jumping straight into a fixed fight.
- **Two-easy-monsters option:** alongside picking one monster, a second choice lets the player fight two Small monsters at once. This is the one multi-monster case for now — a stepping stone so more multi-monster combinations are easy to add later once the underlying support exists.
- **Targeting:** once more than one monster can be in a fight, the player needs a way to pick which monster their attack hits.

### v4 milestones

1. Monster data objects — define Small/Medium/Big as data (name, max HP, attack damage, attack cooldown), with Small matching today's existing monster exactly.
2. Monster selection screen — before Start, the player picks one monster (Small/Medium/Big); the chosen monster's stats drive the fight.
3. Two-easy-monsters option — add a selectable choice to fight two Small monsters instead of one; fight state supports a list of monsters instead of a single one.
4. Multi-monster display — show HP and attack-cooldown indicators for each monster in the active fight.
5. Target selection — when more than one monster is active, the player selects which one their attack button targets (e.g. click a monster to select it, then Attack hits that one).
6. Multi-monster auto-attack — each active monster attacks the player on its own independent cooldown.
7. Win condition update — a fight is won only once every active monster is defeated; losing still ends the fight immediately as before.

**v4 status: done.** All 7 milestones complete. Monsters are data objects (Small/Medium/Big) selected before a fight, with a Two Small Monsters option exercising the first multi-monster case. A fight tracks a list of monsters rather than one: each gets its own combatant card, its own independent attack cooldown, and can be targeted individually by clicking its card (defaulting to the front one); a kill grants that monster's XP, marks its card "Defeated", and hands the target off to whichever monster is still standing, with the fight only ending in a win once none are left.

## Fight flow fixes

Two small, standalone corrections to how an in-progress fight behaves — not tied to any of the scopes above, but worth doing before or alongside them since dungeons (below) build on top of this behavior.

### Fight flow milestones

1. Retreat button — visible during an active fight; pressing it ends the fight immediately without a win or loss result, returning to the pre-fight/selection state. Player HP is left as-is (no penalty, no free heal).
2. Fights keep running across tab switches — switching to the Character or Skills tab mid-fight no longer pauses attack/monster cooldown timers. A fight only ends via a win, a loss, or Retreat, never by navigating away from the Fight tab.

**Fight flow fixes status: done.** Retreat is a button, visible only during an active fight, that stops every timer and returns straight to monster selection with HP untouched — no win/loss message. The second fix needed no code change: `setInterval`/`setTimeout` were already independent of a tab-panel's `hidden` attribute, so switching tabs never paused a fight; verified by watching a fight run to completion (win and loss) while the Fight tab was hidden. A comment now documents that the tab-switch handler must never touch fight timers, so this can't regress silently.

## Skill improvements

Another standalone pass, this time over the Skills tab — not tied to any of the scopes above. Skill upgrade tracks are still fixed to exactly Power and Speed, spread across constants (`powerPerLevel`, `speedPerLevel`, `upgradeBaseCost`, `upgradeCostGrowth`) rather than data the way stats and monsters already are. Effects also always land at the very end of a skill's cooldown, which doesn't suit every skill — a strong attack feels better landing immediately, a heal makes more sense landing partway through, ahead of the next hit. Equipping is also still two buttons per skill rather than something more direct.

- **Upgrade tracks as data:** each skill gets an `upgrades` array instead of the two hardcoded track constants — same reasoning as the stat/monster data-object pattern. Every current skill still ends up with exactly a Power and a Speed track, with today's numbers unchanged; the shape now supports a different set, or count, of tracks per skill later, even though every skill happens to use the same two variables today.
- **Upgrades show what they upgrade:** each upgrade row in the Skills tab shows its current → next value (e.g. "3 damage → 5 damage"), the same "outcome, not just level" format the Character tab's stat rows already use.
- **Trigger point:** a new `triggerAt` value per skill (0–1, a fraction of its cooldown) says when its effect actually lands. Today everything is effectively `triggerAt: 1` (fires only once the cooldown finishes). Strong Attack moves to `triggerAt: 0` (lands immediately on press); Heal moves to `triggerAt: 0.5` (lands halfway through its cooldown). The cooldown bar still animates for the full duration either way, and the button/auto-retrigger still waits for the full cooldown — only the effect's own timing changes.
- **Drag-and-drop loadout:** replaces the Equip/Unequip buttons with a row of skill slots at the bottom of the Skills tab, sized to the Skill Slots stat and styled like the in-combat skill bar. Dragging an unlocked skill onto a slot equips it (swapping out whatever was there, if anything); dragging a slotted skill off unequips it.

### Skill improvements milestones

1. Upgrade tracks as data — replace the two hardcoded Power/Speed constants with an `upgrades` array per skill, each entry carrying its own base effect, cost, and cost growth; the Skills tab's per-track row is generated from that array and shows the current → next value, matching the Character tab's stat-row format. No balance change — every skill keeps today's two tracks and numbers.
2. Trigger point — add `triggerAt` to every skill (defaulting to today's end-of-cooldown behavior); move Strong Attack to fire immediately on press and Heal to fire halfway through its cooldown.
3. Drag-and-drop skill slots — replace the per-skill Equip/Unequip buttons with a slot bar (sized to Skill Slots) at the bottom of the Skills tab, matching the in-combat skill bar's look; drag an unlocked skill onto a slot to equip it, drag a slotted skill off to unequip it.

**Skill improvements status: done.** All 3 milestones complete. Each skill's Power/Speed tracks are entries in an `upgrades` array (own perLevel/cost/value()/format()), rendered as current → next rows the same way the Character tab's stats are. Every skill has a `triggerAt` fraction of its cooldown at which its effect actually lands — Strong Attack fires the instant it's pressed, Heal fires halfway through its cooldown, everything else still fires at the end — timed independently of the button re-enabling, which always waits for the full cooldown. Equipping is now a drag-and-drop loadout: a slot bar at the bottom of the Skills tab (styled like the in-combat bar) with one box per Skill Slots level; dragging an unlocked skill from the list onto a slot equips it there (bumping whatever occupied it), dragging a filled slot onto another moves it, and dragging one back onto the list unequips it — all still bounded by the Skill Points budget.

## v5 scope — dungeons

A dungeon is a chain of monster fights, fought back-to-back without returning to the selection screen in between. Builds directly on v4 (monster/multi-monster selection) and the Fight flow fixes above (Retreat needs to cleanly exit a whole dungeon, not just its current fight).

### v5 milestones

1. Dungeon data — a dungeon is a data object: an ordered list of fights, each reusing the v4 monster/multi-monster definitions.
2. Dungeon selection — alongside picking a single monster or two easy monsters, the player can pick a dungeon to start instead.
3. Auto-chaining — winning one fight in a dungeon immediately starts the next fight in the chain, with no return to the selection screen until the dungeon ends. Player HP carries over between fights (subject to normal passive regen only — no free heal between fights).
4. Dungeon end states — clearing every fight in the chain shows a dungeon-complete result; losing a fight, or pressing Retreat, ends the entire dungeon rather than just the current fight within it.

**v5 status: done.** All 4 milestones complete. `DUNGEONS` in `formulas.js` is `{ label, fightIds }`, `fightIds` an ordered list of existing `MONSTER_GROUPS` ids — a dungeon is a sequence of fight options that already exist, not new monster data. The selection screen lists dungeons in their own section below the monster groups, and picking one previews its first fight, the same way picking a group previews itself; picking either clears the other, since only one can be the active pick. `beginFight` and the win check both funnel through `startFightGroup`, so starting a dungeon's first fight and auto-chaining into its next one are the same code path — winning a fight with another one left in the chain calls `advanceDungeonFight` instead of ending the game, which re-populates `activeMonsters` for the next group and restarts its monster(s)' attack intervals without touching `playerHp`, so HP carries over exactly as it does between any two fights (passive regen only, no free heal). A small `#dungeon-progress` line (hidden outside a dungeon) tracks "<label> — Fight X/N". Losing or pressing Retreat during a dungeon behaves exactly as it already did for a single fight — both already ended the fight outright rather than stepping through a chain — so clearing the whole dungeon rather than just its current fight needed no extra branching.

## v6 scope — quests & progressive unlocks

Instead of a new player seeing every tab at once, tabs unlock progressively by completing simple objectives. A new player starts seeing only the Fight tab, with a short quest text on the side (e.g. "Kill 5 enemies"); completing it reveals the Character tab and shows the next quest ("Kill 10 enemies"), which in turn reveals the Skills tab. More quests with other rewards can be added later.

- **Data-object pattern (again):** each quest is a data object — description text, completion condition, and a reward (initially "unlock this tab," but kept generic so future quests can reward other things, e.g. unlocking a monster or a dungeon).
- **One active quest at a time**, shown as a small always-visible tracker (description + progress, e.g. "Kill 5 enemies (3/5)") — similar in spirit to the always-visible health bar from v3.
- **Depends on / changes:** this supersedes the "tabs are visible from the start" assumption in v2 (Character tab) and v3 (Skills tab) — once this ships, those tabs need to start hidden and reveal only when their unlocking quest completes, rather than always being shown.

### v6 milestones

1. Quest data — define quests as data objects (description, completion condition, reward), starting with "Kill 5 enemies" → unlock Character tab, and "Kill 10 enemies" → unlock Skills tab.
2. Enemy-kill counter — track total enemies defeated persistently, separate from XP (a new counter alongside the existing saved state).
3. Quest tracker UI — a small always-visible panel showing the current active quest's text and progress.
4. Tab gating — Character and Skills tabs start hidden for a new player and only appear once their respective quest completes; other tabs (Fight, and later About) remain always visible.
5. Sequential progression — completing one quest immediately reveals the tracker for the next quest in the chain.
6. Persistence — save quest completion state and the kill counter via `localStorage`, alongside the existing XP/stat/skill save data.

**v6 status: done.** All 6 milestones complete. `QUESTS` in `formulas.js` is an ordered array (order encodes the sequence, matching `activeQuest`'s "first not-yet-completed" lookup) of `{ id, description, target, reward }` objects; `reward` is a generic `{ type, ...}` shape so `unlockTab` isn't the only kind a future quest could use. `totalKills` counts every monster defeat regardless of fight outcome, tracked independently of XP. The tracker is a single always-visible `#quest-tracker` div (hidden once every quest is done) showing `describeQuestProgress`'s `"<description> (<kills>/<target>)"` text. Character and Skills tabs' nav buttons start with the `hidden` attribute in `index.html`; completing a quest un-hides the one its reward names, and `registerKill` loops (rather than checking once) so progression can't stall if a kill ever satisfied more than one quest at a time. `totalKills` and `completedQuestIds` save/load alongside the rest of the state, and already-completed rewards are re-applied on load so a returning player's unlocked tabs match their save.

## About tab & versioning

A small, standalone addition: a place that explains what the project is, plus a visible version number.

### About tab milestones

1. About tab shell — new tab alongside Fight/Character(/Skills), navigable like the others.
2. About content — a short blurb on what the project is (a from-scratch learning project, not a product), plus a version number shown on the page. Exact versioning scheme (simple incrementing `v0.x`, semantic versioning, etc.) is a detail to decide when building this — keep it low-ceremony, consistent with the rest of the project.

**About tab status: done.** Both milestones complete. Landed on the lowest-ceremony scheme available: `VERSION` in `formulas.js` just reuses the `vN` milestone-scope label DESIGN.md already gives each release (currently `v6`, since quests was the most recently completed scope) rather than inventing a separate semantic-versioning number that would need its own bump rules. It's bumped by hand whenever the next `vN` scope ships. The About tab itself is always visible like Fight, never gated behind a quest (its nav button has no `hidden` attribute, unlike Character/Skills) — matching the "other tabs... remain always visible" note in the v6 scope.

**Build stamp (added after the initial About tab work):** the site has no accounts or backend, so "what code is running for a given player" has no server log to check — the deployed page itself is the only record. Rather than a separate build-number counter (the Azure-pipeline pattern) or a git tag pushed on every deploy, `BUILD_SHA` in `formulas.js` starts as the placeholder `__BUILD_SHA__`, which `deploy.yml` overwrites with the short commit SHA (`sed`, one step, no real build tooling) right before publishing to Pages. The commit SHA already is a unique, permanent pointer to the exact source — `git show <sha>` — so it needs no separate counter to stay in sync with. A checkout that never went through that step (local dev, `node --test`, a clone) keeps the placeholder, and the About tab shows that as "unreleased build" rather than a fake SHA. The version line reads e.g. `v6 (a1b2c3d)` once deployed.

## v7 scope — polish

A pass over rough edges across the Skills tab and the Fight tab — not a new feature, just smoothing out things that already work but feel unfinished.

- **Skills tab redesign:** the unlocked-skills list becomes a row of squares styled like the in-combat skill buttons (same icon/label), instead of today's list of rows. The equipped-skill slot boxes at the bottom get the same square look (today they're visually a plain div, not matching the buttons above them). Clicking any square — unlocked-list or equipped-slot — opens a detail view of that skill's stats and upgrade tracks — the info today's row shows inline, just moved behind a click. Dragging a square onto a slot bar box still equips it, same as today.
- **Skill-points shortfall message:** dropping a skill onto a slot when doing so would exceed the Skill Points budget currently just silently fails (`equipInSlot` returns early with no feedback). Replace that with a visible message.
- **Group-kill XP bonus:** killing a monster that's part of a multi-monster group (Two Small Monsters, and any future multi-monster group) grants a compounding ×1.25 XP bonus per kill within that group — 1st kill in the group at normal XP, 2nd at ×1.25, 3rd at ×1.25² = ×1.5625, and so on. Single-monster fights are unaffected.
- **Dungeon-clear bonus XP:** clearing every fight in a dungeon awards a bonus XP amount on top of what its monsters already paid out, defined per dungeon (`DUNGEONS.<id>.completionBonusXp`) — same data-object pattern as everything else, so tuning it later is a data edit.
- **Fight-button jitter:** the skill buttons in the Fight tab visibly shift position during a fight. Root cause to be diagnosed when picked up (likely candidates: cooldown-countdown text changing width, or a disabled-state style changing padding/border) — the fix is whatever keeps each button's box a fixed size regardless of state.
- **Trigger-point indicator:** draw a thin horizontal line across each combat skill button's cooldown fill at its `triggerAt` fraction, so the player can see at a glance *when* (not just whether) the effect will land as the button fills.

### v7 milestones

1. Skills tab: unlocked-skill squares — replace the unlocked-skills list rows with squares styled like the in-combat skill buttons, and give the equipped-slot boxes the same square look; dragging a square onto a slot bar box still equips it exactly as today.
2. Skills tab: click-to-inspect — clicking a square (unlocked-list or equipped-slot) opens a detail panel for that skill showing its current stats and upgrade tracks.
3. Skill-points shortfall message — report a visible message instead of silently refusing when a drop would exceed the Skill Points budget.
4. Group-kill XP bonus — kills inside a multi-monster group compound ×1.25 per kill in that group; single-monster fights unaffected.
5. Dungeon-clear bonus XP — add `completionBonusXp` per dungeon in `DUNGEONS`, paid out once alongside the dungeon-complete result.
6. Fight-button layout stability — diagnose and fix whatever is shifting the skill buttons' position during a fight.
7. Trigger-point indicator — draw a `triggerAt` marker line on each combat skill button's cooldown fill.

## v8 scope — prestige

A reset-for-a-permanent-bonus loop, picking up the "Prestige mechanic" idea parked since v1. Introduces `maxXp` as a second, slower-moving number alongside the existing XP balance rather than replacing it.

- **`maxXp` starts at 100** in a new game — a lifetime-XP milestone, not a cap on the spendable XP balance already earned and spent on stats/skills today (that keeps working exactly as now).
- **Prestige progress bar:** once lifetime XP earned reaches `maxXp`, a second bar appears and starts filling with XP gained from that point on (the regular XP balance keeps accumulating/spending as normal alongside it). It needs 10% of `maxXp` (10 XP, at the starting value) to fill.
- **Prestige button:** once the prestige bar is full, a "Prestige" button appears. Pressing it resets the whole game — XP balance, stats, skills, quests, kill counter, dungeon/monster selection, everything `localStorage` currently saves — back to a fresh start, except `maxXp` is now 100 higher than it was.
- Later, possibly: additional permanent rewards for prestiging (unspecified — parked for a future pass, not part of this scope).

### v8 milestones

1. `maxXp` + lifetime-XP tracking — new persisted counter (starts at 100), plus a running lifetime-XP-earned total separate from the spendable balance.
2. Prestige progress bar UI — hidden until lifetime XP reaches `maxXp`; once visible, fills with post-threshold XP gains toward the 10%-of-`maxXp` target.
3. Prestige button + reset — appears when the bar is full; pressing it wipes every other piece of saved state and raises `maxXp` by 100 for the new game.
4. Persistence — save `maxXp` and lifetime-XP-earned alongside existing save data, surviving a reload mid-way through filling the bar.

## v9 scope — skills: passives, objective unlocks, and optional upgrades

Three related changes to how skills work: a first passive skill, unlocking skills through gameplay objectives instead of XP, and a new kind of skill upgrade that's toggled on/off rather than leveled continuously.

- **Passive skills:** a new skill kind that isn't used in combat at all — while equipped (using a slot and Skill Points like any other skill), it just grants a flat stat boost for as long as it stays equipped.
- **Two new skills:** Regen (+100% HP regen rate while equipped) and Strength (+25% damage on all attacks while equipped).
- **Objective-gated unlocks replace XP unlocks for Strong Attack and Heal:** two new objectives — kill a Medium Monster unlocks Strong Attack, kill a Big Monster unlocks Heal — and completing the objective unlocks the skill directly, free of charge. Their existing `unlockCost` XP price goes away.
- **Optional per-skill upgrades ("toggles"):** a new array per skill, separate from the existing continuous Power/Speed upgrade tracks. Each toggle is unlocked once with an XP cost, then can be switched on/off freely; switching one on increases that skill's Skill Point cost while equipped (switching it off returns the cost to normal).
  - Basic Attack gets a **Multi Attack** toggle: while on, each hit strikes every active monster for full listed damage instead of just the targeted one.
  - Heal gets a **Heal over Time** toggle: while on, casting Heal instead applies a 10-second heal-over-time effect, healing the same total HP the instant cast would have, spread evenly across the 10 seconds.
  - Auto Attack is removed as a skill entirely (superseded by Basic Attack's Multi Attack toggle and the general direction of this milestone).
  - A new objective — win a dungeon — unlocks the ability to use toggles at all (before that, the toggle list is visible but locked).

### v9 milestones

1. Passive skill type — a skill can be marked passive (no combat button, no cooldown); while equipped, its stat boost applies.
2. Regen and Strength skills — defined as data, using the passive type above.
3. Objective unlocks for Strong Attack / Heal — new quests (kill-a-Medium, kill-a-Big) that unlock those two skills directly; remove their XP `unlockCost`.
4. Toggle upgrades: data + unlock — each skill gets a `toggles` array (id, label, XP unlock cost, Skill Point surcharge, effect); unlocking a toggle is a one-time XP purchase, independent of turning it on/off.
5. Toggle upgrades: on/off + Skill Point cost — an unlocked toggle can be flipped on/off; while on, its Skill Point surcharge is added to the skill's cost against the Skill Points budget.
6. Multi Attack toggle on Basic Attack — while on, Basic Attack hits every active monster for full damage instead of the single targeted one.
7. Heal over Time toggle on Heal — while on, casting Heal applies a 10-second HoT healing the same total HP a straight cast would, spread evenly over the duration, instead of healing instantly.
8. Remove Auto Attack — retire the skill (and migrate any existing save data that has it unlocked/equipped).
9. Basic attack and strong attack get an upgrade toggle for auto attack. This makes those abilities trigger automatically as soon as they are available.
10. "Win a dungeon" objective — new objective that gates the toggle system itself; toggles are visible-but-locked until it completes.

## v10 scope — graphics

Picking up the "Graphics for monsters/player" idea parked since v1. Simple, in-code sprites for monsters and skills rather than illustrated art — fits the project's plain-HTML/no-tooling approach (no image-generation tool or external asset pipeline needed).

- **Monster sprites:** a simple geometric/SVG shape per monster (Small/Medium/Big get visually distinct silhouettes), shown on their combatant card during a fight and on the selection screen.
- **Skill icons:** a simple geometric/SVG icon per skill, shown on its combat button, its Skills-tab square (from v7), and its slot-bar box.

### v10 milestones

1. Monster sprites — one SVG/shape per `MONSTERS` entry, rendered on the selection screen and each combatant card.
2. Skill icons — one SVG/shape per `SKILLS` entry, rendered on the combat button, the Skills-tab square, and the slot-bar box.

## v11 scope — mobile friendly

Everything so far has only been shaped for desktop mouse/keyboard use — no viewport meta tag, layouts with fixed widths sized well past a phone's screen, and skill equipping built entirely on HTML5 drag-and-drop, which most mobile browsers don't fire over touch at all. This scope is a pass to make the game actually playable on a phone.

- **Viewport meta tag:** `index.html` has none today, so mobile browsers render it zoomed out to a desktop-width layout instead of fitting the screen.
- **Responsive layout:** several elements assume a wide screen — fixed `width` values on `.monster-name`/`.monster-detail`/`.stat-*`/`.track-*`, and rows of 80px `.cooldown-button` squares (skill bar, Skills tab list, skill slots) that don't wrap — which can overflow or force horizontal scrolling on a narrow viewport.
- **Touch-compatible skill equipping:** dragging a skill onto a slot is standard HTML5 drag-and-drop, which iOS Safari and most mobile browsers never fire over touch — equipping would be simply broken on a phone as things stand, not just awkward. Needs a touch-compatible interaction; exact approach (tap-to-select-then-tap-a-slot, touch-event-based dragging, etc.) still to be decided when this is picked up.
- **Tap target sizing:** controls sized for a mouse cursor (the small Upgrade buttons, hotkey hints) may be too small or too close together for a fingertip.

### v11 milestones

1. Viewport meta tag + baseline responsive pass — add the meta tag, replace fixed pixel/rem widths that can overflow a phone screen with layouts that reflow instead.
2. Touch-compatible skill equipping — replace or augment the drag-and-drop equip/unequip flow with something that works over touch.
3. Tap target pass — check every interactive element is comfortably tappable (size and spacing) on a phone-sized screen.

## Future ideas (parking lot — not yet planned)

Ideas worth remembering but not yet worth breaking into milestones — needs more thought before design work starts.

- **Legal/privacy disclosures.** Not a lawyer, not legal advice — but worth a note: currently the site has no backend, no accounts, no analytics/tracking scripts, and no cookies; `localStorage` for saving progress is generally treated as functionally-necessary storage, not something requiring cookie-consent banners. As it stands, there's likely nothing legally required beyond normal copyright. Revisit this if the project ever adds anything that processes visitor data — analytics, ads, accounts, or real multiplayer — since that's the point a real privacy policy (and, depending on country/monetization, an "imprint"/legal-notice page) could become necessary.
