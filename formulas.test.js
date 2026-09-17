const test = require('node:test');
const assert = require('node:assert');
const {
  VERSION, BUILD_SHA, STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS, QUESTS, DUNGEONS,
  statValue, statCost,
  skillPower, skillCooldown, skillUpgradeCost, describeSkill,
  describeMonster, describeMonsterGroup, describeDungeon, advanceRegen,
  activeQuest, questComplete, describeQuestProgress,
  groupKillXp, groupTotalXp,
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

test('skillSlots grows by whole slots and always allows at least one skill', () => {
  for (let level = 0; level < 10; level += 1) {
    const slots = statValue('skillSlots', level);
    assert.strictEqual(slots % 1, 0, `level ${level} gave a fractional slot count`);
    assert.ok(slots >= 1, `level ${level} left no room for any skill`);
    assert.ok(statValue('skillSlots', level + 1) > slots, `slots did not grow at level ${level + 1}`);
  }
});

test('upgrading maxHp always increases it', () => {
  for (let level = 0; level < 10; level += 1) {
    assert.ok(statValue('maxHp', level + 1) > statValue('maxHp', level), `maxHp did not increase at level ${level + 1}`);
  }
});

test('healthRegen shortens its interval but never reaches zero', () => {
  for (let level = 0; level < 10; level += 1) {
    assert.ok(statValue('healthRegen', level + 1) < statValue('healthRegen', level), `did not shorten at level ${level + 1}`);
  }
  for (const level of [0, 1, 10, 100, 1000]) {
    assert.ok(statValue('healthRegen', level) > 0, `level ${level} produced a non-positive interval`);
  }
});

test('every skill gets stronger and faster as its tracks level up', () => {
  for (const skillId of Object.keys(SKILLS)) {
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
    assert.strictEqual(typeof stat.format, 'function', `${statId} is missing format()`);
    assert.ok(stat.format(stat.value(0)).length > 0, `${statId} format() produced nothing`);
  }
});

// --- Skills ------------------------------------------------------------

test('every skill defines the full data-object shape', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    for (const field of ['label', 'cooldown', 'unlockCost', 'pointCost', 'auto', 'triggerAt']) {
      assert.ok(skill[field] !== undefined, `${skillId} is missing ${field}`);
    }
    assert.ok(skill.pointCost > 0, `${skillId} costs no skill points to equip`);
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
  }
});

test('Strong Attack triggers immediately, Heal triggers halfway, others at the end', () => {
  assert.strictEqual(SKILLS.strongAttack.triggerAt, 0);
  assert.strictEqual(SKILLS.heal.triggerAt, 0.5);
  assert.strictEqual(SKILLS.basicAttack.triggerAt, 1);
  assert.strictEqual(SKILLS.autoAttack.triggerAt, 1);
});

test('starting skills are real skills and cost nothing', () => {
  for (const skillId of STARTING_SKILLS) {
    assert.ok(SKILLS[skillId], `${skillId} is not a defined skill`);
    assert.strictEqual(SKILLS[skillId].unlockCost, 0, `${skillId} starts unlocked so must be free`);
  }
});

test('a new player can afford to equip every starting skill at once', () => {
  const budget = statValue('skillPoints', 0);
  const slots = statValue('skillSlots', 0);
  const needed = STARTING_SKILLS.reduce((total, skillId) => total + SKILLS[skillId].pointCost, 0);

  assert.ok(needed <= budget, `starting skills need ${needed} points but a new player has ${budget}`);
  assert.ok(STARTING_SKILLS.length <= slots, `starting skills need ${STARTING_SKILLS.length} slots but a new player has ${slots}`);
});

test('the cheapest skill always fits a new player budget', () => {
  const cheapest = Math.min(...Object.values(SKILLS).map((skill) => skill.pointCost));
  assert.ok(cheapest <= statValue('skillPoints', 0), 'no skill is affordable at skillPoints level 0');
});

test('every skill that must be bought costs something', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    if (STARTING_SKILLS.includes(skillId)) continue;
    assert.ok(skill.unlockCost > 0, `${skillId} is not a starting skill but is free`);
  }
});

test('describeSkill reports damage, healing and automatic skills', () => {
  assert.match(describeSkill('basicAttack'), /1 damage, 2.0s cooldown/);
  assert.match(describeSkill('heal'), /^Heals 5/);
  assert.match(describeSkill('autoAttack'), /automatic$/);
  assert.doesNotMatch(describeSkill('strongAttack'), /automatic/);
});

test('describeSkill reflects upgrade levels', () => {
  assert.match(describeSkill('basicAttack', { power: 3, speed: 0 }), /^4 damage/);
  assert.match(describeSkill('heal', { power: 2, speed: 0 }), /^Heals 9/);

  const base = describeSkill('basicAttack', { power: 0, speed: 0 });
  const faster = describeSkill('basicAttack', { power: 0, speed: 4 });
  assert.notStrictEqual(base, faster, 'speed levels did not change the description');
});

// --- Balance snapshot --------------------------------------------------
// The one place that pins actual numbers. Expect this to fail when you
// rebalance on purpose — update it to match, deliberately.

test('BALANCE SNAPSHOT: current tuning', () => {
  assert.strictEqual(statValue('maxHp', 0), 20);
  assert.strictEqual(statValue('maxHp', 1), 25);

  assert.strictEqual(skillPower('basicAttack', 0), 1);
  assert.strictEqual(skillPower('basicAttack', 3), 4);
  assert.strictEqual(skillPower('heal', 0), 5);

  assert.strictEqual(skillCooldown('basicAttack', 0), 2);
  assert.strictEqual(skillCooldown('basicAttack', 5), 1);

  assert.strictEqual(skillUpgradeCost('basicAttack', 'power', 0), 5);
  assert.strictEqual(skillUpgradeCost('basicAttack', 'power', 1), 8);

  assert.strictEqual(statValue('healthRegen', 0), 60);
  assert.strictEqual(statValue('healthRegen', 1), 48);
  assert.strictEqual(statValue('healthRegen', 4), 30);

  assert.strictEqual(statValue('skillSlots', 0), 2);
  assert.strictEqual(statValue('skillSlots', 2), 4);

  assert.strictEqual(statValue('skillPoints', 0), 3);
  assert.strictEqual(statValue('skillPoints', 2), 7);

  assert.strictEqual(statCost('maxHp', 0), 5);
  assert.strictEqual(statCost('maxHp', 1), 7);
});

test('Small monster matches the game\'s original fixed monster', () => {
  assert.strictEqual(MONSTERS.small.maxHp, 5);
  assert.strictEqual(MONSTERS.small.damage, 1);
  assert.strictEqual(MONSTERS.small.cooldown, 3);
  assert.strictEqual(MONSTERS.small.xp, 1);
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
  assert.strictEqual(describeMonster('small'), '5 HP \u00b7 1 damage every 3s \u00b7 1 XP');
});

test('the three single-monster groups mirror MONSTERS one-to-one', () => {
  for (const monsterId of ['small', 'medium', 'big']) {
    assert.deepStrictEqual(MONSTER_GROUPS[monsterId].monsterIds, [monsterId]);
  }
});

test('twoSmall groups two Small monsters together', () => {
  assert.deepStrictEqual(MONSTER_GROUPS.twoSmall.monsterIds, ['small', 'small']);
});

test('describeMonsterGroup matches describeMonster for a single-monster group', () => {
  assert.strictEqual(describeMonsterGroup('small'), describeMonster('small'));
});

test('describeMonsterGroup totals XP across a multi-monster group', () => {
  assert.strictEqual(describeMonsterGroup('twoSmall'), '2\u00d7 5 HP \u00b7 1 damage every 3s \u00b7 3 XP total');
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

test('groupTotalXp sums every kill in order, bonus included', () => {
  assert.strictEqual(groupTotalXp(['medium', 'medium']), 4 + 5); // 4, then 4 * 1.25
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

test('a dungeon chains more than one fight', () => {
  for (const [dungeonId, dungeon] of Object.entries(DUNGEONS)) {
    assert.ok(dungeon.fightIds.length > 1, `${dungeonId} has only one fight, so isn't really a chain`);
  }
});

test('describeDungeon lists every fight in order and totals their XP, completion bonus included', () => {
  assert.strictEqual(DUNGEONS.goblinGauntlet.completionBonusXp, 5);
  assert.strictEqual(
    describeDungeon('goblinGauntlet'),
    'Small Monster → Small Monster → Medium Monster · 11 XP total', // 1 + 1 + 4 monster XP + 5 bonus
  );
});

// --- Quests --------------------------------------------------------------

test('every quest defines the full data-object shape', () => {
  for (const quest of QUESTS) {
    for (const field of ['id', 'description', 'target', 'reward']) {
      assert.ok(quest[field] !== undefined, `${quest.id ?? '?'} is missing ${field}`);
    }
    assert.ok(quest.target > 0, `${quest.id} has a non-positive target`);
    assert.ok(quest.reward.type, `${quest.id}'s reward has no type`);
  }
});

test('quest ids are unique', () => {
  const ids = QUESTS.map((quest) => quest.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'QUESTS has duplicate ids');
});

test('killFive unlocks the Character tab and killTen unlocks the Skills tab', () => {
  const killFive = QUESTS.find((quest) => quest.id === 'killFive');
  const killTen = QUESTS.find((quest) => quest.id === 'killTen');
  assert.deepStrictEqual(killFive.reward, { type: 'unlockTab', tabId: 'character-tab' });
  assert.deepStrictEqual(killTen.reward, { type: 'unlockTab', tabId: 'skills-tab' });
});

test('activeQuest returns quests in order, skipping completed ones', () => {
  assert.strictEqual(activeQuest([]).id, QUESTS[0].id);
  assert.strictEqual(activeQuest([QUESTS[0].id]).id, QUESTS[1].id);
});

test('activeQuest returns null once every quest is completed', () => {
  assert.strictEqual(activeQuest(QUESTS.map((quest) => quest.id)), null);
});

test('questComplete is true once the kill count reaches the target, not before', () => {
  const quest = { target: 5 };
  assert.strictEqual(questComplete(quest, 4), false);
  assert.strictEqual(questComplete(quest, 5), true);
  assert.strictEqual(questComplete(quest, 6), true);
});

test('describeQuestProgress reports progress capped at the target', () => {
  const quest = { description: 'Kill 5 enemies', target: 5 };
  assert.strictEqual(describeQuestProgress(quest, 3), 'Kill 5 enemies (3/5)');
  assert.strictEqual(describeQuestProgress(quest, 9), 'Kill 5 enemies (5/5)');
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
