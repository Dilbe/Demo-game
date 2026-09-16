const ATTACK_COOLDOWN_SECONDS = 2;
const INITIAL_PLAYER_HP = 10;
const BASE_ATTACK_DAMAGE = 1;
const MAX_HP_PER_LEVEL = 2;
const ATTACK_DAMAGE_PER_LEVEL = 1;
const ATTACK_SPEED_PER_LEVEL = 0.2;

function playerMaxHp(maxHpLevel) {
  return INITIAL_PLAYER_HP + maxHpLevel * MAX_HP_PER_LEVEL;
}

function attackDamage(attackDamageLevel) {
  return BASE_ATTACK_DAMAGE + attackDamageLevel * ATTACK_DAMAGE_PER_LEVEL;
}

function attackCooldownSeconds(attackSpeedLevel) {
  return ATTACK_COOLDOWN_SECONDS / (1 + attackSpeedLevel * ATTACK_SPEED_PER_LEVEL);
}

// Loaded as a plain <script> in the browser; required by the Node test runner.
if (typeof module !== 'undefined') {
  module.exports = { playerMaxHp, attackDamage, attackCooldownSeconds };
}
