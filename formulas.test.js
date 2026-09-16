const test = require('node:test');
const assert = require('node:assert');
const { STATS, statValue, statCost } = require('./formulas.js');

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
    for (const field of ['label', 'base', 'perLevel', 'baseCost', 'costGrowth']) {
      assert.ok(stat[field] !== undefined, `${statId} is missing ${field}`);
    }
    assert.strictEqual(typeof stat.value, 'function', `${statId} is missing value()`);
  }
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

  assert.strictEqual(statCost('maxHp', 0), 5);
  assert.strictEqual(statCost('maxHp', 1), 7);
  assert.strictEqual(statCost('attackDamage', 1), 8);
});
