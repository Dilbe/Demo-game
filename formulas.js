// Low-ceremony versioning: matches the `vN` milestone-scope naming DESIGN.md
// already uses (v1 stats/skills, ..., v6 quests) rather than inventing a
// separate scheme. Bump it by hand whenever the next `vN` scope ships.
const VERSION = 'v9';

// Which exact commit is live, for tracing "what code is running" without a
// separate build-number counter or git tag — the commit SHA already is that
// identifier. deploy.yml overwrites this placeholder with the short SHA
// before publishing to Pages; any copy it never touched (a local checkout,
// `node --test`, a clone) keeps the placeholder, which the About tab shows
// as "unreleased build" rather than a fake SHA.
const BUILD_SHA = '__BUILD_SHA__';

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

// A dungeon chains several fights back-to-back, fought without returning to
// the selection screen in between. `fightIds` is ordered — the sequence the
// fights happen in — and reuses MONSTER_GROUPS entries rather than defining
// its own monsters, so a dungeon is just a sequence of existing fight
// options, matching the reuse in MONSTER_GROUPS itself.
// `completionBonusXp` is a flat extra reward paid once, only if every fight
// in the chain is cleared — Retreat or a loss ends the dungeon (see
// v5's scope) without paying it, same as it forfeits any fight already in
// progress. Sized roughly proportional to each dungeon's own monster XP.
const DUNGEONS = {
  goblinGauntlet: {
    label: 'Goblin Gauntlet',
    fightIds: ['small', 'small', 'medium'],
    completionBonusXp: 5,
  },

  monsterRush: {
    label: 'Monster Rush',
    fightIds: ['small', 'medium', 'big'],
    completionBonusXp: 10,
  },
};

// A new game's starting Max XP — a lifetime-XP milestone, separate from the
// spendable XP balance (which keeps working exactly as it always has).
// Reaching it unlocks the prestige bar; prestiging raises it by 100 for the
// next cycle. See PRESTIGE_BONUS_PER_CYCLE and prestigeTarget below.
const STARTING_MAX_XP = 100;

// How much Max XP goes up by each time the player prestiges.
const PRESTIGE_BONUS_PER_CYCLE = 100;

// Once lifetime XP earned reaches maxXp, the prestige bar needs this much
// further XP — 10% of maxXp — to fill before the Prestige button appears.
function prestigeTarget(maxXp) {
  return Math.round(maxXp * 0.1);
}

// How many times the player has already prestiged, derived from maxXp
// instead of a separate stored counter — it's fully determined by how many
// PRESTIGE_BONUS_PER_CYCLE steps maxXp has climbed above its starting value.
// 0 for a fresh game, 1 right after the first prestige, and so on.
function prestigeCount(maxXp) {
  return (maxXp - STARTING_MAX_XP) / PRESTIGE_BONUS_PER_CYCLE;
}

// Rounds an upgrade/stat's cost the same way for all of them: compounding
// baseCost by costGrowth per level, like statCost below.
function costForLevel(baseCost, costGrowth, level) {
  return Math.round(baseCost * Math.pow(costGrowth, level));
}

// XP for one kill inside a multi-monster group, rewarding clearing bigger
// groups: `killIndex` is how many monsters in this same group/fight have
// already died (0 for the first kill), and each kill compounds ×1.25 on top
// of the last — 1st kill at the monster's own XP, 2nd at ×1.25, 3rd at
// ×1.25² and so on. A single-monster fight only ever has a killIndex of 0,
// so this is a no-op (×1 = its own XP) without needing a special case.
//
// Each call computes straight from baseXp and killIndex rather than chaining
// off a previously-rounded result, so rounding one kill never drags down the
// next kill's multiplier. Rounds up (rather than costForLevel's round-to-
// nearest) so the bonus always gives at least +1 once it's non-zero, instead
// of a small base XP (e.g. 1) rounding a fractional bonus away entirely.
function groupKillXp(baseXp, killIndex) {
  return Math.ceil(baseXp * Math.pow(1.25, killIndex));
}

// Basic Attack is the ability the Fight tab has always had, now described as
// data. `unlockCost` is XP paid once; `pointCost` is Skill Points held for as
// long as the skill stays equipped. Strong Attack and Heal instead carry
// `unlockObjectiveId` (see OBJECTIVES below) — completing that objective
// unlocks them directly, free of charge, so they have no `unlockCost` at all.
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
//
// `toggles` is a second, separate kind of upgrade from `upgrades`: each
// entry unlocks once for a flat XP cost, then can be switched on/off freely
// (see toggleKey/effectivePointCost) — unlike `upgrades`, which level up
// continuously and can't be turned back off. Turning one on adds its
// `pointSurcharge` to the skill's Skill Point cost while equipped. Gated as a
// whole behind the 'winDungeon' objective (see OBJECTIVES) — visible even
// before that, but not purchasable or switchable until it completes.
//
// `type: 'passive'` (see Regen/Strength below) is the one kind that skips
// all of that: no cooldown, no combat button, no `upgrades`/`toggles` track —
// instead a flat `boost` applies for as long as the skill stays equipped.
// Every other skill is `type: 'active'` and keeps the shape described above.
const SKILLS = {
  basicAttack: {
    label: 'Basic Attack',
    damage: 1,
    cooldown: 2,
    unlockCost: 0,
    pointCost: 1,
    type: 'active',
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
    toggles: [
      {
        id: 'multiAttack',
        label: 'Multi Attack',
        description: 'Hits every active monster for full damage instead of just the target',
        unlockCost: 30,
        pointSurcharge: 1,
      },
      {
        id: 'autoTrigger',
        label: 'Auto-Trigger',
        description: 'Fires automatically as soon as the cooldown is ready, with no click needed',
        unlockCost: 20,
        pointSurcharge: 1,
      },
    ],
  },

  strongAttack: {
    label: 'Strong Attack',
    damage: 3,
    cooldown: 5,
    unlockObjectiveId: 'killMedium',
    pointCost: 2,
    type: 'active',
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
    toggles: [
      {
        id: 'autoTrigger',
        label: 'Auto-Trigger',
        description: 'Fires automatically as soon as the cooldown is ready, with no click needed',
        unlockCost: 25,
        pointSurcharge: 1,
      },
    ],
  },

  heal: {
    label: 'Heal',
    healing: 5,
    cooldown: 8,
    unlockObjectiveId: 'killBig',
    pointCost: 2,
    type: 'active',
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
    toggles: [
      {
        id: 'healOverTime',
        label: 'Heal over Time',
        description: 'Spreads the same total healing evenly over 10 seconds instead of landing it all at once',
        unlockCost: 30,
        pointSurcharge: 1,
      },
    ],
  },

  // Passive skills carry no combat button and no cooldown — while equipped
  // (using a slot and Skill Points like any other skill), `boost` just
  // applies for as long as that stays true. `boost.stat` names what it
  // affects ('damage' for anything an attack skill deals, or a STATS id like
  // 'healthRegen'); `passiveMultiplier` below turns a set of equipped
  // skills into the combined multiplier for a given stat.
  regen: {
    label: 'Regen',
    type: 'passive',
    unlockCost: 20,
    pointCost: 2,
    boost: { stat: 'healthRegen', percent: 100, label: 'HP regen rate' },
    upgrades: [],
    toggles: [],
  },

  strength: {
    label: 'Strength',
    type: 'passive',
    unlockCost: 20,
    pointCost: 2,
    boost: { stat: 'damage', percent: 25, label: 'damage' },
    upgrades: [],
    toggles: [],
  },
};

// A skill can unlock either by spending XP (`unlockCost`) or by completing a
// gameplay objective (`unlockObjectiveId`, matching a key here) — see
// SKILLS.strongAttack/heal. Kept separate from QUESTS (which award tab
// unlocks and progress strictly in sequence): these objectives can complete
// in any order relative to each other and to the quest chain, since nothing
// gates one behind another. `condition` is a small data-object describing
// what event completes it (see objectiveMatches); `reward` is generic like
// QUESTS' own reward shape, so a future objective isn't limited to unlocking
// a skill.
const OBJECTIVES = {
  killMedium: {
    description: 'Kill a Medium Monster',
    condition: { type: 'killMonster', monsterId: 'medium' },
    reward: { type: 'unlockSkill', skillId: 'strongAttack' },
  },

  killBig: {
    description: 'Kill a Big Monster',
    condition: { type: 'killMonster', monsterId: 'big' },
    reward: { type: 'unlockSkill', skillId: 'heal' },
  },

  // Gates the toggle system itself (see SKILLS.*.toggles) rather than a
  // single skill — reward is applied as a global flag, not a skill unlock.
  winDungeon: {
    description: 'Win a dungeon',
    condition: { type: 'winDungeon' },
    reward: { type: 'unlockToggles' },
  },
};

// True if `event` (something that just happened in the game, e.g.
// `{ type: 'killMonster', monsterId: 'medium' }`) satisfies an objective's
// `condition`. A condition with nothing beyond `type` (like winDungeon's)
// matches any event of that type.
function objectiveMatches(condition, event) {
  if (condition.type !== event.type) return false;
  if (condition.type === 'killMonster') return condition.monsterId === event.monsterId;
  return true;
}

// The combined multiplier every equipped passive skill with a matching
// `boost.stat` contributes — 1 (no change) if none apply. Stacks
// multiplicatively rather than adding percentages, so a second future source
// of the same boost compounds instead of just summing.
function passiveMultiplier(equippedSkillIds, statId) {
  return equippedSkillIds.reduce((multiplier, skillId) => {
    const skill = SKILLS[skillId];
    if (skill.type !== 'passive' || skill.boost.stat !== statId) return multiplier;
    return multiplier * (1 + skill.boost.percent / 100);
  }, 1);
}

// Perk Points are earned only by prestiging (see prestigeCount) and, unlike
// XP/stats/skills, survive every future prestige — see game.js's MAX_XP_KEY
// storage. Each perk is bought once, permanently, with no further levels or
// on/off switch, unlike a stat's XP-funded levels or a skill's toggles.
//
// A perk's `effect` is an independent bonus layered on top of whatever the
// thing it boosts already computes to — the same architectural pattern
// SKILLS' own passive `boost` already uses (see passiveMultiplier) — never
// applied by mutating a STATS level or a skill's `upgrades` value directly,
// since that would make the next XP-funded upgrade of the same thing cost
// more, defeating the point of Perk Points being a separate currency.
const PERKS = {
  basicAttackDamage: {
    label: 'Basic Attack damage +1',
    description: "Adds flat damage on top of Basic Attack's own Power track",
    cost: 2,
    effect: { type: 'skillDamage', skillId: 'basicAttack', amount: 1 },
  },

  maxHp10: {
    label: 'Max HP +10',
    description: 'Adds 10 to your effective Max HP',
    cost: 1,
    effect: { type: 'maxHp', amount: 10 },
  },

  // A separate perk from maxHp10, not a bigger tier of it — buying both
  // stacks to +35 Max HP total.
  maxHp25: {
    label: 'Max HP +25',
    description: 'Adds 25 to your effective Max HP',
    cost: 5,
    effect: { type: 'maxHp', amount: 25 },
  },

  healingSpeed25: {
    label: 'Healing Speed +25%',
    description: 'Speeds up HP regen by 25%, stacking multiplicatively with every other source of the same boost',
    cost: 3,
    effect: { type: 'healingSpeedPercent', amount: 25 },
  },
};

// Flat Max HP bonus summed across every purchased perk — perks of this kind
// stack additively with each other (each one is a flat amount, unlike the
// percentage perks below).
function perkMaxHpBonus(purchasedPerkIds) {
  return purchasedPerkIds.reduce((total, perkId) => {
    const perk = PERKS[perkId];
    return perk.effect.type === 'maxHp' ? total + perk.effect.amount : total;
  }, 0);
}

// Same multiplicative-stacking pattern as passiveMultiplier, so a second
// future Healing Speed perk would compound with this one (and with Regen's
// own passive boost) rather than the percentages just adding.
function perkHealingSpeedMultiplier(purchasedPerkIds) {
  return purchasedPerkIds.reduce((multiplier, perkId) => {
    const perk = PERKS[perkId];
    return perk.effect.type === 'healingSpeedPercent' ? multiplier * (1 + perk.effect.amount / 100) : multiplier;
  }, 1);
}

// Flat damage bonus from every purchased perk that targets `skillId`
// specifically (see PERKS.basicAttackDamage) — added on top of the skill's
// own Power-track value, before any passive multiplier (e.g. Strength)
// applies to the total.
function perkSkillDamageBonus(purchasedPerkIds, skillId) {
  return purchasedPerkIds.reduce((total, perkId) => {
    const perk = PERKS[perkId];
    return (perk.effect.type === 'skillDamage' && perk.effect.skillId === skillId) ? total + perk.effect.amount : total;
  }, 0);
}

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

function findToggle(skillId, toggleId) {
  return SKILLS[skillId].toggles.find((toggle) => toggle.id === toggleId);
}

// The flat id a toggle is tracked and persisted under — unique across every
// skill's toggles, since two different skills can each have their own
// 'autoTrigger' toggle.
function toggleKey(skillId, toggleId) {
  return `${skillId}:${toggleId}`;
}

// A skill's Skill Point cost while equipped, including the surcharge of
// whichever of its own toggles are currently switched on. `activeToggleIds`
// is the flat list of every currently-on toggle in the game (see
// toggleKey) — filtered down here to the ones that belong to this skill.
function effectivePointCost(skillId, activeToggleIds) {
  const skill = SKILLS[skillId];
  const surcharge = skill.toggles.reduce((total, toggle) => {
    return activeToggleIds.includes(toggleKey(skillId, toggle.id)) ? total + toggle.pointSurcharge : total;
  }, 0);
  return skill.pointCost + surcharge;
}

function describeSkill(skillId, levels = { power: 0, speed: 0 }, perkDamageBonus = 0) {
  const skill = SKILLS[skillId];

  if (skill.type === 'passive') {
    return `+${skill.boost.percent}% ${skill.boost.label} while equipped`;
  }

  const power = skillPower(skillId, levels.power) + (skill.healing ? 0 : perkDamageBonus);
  const effect = skill.healing ? `Heals ${power}` : `${power} damage`;
  const cooldown = skillCooldown(skillId, levels.speed).toFixed(1);
  return `${effect}, ${cooldown}s cooldown`;
}

function describeMonster(monsterId) {
  const monster = MONSTERS[monsterId];
  return `${monster.maxHp} HP · ${monster.damage} damage every ${monster.cooldown}s · ${monster.xp} XP`;
}

// Total XP for clearing a group's monsters, including the ×1.25 compounding
// kill bonus (see groupKillXp) — order matches monsterIds, which is fine as
// long as a group stays homogeneous (see describeMonsterGroup's note): with
// every monster worth the same XP, kill order doesn't change the total.
function groupTotalXp(monsterIds) {
  return monsterIds.reduce((sum, monsterId, index) => sum + groupKillXp(MONSTERS[monsterId].xp, index), 0);
}

// Assumes a homogeneous group (every monster the same type) — true of every
// group defined so far. A mixed group would need a richer description.
function describeMonsterGroup(groupId) {
  const { monsterIds } = MONSTER_GROUPS[groupId];
  const [firstId] = monsterIds;

  if (monsterIds.length === 1) return describeMonster(firstId);

  const monster = MONSTERS[firstId];
  const totalXp = groupTotalXp(monsterIds);
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

// Chains describeMonsterGroup's summaries with the fight order, plus a
// running total XP across the whole dungeon — mirrors describeMonsterGroup's
// own total-XP line (group-kill bonus included), summed over every fight
// instead of every monster, plus the dungeon's own completionBonusXp on top
// (paid only on a full clear, which is exactly what this total assumes).
// Each fight is its own group for the kill bonus's purposes, so that part
// doesn't compound across fights, only within each one.
function describeDungeon(dungeonId) {
  const dungeon = DUNGEONS[dungeonId];
  const labels = dungeon.fightIds.map((groupId) => MONSTER_GROUPS[groupId].label);
  const monsterXp = dungeon.fightIds.reduce((sum, groupId) => sum + groupTotalXp(MONSTER_GROUPS[groupId].monsterIds), 0);
  const totalXp = monsterXp + dungeon.completionBonusXp;
  return `${labels.join(' → ')} · ${totalXp} XP total`;
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
    VERSION, BUILD_SHA, STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS, QUESTS, DUNGEONS, OBJECTIVES, PERKS,
    statValue, statCost,
    skillPower, skillCooldown, skillUpgradeCost, describeSkill, passiveMultiplier,
    findToggle, toggleKey, effectivePointCost,
    describeMonster, describeMonsterGroup, describeDungeon, advanceRegen,
    activeQuest, questComplete, describeQuestProgress,
    objectiveMatches,
    groupKillXp, groupTotalXp,
    STARTING_MAX_XP, PRESTIGE_BONUS_PER_CYCLE, prestigeTarget, prestigeCount,
    perkMaxHpBonus, perkHealingSpeedMultiplier, perkSkillDamageBonus,
  };
}
