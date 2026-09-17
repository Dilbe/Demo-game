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
const xpTotalEl = document.getElementById('xp-total');
const skillsXpTotalEl = document.getElementById('skills-xp-total');
const slotsUsedEl = document.getElementById('slots-used');
const slotsTotalEl = document.getElementById('slots-total');
const pointsUsedEl = document.getElementById('points-used');
const pointsTotalEl = document.getElementById('points-total');
const skillListEl = document.getElementById('skill-list');
const skillSlotsEl = document.getElementById('skill-slots');
const statListEl = document.getElementById('stat-list');
const resetCharacterButton = document.getElementById('reset-character-button');
const questTrackerEl = document.getElementById('quest-tracker');
const versionValueEl = document.getElementById('version-value');

const REGEN_TICK_SECONDS = 1;

const SAVE_KEY = 'demo-game-save';

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
let xp = 0;
// Total enemies defeated across every fight, ever — separate from XP because
// quests key off it directly rather than off however XP happens to convert.
let totalKills = 0;
// Quest ids completed so far, in the order they were completed (which is
// always QUESTS order, since quests only ever complete sequentially).
let completedQuestIds = [];

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

    const name = document.createElement('span');
    name.className = 'monster-name';
    name.textContent = group.label;

    const detail = document.createElement('span');
    detail.className = 'monster-detail';
    detail.textContent = describeMonsterGroup(groupId);

    const button = document.createElement('button');
    button.className = 'monster-select-button';
    button.textContent = selected ? 'Selected' : 'Select';
    button.disabled = fightActive || selected;
    button.addEventListener('click', () => selectMonsterGroup(groupId));

    const row = document.createElement('div');
    row.className = 'monster-row';
    row.classList.toggle('selected', selected);
    row.append(name, detail, button);
    monsterSelectEl.append(row);
  }

  const dungeonsLabel = document.createElement('div');
  dungeonsLabel.className = 'select-section-label';
  dungeonsLabel.textContent = 'Dungeons';
  monsterSelectEl.append(dungeonsLabel);

  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    const selected = dungeonId === selectedDungeonId;

    const name = document.createElement('span');
    name.className = 'monster-name';
    name.textContent = dungeon.label;

    const detail = document.createElement('span');
    detail.className = 'monster-detail';
    detail.textContent = describeDungeon(dungeonId);

    const button = document.createElement('button');
    button.className = 'monster-select-button';
    button.textContent = selected ? 'Selected' : 'Select';
    button.disabled = fightActive || selected;
    button.addEventListener('click', () => selectDungeon(dungeonId));

    const row = document.createElement('div');
    row.className = 'monster-row';
    row.classList.toggle('selected', selected);
    row.append(name, detail, button);
    monsterSelectEl.append(row);
  }
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

// One button per unlocked skill. Automatic skills get a button too, but only
// as a cooldown indicator — they fire themselves rather than being clicked.
function renderSkillBar() {
  skillBarEl.replaceChildren();

  equippedSkillIds().forEach((skillId, index) => {
    const skill = SKILLS[skillId];

    const fill = document.createElement('span');
    fill.className = 'cooldown-fill';

    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = skill.label;

    const button = document.createElement('button');
    button.className = 'cooldown-button';
    button.dataset.skill = skillId;
    button.disabled = true;
    button.append(fill, label);

    if (!skill.auto) {
      button.addEventListener('click', () => useSkill(skillId));

      // Numbered by position in the bar, so the hint stays correct however the
      // bar is filled. Automatic skills get no number — they cannot be triggered.
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
    if (skill.auto) useSkill(skillId);
    else button.disabled = false;
  }, cooldown * 1000);

  skillTimeouts.set(skillId, [effectTimeout, cooldownTimeout]);
}

function applySkill(skillId) {
  const skill = SKILLS[skillId];
  const power = skillPower(skillId, skillLevels[skillId].power);

  if (skill.healing) {
    playerHp = Math.min(statValue('maxHp', stats.maxHp), playerHp + power);
    updateHealthBar();
    saveProgress();
    return;
  }

  const target = activeMonsters[targetIndex];
  target.hp = Math.max(0, target.hp - power);
  monsterCards[targetIndex].hpEl.textContent = target.hp;

  if (target.hp <= 0) {
    xp += MONSTERS[target.monsterId].xp;
    updateXpDisplay();
    registerKill();
    defeatMonster(targetIndex);
    saveProgress();

    if (activeMonsters.every((monster) => monster.hp <= 0)) {
      if (activeDungeonId && dungeonFightIndex < DUNGEONS[activeDungeonId].fightIds.length - 1) {
        advanceDungeonFight();
        return;
      }

      endGame(activeDungeonId ? `${DUNGEONS[activeDungeonId].label} cleared!` : 'You win!');
      return;
    }

    // Move the fight on to whichever monster is still standing, so the
    // player doesn't have to reselect a target just to keep attacking.
    targetIndex = activeMonsters.findIndex((monster) => monster.hp > 0);
    updateTargetHighlight();
  }
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

function updateRegenIndicator() {
  const pending = playerHp < statValue('maxHp', stats.maxHp);
  const secondsPerHp = statValue('healthRegen', stats.healthRegen);
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
    secondsPerHp: statValue('healthRegen', stats.healthRegen),
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
    if (SKILLS[skillId].auto) useSkill(skillId);
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

function updateXpDisplay() {
  xpTotalEl.textContent = xp;
  skillsXpTotalEl.textContent = xp;
  renderStats();
  renderSkills();
  renderSkillSlots();
}

function unlockSkill(skillId) {
  const cost = SKILLS[skillId].unlockCost;
  if (unlockedSkills.includes(skillId) || xp < cost) return;

  xp -= cost;
  unlockedSkills.push(skillId);
  // Equip straight away when it fits, so buying a skill does something visible
  // rather than needing a second click to matter.
  const slot = firstEmptySlotIndex();
  if (slot !== -1 && canEquip(skillId)) equippedSkills[slot] = skillId;

  updateXpDisplay();
  // Rebuilding mid-fight would discard buttons with cooldowns already running,
  // so a skill bought during a fight joins the bar on the next one.
  if (!fightActive) renderSkillBar();
  saveProgress();
}

function pointsUsed() {
  return equippedSkillIds().reduce((total, skillId) => total + SKILLS[skillId].pointCost, 0);
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
    && pointsUsed() + SKILLS[skillId].pointCost <= statValue('skillPoints', stats.skillPoints);
}

// Equips `skillId` into `slotIndex`, moving it there if it's already
// equipped somewhere else and bumping out whatever currently sits in that
// slot. Refuses only if the result would exceed the Skill Points budget —
// the slot count itself is never at risk, since a drop always targets one
// of the slots already on screen.
function equipInSlot(skillId, slotIndex) {
  if (!skillId || !unlockedSkills.includes(skillId)) return;
  if (equippedSkills[slotIndex] === skillId) return;

  const previousIndex = equippedSkills.indexOf(skillId);
  const otherIds = equippedSkills.filter((id, index) => id && index !== previousIndex && index !== slotIndex);
  const projectedPoints = otherIds.reduce((total, id) => total + SKILLS[id].pointCost, 0) + SKILLS[skillId].pointCost;
  if (projectedPoints > statValue('skillPoints', stats.skillPoints)) return;

  if (previousIndex !== -1) equippedSkills[previousIndex] = null;
  equippedSkills[slotIndex] = skillId;

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

function unequipSkill(skillId) {
  const index = equippedSkills.indexOf(skillId);
  if (index === -1) return;

  equippedSkills[index] = null;

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

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

    const entry = document.createElement('div');
    entry.className = 'skill-entry';

    if (unlocked) {
      // Styled like the in-combat skill button, so a skill looks the same
      // here as it does on the Fight tab. Draggable so it can be dropped
      // onto a slot to equip it, or (if already equipped) dragged back here
      // to unequip it. See skill-slots.
      const label = document.createElement('span');
      label.className = 'cooldown-label';
      label.textContent = skill.label;

      const square = document.createElement('button');
      square.type = 'button';
      square.className = 'cooldown-button skill-square';
      square.classList.toggle('equipped', equipped);
      square.draggable = true;
      square.append(label);
      square.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', skillId));

      entry.append(square);
      // Upgrade tracks only make sense once a skill is yours.
      entry.append(buildUpgradeRow(skillId));
    } else {
      const name = document.createElement('span');
      name.className = 'skill-name';
      name.textContent = skill.label;

      const detail = document.createElement('span');
      detail.className = 'skill-detail';
      detail.textContent = describeSkill(skillId, skillLevels[skillId]);

      const cost = document.createElement('span');
      cost.className = 'skill-cost';
      cost.textContent = `${skill.pointCost} ${skill.pointCost === 1 ? 'pt' : 'pts'}`;

      const action = document.createElement('button');
      action.className = 'unlock-button';
      action.textContent = `Unlock (${skill.unlockCost} XP)`;
      action.disabled = xp < skill.unlockCost;
      action.addEventListener('click', () => unlockSkill(skillId));

      const row = document.createElement('div');
      row.className = 'skill-row';
      row.append(name, detail, cost, action);
      entry.append(row);
    }

    skillListEl.append(entry);
  }
}

// A loadout bar matching the in-combat skill bar's look, one box per Skill
// Slots level. Drag an unlocked skill from the list onto a slot to equip it
// there (bumping out whatever was there); drag a filled slot onto another
// slot to move it, or back onto the list to unequip it.
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
    box.append(label);

    if (skillId) {
      box.draggable = true;
      box.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', skillId));
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

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ xp, stats, hp: playerHp, unlockedSkills, equippedSkills, skillLevels, selectedGroupId, selectedDungeonId, totalKills, completedQuestIds }));
}

function loadProgress() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const saved = JSON.parse(raw);
  xp = saved.xp;
  Object.assign(stats, saved.stats);
  if (saved.hp !== undefined) playerHp = saved.hp;
  if (saved.unlockedSkills) unlockedSkills = saved.unlockedSkills;
  if (saved.equippedSkills) equippedSkills = saved.equippedSkills;
  if (saved.skillLevels) Object.assign(skillLevels, saved.skillLevels);
  if (saved.selectedGroupId) selectedGroupId = saved.selectedGroupId;
  if (saved.selectedDungeonId) selectedDungeonId = saved.selectedDungeonId;
  if (saved.totalKills) totalKills = saved.totalKills;
  if (saved.completedQuestIds) completedQuestIds = saved.completedQuestIds;
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
  });
});

document.querySelector('[data-tab="fight-tab"]').classList.add('active');
