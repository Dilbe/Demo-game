const test = require('node:test');
const assert = require('node:assert');
const {
  VERSION, BUILD_SHA, STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS, DUNGEONS, OBJECTIVES,
  statValue, statCost, statBonuses, statTotal, statEffect,
  skillPower, skillCooldown, skillUpgradeCost, describeSkill, passiveMultiplier,
  findToggle, toggleKey, effectivePointCost,
  describeMonster, describeMonsterGroup, describeDungeon, advanceRegen,
  FIGHT_UNLOCKED_BY, fightUnlocked, describeFightUnlock, wonFightIdsFromUnlockCount,
  objectiveMatches, objectiveAvailable, describeObjectiveProgress, describeReward,
  groupKillXp, groupClearBonusXp, groupTotalXp, diminishedXp, roundXp,
  dungeonFightKey, monsterXpKey, groupBonusXpKey, dungeonClearXpKey,
  fightXpSources, fightXpLeft, fightXpLoss, fightPaysXp, xpClaimsFromFightWins,
  STARTING_MAX_XP, PRESTIGE_BONUS_PER_CYCLE, prestigeTarget, prestigeCount, spendableXpGain,
  PERKS, perkSkillDamageBonus, perkStartingUpgradePoints, perkStatCostGrowth,
} = require('./formulas.js');

// --- Version ---------------------------------------------------------

test('VERSION follows the vN milestone-scope naming', () => {
  assert.match(VERSION, /^v\d+$/);
});

test('BUILD_SHA is the untouched placeholder in a checkout deploy.yml never stamped', () => {
  // deploy.yml overwrites this at publish time; a plain checkout (like the
  // one running this test) should never carry a real SHA.
  assert.strictEqual(BUILD_SHA, '__BUILD_SHA__');
});

// --- Formula maths -----------------------------------------------------
// Exercised on a temporary fixture stat, so rebalancing the real stats
// can never break these.

function withFixture(config, run) {
  STATS.__fixture = { label: 'Fixture', base: 0, perLevel: 0, baseCost: 10, costGrowth: 1, value(level) { return level; }, ...config };
  try {
    run();
  } finally {
    delete STATS.__fixture;
  }
}

test('statCost compounds baseCost by costGrowth per level', () => {
  withFixture({ baseCost: 10, costGrowth: 2 }, () => {
    assert.strictEqual(statCost('__fixture', 0), 10);
    assert.strictEqual(statCost('__fixture', 1), 20);
    assert.strictEqual(statCost('__fixture', 3), 80);
  });
});

test('a costGrowth of 1 keeps the cost flat', () => {
  withFixture({ baseCost: 7, costGrowth: 1 }, () => {
    for (const level of [0, 1, 5, 20]) {
      assert.strictEqual(statCost('__fixture', level), 7);
    }
  });
});

test('statCost rounds to a whole number of XP', () => {
  withFixture({ baseCost: 5, costGrowth: 1.4 }, () => {
    for (const level of [0, 1, 2, 3, 7]) {
      assert.strictEqual(statCost('__fixture', level) % 1, 0, `level ${level} produced a fractional cost`);
    }
  });
});

test('statValue delegates to the stat own formula', () => {
  withFixture({ value: (level) => level * 100 }, () => {
    assert.strictEqual(statValue('__fixture', 3), 300);
  });
});

// --- Invariants that must hold whatever the balance is -----------------

test('no stat ever gets cheaper as levels rise', () => {
  for (const statId of Object.keys(STATS)) {
    for (let level = 0; level < 10; level += 1) {
      assert.ok(statCost(statId, level + 1) >= statCost(statId, level), `${statId} got cheaper at level ${level + 1}`);
    }
  }
});

test('wisdom grows by whole slots and always allows at least one skill', () => {
  for (let level = 0; level < 10; level += 1) {
    const slots = statEffect('wisdom', statValue('wisdom', level));
    assert.strictEqual(slots % 1, 0, `level ${level} gave a fractional slot count`);
    assert.ok(slots >= 1, `level ${level} left no room for any skill`);
    assert.ok(statEffect('wisdom', statValue('wisdom', level + 1)) > slots, `slots did not grow at level ${level + 1}`);
  }
});

test('every stat point gives more of its effect than the last', () => {
  for (const statId of Object.keys(STATS)) {
    for (let points = 0; points < 10; points += 1) {
      const better = statId === 'fortitude'
        ? statEffect(statId, points + 1) < statEffect(statId, points)
        : statEffect(statId, points + 1) > statEffect(statId, points);
      assert.ok(better, `${statId} did not improve at ${points + 1} points`);
    }
  }
});

test('fortitude shortens the regen interval but never reaches zero', () => {
  for (const points of [0, 1, 10, 100, 1000]) {
    assert.ok(statEffect('fortitude', points) > 0, `${points} points produced a non-positive interval`);
  }
});

test('constitution starts at the 20 Max HP a new game always had', () => {
  assert.strictEqual(statEffect('constitution', statValue('constitution', 0)), 20);
});

test('every skill gets stronger and faster as its tracks level up', () => {
  for (const skillId of Object.keys(SKILLS)) {
    if (SKILLS[skillId].type === 'passive') continue; // no power/speed tracks to level

    for (let level = 0; level < 10; level += 1) {
      assert.ok(skillPower(skillId, level + 1) > skillPower(skillId, level), `${skillId} power did not grow at level ${level + 1}`);
      assert.ok(skillCooldown(skillId, level + 1) < skillCooldown(skillId, level), `${skillId} cooldown did not shorten at level ${level + 1}`);
    }
    for (const level of [0, 1, 10, 100, 1000]) {
      assert.ok(skillCooldown(skillId, level) > 0, `${skillId} at level ${level} has a non-positive cooldown`);
    }
  }
});

test('skill upgrades never get cheaper and cost whole XP', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    for (const { id: upgradeId } of skill.upgrades) {
      for (let level = 0; level < 10; level += 1) {
        const cost = skillUpgradeCost(skillId, upgradeId, level);
        assert.strictEqual(cost % 1, 0, `${skillId} ${upgradeId} level ${level} cost is fractional`);
        assert.ok(skillUpgradeCost(skillId, upgradeId, level + 1) >= cost, `${skillId} ${upgradeId} got cheaper at level ${level + 1}`);
      }
    }
  }
});

test('each upgrade\'s label and format describe what it changes', () => {
  const heal = SKILLS.heal.upgrades.find((upgrade) => upgrade.id === 'power');
  assert.strictEqual(heal.label, 'Healing');
  assert.strictEqual(heal.format(9), 'Heals 9');

  const basicAttackPower = SKILLS.basicAttack.upgrades.find((upgrade) => upgrade.id === 'power');
  assert.strictEqual(basicAttackPower.label, 'Damage');
  assert.strictEqual(basicAttackPower.format(4), '4 damage');

  const speed = SKILLS.basicAttack.upgrades.find((upgrade) => upgrade.id === 'speed');
  assert.strictEqual(speed.label, 'Speed');
  assert.strictEqual(speed.format(1.5), '1.5s cooldown');
});

test('every stat defines the full data-object shape', () => {
  for (const [statId, stat] of Object.entries(STATS)) {
    for (const field of ['label', 'description', 'base', 'perLevel', 'baseCost', 'costGrowth']) {
      assert.ok(stat[field] !== undefined, `${statId} is missing ${field}`);
    }
    assert.strictEqual(typeof stat.value, 'function', `${statId} is missing value()`);
    assert.strictEqual(typeof stat.effect, 'function', `${statId} is missing effect()`);
    assert.strictEqual(typeof stat.format, 'function', `${statId} is missing format()`);
    assert.ok(stat.format(stat.effect(stat.value(0))).length > 0, `${statId} format() produced nothing`);
  }
});

// --- Skills ------------------------------------------------------------

test('every skill defines the full data-object shape', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    for (const field of ['label', 'type', 'pointCost', 'icon']) {
      assert.ok(skill[field] !== undefined, `${skillId} is missing ${field}`);
    }
    assert.ok(skill.pointCost > 0, `${skillId} costs no Focus to equip`);
    assert.match(skill.icon, /^<svg viewBox="0 0 24 24">.*<\/svg>$/, `${skillId}'s icon is not a well-formed 24x24 SVG string`);

    // A skill unlocks either by spending XP or by completing a gameplay
    // objective (see OBJECTIVES) — never both, never neither.
    assert.notStrictEqual(
      skill.unlockCost !== undefined, skill.unlockObjectiveId !== undefined,
      `${skillId} must define exactly one of unlockCost/unlockObjectiveId`
    );
    if (skill.unlockObjectiveId !== undefined) {
      assert.ok(OBJECTIVES[skill.unlockObjectiveId], `${skillId}'s unlockObjectiveId does not match a real objective`);
    }

    if (skill.type === 'passive') {
      assert.ok(skill.boost, `${skillId} is passive but has no boost`);
      // Either a percentage (with a label to describe it) or points added
      // to a real stat.
      const { boost } = skill;
      if (boost.points !== undefined) {
        assert.ok(STATS[boost.stat], `${skillId}'s boost names an unknown stat`);
        assert.ok(boost.points > 0, `${skillId}'s boost does nothing`);
      } else {
        for (const field of ['stat', 'percent', 'label']) {
          assert.ok(boost[field] !== undefined, `${skillId}'s boost is missing ${field}`);
        }
        assert.ok(boost.percent > 0, `${skillId}'s boost does nothing`);
      }
      continue;
    }

    for (const field of ['cooldown', 'triggerAt']) {
      assert.ok(skill[field] !== undefined, `${skillId} is missing ${field}`);
    }
    assert.ok(skill.damage !== undefined || skill.healing !== undefined, `${skillId} does neither damage nor healing`);
    assert.ok(skill.cooldown > 0, `${skillId} has a non-positive cooldown`);
    assert.ok(skill.triggerAt >= 0 && skill.triggerAt <= 1, `${skillId} triggerAt is not a fraction of its cooldown`);

    assert.ok(Array.isArray(skill.upgrades) && skill.upgrades.length > 0, `${skillId} has no upgrades`);
    for (const upgrade of skill.upgrades) {
      for (const field of ['id', 'label', 'perLevel', 'baseCost', 'costGrowth']) {
        assert.ok(upgrade[field] !== undefined, `${skillId}'s ${upgrade.id ?? '?'} upgrade is missing ${field}`);
      }
      assert.strictEqual(typeof upgrade.value, 'function', `${skillId}'s ${upgrade.id} upgrade is missing value()`);
      assert.strictEqual(typeof upgrade.format, 'function', `${skillId}'s ${upgrade.id} upgrade is missing format()`);
      assert.ok(upgrade.format(upgrade.value(skill, 0)).length > 0, `${skillId}'s ${upgrade.id} format() produced nothing`);
    }

    assert.ok(Array.isArray(skill.toggles), `${skillId} has no toggles array`);
    for (const toggle of skill.toggles) {
      for (const field of ['id', 'label', 'description', 'unlockCost', 'pointSurcharge']) {
        assert.ok(toggle[field] !== undefined, `${skillId}'s ${toggle.id ?? '?'} toggle is missing ${field}`);
      }
      assert.ok(toggle.unlockCost > 0, `${skillId}'s ${toggle.id} toggle unlocks for free`);
      assert.ok(toggle.pointSurcharge > 0, `${skillId}'s ${toggle.id} toggle costs no extra Focus`);
    }
  }
});

test('Strong Attack triggers immediately, Heal triggers halfway, others at the end', () => {
  assert.strictEqual(SKILLS.strongAttack.triggerAt, 0);
  assert.strictEqual(SKILLS.heal.triggerAt, 0.5);
  assert.strictEqual(SKILLS.basicAttack.triggerAt, 1);
});

test('starting skills are real skills and cost nothing', () => {
  for (const skillId of STARTING_SKILLS) {
    assert.ok(SKILLS[skillId], `${skillId} is not a defined skill`);
    assert.strictEqual(SKILLS[skillId].unlockCost, 0, `${skillId} starts unlocked so must be free`);
  }
});

test('a new player can afford to equip every starting skill at once', () => {
  const budget = statEffect('intelligence', statValue('intelligence', 0));
  const slots = statEffect('wisdom', statValue('wisdom', 0));
  const needed = STARTING_SKILLS.reduce((total, skillId) => total + SKILLS[skillId].pointCost, 0);

  assert.ok(needed <= budget, `starting skills need ${needed} points but a new player has ${budget}`);
  assert.ok(STARTING_SKILLS.length <= slots, `starting skills need ${STARTING_SKILLS.length} slots but a new player has ${slots}`);
});

test('the cheapest skill always fits a new player budget', () => {
  const cheapest = Math.min(...Object.values(SKILLS).map((skill) => skill.pointCost));
  assert.ok(cheapest <= statEffect('intelligence', statValue('intelligence', 0)), 'no skill is affordable at intelligence level 0');
});

test('every skill that must be bought with XP costs something', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    if (STARTING_SKILLS.includes(skillId)) continue;
    if (skill.unlockObjectiveId !== undefined) continue; // objective-gated, not XP-priced
    assert.ok(skill.unlockCost > 0, `${skillId} is not a starting skill but is free`);
  }
});

test('describeSkill reports damage and healing', () => {
  assert.match(describeSkill('basicAttack'), /1 damage, 2.0s cooldown/);
  assert.match(describeSkill('heal'), /^Heals 5/);
});

test('describeSkill reflects upgrade levels', () => {
  assert.match(describeSkill('basicAttack', { power: 3, speed: 0 }), /^4 damage/);
  assert.match(describeSkill('heal', { power: 2, speed: 0 }), /^Heals 9/);

  const base = describeSkill('basicAttack', { power: 0, speed: 0 });
  const faster = describeSkill('basicAttack', { power: 0, speed: 4 });
  assert.notStrictEqual(base, faster, 'speed levels did not change the description');
});

test('describeSkill adds a perk damage bonus to a damage skill but not to healing', () => {
  assert.match(describeSkill('basicAttack', { power: 0, speed: 0 }, 1), /^2 damage/);
  assert.match(describeSkill('heal', { power: 0, speed: 0 }, 1), /^Heals 5/);
});

// --- Passive skills ------------------------------------------------------

test('describeSkill reports a passive skill\'s boost instead of damage/cooldown', () => {
  assert.strictEqual(describeSkill('regen'), '+6 Fortitude while equipped');
  assert.strictEqual(describeSkill('strength'), '+25% damage while equipped');
});

test('passiveMultiplier is 1 with no matching passive equipped', () => {
  assert.strictEqual(passiveMultiplier([], 'damage'), 1);
  assert.strictEqual(passiveMultiplier(['basicAttack'], 'damage'), 1);
  assert.strictEqual(passiveMultiplier(['regen'], 'damage'), 1);
});

test('passiveMultiplier applies an equipped passive\'s boost to its own stat', () => {
  assert.strictEqual(passiveMultiplier(['strength'], 'damage'), 1.25);
  assert.strictEqual(passiveMultiplier(['regen'], 'fortitude'), 1, 'Regen adds points, not a percentage');
  assert.strictEqual(passiveMultiplier(['strength', 'regen', 'basicAttack'], 'damage'), 1.25);
});

// --- Toggles ---------------------------------------------------------------
// Optional per-skill upgrades: unlocked once with XP, then switched on/off
// freely, adding a Focus surcharge only while on.

test('toggleKey is unique per skill even for toggles sharing an id', () => {
  // Basic Attack and Strong Attack both have an 'autoTrigger' toggle — the
  // key must still tell them apart.
  assert.notStrictEqual(toggleKey('basicAttack', 'autoTrigger'), toggleKey('strongAttack', 'autoTrigger'));
});

test('every active skill has an Auto-Trigger toggle', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    if (skill.type !== 'active') continue;
    assert.ok(findToggle(skillId, 'autoTrigger'), `${skillId} has no Auto-Trigger toggle`);
  }
});

test('findToggle looks up a skill\'s own toggle by id', () => {
  assert.strictEqual(findToggle('basicAttack', 'multiAttack').label, 'Multi Attack');
  assert.strictEqual(findToggle('heal', 'healOverTime').label, 'Heal over Time');
});

test('effectivePointCost is the base pointCost with no toggles active', () => {
  assert.strictEqual(effectivePointCost('basicAttack', []), SKILLS.basicAttack.pointCost);
});

test('effectivePointCost adds only the active toggle\'s own surcharge', () => {
  const surcharge = findToggle('basicAttack', 'multiAttack').pointSurcharge;
  assert.strictEqual(
    effectivePointCost('basicAttack', [toggleKey('basicAttack', 'multiAttack')]),
    SKILLS.basicAttack.pointCost + surcharge
  );
  // An active toggle on a different skill must not leak into this one's cost.
  assert.strictEqual(
    effectivePointCost('basicAttack', [toggleKey('heal', 'healOverTime')]),
    SKILLS.basicAttack.pointCost
  );
});

test('effectivePointCost stacks every active toggle a skill has', () => {
  const both = [toggleKey('basicAttack', 'multiAttack'), toggleKey('basicAttack', 'autoTrigger')];
  const expected = SKILLS.basicAttack.pointCost
    + findToggle('basicAttack', 'multiAttack').pointSurcharge
    + findToggle('basicAttack', 'autoTrigger').pointSurcharge;
  assert.strictEqual(effectivePointCost('basicAttack', both), expected);
});

// --- Balance snapshot --------------------------------------------------
// The one place that pins actual numbers. Expect this to fail when you
// rebalance on purpose — update it to match, deliberately.

test('BALANCE SNAPSHOT: current tuning', () => {
  assert.strictEqual(statValue('constitution', 0), 4);
  assert.strictEqual(statEffect('constitution', 5), 25);

  assert.strictEqual(skillPower('basicAttack', 0), 1);
  assert.strictEqual(skillPower('basicAttack', 3), 4);
  assert.strictEqual(skillPower('heal', 0), 5);

  assert.strictEqual(skillCooldown('basicAttack', 0), 2);
  assert.strictEqual(skillCooldown('basicAttack', 5), 1);

  assert.strictEqual(skillUpgradeCost('basicAttack', 'power', 0), 5);
  assert.strictEqual(skillUpgradeCost('basicAttack', 'power', 1), 8);

  assert.strictEqual(statValue('fortitude', 0), 0);
  assert.strictEqual(statEffect('fortitude', 0), 60);
  assert.strictEqual(statEffect('fortitude', 1), 54);
  assert.strictEqual(Math.round(statEffect('fortitude', 6)), 32);

  assert.strictEqual(statValue('wisdom', 0), 2);
  assert.strictEqual(statValue('wisdom', 2), 4);

  assert.strictEqual(statValue('intelligence', 0), 3);
  assert.strictEqual(statValue('intelligence', 2), 7);

  assert.strictEqual(statCost('constitution', 0), 5);
  assert.strictEqual(statCost('constitution', 1), 7);
});

test('every monster defines a well-formed sprite', () => {
  for (const [monsterId, monster] of Object.entries(MONSTERS)) {
    assert.match(monster.sprite, /^<svg viewBox="0 0 40 40">.*<\/svg>$/, `${monsterId}'s sprite is not a well-formed 40x40 SVG string`);
  }
});

test('Small monster matches the game\'s original fixed monster', () => {
  assert.strictEqual(MONSTERS.small.maxHp, 5);
  assert.strictEqual(MONSTERS.small.damage, 1);
  assert.strictEqual(MONSTERS.small.cooldown, 3);
  assert.strictEqual(MONSTERS.small.xp, 2); // originally 1, doubled in #77
});

test('Medium and Big monsters are tougher and worth more XP than Small', () => {
  for (const monsterId of ['medium', 'big']) {
    const monster = MONSTERS[monsterId];
    assert.ok(monster.maxHp > MONSTERS.small.maxHp);
    assert.ok(monster.damage >= MONSTERS.small.damage);
    assert.ok(monster.xp > MONSTERS.small.xp);
  }
});

test('describeMonster summarizes HP, damage, cooldown, and XP', () => {
  assert.strictEqual(describeMonster('small'), '5 HP \u00b7 1 damage every 3s \u00b7 2 XP');
});

test('describeMonster shows the XP left after diminishing returns', () => {
  assert.strictEqual(describeMonster('small', 1), '5 HP \u00b7 1 damage every 3s \u00b7 1.8 XP');
});

test('the three single-monster groups mirror MONSTERS one-to-one', () => {
  for (const monsterId of ['small', 'medium', 'big']) {
    assert.deepStrictEqual(MONSTER_GROUPS[monsterId].monsterIds, [monsterId]);
  }
});

test('describeMonster mentions a self-healing monster\'s regen (#85)', () => {
  assert.strictEqual(describeMonster('troll'), '60 HP · heals 1 HP/s · 2 damage every 2s · 10 XP');
});

test('the #85 monsters match the issue\'s stats', () => {
  const expected = {
    troll: { maxHp: 60, damage: 2, cooldown: 2, xp: 10, regen: 1 },
    ogre: { maxHp: 75, damage: 6, cooldown: 2, xp: 15 },
    giant: { maxHp: 150, damage: 15, cooldown: 4, xp: 40 },
  };
  for (const [monsterId, stats] of Object.entries(expected)) {
    for (const [field, value] of Object.entries(stats)) assert.strictEqual(MONSTERS[monsterId][field], value, `${monsterId}.${field}`);
    assert.deepStrictEqual(MONSTER_GROUPS[monsterId].monsterIds, [monsterId]);
  }
});

test('King of the Giants chains its three mixed fights in order (#85)', () => {
  const fights = DUNGEONS.kingOfTheGiants.fightIds.map((groupId) => MONSTER_GROUPS[groupId].monsterIds);
  assert.deepStrictEqual(fights, [['ogre', 'big', 'big'], ['giant', 'troll', 'troll'], ['troll', 'ogre', 'giant']]);
});

test('twoSmall groups two Small monsters together', () => {
  assert.deepStrictEqual(MONSTER_GROUPS.twoSmall.monsterIds, ['small', 'small']);
});

test('describeMonsterGroup matches describeMonster for a single-monster group', () => {
  assert.strictEqual(describeMonsterGroup('small'), describeMonster('small'));
});

test('describeMonsterGroup totals XP across a multi-monster group', () => {
  assert.strictEqual(describeMonsterGroup('twoSmall'), '2\u00d7 5 HP \u00b7 1 damage every 3s \u00b7 5 XP total'); // 2 + 2 + 1 clear bonus
});

test('describeMonsterGroup scales each part of the group total by its own claim count', () => {
  const xpClaims = { 'twoSmall/0': 3, 'twoSmall/1': 3, 'twoSmall/bonus': 3 };
  assert.strictEqual(describeMonsterGroup('twoSmall', xpClaims), '2\u00d7 5 HP \u00b7 1 damage every 3s \u00b7 3.5 XP total');
});

test('describeMonsterGroup uses the single monster\'s own slot for a single-monster group', () => {
  assert.strictEqual(describeMonsterGroup('small', { 'small/0': 1 }), describeMonster('small', 1));
});

test('groupKillXp does not change the first kill in a group', () => {
  assert.strictEqual(groupKillXp(4, 0), 4);
});

test('groupKillXp compounds \u00d71.25 per kill already in the group, rounded up', () => {
  assert.strictEqual(groupKillXp(4, 1), 5); // 4 * 1.25 = 5, exact
  assert.strictEqual(groupKillXp(4, 2), 7); // 4 * 1.5625 = 6.25, rounded up
});

test('groupKillXp rounds up so a small base XP still gets a nonzero bonus', () => {
  assert.strictEqual(groupKillXp(1, 1), 2); // 1 * 1.25 = 1.25, rounded up rather than away
});

test('groupKillXp computes each kill fresh from baseXp, not chained off the last rounded result', () => {
  // If kill 2 rounded up to 2 and kill 3 compounded \u00d71.25 on *that*, it would
  // be ceil(2 * 1.25) = 3. Compounding on the original baseXp instead gives
  // ceil(1 * 1.25^2) = 2, so one rounding-up doesn't snowball into the next.
  assert.strictEqual(groupKillXp(1, 2), 2);
});

test('groupTotalXp sums every monster\'s XP plus the clear bonus', () => {
  assert.strictEqual(groupTotalXp(['medium', 'medium']), 8 + 10); // 8, then 8 * 1.25
});

test('groupClearBonusXp is 0 for a single-monster group', () => {
  assert.strictEqual(groupClearBonusXp(['big']), 0);
});

test('groupClearBonusXp is what the \u00d71.25 kill bonus paid on top of base XP', () => {
  assert.strictEqual(groupClearBonusXp(['small', 'small']), 1); // ceil(2 * 1.25) - 2
  assert.strictEqual(groupClearBonusXp(['medium', 'medium', 'medium']), 2 + 5); // (10 - 8) + (ceil(12.5) - 8)
});

test('groupClearBonusXp assumes the highest-XP monster dies last, whatever the listed order', () => {
  // small (2) first, big (24) second: ceil(24 * 1.25) - 24 = 6. Big first
  // would only have been ceil(2 * 1.25) - 2 = 1.
  assert.strictEqual(groupClearBonusXp(['big', 'small']), 6);
  assert.strictEqual(groupClearBonusXp(['small', 'big']), 6);
});

test('groupTotalXp matches a monster\'s own XP for a single-monster group', () => {
  assert.strictEqual(groupTotalXp(['small']), MONSTERS.small.xp);
});

// --- Dungeons --------------------------------------------------------------

test('every dungeon defines the full data-object shape', () => {
  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    assert.ok(dungeon.label, `${dungeonId} is missing a label`);
    assert.ok(Array.isArray(dungeon.fightIds) && dungeon.fightIds.length > 0, `${dungeonId} has no fights`);
    assert.ok(dungeon.completionBonusXp > 0, `${dungeonId} has no completionBonusXp`);
  }
});

test('every dungeon fight reuses a real MONSTER_GROUPS entry', () => {
  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    for (const groupId of dungeon.fightIds) {
      assert.ok(MONSTER_GROUPS[groupId], `${dungeonId} references unknown group ${groupId}`);
    }
  }
});

test('every dungeon-only group is used by some dungeon', () => {
  const usedGroupIds = Object.values(DUNGEONS).flatMap((dungeon) => dungeon.fightIds);
  for (const [groupId, group] of Object.entries(MONSTER_GROUPS)) {
    if (group.dungeonOnly) assert.ok(usedGroupIds.includes(groupId), `${groupId} is dungeon-only but no dungeon uses it`);
  }
});

test('Slime Companions pairs a Small Slime with each companion in turn', () => {
  assert.deepStrictEqual(
    DUNGEONS.slimeCompanions.fightIds.map((groupId) => MONSTER_GROUPS[groupId].monsterIds),
    [['small', 'small'], ['small', 'medium'], ['small', 'big']],
  );
});

test('a dungeon chains more than one fight', () => {
  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    assert.ok(dungeon.fightIds.length > 1, `${dungeonId} has only one fight, so isn't really a chain`);
  }
});

test('describeDungeon lists every fight in order and totals their XP, completion bonus included', () => {
  assert.strictEqual(DUNGEONS.goblinGauntlet.completionBonusXp, 5);
  assert.strictEqual(
    describeDungeon('goblinGauntlet'),
    'Small Slime → Small Slime → Goblin · 17 XP total', // 2 + 2 + 8 monster XP + 5 bonus
  );
});

test('describeDungeon scales each monster and the completion bonus by its own claim count', () => {
  const allAtFive = Object.fromEntries(fightXpSources('goblinGauntlet').map(({ key }) => [key, 5]));
  assert.strictEqual(
    describeDungeon('goblinGauntlet', allAtFive),
    'Small Slime → Small Slime → Goblin · 8.5 XP total', // 17 at 50%
  );
  assert.strictEqual(
    describeDungeon('goblinGauntlet', { 'goblinGauntlet/0/0': 10 }),
    'Small Slime → Small Slime → Goblin · 15 XP total', // only the first Small Slime pays nothing
  );
});

// --- Diminishing XP (#77) --------------------------------------------------

test('diminishedXp pays in full on the first win, then 10% less per win', () => {
  assert.strictEqual(diminishedXp(2, 0), 2);
  assert.strictEqual(diminishedXp(2, 1), 1.8);
  assert.strictEqual(diminishedXp(2, 9), 0.2);
});

test('diminishedXp pays nothing from the 11th win on', () => {
  assert.strictEqual(diminishedXp(24, 10), 0);
  assert.strictEqual(diminishedXp(24, 15), 0);
});

test('diminishedXp keeps at most one decimal', () => {
  for (let wins = 0; wins <= 10; wins++) {
    const xp = diminishedXp(7, wins);
    assert.strictEqual(xp, Math.round(xp * 10) / 10);
  }
});

// --- Per-source diminishing XP (#86) ---------------------------------------

test('fightXpSources lists one source per monster slot plus the group\'s clear bonus', () => {
  assert.deepStrictEqual(fightXpSources('twoSmall'), [
    { key: 'twoSmall/0', xp: 2 },
    { key: 'twoSmall/1', xp: 2 },
    { key: 'twoSmall/bonus', xp: 1 },
  ]);
  assert.deepStrictEqual(fightXpSources('big'), [{ key: 'big/0', xp: 24 }]);
});

test('fightXpSources gives each fight in a dungeon its own keys, plus the completion bonus', () => {
  assert.deepStrictEqual(fightXpSources('goblinGauntlet'), [
    { key: 'goblinGauntlet/0/0', xp: 2 },
    { key: 'goblinGauntlet/1/0', xp: 2 },
    { key: 'goblinGauntlet/2/0', xp: 8 },
    { key: 'goblinGauntlet/clear', xp: 5 },
  ]);
});

test('the key helpers build the same keys fightXpSources uses', () => {
  const fightKey = dungeonFightKey('goblinGauntlet', 2);
  assert.strictEqual(monsterXpKey(fightKey, 0), 'goblinGauntlet/2/0');
  assert.strictEqual(groupBonusXpKey('twoSmall'), 'twoSmall/bonus');
  assert.strictEqual(dungeonClearXpKey('goblinGauntlet'), 'goblinGauntlet/clear');
});

test('fightXpSources adds up to the fight\'s full XP', () => {
  assert.strictEqual(fightXpLeft('twoSmall'), groupTotalXp(MONSTER_GROUPS.twoSmall.monsterIds));
  for (const dungeonId of Object.keys(DUNGEONS)) {
    const dungeon = DUNGEONS[dungeonId];
    const monsterXp = dungeon.fightIds.reduce((sum, groupId) => sum + groupTotalXp(MONSTER_GROUPS[groupId].monsterIds), 0);
    assert.strictEqual(fightXpLeft(dungeonId), monsterXp + dungeon.completionBonusXp);
  }
});

test('killing one monster and retreating only lowers that slot\'s XP', () => {
  // The retreat exploit from #86: the first slot paid, nothing else did.
  assert.strictEqual(fightXpLeft('twoSmall', { 'twoSmall/0': 1 }), 1.8 + 2 + 1);
});

test('fightXpLoss goes from 0 for a fresh fight to 1 once it pays nothing', () => {
  assert.strictEqual(fightXpLoss('small'), 0);
  assert.ok(Math.abs(fightXpLoss('small', { 'small/0': 1 }) - 0.1) < 1e-9); // 1 - 1.8 / 2
  assert.strictEqual(fightXpLoss('small', { 'small/0': 10 }), 1);
  assert.strictEqual(fightXpLoss('twoSmall', { 'twoSmall/0': 5, 'twoSmall/1': 5, 'twoSmall/bonus': 5 }), 0.5);
});

test('fightPaysXp stays true while any one source still pays', () => {
  assert.strictEqual(fightPaysXp('twoSmall', { 'twoSmall/0': 10, 'twoSmall/1': 10 }), true); // bonus unclaimed
  assert.strictEqual(fightPaysXp('twoSmall', { 'twoSmall/0': 10, 'twoSmall/1': 10, 'twoSmall/bonus': 10 }), false);
  assert.strictEqual(fightPaysXp('small', { 'small/0': 9 }), true);
  assert.strictEqual(fightPaysXp('small', { 'small/0': 10 }), false);
});

test('xpClaimsFromFightWins gives every source of a won fight that fight\'s win count', () => {
  assert.deepStrictEqual(xpClaimsFromFightWins({ twoSmall: 3, goblinGauntlet: 1 }), {
    'twoSmall/0': 3, 'twoSmall/1': 3, 'twoSmall/bonus': 3,
    'goblinGauntlet/0/0': 1, 'goblinGauntlet/1/0': 1, 'goblinGauntlet/2/0': 1, 'goblinGauntlet/clear': 1,
  });
});

test('xpClaimsFromFightWins drops fights that no longer exist', () => {
  assert.deepStrictEqual(xpClaimsFromFightWins({ removedFight: 4 }), {});
});

test('roundXp strips floating-point noise down to one decimal', () => {
  assert.strictEqual(roundXp(0.1 + 0.2), 0.3);
  assert.strictEqual(roundXp(5.1 - 3), 2.1);
});

// --- Fight unlocks ---------------------------------------------------------

test('FIGHT_UNLOCKED_BY lists every pickable monster group and dungeon exactly once', () => {
  const pickableGroupIds = Object.keys(MONSTER_GROUPS).filter((groupId) => !MONSTER_GROUPS[groupId].dungeonOnly);
  const allFightIds = [...pickableGroupIds, ...Object.keys(DUNGEONS)];
  assert.deepStrictEqual(Object.keys(FIGHT_UNLOCKED_BY).sort(), allFightIds.sort());
});

test('every fight is unlocked by a real fight, or from the start', () => {
  for (const [fightId, requiredId] of Object.entries(FIGHT_UNLOCKED_BY)) {
    if (requiredId === null) continue;
    assert.ok(FIGHT_UNLOCKED_BY[requiredId] !== undefined, `${fightId} is unlocked by an unknown fight ${requiredId}`);
  }
});

test('a new game can pick only the Small Slime', () => {
  for (const fightId of Object.keys(FIGHT_UNLOCKED_BY)) {
    assert.strictEqual(fightUnlocked([], fightId), fightId === 'small', fightId);
  }
});

test('winning a fight unlocks the fights that require it', () => {
  assert.strictEqual(fightUnlocked(['small'], 'medium'), true);
  assert.strictEqual(fightUnlocked(['small'], 'twoSmall'), false);
});

test('a dungeon-only group can never be picked', () => {
  assert.strictEqual(fightUnlocked(Object.keys(FIGHT_UNLOCKED_BY), 'smallAndBig'), false);
});

test('winning the Orc unlocks the Troll, Ogre and Giant together, plus Goblin Gauntlet (#85)', () => {
  const won = ['small', 'medium', 'twoSmall', 'big'];
  for (const fightId of ['troll', 'ogre', 'giant', 'goblinGauntlet']) assert.strictEqual(fightUnlocked(won, fightId), true, fightId);
});

test('the Troll, Ogre and Giant unlock nothing themselves (#85)', () => {
  for (const monsterId of ['troll', 'ogre', 'giant']) {
    assert.ok(!Object.values(FIGHT_UNLOCKED_BY).includes(monsterId), `${monsterId} unlocks something`);
  }
});

test('King of the Giants unlocks after Slime Companions (#85)', () => {
  assert.strictEqual(FIGHT_UNLOCKED_BY.kingOfTheGiants, 'slimeCompanions');
});

test('a pre-#85 unlock count converts to every fight won before the last unlocked one', () => {
  assert.deepStrictEqual(wonFightIdsFromUnlockCount(1), []);
  assert.deepStrictEqual(wonFightIdsFromUnlockCount(4), ['small', 'medium', 'twoSmall']);
  // Everything unlocked: the last dungeon itself may not have been won yet.
  assert.deepStrictEqual(wonFightIdsFromUnlockCount(7), ['small', 'medium', 'twoSmall', 'big', 'goblinGauntlet', 'monsterRush']);
});

test('describeFightUnlock names the fight to win first, group or dungeon', () => {
  assert.strictEqual(describeFightUnlock('medium'), 'Locked — win Small Slime to unlock');
  assert.strictEqual(describeFightUnlock('monsterRush'), 'Locked — win Goblin Gauntlet to unlock');
  assert.strictEqual(describeFightUnlock('slimeCompanions'), 'Locked — win Monster Rush to unlock');
  assert.strictEqual(describeFightUnlock('giant'), 'Locked — win Orc to unlock');
  assert.strictEqual(describeFightUnlock('kingOfTheGiants'), 'Locked — win Slime Companions to unlock');
});

// --- Objectives ------------------------------------------------------------

test('every objective defines the full data-object shape', () => {
  for (const [objectiveId, objective] of Object.entries(OBJECTIVES)) {
    for (const field of ['description', 'condition', 'reward', 'prerequisites']) {
      assert.ok(objective[field] !== undefined, `${objectiveId} is missing ${field}`);
    }
    assert.ok(objective.condition.type, `${objectiveId}'s condition has no type`);
    assert.ok(objective.reward === null || objective.reward.type, `${objectiveId}'s reward has no type`);
    assert.ok(Array.isArray(objective.prerequisites), `${objectiveId}'s prerequisites is not an array`);
  }
});

test('every prerequisite names an existing objective', () => {
  for (const [objectiveId, objective] of Object.entries(OBJECTIVES)) {
    for (const prerequisiteId of objective.prerequisites) {
      assert.ok(OBJECTIVES[prerequisiteId], `${objectiveId} has unknown prerequisite ${prerequisiteId}`);
    }
  }
});

test('every objective with a reward has a reward description', () => {
  for (const [objectiveId, objective] of Object.entries(OBJECTIVES)) {
    if (objective.reward) assert.ok(describeReward(objective.reward), `${objectiveId}'s reward has no description`);
  }
});

test('the first-fight objectives chain in order, each needing the one before', () => {
  assert.deepStrictEqual(OBJECTIVES.selectSmall.prerequisites, []);
  assert.deepStrictEqual(OBJECTIVES.startSmall.prerequisites, ['selectSmall']);
  assert.deepStrictEqual(OBJECTIVES.hitSmall.prerequisites, ['startSmall']);
  assert.deepStrictEqual(OBJECTIVES.killSmall.prerequisites, ['hitSmall']);
  assert.deepStrictEqual(Object.keys(OBJECTIVES).slice(0, 4), ['selectSmall', 'startSmall', 'hitSmall', 'killSmall']);
});

test('killSmall pays 1 bonus XP', () => {
  assert.deepStrictEqual(OBJECTIVES.killSmall.reward, { type: 'xp', amount: 1 });
  assert.strictEqual(describeReward(OBJECTIVES.killSmall.reward), '+1 XP');
});

test('objectiveMatches checks every field a condition names', () => {
  const condition = OBJECTIVES.hitSmall.condition;
  assert.strictEqual(objectiveMatches(condition, { type: 'hitMonster', skillId: 'basicAttack', monsterId: 'small' }), true);
  assert.strictEqual(objectiveMatches(condition, { type: 'hitMonster', skillId: 'strongAttack', monsterId: 'small' }), false);
  assert.strictEqual(objectiveMatches(condition, { type: 'hitMonster', skillId: 'basicAttack', monsterId: 'medium' }), false);
});

test('objectiveMatches checks the group for fight selection and start', () => {
  assert.strictEqual(objectiveMatches(OBJECTIVES.selectSmall.condition, { type: 'selectFight', groupId: 'small' }), true);
  assert.strictEqual(objectiveMatches(OBJECTIVES.selectSmall.condition, { type: 'selectFight', groupId: 'twoSmall' }), false);
  assert.strictEqual(objectiveMatches(OBJECTIVES.startSmall.condition, { type: 'startFight', groupId: 'small' }), true);
});

test('describeReward is empty for an objective with no reward', () => {
  assert.strictEqual(describeReward(null), '');
});

test('killThree unlocks the Character tab and killTen unlocks the Skills tab', () => {
  assert.deepStrictEqual(OBJECTIVES.killThree.reward, { type: 'unlockTab', tabId: 'character-tab' });
  assert.deepStrictEqual(OBJECTIVES.killTen.reward, { type: 'unlockTab', tabId: 'skills-tab' });
});

test('objectiveMatches completes a killCount condition once the kill total reaches its target', () => {
  const condition = OBJECTIVES.killThree.condition;
  assert.strictEqual(objectiveMatches(condition, { type: 'killMonster', monsterId: 'small', totalKills: 2 }), false);
  assert.strictEqual(objectiveMatches(condition, { type: 'killMonster', monsterId: 'small', totalKills: 3 }), true);
  assert.strictEqual(objectiveMatches(condition, { type: 'killMonster', monsterId: 'small', totalKills: 4 }), true);
  assert.strictEqual(objectiveMatches(condition, { type: 'winDungeon' }), false);
});

test('objectiveAvailable is true only once every prerequisite is completed', () => {
  const objective = { prerequisites: ['a', 'b'] };
  assert.strictEqual(objectiveAvailable(objective, []), false);
  assert.strictEqual(objectiveAvailable(objective, ['a']), false);
  assert.strictEqual(objectiveAvailable(objective, ['a', 'b']), true);
  assert.strictEqual(objectiveAvailable({ prerequisites: [] }, []), true);
});

test('describeObjectiveProgress shows capped progress for a killCount objective', () => {
  assert.strictEqual(describeObjectiveProgress(OBJECTIVES.killThree, 2), 'Kill 3 enemies (2/3)');
  assert.strictEqual(describeObjectiveProgress(OBJECTIVES.killThree, 9), 'Kill 3 enemies (3/3)');
});

test('describeObjectiveProgress is just the description for a one-off objective', () => {
  assert.strictEqual(describeObjectiveProgress(OBJECTIVES.killMedium, 3), 'Kill a Goblin');
});

test('describeReward names what each reward unlocks', () => {
  assert.strictEqual(describeReward(OBJECTIVES.killThree.reward), 'Unlocks the Character tab');
  assert.strictEqual(describeReward(OBJECTIVES.killMedium.reward), 'Unlocks Heal');
  assert.strictEqual(describeReward(OBJECTIVES.winDungeon.reward), 'Unlocks skill toggles');
});

test('killMedium and killBig unlock Heal and Strong Attack (#71)', () => {
  assert.deepStrictEqual(OBJECTIVES.killMedium.reward, { type: 'unlockSkill', skillId: 'heal' });
  assert.deepStrictEqual(OBJECTIVES.killBig.reward, { type: 'unlockSkill', skillId: 'strongAttack' });
});

test('winDungeon unlocks the toggle system rather than a specific skill', () => {
  assert.deepStrictEqual(OBJECTIVES.winDungeon.reward, { type: 'unlockToggles' });
});

test('objectiveMatches requires the event type to match the condition type', () => {
  assert.strictEqual(objectiveMatches({ type: 'killMonster', monsterId: 'medium' }, { type: 'winDungeon' }), false);
  assert.strictEqual(objectiveMatches({ type: 'winDungeon' }, { type: 'killMonster', monsterId: 'medium' }), false);
});

test('objectiveMatches checks monsterId for a killMonster condition', () => {
  const condition = OBJECTIVES.killMedium.condition;
  assert.strictEqual(objectiveMatches(condition, { type: 'killMonster', monsterId: 'medium' }), true);
  assert.strictEqual(objectiveMatches(condition, { type: 'killMonster', monsterId: 'small' }), false);
});

test('objectiveMatches matches any event of a type-only condition', () => {
  assert.strictEqual(objectiveMatches(OBJECTIVES.winDungeon.condition, { type: 'winDungeon' }), true);
});

// --- advanceRegen --------------------------------------------------------

test('advanceRegen accumulates progress without healing before the threshold', () => {
  const result = advanceRegen({ hp: 10, maxHp: 20, progress: 0, secondsPerHp: 60 }, 30);
  assert.deepStrictEqual(result, { hp: 10, progress: 30 });
});

test('advanceRegen heals exactly one HP when progress reaches the threshold', () => {
  const result = advanceRegen({ hp: 10, maxHp: 20, progress: 50, secondsPerHp: 60 }, 10);
  assert.deepStrictEqual(result, { hp: 11, progress: 0 });
});

test('advanceRegen catches up multiple HP from a single large gap (a throttled/backgrounded tab)', () => {
  const result = advanceRegen({ hp: 10, maxHp: 20, progress: 0, secondsPerHp: 60 }, 185);
  // 185s / 60s-per-HP = 3 HP healed, 5s progress left over.
  assert.deepStrictEqual(result, { hp: 13, progress: 5 });
});

test('advanceRegen stops at maxHp and does not carry leftover progress past full', () => {
  const result = advanceRegen({ hp: 19, maxHp: 20, progress: 0, secondsPerHp: 60 }, 600);
  assert.deepStrictEqual(result, { hp: 20, progress: 0 });
});

test('advanceRegen is a no-op once already at maxHp', () => {
  const result = advanceRegen({ hp: 20, maxHp: 20, progress: 45, secondsPerHp: 60 }, 100);
  assert.deepStrictEqual(result, { hp: 20, progress: 0 });
});

// --- Prestige --------------------------------------------------------------

test('STARTING_MAX_XP is the Max XP a new game starts with', () => {
  assert.strictEqual(STARTING_MAX_XP, 100);
});

test('prestigeTarget is 10% of maxXp', () => {
  assert.strictEqual(prestigeTarget(100), 10);
  assert.strictEqual(prestigeTarget(200), 20);
});

test('prestiging raises maxXp by PRESTIGE_BONUS_PER_CYCLE', () => {
  assert.strictEqual(STARTING_MAX_XP + PRESTIGE_BONUS_PER_CYCLE, 200);
});

test('prestigeCount is 0 at the starting maxXp and counts up by cycle after that', () => {
  assert.strictEqual(prestigeCount(STARTING_MAX_XP), 0);
  assert.strictEqual(prestigeCount(STARTING_MAX_XP + PRESTIGE_BONUS_PER_CYCLE), 1);
  assert.strictEqual(prestigeCount(STARTING_MAX_XP + PRESTIGE_BONUS_PER_CYCLE * 2), 2);
});

test('spendableXpGain pays the full award while under maxXp', () => {
  assert.strictEqual(spendableXpGain(50, 100, 10), 10);
});

test('spendableXpGain only pays the part of an award that fits under maxXp', () => {
  assert.strictEqual(spendableXpGain(95, 100, 10), 5);
  assert.strictEqual(spendableXpGain(90, 100, 10), 10);
});

test('spendableXpGain pays nothing once lifetime XP has reached maxXp', () => {
  assert.strictEqual(spendableXpGain(100, 100, 10), 0);
  assert.strictEqual(spendableXpGain(130, 100, 10), 0);
});

// --- Perks -------------------------------------------------------------

test('every perk costs Perk Points and defines a targeted effect', () => {
  for (const perk of Object.values(PERKS)) {
    assert.ok(perk.cost > 0);
    assert.ok(perk.effect.type);
    assert.ok((perk.effect.amount ?? perk.effect.points ?? perk.effect.costGrowth) > 0);
  }
});

test('the Cheaper Intelligence perk costs 8 and lowers Intelligence cost growth to 1.75', () => {
  assert.strictEqual(PERKS.intelligenceCostGrowth.cost, 8);
  assert.strictEqual(perkStatCostGrowth('intelligence', []), 2);
  assert.strictEqual(perkStatCostGrowth('intelligence', ['intelligenceCostGrowth']), 1.75);
  assert.strictEqual(statCost('intelligence', 0, ['intelligenceCostGrowth']), 20);
  assert.strictEqual(statCost('intelligence', 4, []), 320);
  assert.strictEqual(statCost('intelligence', 4, ['intelligenceCostGrowth']), Math.round(20 * Math.pow(1.75, 4)));
});

test('a stat cost-growth perk leaves other stats\' costs alone', () => {
  assert.strictEqual(statCost('wisdom', 4, ['intelligenceCostGrowth']), statCost('wisdom', 4));
});

// --- Stat bonuses (#78) --------------------------------------------------

test('statBonuses is empty with nothing equipped or purchased that boosts the stat', () => {
  assert.deepStrictEqual(statBonuses('constitution', [], []), []);
  assert.deepStrictEqual(statBonuses('constitution', ['regen', 'strength'], ['basicAttackDamage', 'healingSpeed25']), []);
});

test('statBonuses lists each equipped passive and purchased perk that boosts the stat', () => {
  assert.deepStrictEqual(statBonuses('fortitude', ['basicAttack', 'regen'], ['healingSpeed25']), [
    { source: 'Regen', points: 6 },
    { source: 'Fortitude +2', points: 2 },
  ]);
  assert.deepStrictEqual(statBonuses('constitution', [], ['maxHp10', 'maxHp25']), [
    { source: 'Constitution +2', points: 2 },
    { source: 'Constitution +5', points: 5 },
  ]);
});

test('statTotal adds every bonus on top of the stat base points', () => {
  assert.strictEqual(statTotal('constitution', 0, []), 4);
  assert.strictEqual(statTotal('constitution', 2, statBonuses('constitution', [], ['maxHp10', 'maxHp25'])), 13);
});

test('the Max HP perks give the same HP as before they became Constitution', () => {
  const base = statEffect('constitution', statTotal('constitution', 0, []));
  const withBoth = statEffect('constitution', statTotal('constitution', 0, statBonuses('constitution', [], ['maxHp10', 'maxHp25'])));
  assert.strictEqual(withBoth - base, 35);
});

test('perkSkillDamageBonus only applies to the skill a perk targets', () => {
  assert.strictEqual(perkSkillDamageBonus([], 'basicAttack'), 0);
  assert.strictEqual(perkSkillDamageBonus(['basicAttackDamage'], 'basicAttack'), 1);
  assert.strictEqual(perkSkillDamageBonus(['basicAttackDamage'], 'strongAttack'), 0);
});

test('perkStartingUpgradePoints is 0 with no starting-Upgrade-Points perk purchased', () => {
  assert.strictEqual(perkStartingUpgradePoints([]), 0);
  assert.strictEqual(perkStartingUpgradePoints(['maxHp10']), 0);
});

test('perkStartingUpgradePoints stacks the three perks to +30', () => {
  assert.strictEqual(perkStartingUpgradePoints(['startingUpgradePoints1']), 10);
  assert.strictEqual(perkStartingUpgradePoints(['startingUpgradePoints1', 'startingUpgradePoints2']), 20);
  assert.strictEqual(perkStartingUpgradePoints(['startingUpgradePoints1', 'startingUpgradePoints2', 'startingUpgradePoints3']), 30);
});
