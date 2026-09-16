const test = require('node:test');
const assert = require('node:assert');
const { STATS, statValue, statCost } = require('./formulas.js');

test('maxHp starts at 20 and gains 2 per level', () => {
  assert.strictEqual(statValue('maxHp', 0), 20);
  assert.strictEqual(statValue('maxHp', 1), 22);
  assert.strictEqual(statValue('maxHp', 5), 30);
});

test('attackDamage starts at 1 and gains 1 per level', () => {
  assert.strictEqual(statValue('attackDamage', 0), 1);
  assert.strictEqual(statValue('attackDamage', 1), 2);
  assert.strictEqual(statValue('attackDamage', 10), 11);
});

test('attackSpeed starts at a 2s cooldown and shortens per level', () => {
  assert.strictEqual(statValue('attackSpeed', 0), 2);
  assert.strictEqual(statValue('attackSpeed', 5), 1);
});

test('attackSpeed cooldown stays positive at every level', () => {
  for (const level of [0, 1, 10, 100]) {
    assert.ok(statValue('attackSpeed', level) > 0, `level ${level} produced a non-positive cooldown`);
  }
});

test('every stat costs a flat 5 XP while costGrowth is 1', () => {
  for (const statId of Object.keys(STATS)) {
    for (const level of [0, 1, 5, 20]) {
      assert.strictEqual(statCost(statId, level), 5, `${statId} at level ${level}`);
    }
  }
});

test('costGrowth above 1 compounds the cost per level', () => {
  const original = STATS.maxHp.costGrowth;
  STATS.maxHp.costGrowth = 2;
  try {
    assert.strictEqual(statCost('maxHp', 0), 5);
    assert.strictEqual(statCost('maxHp', 1), 10);
    assert.strictEqual(statCost('maxHp', 3), 40);
  } finally {
    STATS.maxHp.costGrowth = original;
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
