const monsterHpEl = document.getElementById('monster-hp');
const playerHpEl = document.getElementById('player-hp');
const playerMaxHpEl = document.getElementById('player-max-hp');
const healthBarFillEl = document.getElementById('health-bar-fill');
const regenProgressEl = document.getElementById('regen-progress');
const skillBarEl = document.getElementById('skill-bar');
const monsterCooldownFillEl = document.getElementById('monster-cooldown-fill');
const resultMessageEl = document.getElementById('result-message');
const restartButton = document.getElementById('restart-button');
const startButton = document.getElementById('start-button');
const xpTotalEl = document.getElementById('xp-total');
const skillsXpTotalEl = document.getElementById('skills-xp-total');
const skillListEl = document.getElementById('skill-list');
const upgradeButtons = document.querySelectorAll('.upgrade-button');
const resetCharacterButton = document.getElementById('reset-character-button');

const MONSTER_ATTACK_INTERVAL_SECONDS = 3;
const INITIAL_MONSTER_HP = 5;

const XP_PER_KILL = 1;
const REGEN_TICK_SECONDS = 1;

const SAVE_KEY = 'demo-game-save';

const stats = { maxHp: 0, attackDamage: 0, attackSpeed: 0, healthRegen: 0 };

let monsterHp;
let playerHp = null;
let fightActive = false;
const skillTimeouts = new Map();
let monsterAttackInterval;
let regenProgress = 0;
let unlockedSkills = [...STARTING_SKILLS];
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

upgradeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const stat = button.dataset.stat;
    const cost = statCost(stat, stats[stat]);
    if (xp < cost) return;

    xp -= cost;
    stats[stat] += 1;
    updateStatLevelLabels();
    updateHealthBar();
    updateRegenIndicator();

    updateXpDisplay();
    saveProgress();
  });
});

// One button per unlocked skill. Automatic skills get a button too, but only
// as a cooldown indicator — they fire themselves rather than being clicked.
function renderSkillBar() {
  skillBarEl.replaceChildren();

  unlockedSkills.forEach((skillId, index) => {
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
  button.disabled = true;
  animateCooldownFill(button.querySelector('.cooldown-fill'), skill.cooldown);

  skillTimeouts.set(skillId, setTimeout(() => {
    skillTimeouts.delete(skillId);
    applySkill(skill);

    if (!fightActive) return;
    if (skill.auto) useSkill(skillId);
    else button.disabled = false;
  }, skill.cooldown * 1000));
}

function applySkill(skill) {
  if (skill.healing) {
    playerHp = Math.min(statValue('maxHp', stats.maxHp), playerHp + skill.healing);
    updateHealthBar();
    saveProgress();
    return;
  }

  monsterHp = Math.max(0, monsterHp - skill.damage);
  monsterHpEl.textContent = monsterHp;

  if (monsterHp <= 0) {
    xp += XP_PER_KILL;
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
  playerHp = Math.max(0, playerHp - 1);
  updateHealthBar();
  saveProgress();

  if (playerHp <= 0) {
    endGame('You lose...');
    return;
  }

  animateCooldownFill(monsterCooldownFillEl, MONSTER_ATTACK_INTERVAL_SECONDS);
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
  monsterHp = INITIAL_MONSTER_HP;
  monsterHpEl.textContent = monsterHp;
  updateHealthBar();

  resultMessageEl.hidden = true;
  restartButton.hidden = true;

  renderSkillBar();
  skillBarEl.hidden = true;
  startButton.hidden = false;

  monsterCooldownFillEl.style.transition = 'none';
  monsterCooldownFillEl.style.height = '0%';
}

function beginFight() {
  fightActive = true;
  startButton.hidden = true;
  skillBarEl.hidden = false;

  for (const skillId of unlockedSkills) {
    if (SKILLS[skillId].auto) useSkill(skillId);
    else skillBarEl.querySelector(`[data-skill="${skillId}"]`).disabled = false;
  }

  animateCooldownFill(monsterCooldownFillEl, MONSTER_ATTACK_INTERVAL_SECONDS);
  monsterAttackInterval = setInterval(monsterAttackTick, MONSTER_ATTACK_INTERVAL_SECONDS * 1000);
}

function updateXpDisplay() {
  xpTotalEl.textContent = xp;
  skillsXpTotalEl.textContent = xp;
  renderSkills();

  upgradeButtons.forEach((button) => {
    const stat = button.dataset.stat;
    const cost = statCost(stat, stats[stat]);
    button.textContent = `Upgrade (${cost} XP)`;
    button.disabled = xp < cost;
  });
}

function unlockSkill(skillId) {
  const cost = SKILLS[skillId].unlockCost;
  if (unlockedSkills.includes(skillId) || xp < cost) return;

  xp -= cost;
  unlockedSkills.push(skillId);
  updateXpDisplay();
  // Rebuilding mid-fight would discard buttons with cooldowns already running,
  // so a skill bought during a fight joins the bar on the next one.
  if (!fightActive) renderSkillBar();
  saveProgress();
}

function renderSkills() {
  skillListEl.replaceChildren();

  for (const skillId of Object.keys(SKILLS)) {
    const skill = SKILLS[skillId];
    const unlocked = unlockedSkills.includes(skillId);

    const name = document.createElement('span');
    name.className = 'skill-name';
    name.textContent = skill.label;

    const detail = document.createElement('span');
    detail.className = 'skill-detail';
    detail.textContent = describeSkill(skillId);

    const action = document.createElement('button');
    action.className = 'unlock-button';
    action.textContent = unlocked ? 'Unlocked' : `Unlock (${skill.unlockCost} XP)`;
    action.disabled = unlocked || xp < skill.unlockCost;
    if (!unlocked) action.addEventListener('click', () => unlockSkill(skillId));

    const row = document.createElement('div');
    row.className = 'skill-row';
    row.append(name, detail, action);
    skillListEl.append(row);
  }
}

function updateStatLevelLabels() {
  upgradeButtons.forEach((button) => {
    const stat = button.dataset.stat;
    button.closest('.stat-row').querySelector('.stat-level').textContent = `Lvl ${stats[stat]}`;
  });
}

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ xp, stats, hp: playerHp, unlockedSkills }));
}

function loadProgress() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const saved = JSON.parse(raw);
  xp = saved.xp;
  Object.assign(stats, saved.stats);
  if (saved.hp !== undefined) playerHp = saved.hp;
  if (saved.unlockedSkills) unlockedSkills = saved.unlockedSkills;

  updateStatLevelLabels();
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
