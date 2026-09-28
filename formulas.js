// Low-ceremony versioning: matches the `vN` milestone-scope naming DESIGN.md
// already uses (v1 stats/skills, ..., v6 quests) rather than inventing a
// separate scheme. Bump it by hand whenever the next `vN` scope ships.
const VERSION = 'v12';

// Which exact commit is live, for tracing "what code is running" without a
// separate build-number counter or git tag — the commit SHA already is that
// identifier. deploy.yml overwrites this placeholder with the short SHA
// before publishing to Pages; any copy it never touched (a local checkout,
// `node --test`, a clone) keeps the placeholder, which the About tab shows
// as "unreleased build" rather than a fake SHA.
const BUILD_SHA = '__BUILD_SHA__';

// A stat is a number of points (#78): a base value that grows with levels
// bought with Upgrade Points (`value`), plus bonuses from equipped passive
// skills and purchased perks (see statBonuses). `effect` turns the total
// points into what the game actually uses — Max HP, seconds per healed HP,
// and so on — and `format` describes that effect for the Character tab.
const STATS = {
  constitution: {
    label: 'Constitution',
    description: '+5 Max HP per point',
    // 4 points is the 20 HP a new game has always started with.
    base: 4,
    perLevel: 1,
    baseCost: 5,
    costGrowth: 1.4,
    value(level) {
      return this.base + level * this.perLevel;
    },
    effect(points) {
      return points * 5;
    },
    format(effect) {
      return `${effect} Max HP`;
    },
  },

  fortitude: {
    label: 'Fortitude',
    description: 'Faster HP regen',
    // Seconds to regenerate 1 HP: 60 at 0 points, 10% less per point. A
    // multiplier rather than a subtraction, so it never reaches zero.
    base: 0,
    perLevel: 1,
    baseCost: 5,
    costGrowth: 1.5,
    value(level) {
      return this.base + level * this.perLevel;
    },
    effect(points) {
      return 60 * Math.pow(0.9, points);
    },
    format(effect) {
      return `${Math.round(effect)}s per HP`;
    },
  },

  wisdom: {
    label: 'Wisdom',
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
    effect(points) {
      return points;
    },
    format(effect) {
      return `${effect} skill slots`;
    },
  },

  intelligence: {
    label: 'Intelligence',
    description: 'Skill Points for equipped skills',
    // A second limit alongside Wisdom: slots cap how many skills you equip,
    // Skill Points cap how strong that combination can be.
    base: 3,
    perLevel: 2,
    baseCost: 20,
    costGrowth: 2,
    value(level) {
      return this.base + level * this.perLevel;
    },
    effect(points) {
      return points;
    },
    format(effect) {
      return `${effect} Skill Points`;
    },
  },
};

// A monster is data for the same reason stats and skills are: adding one should
// be a data entry rather than new fight logic. Small is the monster the game has
// always had — 5 HP, 1 damage every 3 seconds — now described as data.
// Every monster's XP was doubled in #77, alongside fights paying less XP
// each time they're won (see diminishedXp).
// `xp` is part of the template because otherwise a tougher monster would be
// strictly worse to pick: more HP to chew through for the same reward.
//
// `sprite` is a small inline SVG string, not an image file — simple geometric
// shapes rather than illustrated art, so there's no external asset pipeline
// or image-generation tool involved (see v10 in DESIGN.md). Rendered as raw
// markup (see game.js's buildSprite) into a fixed viewBox, so every monster's
// sprite lines up the same way regardless of its own shape's proportions.
const MONSTERS = {
  small: {
    label: 'Small Slime',
    maxHp: 5,
    damage: 1,
    cooldown: 3,
    xp: 2,
    // A squat blob with a lighter highlight and two dot eyes — no limbs, the
    // simplest silhouette of the three.
    sprite: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="27" rx="16" ry="11" fill="#4caf50"/><ellipse cx="20" cy="21" rx="12" ry="9" fill="#81c784"/><circle cx="15" cy="21" r="2" fill="#1b3a1b"/><circle cx="25" cy="21" r="2" fill="#1b3a1b"/></svg>',
  },

  medium: {
    label: 'Goblin',
    maxHp: 15,
    damage: 2,
    cooldown: 3,
    xp: 8,
    // A round head with pointed ears over a small body — reads as a
    // humanoid, distinct from the slime's limbless blob.
    sprite: '<svg viewBox="0 0 40 40"><polygon points="10,13 3,5 13,11" fill="#7a9d54"/><polygon points="30,13 37,5 27,11" fill="#7a9d54"/><rect x="12" y="25" width="16" height="12" rx="4" fill="#5c7a3d"/><circle cx="20" cy="16" r="9" fill="#7a9d54"/><circle cx="16" cy="15" r="1.6" fill="#1b1b1b"/><circle cx="24" cy="15" r="1.6" fill="#1b1b1b"/></svg>',
  },

  big: {
    label: 'Orc',
    maxHp: 40,
    damage: 4,
    cooldown: 4,
    xp: 24,
    // Bigger head and broader body than the Goblin, plus two tusks, so it
    // reads as the toughest of the three at a glance.
    sprite: '<svg viewBox="0 0 40 40"><rect x="7" y="21" width="26" height="16" rx="5" fill="#6b7d4a"/><circle cx="20" cy="14" r="11" fill="#7d8f57"/><circle cx="15" cy="13" r="1.8" fill="#1b1b1b"/><circle cx="25" cy="13" r="1.8" fill="#1b1b1b"/><polygon points="15,19 17,24 19,19" fill="#f1f1f1"/><polygon points="25,19 23,24 21,19" fill="#f1f1f1"/></svg>',
  },
};

// A fight option groups one or more monsters to fight together. Reuses the
// MONSTERS templates — a group is just an ordered list of monster ids — so
// adding one is still a data entry, matching the monster/stat/skill pattern.
// The three single-monster groups mirror MONSTERS one-to-one; twoSmall is
// the first multi-monster option.
// `dungeonOnly` groups exist only as fights inside a dungeon (#79): they're
// left out of the picker and FIGHT_UNLOCK_ORDER, so they can't be picked
// on their own.
const MONSTER_GROUPS = {
  small: { label: 'Small Slime', monsterIds: ['small'] },
  medium: { label: 'Goblin', monsterIds: ['medium'] },
  twoSmall: { label: 'Two Small Slimes', monsterIds: ['small', 'small'] },
  big: { label: 'Orc', monsterIds: ['big'] },
  smallAndMedium: { label: 'Small Slime + Goblin', monsterIds: ['small', 'medium'], dungeonOnly: true },
  smallAndBig: { label: 'Small Slime + Orc', monsterIds: ['small', 'big'], dungeonOnly: true },
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

  // #79: every fight pairs a Small Slime with a companion.
  slimeCompanions: {
    label: 'Slime Companions',
    fightIds: ['twoSmall', 'smallAndMedium', 'smallAndBig'],
    completionBonusXp: 12,
  },
};

// The order fights unlock in (#59) — MONSTER_GROUPS and DUNGEONS ids mixed
// in one list, since no id is used by both. A new game can pick only the
// first; winning a fight unlocks the one after it. Every group and dungeon
// must appear here, or it can never be picked — except `dungeonOnly` groups,
// which are never picked on their own.
const FIGHT_UNLOCK_ORDER = ['small', 'medium', 'twoSmall', 'big', 'goblinGauntlet', 'monsterRush', 'slimeCompanions'];

// Whether `fightId` can be picked, given how many FIGHT_UNLOCK_ORDER entries
// are unlocked so far (always at least the first).
function fightUnlocked(unlockedFightCount, fightId) {
  const index = FIGHT_UNLOCK_ORDER.indexOf(fightId);
  return index !== -1 && index < unlockedFightCount;
}

// How many fights are unlocked after winning `fightId`: always the one right
// after it, never fewer than before — replaying an earlier fight changes
// nothing, and the count stops at the end of the list.
function fightsUnlockedAfterWin(unlockedFightCount, fightId) {
  const index = FIGHT_UNLOCK_ORDER.indexOf(fightId);
  return Math.min(FIGHT_UNLOCK_ORDER.length, Math.max(unlockedFightCount, index + 2));
}

// The hint a locked fight shows instead of being selectable.
function describeFightUnlock(fightId) {
  const previousId = FIGHT_UNLOCK_ORDER[FIGHT_UNLOCK_ORDER.indexOf(fightId) - 1];
  const previous = MONSTER_GROUPS[previousId] ?? DUNGEONS[previousId];
  return `Locked — win ${previous.label} to unlock`;
}

// A new game's starting Max XP — the most XP a single cycle can earn.
// Once lifetime XP reaches it, further XP no longer adds to the spendable
// balance (see spendableXpGain) and only fills the prestige bar instead.
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

// How much of an XP award still reaches the spendable balance, given the
// lifetime XP earned before it: only the part that fits under maxXp. An
// award that crosses the threshold is split — the rest is simply not
// spendable (it still counts toward the prestige bar, see game.js awardXp).
function spendableXpGain(lifetimeXp, maxXp, amount) {
  return Math.max(0, Math.min(amount, maxXp - lifetimeXp));
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
// Each time the same XP source pays out, it pays 10% (of its full XP) less
// than the last (#77): the 1st payout is 100%, the 2nd 90%, ... the 10th
// 10%, and from the 11th on nothing. `claimCount` is how many times this
// source already paid. Since #86 every payout tracks its own count — each
// monster slot in a fight, each group's clear bonus, each dungeon's
// completion bonus (see fightXpSources) — so retreating after one kill
// doesn't lower the XP of the monsters that weren't killed.
// XP keeps at most one decimal: `amount` is always a whole number, so
// amount × (10 - claimCount) / 10 never needs rounding beyond that.
function diminishedXp(amount, claimCount) {
  return (amount * Math.max(0, 10 - claimCount)) / 10;
}

// Rounds away floating-point noise from adding one-decimal XP amounts
// together (0.1 + 0.2 and so on), so balances stay at one decimal.
function roundXp(amount) {
  return Math.round(amount * 10) / 10;
}

function costForLevel(baseCost, costGrowth, level) {
  return Math.round(baseCost * Math.pow(costGrowth, level));
}

// The compounding ×1.25 group-kill multiplier from v7: with `killIndex`
// monsters already dead in the group, ×1.25^killIndex on baseXp. Since #86
// no kill is paid this way directly any more — groupClearBonusXp uses it to
// size a group's clear bonus as if the kills had happened in the best order.
//
// Each call computes straight from baseXp and killIndex rather than chaining
// off a previously-rounded result, so rounding one kill never drags down the
// next kill's multiplier. Rounds up (rather than costForLevel's round-to-
// nearest) so the bonus always gives at least +1 once it's non-zero, instead
// of a small base XP (e.g. 1) rounding a fractional bonus away entirely.
function groupKillXp(baseXp, killIndex) {
  return Math.ceil(baseXp * Math.pow(1.25, killIndex));
}

// The extra XP a multi-monster group pays once every monster in it is dead
// (#86) — nothing while any are still standing, so retreating mid-fight
// never pays it. Sized as the v7 per-kill ×1.25 bonus would have paid had
// the monsters died from lowest to highest XP (the highest-XP one last),
// so it doesn't depend on kill order. 0 for a single-monster group.
function groupClearBonusXp(monsterIds) {
  const xps = monsterIds.map((monsterId) => MONSTERS[monsterId].xp).sort((a, b) => a - b);
  return xps.reduce((sum, xp, index) => sum + groupKillXp(xp, index) - xp, 0);
}

// Total XP for clearing a group at full value: every monster's own XP plus
// the group's clear bonus.
function groupTotalXp(monsterIds) {
  const monsterXp = monsterIds.reduce((sum, monsterId) => sum + MONSTERS[monsterId].xp, 0);
  return monsterXp + groupClearBonusXp(monsterIds);
}

// Keys into the saved per-source claim counts (#86, see diminishedXp).
// `fightKey` names one group being fought: a MONSTER_GROUPS id on its own,
// or a fight within a dungeon (dungeonFightKey) — so a group fought inside
// a dungeon has its own counts, separate from fighting it alone.
function dungeonFightKey(dungeonId, fightIndex) {
  return `${dungeonId}/${fightIndex}`;
}

function monsterXpKey(fightKey, monsterIndex) {
  return `${fightKey}/${monsterIndex}`;
}

function groupBonusXpKey(fightKey) {
  return `${fightKey}/bonus`;
}

function dungeonClearXpKey(dungeonId) {
  return `${dungeonId}/clear`;
}

function groupXpSources(groupId, fightKey) {
  const { monsterIds } = MONSTER_GROUPS[groupId];
  const sources = monsterIds.map((monsterId, index) => ({ key: monsterXpKey(fightKey, index), xp: MONSTERS[monsterId].xp }));
  const bonus = groupClearBonusXp(monsterIds);
  if (bonus > 0) sources.push({ key: groupBonusXpKey(fightKey), xp: bonus });
  return sources;
}

// Every separately-diminished XP payout a fight option (a MONSTER_GROUPS or
// DUNGEONS id) can make, as { key, xp } at full value: one per monster
// slot, one per multi-monster group's clear bonus, and a dungeon's
// completion bonus.
function fightXpSources(fightId) {
  const dungeon = DUNGEONS[fightId];
  if (!dungeon) return groupXpSources(fightId, fightId);
  return [
    ...dungeon.fightIds.flatMap((groupId, index) => groupXpSources(groupId, dungeonFightKey(fightId, index))),
    { key: dungeonClearXpKey(fightId), xp: dungeon.completionBonusXp },
  ];
}

// What a full clear of `fightId` pays right now, given `xpClaims` (claim
// count per source key, see fightXpSources — a missing key is 0).
function fightXpLeft(fightId, xpClaims = {}) {
  return roundXp(fightXpSources(fightId).reduce((sum, { key, xp }) => sum + diminishedXp(xp, xpClaims[key] ?? 0), 0));
}

// Whether a fight still pays any XP at all — the picker fades the ones that
// don't (still selectable, just not worth it for XP).
function fightPaysXp(fightId, xpClaims = {}) {
  return fightXpLeft(fightId, xpClaims) > 0;
}

// Converts a pre-#86 save's per-fight win counts into per-source claim
// counts: a fight won N times had every one of its sources paid N times.
// Ids no longer defined are dropped.
function xpClaimsFromFightWins(fightWinCounts) {
  const xpClaims = {};
  for (const [fightId, wins] of Object.entries(fightWinCounts)) {
    if (!MONSTER_GROUPS[fightId] && !DUNGEONS[fightId]) continue;
    for (const { key } of fightXpSources(fightId)) xpClaims[key] = wins;
  }
  return xpClaims;
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
// instead a `boost` applies for as long as the skill stays equipped.
// Every other skill is `type: 'active'` and keeps the shape described above.
//
// `icon` is a small inline SVG string, same reasoning as MONSTERS' `sprite`
// — simple geometric shapes, drawn with `currentColor` so an icon matches
// whatever text color the button/square/slot it's rendered into already
// uses, rather than a fixed color of its own.
const SKILLS = {
  basicAttack: {
    label: 'Basic Attack',
    icon: '<svg viewBox="0 0 24 24"><rect x="11" y="2" width="2" height="13" fill="currentColor"/><rect x="8" y="15" width="8" height="2" fill="currentColor"/><rect x="10.5" y="17" width="3" height="5" fill="currentColor"/></svg>',
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
    icon: '<svg viewBox="0 0 24 24"><rect x="10" y="1" width="4" height="15" fill="currentColor"/><rect x="6" y="16" width="12" height="2.5" fill="currentColor"/><rect x="9.5" y="18.5" width="5" height="4.5" fill="currentColor"/></svg>',
    damage: 3,
    cooldown: 5,
    unlockObjectiveId: 'killBig',
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
    icon: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="1.5" fill="currentColor"/><rect x="3" y="9" width="18" height="6" rx="1.5" fill="currentColor"/></svg>',
    healing: 5,
    cooldown: 8,
    unlockObjectiveId: 'killMedium',
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
      {
        id: 'autoTrigger',
        label: 'Auto-Trigger',
        description: 'Fires automatically as soon as the cooldown is ready, with no click needed',
        unlockCost: 25,
        pointSurcharge: 1,
      },
    ],
  },

  // Passive skills carry no combat button and no cooldown — while equipped
  // (using a slot and Skill Points like any other skill), `boost` just
  // applies for as long as that stays true. A boost is one of two kinds:
  // `percent` on 'damage' (anything an attack skill deals — see
  // passiveMultiplier), or `points` added to a STATS id (see statBonuses).
  regen: {
    label: 'Regen',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-6.93 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><polygon points="4,4 4,10 9,7" fill="currentColor"/></svg>',
    type: 'passive',
    unlockCost: 20,
    pointCost: 2,
    boost: { stat: 'fortitude', points: 6 },
    upgrades: [],
    toggles: [],
  },

  strength: {
    label: 'Strength',
    icon: '<svg viewBox="0 0 24 24"><rect x="6" y="8" width="12" height="10" rx="4" fill="currentColor"/><rect x="9" y="16" width="6" height="6" rx="2" fill="currentColor"/></svg>',
    type: 'passive',
    unlockCost: 20,
    pointCost: 2,
    boost: { stat: 'damage', percent: 25, label: 'damage' },
    upgrades: [],
    toggles: [],
  },
};

// Everything the player unlocks by *doing* something — a tab, a skill, the
// toggle system — is an objective here, listed on the Objectives tab. A
// skill can point back at one with `unlockObjectiveId` (see
// SKILLS.strongAttack/heal). `condition` is a small data-object describing
// what completes it (see objectiveMatches); `reward` is generic (`type` plus
// whatever that type needs), so a new kind of reward is a new case in
// game.js's applyObjectiveReward, not a change to how completion works.
//
// `prerequisites` lists objective ids that must be completed before this one
// can be (see objectiveAvailable) — how objectives chain. Every objective
// below is available from the start for now.
//
// Key order is display order: the Objectives tab lists them in this order,
// and the tracker above the tabs shows the first one not yet completed.
//
// `reward` can be null for a step that only leads on to the next one.
const OBJECTIVES = {
  // A new player's first steps, one at a time (#58): each needs the one
  // before it, so the tracker walks them through a first fight.
  selectSmall: {
    description: 'Select a Small Slime to fight',
    condition: { type: 'selectFight', groupId: 'small' },
    reward: null,
    prerequisites: [],
  },

  startSmall: {
    description: 'Start a fight with a Small Slime',
    condition: { type: 'startFight', groupId: 'small' },
    reward: null,
    prerequisites: ['selectSmall'],
  },

  hitSmall: {
    description: 'Attack the Small Slime with your Basic Attack',
    condition: { type: 'hitMonster', skillId: 'basicAttack', monsterId: 'small' },
    reward: null,
    prerequisites: ['startSmall'],
  },

  killSmall: {
    description: 'Kill the Small Slime',
    condition: { type: 'killMonster', monsterId: 'small' },
    reward: { type: 'xp', amount: 1 },
    prerequisites: ['hitSmall'],
  },

  killFive: {
    description: 'Kill 5 enemies',
    condition: { type: 'killCount', target: 5 },
    reward: { type: 'unlockTab', tabId: 'character-tab' },
    prerequisites: [],
  },

  killTen: {
    description: 'Kill 10 enemies',
    condition: { type: 'killCount', target: 10 },
    reward: { type: 'unlockTab', tabId: 'skills-tab' },
    prerequisites: [],
  },

  killMedium: {
    description: 'Kill a Goblin',
    condition: { type: 'killMonster', monsterId: 'medium' },
    reward: { type: 'unlockSkill', skillId: 'heal' },
    prerequisites: [],
  },

  killBig: {
    description: 'Kill an Orc',
    condition: { type: 'killMonster', monsterId: 'big' },
    reward: { type: 'unlockSkill', skillId: 'strongAttack' },
    prerequisites: [],
  },

  // Gates the toggle system itself (see SKILLS.*.toggles) rather than a
  // single skill — reward is applied as a global flag, not a skill unlock.
  winDungeon: {
    description: 'Win a dungeon',
    condition: { type: 'winDungeon' },
    reward: { type: 'unlockToggles' },
    prerequisites: [],
  },
};

// Labels for the tabs an 'unlockTab' reward can name — used only to describe
// the reward (see describeReward); the tab buttons carry their own text.
const TAB_LABELS = {
  'character-tab': 'Character',
  'skills-tab': 'Skills',
};

// True if `event` (something that just happened in the game, e.g.
// `{ type: 'killMonster', monsterId: 'medium', totalKills: 7 }`) satisfies
// an objective's `condition`. A 'killCount' condition checks the running
// kill total every kill event carries. Any other condition matches an event
// of its type whose fields equal every other field the condition names — so
// `{ type: 'killMonster', monsterId: 'medium' }` needs a Goblin kill, and a
// type-only condition (like winDungeon's) matches any event of that type.
function objectiveMatches(condition, event) {
  if (condition.type === 'killCount') return event.type === 'killMonster' && event.totalKills >= condition.target;
  if (condition.type !== event.type) return false;
  return Object.entries(condition).every(([key, value]) => event[key] === value);
}

// Whether an objective can be completed yet: every one of its prerequisites
// is already done.
function objectiveAvailable(objective, completedObjectiveIds) {
  return objective.prerequisites.every((id) => completedObjectiveIds.includes(id));
}

// The objective's text, plus progress for one that counts toward a target
// (capped at the target, so it never reads e.g. "12/10").
function describeObjectiveProgress(objective, totalKills) {
  const { condition } = objective;
  if (condition.type !== 'killCount') return objective.description;
  return `${objective.description} (${Math.min(totalKills, condition.target)}/${condition.target})`;
}

// '' for an objective with no reward (see OBJECTIVES' null rewards).
function describeReward(reward) {
  if (!reward) return '';
  if (reward.type === 'xp') return `+${reward.amount} XP`;
  if (reward.type === 'unlockTab') return `Unlocks the ${TAB_LABELS[reward.tabId]} tab`;
  if (reward.type === 'unlockSkill') return `Unlocks ${SKILLS[reward.skillId].label}`;
  if (reward.type === 'unlockToggles') return 'Unlocks skill toggles';
  return '';
}

// The combined multiplier every equipped passive skill with a matching
// percentage `boost` contributes — 1 (no change) if none apply. Stacks
// multiplicatively rather than adding percentages, so a second future source
// of the same boost compounds instead of just summing.
function passiveMultiplier(equippedSkillIds, statId) {
  return equippedSkillIds.reduce((multiplier, skillId) => {
    const skill = SKILLS[skillId];
    if (skill.type !== 'passive' || skill.boost.stat !== statId || !skill.boost.percent) return multiplier;
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

  // The three stat perks keep their pre-#78 ids (Max HP +10/+25, Healing
  // Speed +25%) so saves that bought them still own them. Each became a
  // stat bonus giving about the same as before: 10 and 25 HP are 2 and 5
  // Constitution, and 2 Fortitude (0.9² = 0.81) is close to +25% speed.
  maxHp10: {
    label: 'Constitution +2',
    description: 'Adds 2 Constitution (+10 Max HP)',
    cost: 1,
    effect: { type: 'statBonus', stat: 'constitution', points: 2 },
  },

  // A separate perk from maxHp10, not a bigger tier of it — buying both
  // stacks to +7 Constitution total.
  maxHp25: {
    label: 'Constitution +5',
    description: 'Adds 5 Constitution (+25 Max HP)',
    cost: 5,
    effect: { type: 'statBonus', stat: 'constitution', points: 5 },
  },

  healingSpeed25: {
    label: 'Fortitude +2',
    description: 'Adds 2 Fortitude (faster HP regen)',
    cost: 3,
    effect: { type: 'statBonus', stat: 'fortitude', points: 2 },
  },

  // Three separate perks rather than tiers of one (#76): each is bought on
  // its own and they stack, up to +30 Upgrade Points per cycle.
  startingUpgradePoints1: {
    label: 'Starting Upgrade Points +10 (I)',
    description: 'Start every prestige with 10 extra Upgrade Points, including the current one',
    cost: 2,
    effect: { type: 'startingUpgradePoints', amount: 10 },
  },

  startingUpgradePoints2: {
    label: 'Starting Upgrade Points +10 (II)',
    description: 'Start every prestige with 10 more Upgrade Points, including the current one',
    cost: 5,
    effect: { type: 'startingUpgradePoints', amount: 10 },
  },

  startingUpgradePoints3: {
    label: 'Starting Upgrade Points +10 (III)',
    description: 'Start every prestige with 10 more Upgrade Points, including the current one',
    cost: 12,
    effect: { type: 'startingUpgradePoints', amount: 10 },
  },
};

// Upgrade Points a fresh game (every prestige) starts with, summed across
// every purchased perk — flat amounts, so they stack additively. game.js also pays a perk's amount out once on purchase.
function perkStartingUpgradePoints(purchasedPerkIds) {
  return purchasedPerkIds.reduce((total, perkId) => {
    const perk = PERKS[perkId];
    return perk.effect.type === 'startingUpgradePoints' ? total + perk.effect.amount : total;
  }, 0);
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
    const { boost } = skill;
    if (boost.points) return `+${boost.points} ${STATS[boost.stat].label} while equipped`;
    return `+${boost.percent}% ${boost.label} while equipped`;
  }

  const power = skillPower(skillId, levels.power) + (skill.healing ? 0 : perkDamageBonus);
  const effect = skill.healing ? `Heals ${power}` : `${power} damage`;
  const cooldown = skillCooldown(skillId, levels.speed).toFixed(1);
  return `${effect}, ${cooldown}s cooldown`;
}

// `claimCount` (how often this monster slot already paid XP) shows the XP
// after diminishing returns (see diminishedXp) — 0 for the full amount.
function describeMonster(monsterId, claimCount = 0) {
  const monster = MONSTERS[monsterId];
  return `${monster.maxHp} HP · ${monster.damage} damage every ${monster.cooldown}s · ${diminishedXp(monster.xp, claimCount)} XP`;
}

// Assumes a homogeneous group (every monster the same type) — true of every
// group defined so far. A mixed group would need a richer description.
// `xpClaims` is the per-source claim counts (see fightXpLeft); the total
// includes the group's clear bonus.
function describeMonsterGroup(groupId, xpClaims = {}) {
  const { monsterIds } = MONSTER_GROUPS[groupId];
  const [firstId] = monsterIds;

  if (monsterIds.length === 1) return describeMonster(firstId, xpClaims[monsterXpKey(groupId, 0)] ?? 0);

  const monster = MONSTERS[firstId];
  return `${monsterIds.length}× ${monster.maxHp} HP · ${monster.damage} damage every ${monster.cooldown}s · ${fightXpLeft(groupId, xpClaims)} XP total`;
}

// Chains describeMonsterGroup's summaries with the fight order, plus the
// total XP a full clear pays right now — every fight's monsters and clear
// bonuses plus the dungeon's own completionBonusXp, each after its own
// diminishing returns (see fightXpSources).
function describeDungeon(dungeonId, xpClaims = {}) {
  const dungeon = DUNGEONS[dungeonId];
  const labels = dungeon.fightIds.map((groupId) => MONSTER_GROUPS[groupId].label);
  return `${labels.join(' → ')} · ${fightXpLeft(dungeonId, xpClaims)} XP total`;
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

// A stat's base points: its starting value plus whatever levels were bought.
function statValue(statId, level) {
  return STATS[statId].value(level);
}

// Every bonus on top of a stat's base points, each with where it comes from
// so the Character tab can show how the total adds up: equipped passive
// skills with a `points` boost for it, and purchased stat perks. Neither
// touches the stat's level, so a bonus never makes the next level cost more.
function statBonuses(statId, equippedSkillIds, purchasedPerkIds) {
  const bonuses = [];
  for (const skillId of equippedSkillIds) {
    const { boost } = SKILLS[skillId];
    if (boost && boost.stat === statId && boost.points) bonuses.push({ source: SKILLS[skillId].label, points: boost.points });
  }
  for (const perkId of purchasedPerkIds) {
    const { effect } = PERKS[perkId];
    if (effect.type === 'statBonus' && effect.stat === statId) bonuses.push({ source: PERKS[perkId].label, points: effect.points });
  }
  return bonuses;
}

// Base points plus every bonus — the number the stat's `effect` works from.
function statTotal(statId, level, bonuses) {
  return bonuses.reduce((total, bonus) => total + bonus.points, statValue(statId, level));
}

function statEffect(statId, points) {
  return STATS[statId].effect(points);
}

function statCost(statId, level) {
  const stat = STATS[statId];
  return costForLevel(stat.baseCost, stat.costGrowth, level);
}

// Loaded as a plain <script> in the browser; required by the Node test runner.
if (typeof module !== 'undefined') {
  module.exports = {
    VERSION, BUILD_SHA, STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS, DUNGEONS, OBJECTIVES, PERKS,
    statValue, statCost, statBonuses, statTotal, statEffect,
    skillPower, skillCooldown, skillUpgradeCost, describeSkill, passiveMultiplier,
    findToggle, toggleKey, effectivePointCost,
    describeMonster, describeMonsterGroup, describeDungeon, advanceRegen,
    FIGHT_UNLOCK_ORDER, fightUnlocked, fightsUnlockedAfterWin, describeFightUnlock,
    objectiveMatches, objectiveAvailable, describeObjectiveProgress, describeReward,
    groupKillXp, groupClearBonusXp, groupTotalXp, diminishedXp, roundXp,
    dungeonFightKey, monsterXpKey, groupBonusXpKey, dungeonClearXpKey,
    fightXpSources, fightXpLeft, fightPaysXp, xpClaimsFromFightWins,
    STARTING_MAX_XP, PRESTIGE_BONUS_PER_CYCLE, prestigeTarget, prestigeCount, spendableXpGain,
    perkSkillDamageBonus, perkStartingUpgradePoints,
  };
}
