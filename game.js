const monsterSelectEl = document.getElementById('monster-select');
const monsterListEl = document.getElementById('monster-list');
const playerHpEl = document.getElementById('player-hp');
const playerMaxHpEl = document.getElementById('player-max-hp');
const healthBarFillEl = document.getElementById('health-bar-fill');
const regenProgressEl = document.getElementById('regen-progress');
const skillBarEl = document.getElementById('skill-bar');
const resultMessageEl = document.getElementById('result-message');
const restartButton = document.getElementById('restart-button');
const startButton = document.getElementById('start-button');
const xpTotalEl = document.getElementById('xp-total');
const skillsXpTotalEl = document.getElementById('skills-xp-total');
const slotsUsedEl = document.getElementById('slots-used');
const slotsTotalEl = document.getElementById('slots-total');
const pointsUsedEl = document.getElementById('points-used');
const pointsTotalEl = document.getElementById('points-total');
const skillListEl = document.getElementById('skill-list');
const statListEl = document.getElementById('stat-list');
const resetCharacterButton = document.getElementById('reset-character-button');

const REGEN_TICK_SECONDS = 1;

const SAVE_KEY = 'demo-game-save';

// Derived from STATS so a new stat needs defining in one place only.
const stats = Object.fromEntries(Object.keys(STATS).map((statId) => [statId, 0]));

// The player's current pick from MONSTER_GROUPS, chosen on the selection
// screen below. `activeMonsters` is only populated once a fight starts: one
// entry ({ monsterId, hp }) per monster in the group, in queue order.
//
// Every monster in the list gets its own card (see renderMonsterList), but
// only the front entry (index 0) actually fights right now — targeting and
// independent attacks are the next two milestones, so a second monster is
// visible but untouched: full HP, idle cooldown, until then.
let selectedGroupId = null;
let activeMonsters = [];
// DOM refs for the currently rendered monster cards, parallel to whichever
// list (preview or live) renderMonsterList was last given.
let monsterCards = [];
let playerHp = null;
let fightActive = false;
const skillTimeouts = new Map();
let monsterAttackInterval;
let regenProgress = 0;
let unlockedSkills = [...STARTING_SKILLS];
// Order matters: it decides the order of the fight bar and therefore the hotkeys.
let equippedSkills = [...STARTING_SKILLS];
// Per-skill upgrade tracks, replacing the old global Attack Damage/Speed stats.
let skillLevels = Object.fromEntries(Object.keys(SKILLS).map((skillId) => [skillId, { power: 0, speed: 0 }]));
let xp = 0;

// Reset a cooldown fill to full instantly, then animate it down to 0 over `durationSeconds`.
function animateCooldownFill(fillEl, durationSeconds) {
  fillEl.style.transition = 'none';
  fillEl.style.height = '100%';
  void fillEl.offsetHeight; // force reflow so the reset above isn't animated
  fillEl.style.transition = `height ${durationSeconds}s linear`;
  fillEl.style.height = '0%';
}

restartButton.addEventListener('click', startGame);
startButton.addEventListener('click', beginFight);
resetCharacterButton.addEventListener('click', resetCharacter);

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

// One row per fight option, same pattern as renderStats/renderSkills.
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
}

function selectMonsterGroup(groupId) {
  if (fightActive) return;

  selectedGroupId = groupId;
  renderMonsterSelect();
  updateMonsterPreview();
  saveProgress();
}

// One combatant card per monster in `monsters` ({ monsterId, hp }[]). Used
// both for the pre-fight preview (every monster in the chosen group, at full
// HP) and for the live fight (the real, mutating state) — same shape either
// way, so one renderer covers both.
function renderMonsterList(monsters) {
  monsterListEl.replaceChildren();

  if (monsters.length === 0) {
    const placeholder = document.createElement('h2');
    placeholder.textContent = 'No monster selected';
    monsterListEl.append(placeholder);
    monsterCards = [];
    return;
  }

  monsterCards = monsters.map(({ monsterId, hp }) => {
    const monster = MONSTERS[monsterId];

    const name = document.createElement('h2');
    name.textContent = monster.label;

    const hpEl = document.createElement('span');
    hpEl.textContent = hp;
    const hpLine = document.createElement('p');
    hpLine.append('HP: ', hpEl, ` / ${monster.maxHp}`);

    // An indicator only — not clickable. Only the front card's fill ever
    // animates right now; the rest sit idle until independent attacks land.
    const fill = document.createElement('span');
    fill.className = 'cooldown-fill';
    const label = document.createElement('span');
    label.className = 'cooldown-label';
    label.textContent = 'Attack';
    const button = document.createElement('button');
    button.className = 'cooldown-button';
    button.disabled = true;
    button.append(fill, label);

    const card = document.createElement('div');
    card.className = 'combatant';
    card.append(name, hpLine, button);
    monsterListEl.append(card);

    return { hpEl, cooldownFillEl: fill };
  });
}

// Shows what the current selection would fight, before Start commits to it.
function updateMonsterPreview() {
  const group = selectedGroupId ? MONSTER_GROUPS[selectedGroupId] : null;
  const monsters = group
    ? group.monsterIds.map((monsterId) => ({ monsterId, hp: MONSTERS[monsterId].maxHp }))
    : [];
  renderMonsterList(monsters);
  startButton.disabled = !group;
}

// The monster currently shown/fought — the front of the queue.
function frontMonster() {
  return activeMonsters.length ? MONSTERS[activeMonsters[0].monsterId] : null;
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

// One button per unlocked skill. Automatic skills get a button too, but only
// as a cooldown indicator — they fire themselves rather than being clicked.
function renderSkillBar() {
  skillBarEl.replaceChildren();

  equippedSkills.forEach((skillId, index) => {
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

// The cooldown runs first and the effect lands when it finishes, matching how
// the original attack button behaved.
function useSkill(skillId) {
  if (!fightActive || skillTimeouts.has(skillId)) return;

  const skill = SKILLS[skillId];
  const button = skillBarEl.querySelector(`[data-skill="${skillId}"]`);
  const cooldown = skillCooldown(skillId, skillLevels[skillId].speed);
  button.disabled = true;
  animateCooldownFill(button.querySelector('.cooldown-fill'), cooldown);

  skillTimeouts.set(skillId, setTimeout(() => {
    skillTimeouts.delete(skillId);
    applySkill(skillId);

    if (!fightActive) return;
    if (skill.auto) useSkill(skillId);
    else button.disabled = false;
  }, cooldown * 1000));
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

  const target = activeMonsters[0];
  target.hp = Math.max(0, target.hp - power);
  monsterCards[0].hpEl.textContent = target.hp;

  if (target.hp <= 0) {
    xp += MONSTERS[target.monsterId].xp;
    updateXpDisplay();
    saveProgress();
    endGame('You win!');
  }
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
function regenTick() {
  const maxHp = statValue('maxHp', stats.maxHp);

  if (playerHp >= maxHp) {
    regenProgress = 0;
  } else {
    regenProgress += REGEN_TICK_SECONDS;

    if (regenProgress >= statValue('healthRegen', stats.healthRegen)) {
      regenProgress = 0;
      playerHp += 1;
      updateHealthBar();
      saveProgress();
    }
  }

  updateRegenIndicator();
}

function monsterAttackTick() {
  const monster = frontMonster();
  playerHp = Math.max(0, playerHp - monster.damage);
  updateHealthBar();
  saveProgress();

  if (playerHp <= 0) {
    endGame('You lose...');
    return;
  }

  animateCooldownFill(monsterCards[0].cooldownFillEl, monster.cooldown);
}

function endGame(message) {
  fightActive = false;
  clearInterval(monsterAttackInterval);
  for (const timeout of skillTimeouts.values()) clearTimeout(timeout);
  skillTimeouts.clear();
  skillBarEl.querySelectorAll('button').forEach((button) => { button.disabled = true; });

  resultMessageEl.textContent = message;
  resultMessageEl.hidden = false;
  restartButton.hidden = false;
}

function startGame() {
  fightActive = false;
  activeMonsters = [];
  updateHealthBar();

  renderMonsterSelect();
  updateMonsterPreview();
  monsterSelectEl.hidden = false;

  resultMessageEl.hidden = true;
  restartButton.hidden = true;

  renderSkillBar();
  skillBarEl.hidden = true;
  startButton.hidden = false;
}

function beginFight() {
  if (!selectedGroupId) return;

  const group = MONSTER_GROUPS[selectedGroupId];
  activeMonsters = group.monsterIds.map((monsterId) => ({ monsterId, hp: MONSTERS[monsterId].maxHp }));
  renderMonsterList(activeMonsters);

  const monster = frontMonster();

  fightActive = true;
  startButton.hidden = true;
  monsterSelectEl.hidden = true;
  skillBarEl.hidden = false;

  for (const skillId of equippedSkills) {
    if (SKILLS[skillId].auto) useSkill(skillId);
    else skillBarEl.querySelector(`[data-skill="${skillId}"]`).disabled = false;
  }

  animateCooldownFill(monsterCards[0].cooldownFillEl, monster.cooldown);
  monsterAttackInterval = setInterval(monsterAttackTick, monster.cooldown * 1000);
}

function updateXpDisplay() {
  xpTotalEl.textContent = xp;
  skillsXpTotalEl.textContent = xp;
  renderStats();
  renderSkills();
}

function unlockSkill(skillId) {
  const cost = SKILLS[skillId].unlockCost;
  if (unlockedSkills.includes(skillId) || xp < cost) return;

  xp -= cost;
  unlockedSkills.push(skillId);
  // Equip straight away when it fits, so buying a skill does something visible
  // rather than needing a second click to matter.
  if (canEquip(skillId)) equippedSkills.push(skillId);

  updateXpDisplay();
  // Rebuilding mid-fight would discard buttons with cooldowns already running,
  // so a skill bought during a fight joins the bar on the next one.
  if (!fightActive) renderSkillBar();
  saveProgress();
}

function pointsUsed() {
  return equippedSkills.reduce((total, skillId) => total + SKILLS[skillId].pointCost, 0);
}

// Equipping is limited on two axes: slots cap how many skills you carry,
// points cap how strong that combination is.
function canEquip(skillId) {
  return equippedSkills.length < statValue('skillSlots', stats.skillSlots)
    && pointsUsed() + SKILLS[skillId].pointCost <= statValue('skillPoints', stats.skillPoints);
}

function toggleEquipped(skillId) {
  const index = equippedSkills.indexOf(skillId);

  if (index !== -1) {
    equippedSkills.splice(index, 1);
  } else {
    if (!canEquip(skillId)) return;
    equippedSkills.push(skillId);
  }

  updateXpDisplay();
  if (!fightActive) renderSkillBar();
  saveProgress();
}

function renderSkills() {
  skillListEl.replaceChildren();

  const slots = statValue('skillSlots', stats.skillSlots);
  slotsUsedEl.textContent = equippedSkills.length;
  slotsTotalEl.textContent = slots;
  pointsUsedEl.textContent = pointsUsed();
  pointsTotalEl.textContent = statValue('skillPoints', stats.skillPoints);

  for (const skillId of Object.keys(SKILLS)) {
    const skill = SKILLS[skillId];
    const unlocked = unlockedSkills.includes(skillId);
    const equipped = equippedSkills.includes(skillId);

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

    if (unlocked) {
      // Unequipping always works; equipping needs both a free slot and points.
      action.textContent = equipped ? 'Unequip' : 'Equip';
      action.disabled = !equipped && !canEquip(skillId);
      action.addEventListener('click', () => toggleEquipped(skillId));
    } else {
      action.textContent = `Unlock (${skill.unlockCost} XP)`;
      action.disabled = xp < skill.unlockCost;
      action.addEventListener('click', () => unlockSkill(skillId));
    }

    const row = document.createElement('div');
    row.className = 'skill-row';
    row.append(name, detail, cost, action);

    const entry = document.createElement('div');
    entry.className = 'skill-entry';
    entry.append(row);
    // Upgrade tracks only make sense once a skill is yours.
    if (unlocked) entry.append(buildUpgradeRow(skillId));
    skillListEl.append(entry);
  }
}

function buildUpgradeRow(skillId) {
  const row = document.createElement('div');
  row.className = 'skill-upgrades';

  for (const track of ['power', 'speed']) {
    const level = skillLevels[skillId][track];
    const cost = skillUpgradeCost(skillId, level);

    const label = document.createElement('span');
    label.className = 'track-label';
    label.textContent = `${track === 'power' ? powerLabel(skillId) : 'Speed'} Lvl ${level}`;

    const button = document.createElement('button');
    button.className = 'upgrade-button';
    button.textContent = `Upgrade (${cost} XP)`;
    button.disabled = xp < cost;
    button.addEventListener('click', () => upgradeSkillTrack(skillId, track));

    row.append(label, button);
  }

  return row;
}

function upgradeSkillTrack(skillId, track) {
  const cost = skillUpgradeCost(skillId, skillLevels[skillId][track]);
  if (xp < cost) return;

  xp -= cost;
  skillLevels[skillId][track] += 1;
  updateXpDisplay();
  saveProgress();
}

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ xp, stats, hp: playerHp, unlockedSkills, equippedSkills, skillLevels, selectedGroupId }));
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
setInterval(regenTick, REGEN_TICK_SECONDS * 1000);

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

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
