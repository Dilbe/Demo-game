const test = require('node:test');
const assert = require('node:assert');
const { STATS, SKILLS, STARTING_SKILLS, statValue, statCost, describeSkill } = require('./formulas.js');

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

test('upgrading maxHp and attackDamage always increases them', () => {
  for (const statId of ['maxHp', 'attackDamage']) {
    for (let level = 0; level < 10; level += 1) {
      assert.ok(statValue(statId, level + 1) > statValue(statId, level), `${statId} did not increase at level ${level + 1}`);
    }
  }
});

test('attackSpeed and healthRegen shorten their interval but never reach zero', () => {
  for (const statId of ['attackSpeed', 'healthRegen']) {
    for (let level = 0; level < 10; level += 1) {
      assert.ok(statValue(statId, level + 1) < statValue(statId, level), `${statId} did not shorten at level ${level + 1}`);
    }
    for (const level of [0, 1, 10, 100, 1000]) {
      assert.ok(statValue(statId, level) > 0, `${statId} at level ${level} produced a non-positive interval`);
    }
  }
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
    for (const field of ['label', 'cooldown', 'unlockCost', 'auto']) {
      assert.ok(skill[field] !== undefined, `${skillId} is missing ${field}`);
    }
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

test('every skill that must be bought costs something', () => {
  for (const [skillId, skill] of Object.entries(SKILLS)) {
    if (STARTING_SKILLS.includes(skillId)) continue;
    assert.ok(skill.unlockCost > 0, `${skillId} is not a starting skill but is free`);
  }
});

test('describeSkill reports damage, healing and automatic skills', () => {
  assert.match(describeSkill('basicAttack'), /1 damage, 2s cooldown/);
  assert.match(describeSkill('heal'), /^Heals 5/);
  assert.match(describeSkill('autoAttack'), /automatic$/);
  assert.doesNotMatch(describeSkill('strongAttack'), /automatic/);
});

// --- Balance snapshot --------------------------------------------------
// The one place that pins actual numbers. Expect this to fail when you
// rebalance on purpose — update it to match, deliberately.

test('BALANCE SNAPSHOT: current tuning', () => {
  assert.strictEqual(statValue('maxHp', 0), 20);
  assert.strictEqual(statValue('maxHp', 1), 25);

  assert.strictEqual(statValue('attackDamage', 0), 1);
  assert.strictEqual(statValue('attackDamage', 1), 2);

  assert.strictEqual(statValue('attackSpeed', 0), 2);
  assert.strictEqual(statValue('attackSpeed', 5), 1);

  assert.strictEqual(statValue('healthRegen', 0), 60);
  assert.strictEqual(statValue('healthRegen', 1), 48);
  assert.strictEqual(statValue('healthRegen', 4), 30);

  assert.strictEqual(statValue('skillSlots', 0), 2);
  assert.strictEqual(statValue('skillSlots', 2), 4);

  assert.strictEqual(statCost('maxHp', 0), 5);
  assert.strictEqual(statCost('maxHp', 1), 7);
  assert.strictEqual(statCost('attackDamage', 1), 8);
});
