const STATS = {
  maxHp: {
    label: 'Max HP',
    description: 'Health you can hold',
    base: 20,
    perLevel: 5,
    baseCost: 5,
    costGrowth: 1.4,
    value(level) {
      return this.base + level * this.perLevel;
    },
    format(value) {
      return `${value} HP`;
    },
  },

  healthRegen: {
    label: 'Health Regen',
    description: 'Seconds per healed HP',
    // Seconds to regenerate 1 HP. Divides rather than subtracts, so higher
    // levels mean less time per HP without the interval ever reaching zero.
    base: 60,
    perLevel: 0.25,
    baseCost: 5,
    costGrowth: 1.5,
    value(level) {
      return this.base / (1 + level * this.perLevel);
    },
    format(value) {
      return `${Math.round(value)}s`;
    },
  },

  skillSlots: {
    label: 'Skill Slots',
    description: 'Skills you can equip',
    // How many skills can be equipped at once. Starts at 2 so a new player has
    // one empty slot, which advertises that unlocking a skill is worth doing.
    base: 2,
    perLevel: 1,
    baseCost: 20,
    costGrowth: 2,
    value(level) {
      return this.base + level * this.perLevel;
    },
    format(value) {
      return `${value}`;
    },
  },

  skillPoints: {
    label: 'Skill Points',
    description: 'Budget for equipped skills',
    // A second limit alongside slots: slots cap how many skills you equip,
    // points cap how strong that combination can be.
    base: 3,
    perLevel: 2,
    baseCost: 20,
    costGrowth: 2,
    value(level) {
      return this.base + level * this.perLevel;
    },
    format(value) {
      return `${value}`;
    },
  },
};

// Basic Attack is the ability the Fight tab has always had, now described as
// data. `unlockCost` is XP paid once; `pointCost` is Skill Points held for as
// long as the skill stays equipped.
const SKILLS = {
  basicAttack: {
    label: 'Basic Attack',
    damage: 1,
    cooldown: 2,
    unlockCost: 0,
    pointCost: 1,
    auto: false,
    powerPerLevel: 1,
    speedPerLevel: 0.2,
    upgradeBaseCost: 5,
    upgradeCostGrowth: 1.5,
  },

  strongAttack: {
    label: 'Strong Attack',
    damage: 3,
    cooldown: 5,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
    powerPerLevel: 2,
    speedPerLevel: 0.15,
    upgradeBaseCost: 8,
    upgradeCostGrowth: 1.5,
  },

  heal: {
    label: 'Heal',
    healing: 5,
    cooldown: 8,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
    powerPerLevel: 2,
    speedPerLevel: 0.15,
    upgradeBaseCost: 8,
    upgradeCostGrowth: 1.5,
  },

  autoAttack: {
    label: 'Auto Attack',
    damage: 1,
    cooldown: 6,
    unlockCost: 25,
    // Costs the most to hold: it deals damage without being clicked.
    pointCost: 3,
    auto: true,
    powerPerLevel: 1,
    speedPerLevel: 0.1,
    upgradeBaseCost: 10,
    upgradeCostGrowth: 1.6,
  },
};

// Unlocked from the start, so a new player always has something to attack with.
const STARTING_SKILLS = ['basicAttack'];

// A skill's two upgrade tracks. Power is damage, or healing for a healing
// skill; speed divides the cooldown the way Health Regen divides its interval,
// so it shrinks with diminishing returns and never reaches zero.
function skillPower(skillId, level) {
  const skill = SKILLS[skillId];
  const base = skill.healing ?? skill.damage;
  return base + level * skill.powerPerLevel;
}

function skillCooldown(skillId, level) {
  const skill = SKILLS[skillId];
  return skill.cooldown / (1 + level * skill.speedPerLevel);
}

function skillUpgradeCost(skillId, level) {
  const skill = SKILLS[skillId];
  return Math.round(skill.upgradeBaseCost * Math.pow(skill.upgradeCostGrowth, level));
}

function powerLabel(skillId) {
  return SKILLS[skillId].healing ? 'Healing' : 'Damage';
}

function describeSkill(skillId, levels = { power: 0, speed: 0 }) {
  const skill = SKILLS[skillId];
  const power = skillPower(skillId, levels.power);
  const effect = skill.healing ? `Heals ${power}` : `${power} damage`;
  const cooldown = skillCooldown(skillId, levels.speed).toFixed(1);
  return `${effect}, ${cooldown}s cooldown${skill.auto ? ', automatic' : ''}`;
}

function statValue(statId, level) {
  return STATS[statId].value(level);
}

function statCost(statId, level) {
  const stat = STATS[statId];
  return Math.round(stat.baseCost * Math.pow(stat.costGrowth, level));
}

// Loaded as a plain <script> in the browser; required by the Node test runner.
if (typeof module !== 'undefined') {
  module.exports = {
    STATS, SKILLS, STARTING_SKILLS,
    statValue, statCost,
    skillPower, skillCooldown, skillUpgradeCost, powerLabel, describeSkill,
  };
}
