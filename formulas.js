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

// Rounds an upgrade/stat's cost the same way for all of them: compounding
// baseCost by costGrowth per level, like statCost below.
function costForLevel(baseCost, costGrowth, level) {
  return Math.round(baseCost * Math.pow(costGrowth, level));
}

// Basic Attack is the ability the Fight tab has always had, now described as
// data. `unlockCost` is XP paid once; `pointCost` is Skill Points held for as
// long as the skill stays equipped.
//
// `upgrades` is an array rather than fixed fields so a skill isn't locked to
// exactly a Power and a Speed track — same reasoning as the stat/monster
// data-object pattern. Every skill happens to use the same two tracks today
// (and the two variables — perLevel, baseCost, costGrowth — happen to line
// up the same way), but nothing here assumes that stays true.
//
// `triggerAt` is a fraction (0–1) of the cooldown at which the skill's
// effect actually lands: 0 fires immediately on press, 1 (today's default
// for most skills) fires only once the cooldown finishes. The cooldown bar
// still animates for the full duration, and the button/auto-retrigger still
// waits for the full cooldown, either way — only the effect's own timing
// moves.
const SKILLS = {
  basicAttack: {
    label: 'Basic Attack',
    damage: 1,
    cooldown: 2,
    unlockCost: 0,
    pointCost: 1,
    auto: false,
    triggerAt: 1,
    upgrades: [
      {
        id: 'power',
        label: 'Damage',
        perLevel: 1,
        baseCost: 5,
        costGrowth: 1.5,
        value(skill, level) { return skill.damage + level * this.perLevel; },
        format(value) { return `${value} damage`; },
      },
      {
        id: 'speed',
        label: 'Speed',
        // Divides rather than subtracts, so higher levels mean a shorter
        // cooldown with diminishing returns, never reaching zero.
        perLevel: 0.2,
        baseCost: 5,
        costGrowth: 1.5,
        value(skill, level) { return skill.cooldown / (1 + level * this.perLevel); },
        format(value) { return `${value.toFixed(1)}s cooldown`; },
      },
    ],
  },

  strongAttack: {
    label: 'Strong Attack',
    damage: 3,
    cooldown: 5,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
    // Lands the instant it's pressed, rather than waiting out its (longer)
    // cooldown like Basic Attack — the cooldown is what limits how often you
    // can use it, not a delay on top of using it.
    triggerAt: 0,
    upgrades: [
      {
        id: 'power',
        label: 'Damage',
        perLevel: 2,
        baseCost: 8,
        costGrowth: 1.5,
        value(skill, level) { return skill.damage + level * this.perLevel; },
        format(value) { return `${value} damage`; },
      },
      {
        id: 'speed',
        label: 'Speed',
        perLevel: 0.15,
        baseCost: 8,
        costGrowth: 1.5,
        value(skill, level) { return skill.cooldown / (1 + level * this.perLevel); },
        format(value) { return `${value.toFixed(1)}s cooldown`; },
      },
    ],
  },

  heal: {
    label: 'Heal',
    healing: 5,
    cooldown: 8,
    unlockCost: 15,
    pointCost: 2,
    auto: false,
    // Lands halfway through its cooldown, ahead of whatever the next monster
    // attack might be, rather than only once the cooldown is already over.
    triggerAt: 0.5,
    upgrades: [
      {
        id: 'power',
        label: 'Healing',
        perLevel: 2,
        baseCost: 8,
        costGrowth: 1.5,
        value(skill, level) { return skill.healing + level * this.perLevel; },
        format(value) { return `Heals ${value}`; },
      },
      {
        id: 'speed',
        label: 'Speed',
        perLevel: 0.15,
        baseCost: 8,
        costGrowth: 1.5,
        value(skill, level) { return skill.cooldown / (1 + level * this.perLevel); },
        format(value) { return `${value.toFixed(1)}s cooldown`; },
      },
    ],
  },

  autoAttack: {
    label: 'Auto Attack',
    damage: 1,
    cooldown: 6,
    unlockCost: 25,
    // Costs the most to hold: it deals damage without being clicked.
    pointCost: 3,
    auto: true,
    triggerAt: 1,
    upgrades: [
      {
        id: 'power',
        label: 'Damage',
        perLevel: 1,
        baseCost: 10,
        costGrowth: 1.6,
        value(skill, level) { return skill.damage + level * this.perLevel; },
        format(value) { return `${value} damage`; },
      },
      {
        id: 'speed',
        label: 'Speed',
        perLevel: 0.1,
        baseCost: 10,
        costGrowth: 1.6,
        value(skill, level) { return skill.cooldown / (1 + level * this.perLevel); },
        format(value) { return `${value.toFixed(1)}s cooldown`; },
      },
    ],
  },
};

// Unlocked from the start, so a new player always has something to attack with.
const STARTING_SKILLS = ['basicAttack'];

function findUpgrade(skillId, upgradeId) {
  return SKILLS[skillId].upgrades.find((upgrade) => upgrade.id === upgradeId);
}

// Game logic only ever needs "how hard does this skill currently hit" and
// "how long is its cooldown right now" — regardless of how many upgrade
// tracks a skill has, those two ideas are always the 'power' and 'speed'
// upgrade ids by convention.
function skillPower(skillId, level) {
  const skill = SKILLS[skillId];
  return findUpgrade(skillId, 'power').value(skill, level);
}

function skillCooldown(skillId, level) {
  const skill = SKILLS[skillId];
  return findUpgrade(skillId, 'speed').value(skill, level);
}

function skillUpgradeCost(skillId, upgradeId, level) {
  const upgrade = findUpgrade(skillId, upgradeId);
  return costForLevel(upgrade.baseCost, upgrade.costGrowth, level);
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

// A new player sees only the Fight tab; completing a quest reveals the tab
// (or other reward) it names and moves on to the next quest in order. Same
// data-object pattern as stats/skills/monsters — adding a quest is a data
// entry, not new gating logic. `reward` is generic (`type` plus whatever
// that type needs) so a future quest can unlock something other than a tab
// without changing how quests are processed, only how rewards are applied.
const QUESTS = [
  {
    id: 'killFive',
    description: 'Kill 5 enemies',
    target: 5,
    reward: { type: 'unlockTab', tabId: 'character-tab' },
  },
  {
    id: 'killTen',
    description: 'Kill 10 enemies',
    target: 10,
    reward: { type: 'unlockTab', tabId: 'skills-tab' },
  },
];

// The first quest not yet in `completedQuestIds` — quests complete strictly
// in order, so there is always at most one active quest.
function activeQuest(completedQuestIds) {
  return QUESTS.find((quest) => !completedQuestIds.includes(quest.id)) ?? null;
}

function questComplete(quest, killCount) {
  return killCount >= quest.target;
}

function describeQuestProgress(quest, killCount) {
  return `${quest.description} (${Math.min(killCount, quest.target)}/${quest.target})`;
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
  return costForLevel(stat.baseCost, stat.costGrowth, level);
}

// Loaded as a plain <script> in the browser; required by the Node test runner.
if (typeof module !== 'undefined') {
  module.exports = {
    STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS, QUESTS,
    statValue, statCost,
    skillPower, skillCooldown, skillUpgradeCost, describeSkill,
    describeMonster, describeMonsterGroup, advanceRegen,
    activeQuest, questComplete, describeQuestProgress,
  };
}
