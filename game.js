const monsterSelectEl = document.getElementById('monster-select');
const dungeonProgressEl = document.getElementById('dungeon-progress');
const monsterListEl = document.getElementById('monster-list');
const playerHpEl = document.getElementById('player-hp');
const playerMaxHpEl = document.getElementById('player-max-hp');
const healthBarFillEl = document.getElementById('health-bar-fill');
const regenProgressEl = document.getElementById('regen-progress');
const skillBarEl = document.getElementById('skill-bar');
const resultMessageEl = document.getElementById('result-message');
const restartButton = document.getElementById('restart-button');
const retreatButton = document.getElementById('retreat-button');
const startButton = document.getElementById('start-button');
const xpValueEl = document.getElementById('xp-value');
const slotsUsedEl = document.getElementById('slots-used');
const slotsTotalEl = document.getElementById('slots-total');
const pointsUsedEl = document.getElementById('points-used');
const pointsTotalEl = document.getElementById('points-total');
const skillListEl = document.getElementById('skill-list');
const skillSlotsEl = document.getElementById('skill-slots');
const skillDetailPanelEl = document.getElementById('skill-detail-panel');
const skillEquipMessageEl = document.getElementById('skill-equip-message');
const statListEl = document.getElementById('stat-list');
const resetCharacterButton = document.getElementById('reset-character-button');
const questTrackerEl = document.getElementById('quest-tracker');
const versionValueEl = document.getElementById('version-value');
const maxXpValueEl = document.getElementById('max-xp-value');
const prestigeSectionEl = document.getElementById('prestige-section');
const prestigeBarFillEl = document.getElementById('prestige-bar-fill');
const prestigeProgressValueEl = document.getElementById('prestige-progress-value');
const prestigeTargetValueEl = document.getElementById('prestige-target-value');
const prestigeButton = document.getElementById('prestige-button');

const REGEN_TICK_SECONDS = 1;

const SAVE_KEY = 'demo-game-save';
// Separate from SAVE_KEY so a prestige reset (which wipes SAVE_KEY back to a
// fresh game) can raise Max XP without needing to special-case it inside
// whatever shape the main save happens to be — it simply isn't in there.
const MAX_XP_KEY = 'demo-game-max-xp';

// Derived from STATS so a new stat needs defining in one place only.
const stats = Object.fromEntries(Object.keys(STATS).map((statId) => [statId, 0]));

// The player's current pick from MONSTER_GROUPS or DUNGEONS, chosen on the
// selection screen below — exactly one of the two is set at a time, picking
// one clears the other. `activeMonsters` is only populated once a fight
// starts: one entry ({ monsterId, hp }) per monster in the current fight, in
// queue order.
let selectedGroupId = null;
let selectedDungeonId = null;
// Set only while fighting through a dungeon: which dungeon, and the index
// into its fightIds the player is currently on. Both null/0 outside a
// dungeon fight, including for a plain single-group fight.
let activeDungeonId = null;
let dungeonFightIndex = 0;
let activeMonsters = [];
// How many monsters have died in the current group/fight so far — drives the
// compounding ×1.25 group-kill XP bonus (see groupKillXp). Reset whenever a
// new group starts (startFightGroup), including each fight within a dungeon,
// so the bonus never carries over between them.
let groupKillCount = 0;
// Which entry of activeMonsters the player's own attacks hit — selectable by
// clicking a card once more than one monster is active, defaulting to the
// front.
let targetIndex = 0;
// DOM refs for the currently rendered monster cards, parallel to whichever
// list (preview or live) renderMonsterList was last given.
let monsterCards = [];
let playerHp = null;
let fightActive = false;
const skillTimeouts = new Map();
// One interval per monster in activeMonsters — each attacks the player on
// its own cooldown, independently of the others.
let monsterAttackIntervals = [];
// Active Heal-over-Time payouts in progress (see startHealOverTime) — one
// interval per cast, so overlapping casts each run their own ticks
// independently. Cleared by stopFightTimers, same as every other in-fight
// timer.
let hotIntervals = [];
let regenProgress = 0;
let unlockedSkills = [...STARTING_SKILLS];
// One entry per skill slot, in slot order — a skillId, or null/undefined for
// an empty slot. Index order also decides the fight bar's order and
// therefore its hotkeys (see equippedSkillIds).
let equippedSkills = [...STARTING_SKILLS];
// Per-skill upgrade tracks, replacing the old global Attack Damage/Speed
// stats. Derived from each skill's own `upgrades` array so this doesn't
// assume every skill has the same set of tracks.
let skillLevels = Object.fromEntries(
  Object.entries(SKILLS).map(([skillId, skill]) => [
    skillId,
    Object.fromEntries(skill.upgrades.map((upgrade) => [upgrade.id, 0])),
  ])
);
// Which skill's square was last clicked, shown in the detail panel below the
// list/slots — null when nothing is currently selected. Not persisted; every
// reload starts with the panel closed.
let inspectedSkillId = null;
let xp = 0;
// Total XP ever earned (never reduced by spending, unlike xp) — drives the
// prestige bar once it reaches maxXp. Reset to 0 by a prestige itself, since
// each cycle needs to build back up to its own (higher) maxXp.
let lifetimeXp = 0;
// Starts at STARTING_MAX_XP and only ever goes up, by PRESTIGE_BONUS_PER_CYCLE
// per prestige — kept in its own localStorage key (see MAX_XP_KEY) rather
// than the main save, so a prestige's reset of everything else can't also
// wipe the one number the whole mechanic is about preserving.
let maxXp = STARTING_MAX_XP;
// How much post-threshold XP has been earned toward this cycle's prestige
// (see awardXp) — needs prestigeTarget(maxXp) to fill before the Prestige
// button appears. Reset to 0 alongside lifetimeXp on prestige.
let prestigeProgress = 0;
// Total enemies defeated across every fight, ever — separate from XP because
// quests key off it directly rather than off however XP happens to convert.
let totalKills = 0;
// Quest ids completed so far, in the order they were completed (which is
// always QUESTS order, since quests only ever complete sequentially).
let completedQuestIds = [];
// Objective ids completed so far (see OBJECTIVES) — unlike QUESTS, these can
// complete in any order, since nothing gates one behind another.
let completedObjectiveIds = [];
// Gates the whole toggle system (see SKILLS.*.toggles): false until the
// 'winDungeon' objective completes, at which point every skill's toggle list
// becomes purchasable/switchable rather than just visible.
let togglesUnlocked = false;
// Flat "skillId:toggleId" lists (see toggleKey) — unlockedToggleIds is a
// one-time XP purchase per toggle, activeToggleIds (always a subset of it)
// is which of those are currently switched on.
let unlockedToggleIds = [];
let activeToggleIds = [];

// Reset a cooldown fill to full instantly, then animate it down to 0 over `durationSeconds`.
function animateCooldownFill(fillEl, durationSeconds) {
  fillEl.style.transition = 'none';
  fillEl.style.height = '100%';
  void fillEl.offsetHeight; // force reflow so the reset above isn't animated
  fillEl.style.transition = `height ${durationSeconds}s linear`;
  fillEl.style.height = '0%';
}

// Snaps a cooldown fill to empty and drops whatever CSS transition was in
// flight. Clearing the JS interval/timeout that would schedule the *next*
// attack does nothing on its own to a transition already running on the
// element — it would otherwise keep visibly animating on its own.
function resetCooldownFill(fillEl) {
  fillEl.style.transition = 'none';
  fillEl.style.height = '0%';
}

restartButton.addEventListener('click', startGame);
startButton.addEventListener('click', beginFight);
retreatButton.addEventListener('click', retreat);
resetCharacterButton.addEventListener('click', resetCharacter);
prestigeButton.addEventListener('click', prestige);

// Dropping a skill back onto the list unequips it — the list itself is a
// fixed element (only its rows get rebuilt), so this is wired up once here
// rather than inside renderSkills.
skillListEl.addEventListener('dragover', (event) => event.preventDefault());
skillListEl.addEventListener('drop', (event) => {
  event.preventDefault();
  unequipSkill(event.dataTransfer.getData('text/plain'));
});

function upgradeStat(statId) {
  const cost = statCost(statId, stats[statId]);
  if (xp < cost) return;

  xp -= cost;
  stats[statId] += 1;

  updateHealthBar();
  updateRegenIndicator();
  updateXpDisplay();
  saveProgress();
}

// One row per fight option, same pattern as renderStats/renderSkills. Covers
// both single/multi-monster groups and dungeons — a dungeon row picks the
// whole chain rather than one fight, but is otherwise the same row shape.
// Disabled entirely mid-fight — the opponent can't change once a fight starts.
function renderMonsterSelect() {
  monsterSelectEl.replaceChildren();

  for (const [groupId, group] of Object.entries(MONSTER_GROUPS)) {
    const selected = groupId === selectedGroupId;
    monsterSelectEl.append(
      buildMonsterSelectRow(group.label, describeMonsterGroup(groupId), selected, () => selectMonsterGroup(groupId))
    );
  }

  const dungeonsLabel = document.createElement('div');
  dungeonsLabel.className = 'select-section-label';
  dungeonsLabel.textContent = 'Dungeons';
  monsterSelectEl.append(dungeonsLabel);

  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    const selected = dungeonId === selectedDungeonId;
    monsterSelectEl.append(
      buildMonsterSelectRow(dungeon.label, describeDungeon(dungeonId), selected, () => selectDungeon(dungeonId))
    );
  }
}

// One card per fight option (a monster group or a dungeon) — the whole card
// is the select control, no separate button. selectMonsterGroup/
// selectDungeon already refuse mid-fight, so the only thing guarded here is
// re-clicking the already-selected card, which would otherwise just re-render
// and re-save for no change.
function buildMonsterSelectRow(label, detailText, selected, onSelect) {
  const name = document.createElement('span');
  name.className = 'monster-name';
  name.textContent = label;

  const detail = document.createElement('span');
  detail.className = 'monster-detail';
  detail.textContent = detailText;

  const row = document.createElement('div');
  row.className = 'monster-row';
  row.classList.toggle('selected', selected);
  row.append(name, detail);
  row.addEventListener('click', () => {
    if (selected) return;
    onSelect();
  });

  return row;
}

function selectMonsterGroup(groupId) {
  if (fightActive) return;

  selectedGroupId = groupId;
  selectedDungeonId = null;
  renderMonsterSelect();
  updateMonsterPreview();
  saveProgress();
}

function selectDungeon(dungeonId) {
  if (fightActive) return;

  selectedDungeonId = dungeonId;
  selectedGroupId = null;
  renderMonsterSelect();
  updateMonsterPreview();
  saveProgress();
}

// One combatant card per monster in `monsters` ({ monsterId, hp }[]). Used
// both for the pre-fight preview (every monster in the chosen group, at full
// HP, not clickable) and for the live fight (the real, mutating state) —
// same shape either way, so one renderer covers both.
//
// `interactive` makes cards clickable to change the attack target, but only
// when there's more than one monster to choose between — a single monster is
// always the target, so no click affordance is shown for it.
function renderMonsterList(monsters, { interactive = false } = {}) {
  monsterListEl.replaceChildren();

  if (monsters.length === 0) {
    const placeholder = document.createElement('h2');
    placeholder.textContent = 'No monster selected';
    monsterListEl.append(placeholder);
    monsterCards = [];
    return;
  }

  const targetable = interactive && monsters.length > 1;

  monsterCards = monsters.map(({ monsterId, hp }, index) => {
    const monster = MONSTERS[monsterId];

    const name = document.createElement('h2');
    name.textContent = monster.label;

    let badge = null;
    if (targetable) {
      badge = document.createElement('span');
      badge.className = 'target-badge';
      badge.textContent = 'Target';
      badge.hidden = true;
      name.append(' ', badge);
    }

    const hpEl = document.createElement('span');
    hpEl.textContent = hp;
    const hpLine = document.createElement('p');
    hpLine.append('HP: ', hpEl, ` / ${monster.maxHp}`);

    // An indicator only — not clickable itself; each monster's own attack
    // interval animates its fill. Hidden outside an active fight, the same
    // as the player's own skill bar — there's nothing to indicate yet.
    const fill = document.createElement('span');
    fill.className = 'cooldown-fill';
    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = 'Attack';
    const button = document.createElement('button');
    button.className = 'cooldown-button';
    button.disabled = true;
    button.hidden = !interactive;
    button.append(fill, label);

    const card = document.createElement('div');
    card.className = 'combatant';
    card.append(name, hpLine, button);

    if (targetable) {
      card.classList.add('targetable');
      card.addEventListener('click', () => {
        if (!fightActive || activeMonsters[index].hp <= 0) return;
        targetIndex = index;
        updateTargetHighlight();
      });
    }

    monsterListEl.append(card);

    return { cardEl: card, hpEl, cooldownFillEl: fill, badgeEl: badge };
  });

  if (targetable) updateTargetHighlight();
}

// Highlights whichever card is currently targeted, without rebuilding the
// cards — a rebuild would wipe the front monster's in-progress cooldown
// animation.
function updateTargetHighlight() {
  monsterCards.forEach((card, index) => {
    const isTarget = index === targetIndex;
    card.cardEl.classList.toggle('targeted', isTarget);
    if (card.badgeEl) card.badgeEl.hidden = !isTarget;
  });
}

// Shows what the current selection would fight, before Start commits to it.
// A dungeon pick previews its first fight — the fight Start would actually
// begin with.
function updateMonsterPreview() {
  const groupId = selectedGroupId ?? (selectedDungeonId ? DUNGEONS[selectedDungeonId].fightIds[0] : null);
  const group = groupId ? MONSTER_GROUPS[groupId] : null;
  const monsters = group
    ? group.monsterIds.map((monsterId) => ({ monsterId, hp: MONSTERS[monsterId].maxHp }))
    : [];
  renderMonsterList(monsters);
  startButton.disabled = !group;
  fitMonsterSelectHeight();
}

// Keeps Start (and everything else below the fight-option list) in view
// without the whole page needing to scroll to reach it — only the list
// itself scrolls, via #monster-select's own overflow-y (see style.css).
// Measured rather than guessed, since how much room the monster preview and
// Start need varies with how many monsters are in the selected group and how
// narrow the viewport is (more/taller wrapped rows on a phone).
function fitMonsterSelectHeight() {
  if (monsterSelectEl.hidden) return; // hidden mid-fight; nothing to fit

  monsterSelectEl.style.maxHeight = 'none'; // measure the fully unconstrained layout first
  const naturalHeight = monsterSelectEl.getBoundingClientRect().height;
  const overflow = startButton.getBoundingClientRect().bottom - window.innerHeight;

  const MIN_LIST_HEIGHT = 128; // never shrink the list below a usable size
  monsterSelectEl.style.maxHeight = overflow > 0
    ? `${Math.max(naturalHeight - overflow, MIN_LIST_HEIGHT)}px`
    : '';
}

function renderStats() {
  statListEl.replaceChildren();

  for (const [statId, stat] of Object.entries(STATS)) {
    const name = document.createElement('span');
    name.className = 'stat-name';
    name.textContent = stat.label;

    const level = document.createElement('span');
    level.className = 'stat-level';
    level.textContent = `Lvl ${stats[statId]}`;

    const description = document.createElement('span');
    description.className = 'stat-description';
    description.textContent = stat.description;

    // Shows what the level costs you in outcome terms, not just in levels.
    const change = document.createElement('span');
    change.className = 'stat-change';
    change.textContent = `${stat.format(statValue(statId, stats[statId]))} → ${stat.format(statValue(statId, stats[statId] + 1))}`;

    const cost = statCost(statId, stats[statId]);
    const button = document.createElement('button');
    button.className = 'upgrade-button';
    button.textContent = `Upgrade (${cost} XP)`;
    button.disabled = xp < cost;
    button.addEventListener('click', () => upgradeStat(statId));

    const row = document.createElement('div');
    row.className = 'stat-row';
    row.append(name, level, description, change, button);
    statListEl.append(row);
  }
}

// The compact list of what's actually equipped, in slot order, with the
// empty-slot gaps removed — what fight logic and the point/slot counts care
// about, as opposed to `equippedSkills` itself which also encodes which
// physical slot each one sits in.
function equippedSkillIds() {
  return equippedSkills.filter((skillId) => skillId);
}

// True if `skillId` should fire itself as soon as its cooldown allows,
// rather than waiting for a click — the Auto-Trigger toggle (see
// SKILLS.basicAttack/strongAttack.toggles), checked live rather than frozen
// at fight start, same as every other toggle/upgrade-level lookup here.
function isAutoTriggering(skillId) {
  return isToggleActive(skillId, 'autoTrigger');
}

// One button per unlocked skill. Auto-triggering skills get a button too, but
// only as a cooldown indicator — they fire themselves rather than being
// clicked. Passive skills get no button at all: they have no cooldown to
// show and nothing to click, just a stat boost that applies for as long as
// they stay equipped (see applySkill/effectiveSecondsPerHp).
function renderSkillBar() {
  skillBarEl.replaceChildren();

  equippedSkillIds().filter((skillId) => SKILLS[skillId].type !== 'passive').forEach((skillId, index) => {
    const skill = SKILLS[skillId];

    const fill = document.createElement('span');
    fill.className = 'cooldown-fill';

    // The fill starts covering the whole button and drains from the bottom
    // up as the cooldown elapses (see animateCooldownFill), so its bottom
    // edge reaches a given point at a fixed, known moment regardless of the
    // cooldown's actual length — this marks exactly where that edge will be
    // when the effect lands, a static line at (1 - triggerAt) from the top.
    const triggerMarker = document.createElement('span');
    triggerMarker.className = 'trigger-marker';
    triggerMarker.style.top = `${(1 - skill.triggerAt) * 100}%`;

    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = skill.label;

    const button = document.createElement('button');
    button.className = 'cooldown-button';
    button.dataset.skill = skillId;
    button.disabled = true;
    button.append(fill, triggerMarker, label);

    if (!isAutoTriggering(skillId)) {
      button.addEventListener('click', () => useSkill(skillId));

      // Numbered by position in the bar, so the hint stays correct however the
      // bar is filled. Auto-triggering skills get no number — they cannot be
      // triggered by hand.
      const hotkey = document.createElement('span');
      hotkey.className = 'hotkey-hint';
      hotkey.textContent = index + 1;
      button.append(hotkey);
    }

    skillBarEl.append(button);
  });
}

document.addEventListener('keydown', (event) => {
  if (!fightActive) return;

  const index = Number(event.key) - 1;
  if (!Number.isInteger(index) || index < 0) return;

  const button = skillBarEl.querySelectorAll('button')[index];
  if (!button || button.disabled) return;

  useSkill(button.dataset.skill);
});

// The effect lands at skill.triggerAt (a fraction of the cooldown — 0 fires
// immediately, 1 only once the cooldown finishes), independently of the
// button re-enabling / auto-retrigger, which always waits for the full
// cooldown. Two separate timeouts, so a skill with triggerAt < 1 can still
// only be used again once its whole cooldown is over.
function useSkill(skillId) {
  if (!fightActive || skillTimeouts.has(skillId)) return;

  const skill = SKILLS[skillId];
  const button = skillBarEl.querySelector(`[data-skill="${skillId}"]`);
  const cooldown = skillCooldown(skillId, skillLevels[skillId].speed);
  button.disabled = true;
  animateCooldownFill(button.querySelector('.cooldown-fill'), cooldown);

  const effectTimeout = setTimeout(() => applySkill(skillId), cooldown * skill.triggerAt * 1000);

  const cooldownTimeout = setTimeout(() => {
    skillTimeouts.delete(skillId);

    if (!fightActive) return;
    if (isAutoTriggering(skillId)) useSkill(skillId);
    else button.disabled = false;
  }, cooldown * 1000);

  skillTimeouts.set(skillId, [effectTimeout, cooldownTimeout]);
}

function isToggleActive(skillId, toggleId) {
  return activeToggleIds.includes(toggleKey(skillId, toggleId));
}

function applySkill(skillId) {
  const skill = SKILLS[skillId];
  const basePower = skillPower(skillId, skillLevels[skillId].power);
  // Strength (a passive skill) boosts attacks only, never healing. Rounded
  // so a boosted hit still deals a whole number of damage.
  const power = skill.healing ? basePower : Math.round(basePower * passiveMultiplier(equippedSkillIds(), 'damage'));

  if (skill.healing) {
    if (isToggleActive(skillId, 'healOverTime')) {
      startHealOverTime(power);
    } else {
      healPlayer(power);
    }
    saveProgress();
    return;
  }

  // Multi Attack (a Basic Attack toggle) hits every monster still standing
  // instead of just the current target, each for the same full damage.
  const targets = isToggleActive(skillId, 'multiAttack')
    ? activeMonsters.map((monster, index) => (monster.hp > 0 ? index : null)).filter((index) => index !== null)
    : [targetIndex];

  const anyKilled = targets.reduce((killed, index) => damageMonster(index, power) || killed, false);
  if (anyKilled) {
    saveProgress();
    resolveFightProgress();
  }
}

// Applies damage to one monster, handling its kill (XP, quest/objective
// progress, defeat) if that's what the hit did. Returns whether it killed —
// applySkill uses that to decide whether anything needs re-checking
// afterwards (win condition, retargeting), whether it hit one monster or,
// with Multi Attack, several at once.
function damageMonster(index, power) {
  const target = activeMonsters[index];
  target.hp = Math.max(0, target.hp - power);
  monsterCards[index].hpEl.textContent = target.hp;
  if (target.hp > 0) return false;

  awardXp(groupKillXp(MONSTERS[target.monsterId].xp, groupKillCount));
  groupKillCount += 1;
  updateXpDisplay();
  registerKill();
  registerObjectiveEvent({ type: 'killMonster', monsterId: target.monsterId });
  defeatMonster(index);
  return true;
}

// Checks the fight's state after one or more monsters were just damaged:
// ends/advances the fight if every monster is down, otherwise retargets away
// from a target that just died so the player doesn't have to reselect one
// just to keep attacking.
function resolveFightProgress() {
  if (!activeMonsters.every((monster) => monster.hp <= 0)) {
    if (activeMonsters[targetIndex].hp <= 0) {
      targetIndex = activeMonsters.findIndex((monster) => monster.hp > 0);
      updateTargetHighlight();
    }
    return;
  }

  if (activeDungeonId && dungeonFightIndex < DUNGEONS[activeDungeonId].fightIds.length - 1) {
    advanceDungeonFight();
    return;
  }

  if (activeDungeonId) {
    // Paid once, only here — reaching this point already means every fight
    // in the chain is cleared. Retreat and a loss both end the dungeon
    // elsewhere, without ever reaching this branch.
    const bonus = DUNGEONS[activeDungeonId].completionBonusXp;
    awardXp(bonus);
    registerObjectiveEvent({ type: 'winDungeon' });
    updateXpDisplay();
    saveProgress();
    endGame(`${DUNGEONS[activeDungeonId].label} cleared! (+${bonus} bonus XP)`);
    return;
  }

  endGame('You win!');
}

function healPlayer(amount) {
  playerHp = Math.min(statValue('maxHp', stats.maxHp), playerHp + amount);
  updateHealthBar();
}

// Heal over Time (a Heal toggle): spreads `totalAmount` over 10 one-second
// ticks instead of landing it all at once. Each tick's amount is the
// difference between successive *rounded* running totals (rather than a
// flat totalAmount/10 every tick) so small, uneven totals still add up to
// exactly totalAmount rather than losing a fraction to rounding each tick.
const HOT_DURATION_SECONDS = 10;

function startHealOverTime(totalAmount) {
  let paidSoFar = 0;
  let tick = 0;

  const intervalId = setInterval(() => {
    tick += 1;
    const target = Math.round((totalAmount * tick) / HOT_DURATION_SECONDS);
    healPlayer(target - paidSoFar);
    paidSoFar = target;
    saveProgress();

    if (tick >= HOT_DURATION_SECONDS) {
      clearInterval(intervalId);
      hotIntervals = hotIntervals.filter((id) => id !== intervalId);
    }
  }, 1000);

  hotIntervals.push(intervalId);
}

// A defeated monster stops attacking and can no longer be targeted, but its
// card stays visible at 0 HP rather than disappearing.
function defeatMonster(index) {
  clearInterval(monsterAttackIntervals[index]);
  monsterAttackIntervals[index] = null;

  const card = monsterCards[index];
  card.cardEl.classList.add('defeated');
  if (card.badgeEl) card.badgeEl.hidden = true;
  card.cardEl.querySelector('.cooldown-label').textContent = 'Defeated';
  resetCooldownFill(card.cooldownFillEl);
}

function updateHealthBar() {
  const maxHp = statValue('maxHp', stats.maxHp);
  playerHpEl.textContent = playerHp;
  playerMaxHpEl.textContent = maxHp;
  healthBarFillEl.style.width = `${(playerHp / maxHp) * 100}%`;
}

// The Health Regen stat's own seconds-per-HP, sped up by Regen (a passive
// skill) for as long as it stays equipped — divided, since a higher
// multiplier means less time per HP, same relationship the stat's own
// perLevel already has.
function effectiveSecondsPerHp() {
  return statValue('healthRegen', stats.healthRegen) / passiveMultiplier(equippedSkillIds(), 'healthRegen');
}

function updateRegenIndicator() {
  const pending = playerHp < statValue('maxHp', stats.maxHp);
  const secondsPerHp = effectiveSecondsPerHp();
  // Clamped because upgrading Health Regen can leave progress above the new
  // requirement until the next tick collects it.
  const percent = Math.min(100, (regenProgress / secondsPerHp) * 100);
  regenProgressEl.style.width = pending ? `${percent}%` : '0%';
}

// Passive regen runs continuously, including during a fight and after a loss —
// it is what makes HP recoverable now that fights no longer heal you.
//
// Progress accumulates against the *current* seconds-per-HP rather than being
// scheduled, so upgrading Health Regen applies immediately instead of
// discarding the wait already served.
//
// Driven by real elapsed time (see advanceRegen) rather than counting ticks,
// because a browser throttles setInterval once its tab is backgrounded — a
// 1-second timer can end up firing only once a minute. Without this, regen
// already in progress would still land on the rare tick that does fire, but
// the next one would take far longer than it should to even start.
let lastRegenTimestamp = Date.now();

function regenTick() {
  const now = Date.now();
  const elapsedSeconds = (now - lastRegenTimestamp) / 1000;
  lastRegenTimestamp = now;

  const result = advanceRegen({
    hp: playerHp,
    maxHp: statValue('maxHp', stats.maxHp),
    progress: regenProgress,
    secondsPerHp: effectiveSecondsPerHp(),
  }, elapsedSeconds);

  const healed = result.hp !== playerHp;
  playerHp = result.hp;
  regenProgress = result.progress;

  if (healed) {
    updateHealthBar();
    saveProgress();
  }

  updateRegenIndicator();
}

// `index` identifies which monster in activeMonsters is attacking, so each
// one's interval (see beginFight) deals its own damage and animates its own
// card, independently of every other monster's cooldown.
function monsterAttackTick(index) {
  const monster = MONSTERS[activeMonsters[index].monsterId];
  playerHp = Math.max(0, playerHp - monster.damage);
  updateHealthBar();
  saveProgress();

  if (playerHp <= 0) {
    endGame('You lose...');
    return;
  }

  animateCooldownFill(monsterCards[index].cooldownFillEl, monster.cooldown);
}

// Stops every timer a fight has running — both directions (endGame and
// Retreat) need this so nothing keeps ticking, and possibly damaging the
// player, once the fight is no longer active.
function stopFightTimers() {
  monsterAttackIntervals.forEach(clearInterval);
  monsterAttackIntervals = [];
  // Each skill has two timeouts (its effect, and its cooldown finishing —
  // see useSkill) that both need clearing, or a not-yet-fired effect could
  // still land after the fight is already over.
  for (const timeouts of skillTimeouts.values()) timeouts.forEach(clearTimeout);
  skillTimeouts.clear();
  hotIntervals.forEach(clearInterval);
  hotIntervals = [];
}

function endGame(message) {
  fightActive = false;
  stopFightTimers();

  // stopFightTimers only stops the JS timers that would schedule the *next*
  // attack; any cooldown fill whose CSS transition was already running (a
  // monster mid-attack, or a skill mid-cooldown) would otherwise keep
  // visibly animating on its own after the fight is over.
  monsterCards.forEach((card) => resetCooldownFill(card.cooldownFillEl));
  skillBarEl.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
    resetCooldownFill(button.querySelector('.cooldown-fill'));
  });
  retreatButton.hidden = true;

  resultMessageEl.textContent = message;
  resultMessageEl.hidden = false;
  restartButton.hidden = false;
}

// Ends the fight immediately with no win or loss — just back to picking a
// monster. HP is left exactly as it was; there's no penalty or free heal.
function retreat() {
  if (!fightActive) return;

  fightActive = false;
  stopFightTimers();
  startGame();
}

function startGame() {
  fightActive = false;
  activeMonsters = [];
  activeDungeonId = null;
  dungeonFightIndex = 0;
  updateHealthBar();
  updateDungeonProgress();

  renderMonsterSelect();
  updateMonsterPreview();
  monsterSelectEl.hidden = false;

  resultMessageEl.hidden = true;
  restartButton.hidden = true;
  retreatButton.hidden = true;

  renderSkillBar();
  skillBarEl.hidden = true;
  startButton.hidden = false;
}

// Shows which dungeon fight is current, or hides the line entirely outside
// a dungeon (a plain single-group fight has nothing to chain, so nothing to
// show here).
function updateDungeonProgress() {
  if (!activeDungeonId) {
    dungeonProgressEl.hidden = true;
    return;
  }

  const dungeon = DUNGEONS[activeDungeonId];
  dungeonProgressEl.hidden = false;
  dungeonProgressEl.textContent = `${dungeon.label} — Fight ${dungeonFightIndex + 1}/${dungeon.fightIds.length}`;
}

// Populates activeMonsters for `groupId` and starts each monster's attack
// interval. Shared by beginFight (the first fight of a pick) and
// advanceDungeonFight (every fight after the first in a dungeon chain) —
// both just mean "start fighting this group now".
function startFightGroup(groupId) {
  const group = MONSTER_GROUPS[groupId];
  activeMonsters = group.monsterIds.map((monsterId) => ({ monsterId, hp: MONSTERS[monsterId].maxHp }));
  targetIndex = 0;
  groupKillCount = 0;
  renderMonsterList(activeMonsters, { interactive: true });

  // Every monster starts attacking as soon as the fight begins, each on its
  // own cooldown.
  monsterAttackIntervals = activeMonsters.map((entry, index) => {
    const monster = MONSTERS[entry.monsterId];
    animateCooldownFill(monsterCards[index].cooldownFillEl, monster.cooldown);
    return setInterval(() => monsterAttackTick(index), monster.cooldown * 1000);
  });
}

function beginFight() {
  if (!selectedGroupId && !selectedDungeonId) return;

  if (selectedDungeonId) {
    activeDungeonId = selectedDungeonId;
    dungeonFightIndex = 0;
  } else {
    activeDungeonId = null;
  }

  fightActive = true;
  startButton.hidden = true;
  monsterSelectEl.hidden = true;
  skillBarEl.hidden = false;
  retreatButton.hidden = false;
  updateDungeonProgress();

  for (const skillId of equippedSkillIds()) {
    const skill = SKILLS[skillId];
    if (skill.type === 'passive') continue;
    if (isAutoTriggering(skillId)) useSkill(skillId);
    else skillBarEl.querySelector(`[data-skill="${skillId}"]`).disabled = false;
  }

  startFightGroup(activeDungeonId ? DUNGEONS[activeDungeonId].fightIds[0] : selectedGroupId);
}

// Moves a dungeon on to its next fight in the chain, without returning to
// the selection screen — HP carries over as-is (subject to normal passive
// regen only, same as between any two fights).
function advanceDungeonFight() {
  dungeonFightIndex += 1;
  updateDungeonProgress();
  startFightGroup(DUNGEONS[activeDungeonId].fightIds[dungeonFightIndex]);
  saveProgress();
}

// Every XP-earning moment (a kill, a dungeon-clear bonus) should route
// through here rather than adding to `xp` directly, so lifetime tracking and
// the prestige bar can never drift out of sync with what was actually
// earned. Spending XP (upgrades, unlocks) still just subtracts from `xp`
// directly — lifetimeXp and prestigeProgress only ever move forward.
function awardXp(amount) {
  xp += amount;
  lifetimeXp += amount;

  if (lifetimeXp >= maxXp) {
    // Simplification: an award that itself crosses the threshold counts in
    // full toward the bar, rather than splitting the part that happened
    // before/after crossing — awards are small relative to the target (10%
    // of maxXp), so the possible overshoot is negligible.
    prestigeProgress = Math.min(prestigeTarget(maxXp), prestigeProgress + amount);
  }
}

function updateXpDisplay() {
  xpValueEl.textContent = xp;
  renderStats();
  renderSkills();
  renderSkillSlots();
  renderSkillDetail();
  renderPrestige();
}

// Hidden until lifetime XP reaches maxXp; once visible, fills toward
// prestigeTarget(maxXp) and reveals the Prestige button once full.
function renderPrestige() {
  maxXpValueEl.textContent = maxXp;

  const ready = lifetimeXp >= maxXp;
  prestigeSectionEl.hidden = !ready;
  if (!ready) return;

  const target = prestigeTarget(maxXp);
  prestigeProgressValueEl.textContent = prestigeProgress;
  prestigeTargetValueEl.textContent = target;
  prestigeBarFillEl.style.width = `${Math.min(100, (prestigeProgress / target) * 100)}%`;
  prestigeButton.hidden = prestigeProgress < target;
}

// Resets everything a fresh game starts with — XP, stats, skills, quests,
// kill count, the current fight selection — but raises maxXp by
// PRESTIGE_BONUS_PER_CYCLE for the next cycle. Mirrors resetCharacter's
// "wipe the save and reload" approach, since that already takes a fresh
// player's exact path with no chance to drift as more state is added; the
// one difference is maxXp needing to survive, which is exactly why it lives
// in its own localStorage key instead of the main save.
function prestige() {
  const target = prestigeTarget(maxXp);
  if (prestigeProgress < target) return;

  const newMaxXp = maxXp + PRESTIGE_BONUS_PER_CYCLE;
  if (!confirm(`Prestige now? This resets your XP, stats, skills, quests, and kill count back to a fresh start, but raises Max XP from ${maxXp} to ${newMaxXp}.`)) return;

  localStorage.setItem(MAX_XP_KEY, String(newMaxXp));
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

function unlockSkill(skillId) {
  // Objective-gated skills (Strong Attack, Heal) have no XP price at all —
  // they unlock only via applyObjectiveReward, never through this button.
  if (SKILLS[skillId].unlockObjectiveId) return;

  const cost = SKILLS[skillId].unlockCost;
  if (unlockedSkills.includes(skillId) || xp < cost) return;

  xp -= cost;
  markSkillUnlocked(skillId);
  updateXpDisplay();
  saveProgress();
}

// Marks a skill unlocked and, when it fits, equips it straight away — shared
// by unlockSkill (an XP purchase) and applyObjectiveReward's 'unlockSkill'
// reward (free), so buying or earning a skill does something visible right
// away rather than needing a second click to matter either way.
function markSkillUnlocked(skillId) {
  if (unlockedSkills.includes(skillId)) return;

  unlockedSkills.push(skillId);
  const slot = firstEmptySlotIndex();
  if (slot !== -1 && canEquip(skillId)) equippedSkills[slot] = skillId;

  // Rebuilding mid-fight would discard buttons with cooldowns already running,
  // so a skill unlocked during a fight joins the bar on the next one.
  if (!fightActive) renderSkillBar();
}

function pointsUsed() {
  return equippedSkillIds().reduce((total, skillId) => total + effectivePointCost(skillId, activeToggleIds), 0);
}

// The lowest-index slot (within today's Skill Slots count) that's empty, or
// -1 if every slot is already filled.
function firstEmptySlotIndex() {
  const slotCount = statValue('skillSlots', stats.skillSlots);
  for (let index = 0; index < slotCount; index += 1) {
    if (!equippedSkills[index]) return index;
  }
  return -1;
}

// Equipping is limited on two axes: slots cap how many skills you carry,
// points cap how strong that combination is.
function canEquip(skillId) {
  return equippedSkillIds().length < statValue('skillSlots', stats.skillSlots)
    && pointsUsed() + effectivePointCost(skillId, activeToggleIds) <= statValue('skillPoints', stats.skillPoints);
}

// Equips `skillId` into `slotIndex`, moving it there if it's already
// equipped somewhere else and bumping out whatever currently sits in that
// slot. Refuses only if the result would exceed the Skill Points budget —
// the slot count itself is never at risk, since a drop always targets one
// of the slots already on screen.
function equipInSlot(skillId, slotIndex) {
  if (!skillId || !unlockedSkills.includes(skillId)) return;
  if (equippedSkills[slotIndex] === skillId) return;

  hideSkillEquipMessage();

  const previousIndex = equippedSkills.indexOf(skillId);
  const otherIds = equippedSkills.filter((id, index) => id && index !== previousIndex && index !== slotIndex);
  const projectedPoints = otherIds.reduce((total, id) => total + effectivePointCost(id, activeToggleIds), 0)
    + effectivePointCost(skillId, activeToggleIds);
  const budget = statValue('skillPoints', stats.skillPoints);
  if (projectedPoints > budget) {
    const shortfall = projectedPoints - budget;
    showSkillEquipMessage(
      `Not enough Skill Points to equip ${SKILLS[skillId].label} — needs ${shortfall} more `
      + `(would use ${projectedPoints}/${budget}). Unequip something else or level up Skill Points.`
    );
    // Mirrors the message inline if the detail panel is open — see there —
    // since a tap-to-equip attempt (unlike a drag) is triggered from inside
    // that panel, nowhere near the shared message slot below the skill list.
    renderSkillDetail();
    return;
  }

  if (previousIndex !== -1) equippedSkills[previousIndex] = null;
  equippedSkills[slotIndex] = skillId;

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

// Transient feedback for a failed equip attempt — auto-hides after a few
// seconds, or immediately at the start of the next equip attempt, so it
// never lingers stale once the player has moved on.
let skillEquipMessageTimeout = null;

function showSkillEquipMessage(text) {
  clearTimeout(skillEquipMessageTimeout);
  skillEquipMessageEl.textContent = text;
  skillEquipMessageEl.hidden = false;
  skillEquipMessageTimeout = setTimeout(hideSkillEquipMessage, 4000);
}

function hideSkillEquipMessage() {
  clearTimeout(skillEquipMessageTimeout);
  skillEquipMessageEl.hidden = true;
}

function unequipSkill(skillId) {
  const index = equippedSkills.indexOf(skillId);
  if (index === -1) return;

  equippedSkills[index] = null;

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

// A one-time XP purchase, independent of switching the toggle on/off
// afterwards (see setToggleActive). Locked entirely (like every toggle)
// until the 'winDungeon' objective completes.
function unlockToggle(skillId, toggleId) {
  if (!togglesUnlocked) return;

  const key = toggleKey(skillId, toggleId);
  if (unlockedToggleIds.includes(key)) return;

  const cost = findToggle(skillId, toggleId).unlockCost;
  if (xp < cost) return;

  xp -= cost;
  unlockedToggleIds.push(key);
  updateXpDisplay();
  saveProgress();
}

// Switches an already-unlocked toggle on or off. Turning one on adds its
// pointSurcharge to the skill's Skill Point cost while equipped — refused,
// with the same shortfall message equipInSlot shows, if that would exceed
// the budget.
function setToggleActive(skillId, toggleId, active) {
  if (!togglesUnlocked) return;

  const key = toggleKey(skillId, toggleId);
  if (!unlockedToggleIds.includes(key) || activeToggleIds.includes(key) === active) return;

  hideSkillEquipMessage();

  if (active && equippedSkills.includes(skillId)) {
    const toggle = findToggle(skillId, toggleId);
    const projectedPoints = pointsUsed() + toggle.pointSurcharge;
    const budget = statValue('skillPoints', stats.skillPoints);
    if (projectedPoints > budget) {
      const shortfall = projectedPoints - budget;
      showSkillEquipMessage(
        `Not enough Skill Points to turn on ${toggle.label} — needs ${shortfall} more `
        + `(would use ${projectedPoints}/${budget}). Unequip something else or level up Skill Points.`
      );
      // The toggle switch lives inside the detail panel, not near the shared
      // message slot below the skill list — mirror it inline (see there) so
      // turning a toggle on doesn't look like it silently did nothing.
      renderSkillDetail();
      return;
    }
  }

  activeToggleIds = active
    ? [...activeToggleIds, key]
    : activeToggleIds.filter((id) => id !== key);

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

// Every skill — locked or not — renders as the same square, in one
// horizontal row (matching #skill-slots' look), so a locked skill's box
// lines up with an unlocked one instead of sitting in a differently-shaped
// row of its own. A locked square is dimmed and not draggable, but still
// clickable: its cost/requirement moved into the detail panel (see
// renderSkillDetail) rather than being crammed into the square itself.
function renderSkills() {
  skillListEl.replaceChildren();

  const slots = statValue('skillSlots', stats.skillSlots);
  slotsUsedEl.textContent = equippedSkillIds().length;
  slotsTotalEl.textContent = slots;
  pointsUsedEl.textContent = pointsUsed();
  pointsTotalEl.textContent = statValue('skillPoints', stats.skillPoints);

  for (const skillId of Object.keys(SKILLS)) {
    const skill = SKILLS[skillId];
    const unlocked = unlockedSkills.includes(skillId);
    const equipped = equippedSkills.includes(skillId);

    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = skill.label;

    const square = document.createElement('button');
    square.type = 'button';
    square.className = 'cooldown-button skill-square';
    square.classList.toggle('equipped', equipped);
    square.classList.toggle('inspected', inspectedSkillId === skillId);
    square.classList.toggle('locked', !unlocked);
    square.append(label);
    square.addEventListener('click', () => inspectSkill(skillId));

    if (unlocked) {
      // Draggable so it can be dropped onto a slot to equip it, or (if
      // already equipped) dragged back here to unequip it (see skill-slots).
      square.draggable = true;
      square.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', skillId));
    }

    skillListEl.append(square);
  }
}

// A loadout bar matching the in-combat skill bar's look, one box per Skill
// Slots level. Drag an unlocked skill from the list onto a slot to equip it
// there (bumping out whatever was there); drag a filled slot onto another
// slot to move it, or back onto the list to unequip it. Clicking a filled
// slot (rather than dragging it) opens its stats/upgrades in the detail
// panel below, same as clicking its square in the list.
function renderSkillSlots() {
  skillSlotsEl.replaceChildren();

  const slotCount = statValue('skillSlots', stats.skillSlots);

  for (let index = 0; index < slotCount; index += 1) {
    const skillId = equippedSkills[index];

    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = skillId ? SKILLS[skillId].label : 'Empty';

    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'cooldown-button skill-slot';
    box.classList.toggle('inspected', Boolean(skillId) && inspectedSkillId === skillId);
    box.append(label);

    if (skillId) {
      box.draggable = true;
      box.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', skillId));
      box.addEventListener('click', () => inspectSkill(skillId));
    }

    box.addEventListener('dragover', (event) => {
      event.preventDefault();
      box.classList.add('drag-over');
    });
    box.addEventListener('dragleave', () => box.classList.remove('drag-over'));
    box.addEventListener('drop', (event) => {
      event.preventDefault();
      box.classList.remove('drag-over');
      equipInSlot(event.dataTransfer.getData('text/plain'), index);
    });

    skillSlotsEl.append(box);
  }
}

// Toggles the detail panel for `skillId` — clicking an already-open skill's
// square closes it, clicking a different one switches to it. Re-renders the
// list/slots too so the clicked square's `inspected` highlight moves.
function inspectSkill(skillId) {
  inspectedSkillId = inspectedSkillId === skillId ? null : skillId;
  renderSkills();
  renderSkillSlots();
  renderSkillDetail();
}

// The stats/upgrades panel for whichever skill was last clicked. Never
// actually hidden — with nothing inspected it shows a placeholder instead —
// so it always claims the same layout space; toggling it via the `hidden`
// attribute used to make the whole two-column row recenter the instant it
// appeared, visibly shifting the skill list sideways on the very click that
// opened it. Reused by updateXpDisplay so it stays current (e.g. an upgrade
// bought while the panel is open updates its cost/preview) without the click
// handlers needing to know about that themselves.
function renderSkillDetail() {
  if (!inspectedSkillId) {
    const placeholder = document.createElement('p');
    placeholder.className = 'skill-detail-placeholder';
    placeholder.textContent = 'Tap a skill to see its stats and upgrades.';
    skillDetailPanelEl.replaceChildren(placeholder);
    return;
  }

  const skillId = inspectedSkillId;
  const skill = SKILLS[skillId];

  const heading = document.createElement('h3');
  heading.className = 'skill-detail-heading';
  heading.textContent = skill.label;

  const summary = document.createElement('p');
  summary.className = 'skill-detail-summary';
  summary.textContent = describeSkill(skillId, skillLevels[skillId]);

  if (!unlockedSkills.includes(skillId)) {
    // A locked skill has no cost/equip/upgrades/toggles of its own yet —
    // just what unlocks it: an objective to complete, or an XP price.
    const lockInfo = skill.unlockObjectiveId
      ? (() => {
        const message = document.createElement('p');
        message.className = 'skill-detail-cost';
        message.textContent = `Locked — ${OBJECTIVES[skill.unlockObjectiveId].description}`;
        return message;
      })()
      : (() => {
        const button = document.createElement('button');
        button.className = 'unlock-button';
        button.textContent = `Unlock (${skill.unlockCost} XP)`;
        button.disabled = xp < skill.unlockCost;
        button.addEventListener('click', () => unlockSkill(skillId));
        return button;
      })();

    skillDetailPanelEl.replaceChildren(heading, summary, lockInfo);
    return;
  }

  const effectiveCost = effectivePointCost(skillId, activeToggleIds);
  const cost = document.createElement('p');
  cost.className = 'skill-detail-cost';
  cost.textContent = `${effectiveCost} ${effectiveCost === 1 ? 'pt' : 'pts'} while equipped`;

  const children = [heading, summary, cost];

  // Mirrors #skill-equip-message inline, right where the tap-to-equip
  // buttons and toggle switches that can trigger it actually live — the
  // shared message slot sits below the skill list in a separate column on
  // desktop, easy to miss entirely otherwise (see equipInSlot/setToggleActive).
  if (!skillEquipMessageEl.hidden) {
    const message = document.createElement('p');
    message.className = 'skill-detail-message';
    message.textContent = skillEquipMessageEl.textContent;
    children.push(message);
  }

  children.push(buildEquipControls(skillId), buildUpgradeRow(skillId));
  const toggleRow = buildToggleRow(skillId);
  if (toggleRow) children.push(toggleRow);

  skillDetailPanelEl.replaceChildren(...children);
}

// One row per entry in the skill's `toggles` array (see SKILLS.*.toggles) —
// separate from buildUpgradeRow's continuous tracks, since a toggle is a
// one-time unlock that then switches on/off rather than leveling up.
// Visible even when togglesUnlocked is false (so a player knows the system
// exists and what unlocks it), but every control stays disabled until then.
function buildToggleRow(skillId) {
  const skill = SKILLS[skillId];
  if (skill.toggles.length === 0) return null;

  const container = document.createElement('div');
  container.className = 'skill-toggles';

  if (!togglesUnlocked) {
    const lockedMessage = document.createElement('p');
    lockedMessage.className = 'toggles-locked-message';
    lockedMessage.textContent = `Toggles are locked — ${OBJECTIVES.winDungeon.description} to unlock them.`;
    container.append(lockedMessage);
  }

  for (const toggle of skill.toggles) {
    const key = toggleKey(skillId, toggle.id);
    const unlocked = unlockedToggleIds.includes(key);
    const active = activeToggleIds.includes(key);

    const label = document.createElement('span');
    label.className = 'toggle-label';
    label.textContent = toggle.label;

    const description = document.createElement('span');
    description.className = 'toggle-description';
    description.textContent = `${toggle.description} (+${toggle.pointSurcharge} ${toggle.pointSurcharge === 1 ? 'pt' : 'pts'} while on)`;

    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.append(label, description);

    if (unlocked) {
      const button = document.createElement('button');
      button.className = 'toggle-switch';
      button.classList.toggle('active', active);
      button.textContent = active ? 'On' : 'Off';
      button.disabled = !togglesUnlocked;
      button.addEventListener('click', () => setToggleActive(skillId, toggle.id, !active));
      row.append(button);
    } else {
      const button = document.createElement('button');
      button.className = 'toggle-unlock-button';
      button.textContent = `Unlock (${toggle.unlockCost} XP)`;
      button.disabled = !togglesUnlocked || xp < toggle.unlockCost;
      button.addEventListener('click', () => unlockToggle(skillId, toggle.id));
      row.append(button);
    }

    container.append(row);
  }

  return container;
}

// Tap-based equip/move/unequip, standing alongside the drag-and-drop on the
// squares themselves — iOS Safari and most mobile browsers never fire HTML5
// drag events over touch, so this is the only way a touch player can equip a
// skill at all. One button per slot ("here" for wherever the skill already
// sits, disabled; otherwise the slot's current occupant, or "Empty") calls
// the same equipInSlot used by dropping a square on a slot, so a tap and a
// drag land on identical logic (budget check, message on shortfall, save).
function buildEquipControls(skillId) {
  const container = document.createElement('div');
  container.className = 'skill-equip-controls';

  const slotCount = statValue('skillSlots', stats.skillSlots);
  const currentIndex = equippedSkills.indexOf(skillId);

  const slotsRow = document.createElement('div');
  slotsRow.className = 'skill-equip-slots';

  for (let index = 0; index < slotCount; index += 1) {
    const occupantId = equippedSkills[index];

    const button = document.createElement('button');
    button.className = 'equip-slot-button';
    button.textContent = index === currentIndex
      ? `Slot ${index + 1} (here)`
      : `Slot ${index + 1} (${occupantId ? SKILLS[occupantId].label : 'Empty'})`;
    button.disabled = index === currentIndex;
    button.addEventListener('click', () => equipInSlot(skillId, index));

    slotsRow.append(button);
  }

  container.append(slotsRow);

  if (currentIndex !== -1) {
    const unequipButton = document.createElement('button');
    unequipButton.className = 'unequip-button';
    unequipButton.textContent = 'Unequip';
    unequipButton.addEventListener('click', () => unequipSkill(skillId));
    container.append(unequipButton);
  }

  return container;
}

// One row per entry in the skill's `upgrades` array, whatever tracks that
// happens to be — same pattern renderStats uses for the Character tab, down
// to the current → next preview.
function buildUpgradeRow(skillId) {
  const skill = SKILLS[skillId];
  const row = document.createElement('div');
  row.className = 'skill-upgrades';

  for (const upgrade of skill.upgrades) {
    const level = skillLevels[skillId][upgrade.id];
    const cost = skillUpgradeCost(skillId, upgrade.id, level);

    const label = document.createElement('span');
    label.className = 'track-label';
    label.textContent = `${upgrade.label} Lvl ${level}`;

    const change = document.createElement('span');
    change.className = 'track-change';
    change.textContent = `${upgrade.format(upgrade.value(skill, level))} → ${upgrade.format(upgrade.value(skill, level + 1))}`;

    const button = document.createElement('button');
    button.className = 'upgrade-button';
    button.textContent = `Upgrade (${cost} XP)`;
    button.disabled = xp < cost;
    button.addEventListener('click', () => upgradeSkillTrack(skillId, upgrade.id));

    row.append(label, change, button);
  }

  return row;
}

function upgradeSkillTrack(skillId, upgradeId) {
  const cost = skillUpgradeCost(skillId, upgradeId, skillLevels[skillId][upgradeId]);
  if (xp < cost) return;

  xp -= cost;
  skillLevels[skillId][upgradeId] += 1;
  updateXpDisplay();
  saveProgress();
}

// Applies a quest's reward. Only `unlockTab` exists today, but this stays a
// switch on `reward.type` so a future reward kind (e.g. unlocking a monster)
// is a new case here, not a change to how completion is detected.
function applyQuestReward(reward) {
  if (reward.type === 'unlockTab') {
    document.querySelector(`.tab-button[data-tab="${reward.tabId}"]`).hidden = false;
  }
}

// Re-applies every already-completed quest's reward — used on load, so a
// returning player's unlocked tabs reflect their save rather than starting
// hidden again.
function applyCompletedQuestRewards() {
  for (const questId of completedQuestIds) {
    const quest = QUESTS.find((q) => q.id === questId);
    if (quest) applyQuestReward(quest.reward);
  }
}

function updateQuestTracker() {
  const quest = activeQuest(completedQuestIds);
  questTrackerEl.hidden = !quest;
  if (!quest) return;

  questTrackerEl.textContent = describeQuestProgress(quest, totalKills);
}

// Called once per enemy defeated. A `while` (rather than an `if`) covers a
// quest whose target the kill counter has already passed, so progression
// never stalls even if a future quest's target is skipped over in one kill.
function registerKill() {
  totalKills += 1;

  let quest = activeQuest(completedQuestIds);
  while (quest && questComplete(quest, totalKills)) {
    completedQuestIds.push(quest.id);
    applyQuestReward(quest.reward);
    quest = activeQuest(completedQuestIds);
  }

  updateQuestTracker();
}

// Applies an objective's reward (see OBJECTIVES) — a switch on `reward.type`,
// same pattern as applyQuestReward, so a future reward kind is a new case
// here rather than a change to how completion is detected.
function applyObjectiveReward(reward) {
  if (reward.type === 'unlockSkill') {
    markSkillUnlocked(reward.skillId);
  } else if (reward.type === 'unlockToggles') {
    togglesUnlocked = true;
  }

  updateXpDisplay();
  saveProgress();
}

// Re-applies every already-completed objective's reward — used on load, same
// reasoning as applyCompletedQuestRewards.
function applyCompletedObjectiveRewards() {
  for (const objectiveId of completedObjectiveIds) {
    const objective = OBJECTIVES[objectiveId];
    if (objective) applyObjectiveReward(objective.reward);
  }
}

// Checks `event` (e.g. `{ type: 'killMonster', monsterId: 'medium' }`)
// against every not-yet-completed objective. Unlike registerKill's quest
// chain, objectives aren't sequential — more than one can match the same
// event in principle, and any can complete in any order, so this loops over
// all of them rather than checking only "the" active one.
function registerObjectiveEvent(event) {
  for (const [objectiveId, objective] of Object.entries(OBJECTIVES)) {
    if (completedObjectiveIds.includes(objectiveId)) continue;
    if (!objectiveMatches(objective.condition, event)) continue;

    completedObjectiveIds.push(objectiveId);
    applyObjectiveReward(objective.reward);
  }
}

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    xp, stats, hp: playerHp, unlockedSkills, equippedSkills, skillLevels,
    selectedGroupId, selectedDungeonId, totalKills, completedQuestIds,
    lifetimeXp, prestigeProgress,
    completedObjectiveIds, togglesUnlocked, unlockedToggleIds, activeToggleIds,
  }));
}

// A skill id from an older save that no longer exists in SKILLS (e.g. Auto
// Attack, retired in v9) — dropped everywhere it could appear, rather than
// left dangling as a dead reference nothing ever cleans up.
function isRemovedSkillId(skillId) {
  return skillId && !SKILLS[skillId];
}

function loadProgress() {
  // maxXp lives outside SAVE_KEY (see MAX_XP_KEY) specifically so it
  // survives a prestige wiping everything else back to a fresh game.
  const savedMaxXp = Number(localStorage.getItem(MAX_XP_KEY));
  if (savedMaxXp) maxXp = savedMaxXp;

  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const saved = JSON.parse(raw);
  xp = saved.xp;
  Object.assign(stats, saved.stats);
  if (saved.hp !== undefined) playerHp = saved.hp;
  if (saved.unlockedSkills) unlockedSkills = saved.unlockedSkills.filter((id) => !isRemovedSkillId(id));
  if (saved.equippedSkills) equippedSkills = saved.equippedSkills.map((id) => (isRemovedSkillId(id) ? null : id));
  // Merged key-by-key against today's SKILLS, rather than Object.assign, so a
  // removed skill's stray levels (e.g. autoAttack's) don't tag along.
  if (saved.skillLevels) {
    for (const skillId of Object.keys(SKILLS)) {
      if (saved.skillLevels[skillId]) skillLevels[skillId] = saved.skillLevels[skillId];
    }
  }
  if (saved.selectedGroupId) selectedGroupId = saved.selectedGroupId;
  if (saved.selectedDungeonId) selectedDungeonId = saved.selectedDungeonId;
  if (saved.totalKills) totalKills = saved.totalKills;
  if (saved.completedQuestIds) completedQuestIds = saved.completedQuestIds;
  if (saved.lifetimeXp) lifetimeXp = saved.lifetimeXp;
  if (saved.prestigeProgress) prestigeProgress = saved.prestigeProgress;
  if (saved.completedObjectiveIds) completedObjectiveIds = saved.completedObjectiveIds;
  if (saved.togglesUnlocked) togglesUnlocked = saved.togglesUnlocked;
  if (saved.unlockedToggleIds) unlockedToggleIds = saved.unlockedToggleIds;
  if (saved.activeToggleIds) activeToggleIds = saved.activeToggleIds;
}

function resetCharacter() {
  if (!confirm('Reset all XP and stats back to 0?')) return;

  xp = 0;
  // Reload from no save rather than zeroing state by hand — a fresh player
  // takes the same path, so this cannot drift as more state is added.
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

loadProgress();
if (playerHp === null) playerHp = statValue('maxHp', stats.maxHp);
startGame();
updateXpDisplay();
updateRegenIndicator();
applyCompletedQuestRewards();
applyCompletedObjectiveRewards();
updateQuestTracker();
// The placeholder only ever ships from deploy.yml having stamped a real SHA
// in; any other copy (local dev, `node --test`, a clone) shows this instead
// of the literal placeholder token.
const buildLabel = BUILD_SHA === '__BUILD_SHA__' ? 'unreleased build' : BUILD_SHA;
versionValueEl.textContent = `${VERSION} (${buildLabel})`;
setInterval(regenTick, REGEN_TICK_SECONDS * 1000);

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

// This only ever hides/shows panels — it must never pause or clear a fight's
// timers. setInterval/setTimeout keep running regardless of a hidden
// ancestor, which is exactly what lets a fight keep going while the player
// is on the Character or Skills tab; a fight ends only via a win, a loss, or
// Retreat.
tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.tab;
    tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== targetId;
    });
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn === button);
    });
    // #monster-select is unmeasurable (0-height) while the Fight tab is
    // hidden, so re-fit it on the way back in rather than only when its own
    // content last changed — covers a window resize that happened meanwhile.
    if (targetId === 'fight-tab') fitMonsterSelectHeight();
  });
});

document.querySelector('[data-tab="fight-tab"]').classList.add('active');

window.addEventListener('resize', fitMonsterSelectHeight);
