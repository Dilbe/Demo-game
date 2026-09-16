const monsterHpEl = document.getElementById('monster-hp');
const playerHpEl = document.getElementById('player-hp');
const playerMaxHpEl = document.getElementById('player-max-hp');
const attackButton = document.getElementById('attack-button');
const playerCooldownFillEl = document.getElementById('player-cooldown-fill');
const monsterCooldownFillEl = document.getElementById('monster-cooldown-fill');
const resultMessageEl = document.getElementById('result-message');
const restartButton = document.getElementById('restart-button');
const startButton = document.getElementById('start-button');
const xpTotalEl = document.getElementById('xp-total');
const upgradeButtons = document.querySelectorAll('.upgrade-button');
const resetCharacterButton = document.getElementById('reset-character-button');

const MONSTER_ATTACK_INTERVAL_SECONDS = 3;
const INITIAL_MONSTER_HP = 5;

const UPGRADE_COST_XP = 5;
const XP_PER_KILL = 1;

const SAVE_KEY = 'demo-game-save';

const stats = { maxHp: 0, attackDamage: 0, attackSpeed: 0 };

let monsterHp;
let playerHp;
let cooldownTimeout;
let monsterAttackInterval;
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
    if (xp < UPGRADE_COST_XP) return;

    xp -= UPGRADE_COST_XP;
    const stat = button.dataset.stat;
    stats[stat] += 1;
    updateStatLevelLabels();

    updateXpDisplay();
    saveProgress();
  });
});

function startCooldown() {
  attackButton.disabled = true;
  const cooldownSeconds = attackCooldownSeconds(stats.attackSpeed);
  animateCooldownFill(playerCooldownFillEl, cooldownSeconds);

  clearTimeout(cooldownTimeout);
  cooldownTimeout = setTimeout(() => {
    monsterHp = Math.max(0, monsterHp - attackDamage(stats.attackDamage));
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

function monsterAttackTick() {
  playerHp = Math.max(0, playerHp - 1);
  playerHpEl.textContent = playerHp;

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
  playerHp = playerMaxHp(stats.maxHp);
  monsterHpEl.textContent = monsterHp;
  playerHpEl.textContent = playerHp;
  playerMaxHpEl.textContent = playerHp;

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
  upgradeButtons.forEach((button) => {
    button.disabled = xp < UPGRADE_COST_XP;
  });
}

function updateStatLevelLabels() {
  upgradeButtons.forEach((button) => {
    const stat = button.dataset.stat;
    button.closest('.stat-row').querySelector('.stat-level').textContent = `Lvl ${stats[stat]}`;
  });
}

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ xp, stats }));
}

function loadProgress() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const saved = JSON.parse(raw);
  xp = saved.xp;
  Object.assign(stats, saved.stats);

  updateStatLevelLabels();
}

function resetCharacter() {
  if (!confirm('Reset all XP and stats back to 0?')) return;

  xp = 0;
  stats.maxHp = 0;
  stats.attackDamage = 0;
  stats.attackSpeed = 0;

  updateStatLevelLabels();
  updateXpDisplay();
  saveProgress();
  startGame();
}

loadProgress();
startGame();
updateXpDisplay();

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
