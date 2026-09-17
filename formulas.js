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

// A monster is data for the same reason stats and skills are: adding one should
// be a data entry rather than new fight logic. Small is the monster the game has
// always had — 5 HP, 1 damage every 3 seconds, 1 XP — now described as data.
// `xp` is part of the template because otherwise a tougher monster would be
// strictly worse to pick: more HP to chew through for the same reward.
const MONSTERS = {
  small: {
    label: 'Small Monster',
    maxHp: 5,
    damage: 1,
    cooldown: 3,
    xp: 1,
  },

  medium: {
    label: 'Medium Monster',
    maxHp: 15,
    damage: 2,
    cooldown: 3,
    xp: 4,
  },

  big: {
    label: 'Big Monster',
    maxHp: 40,
    damage: 4,
    cooldown: 4,
    xp: 12,
  },
};

// A fight option groups one or more monsters to fight together. Reuses the
// MONSTERS templates — a group is just an ordered list of monster ids — so
// adding one is still a data entry, matching the monster/stat/skill pattern.
// The three single-monster groups mirror MONSTERS one-to-one; twoSmall is
// the first multi-monster option.
const MONSTER_GROUPS = {
  small: { label: 'Small Monster', monsterIds: ['small'] },
  medium: { label: 'Medium Monster', monsterIds: ['medium'] },
  big: { label: 'Big Monster', monsterIds: ['big'] },
  twoSmall: { label: 'Two Small Monsters', monsterIds: ['small', 'small'] },
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

function describeMonster(monsterId) {
  const monster = MONSTERS[monsterId];
  return `${monster.maxHp} HP · ${monster.damage} damage every ${monster.cooldown}s · ${monster.xp} XP`;
}

// Assumes a homogeneous group (every monster the same type) — true of every
// group defined so far. A mixed group would need a richer description.
function describeMonsterGroup(groupId) {
  const { monsterIds } = MONSTER_GROUPS[groupId];
  const [firstId] = monsterIds;

  if (monsterIds.length === 1) return describeMonster(firstId);

  const monster = MONSTERS[firstId];
  const totalXp = monsterIds.reduce((sum, id) => sum + MONSTERS[id].xp, 0);
  return `${monsterIds.length}× ${monster.maxHp} HP · ${monster.damage} damage every ${monster.cooldown}s · ${totalXp} XP total`;
}

// Advances passive HP regen by however much real time has actually passed,
// rather than assuming one call equals one fixed-size tick. A browser
// throttles setInterval heavily once its tab is backgrounded — a 1-second
// timer can end up firing only once a minute — so driving regen off elapsed
// wall-clock time (instead of counting ticks) means a long gap still credits
// the HP it should, catching up in one step instead of nearly stalling.
function advanceRegen({ hp, maxHp, progress, secondsPerHp }, elapsedSeconds) {
  if (hp >= maxHp) return { hp, progress: 0 };

  let newHp = hp;
  let newProgress = progress + elapsedSeconds;

  while (newProgress >= secondsPerHp && newHp < maxHp) {
    newProgress -= secondsPerHp;
    newHp += 1;
  }

  if (newHp >= maxHp) newProgress = 0;

  return { hp: newHp, progress: newProgress };
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
    STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS,
    statValue, statCost,
    skillPower, skillCooldown, skillUpgradeCost, powerLabel, describeSkill,
    describeMonster, describeMonsterGroup, advanceRegen,
  };
}
