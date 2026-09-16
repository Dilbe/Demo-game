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

  attackDamage: {
    label: 'Attack Damage',
    // Dormant until milestone 10 turns it into a per-skill upgrade — skills
    // currently carry their own damage. Said plainly so it is not bought blind.
    description: 'Damage per hit — unused',
    base: 1,
    perLevel: 1,
    baseCost: 5,
    costGrowth: 1.5,
    value(level) {
      return this.base + level * this.perLevel;
    },
    format(value) {
      return `${value} dmg`;
    },
  },

  attackSpeed: {
    label: 'Attack Speed',
    description: 'Attack cooldown — unused',
    base: 2,
    perLevel: 0.2,
    baseCost: 5,
    costGrowth: 1.5,
    // Divides rather than subtracts, so the cooldown shrinks with diminishing
    // returns and never reaches zero — which is why it needs no floor.
    value(level) {
      return this.base / (1 + level * this.perLevel);
    },
    format(value) {
      return `${value.toFixed(1)}s`;
    },
  },

  healthRegen: {
    label: 'Health Regen',
    description: 'Seconds per healed HP',
    // Seconds to regenerate 1 HP. Divides like attackSpeed, so higher levels
    // mean less time per HP without the interval ever reaching zero.
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
  },

  strongAttack: {
    label: 'Strong Attack',
    damage: 3,
    cooldown: 5,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
  },

  heal: {
    label: 'Heal',
    healing: 5,
    cooldown: 8,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
  },

  autoAttack: {
    label: 'Auto Attack',
    damage: 1,
    cooldown: 6,
    unlockCost: 25,
    // Costs the most to hold: it deals damage without being clicked.
    pointCost: 3,
    auto: true,
  },
};

// Unlocked from the start, so a new player always has something to attack with.
const STARTING_SKILLS = ['basicAttack'];

function describeSkill(skillId) {
  const skill = SKILLS[skillId];
  const effect = skill.healing ? `Heals ${skill.healing}` : `${skill.damage} damage`;
  return `${effect}, ${skill.cooldown}s cooldown${skill.auto ? ', automatic' : ''}`;
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
  module.exports = { STATS, SKILLS, STARTING_SKILLS, statValue, statCost, describeSkill };
}
