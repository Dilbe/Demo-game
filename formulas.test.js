const test = require('node:test');
const assert = require('node:assert');
const {
  STATS, SKILLS, STARTING_SKILLS, MONSTERS, MONSTER_GROUPS,
  statValue, statCost,
  skillPower, skillCooldown, skillUpgradeCost, powerLabel, describeSkill,
  describeMonster, describeMonsterGroup,
} = require('./formulas.js');

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
  for (const skillId of Object.keys(SKILLS)) {
    for (let level = 0; level < 10; level += 1) {
      const cost = skillUpgradeCost(skillId, level);
      assert.strictEqual(cost % 1, 0, `${skillId} level ${level} cost is fractional`);
      assert.ok(skillUpgradeCost(skillId, level + 1) >= cost, `${skillId} got cheaper at level ${level + 1}`);
    }
  }
});

test('powerLabel says Healing for healing skills and Damage otherwise', () => {
  assert.strictEqual(powerLabel('heal'), 'Healing');
  assert.strictEqual(powerLabel('basicAttack'), 'Damage');
  assert.strictEqual(powerLabel('autoAttack'), 'Damage');
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
    for (const field of ['label', 'cooldown', 'unlockCost', 'pointCost', 'auto', 'powerPerLevel', 'speedPerLevel', 'upgradeBaseCost', 'upgradeCostGrowth']) {
      assert.ok(skill[field] !== undefined, `${skillId} is missing ${field}`);
    }
    assert.ok(skill.pointCost > 0, `${skillId} costs no skill points to equip`);
    assert.ok(skill.damage !== undefined || skill.healing !== undefined, `${skillId} does neither damage nor healing`);
    assert.ok(skill.cooldown > 0, `${skillId} has a non-positive cooldown`);
  }
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

  assert.strictEqual(skillUpgradeCost('basicAttack', 0), 5);
  assert.strictEqual(skillUpgradeCost('basicAttack', 1), 8);

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
  assert.strictEqual(describeMonsterGroup('twoSmall'), '2\u00d7 5 HP \u00b7 1 damage every 3s \u00b7 2 XP total');
});
