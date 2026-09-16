const monsterHpEl = document.getElementById('monster-hp');
const playerHpEl = document.getElementById('player-hp');
const playerMaxHpEl = document.getElementById('player-max-hp');
const healthBarFillEl = document.getElementById('health-bar-fill');
const regenProgressEl = document.getElementById('regen-progress');
const attackButton = document.getElementById('attack-button');
const playerCooldownFillEl = document.getElementById('player-cooldown-fill');
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
let cooldownTimeout;
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

attackButton.addEventListener('click', startCooldown);
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

function startCooldown() {
  attackButton.disabled = true;
  const cooldownSeconds = statValue('attackSpeed', stats.attackSpeed);
  animateCooldownFill(playerCooldownFillEl, cooldownSeconds);

  clearTimeout(cooldownTimeout);
  cooldownTimeout = setTimeout(() => {
    monsterHp = Math.max(0, monsterHp - statValue('attackDamage', stats.attackDamage));
    monsterHpEl.textContent = monsterHp;

    if (monsterHp <= 0) {
      xp += XP_PER_KILL;
      updateXpDisplay();
      saveProgress();
      endGame('You win!');
      return;
    }

    attackButton.disabled = false;
  }, cooldownSeconds * 1000);
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
  clearInterval(monsterAttackInterval);
  clearTimeout(cooldownTimeout);
  attackButton.disabled = true;
  resultMessageEl.textContent = message;
  resultMessageEl.hidden = false;
  restartButton.hidden = false;
}

function startGame() {
  monsterHp = INITIAL_MONSTER_HP;
  monsterHpEl.textContent = monsterHp;
  updateHealthBar();

  resultMessageEl.hidden = true;
  restartButton.hidden = true;

  attackButton.hidden = true;
  startButton.hidden = false;

  monsterCooldownFillEl.style.transition = 'none';
  monsterCooldownFillEl.style.height = '0%';
}

function beginFight() {
  startButton.hidden = true;
  attackButton.hidden = false;
  attackButton.disabled = false;

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
