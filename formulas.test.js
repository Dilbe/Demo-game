const test = require('node:test');
const assert = require('node:assert');
const { playerMaxHp, attackDamage, attackCooldownSeconds } = require('./formulas.js');

test('playerMaxHp starts at 10 and gains 2 per level', () => {
  assert.strictEqual(playerMaxHp(0), 10);
  assert.strictEqual(playerMaxHp(1), 12);
  assert.strictEqual(playerMaxHp(5), 20);
});

test('attackDamage starts at 1 and gains 1 per level', () => {
  assert.strictEqual(attackDamage(0), 1);
  assert.strictEqual(attackDamage(1), 2);
  assert.strictEqual(attackDamage(10), 11);
});

test('attackCooldownSeconds starts at 2s and shortens per level', () => {
  assert.strictEqual(attackCooldownSeconds(0), 2);
  assert.strictEqual(attackCooldownSeconds(5), 1);
});

// DELIBERATELY FAILING — proves the CI gate blocks a merge. Do not merge; delete this branch.
test('DELIBERATE FAILURE: proves CI blocks merges', () => {
  assert.strictEqual(attackDamage(0), 999);
});

test('attackCooldownSeconds always returns a positive cooldown', () => {
  for (const level of [0, 1, 10, 100]) {
    assert.ok(attackCooldownSeconds(level) > 0, `level ${level} produced a non-positive cooldown`);
  }
});
