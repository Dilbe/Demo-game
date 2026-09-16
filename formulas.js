const STATS = {
  maxHp: {
    label: 'Max HP',
    base: 10,
    perLevel: 2,
    baseCost: 5,
    costGrowth: 1,
    value(level) {
      return this.base + level * this.perLevel;
    },
  },

  attackDamage: {
    label: 'Attack Damage',
    base: 1,
    perLevel: 1,
    baseCost: 5,
    costGrowth: 1,
    value(level) {
      return this.base + level * this.perLevel;
    },
  },

  attackSpeed: {
    label: 'Attack Speed',
    base: 2,
    perLevel: 0.2,
    baseCost: 5,
    costGrowth: 1,
    // Divides rather than subtracts, so the cooldown shrinks with diminishing
    // returns and never reaches zero — which is why it needs no floor.
    value(level) {
      return this.base / (1 + level * this.perLevel);
    },
  },
};

function statValue(statId, level) {
  return STATS[statId].value(level);
}

function statCost(statId, level) {
  const stat = STATS[statId];
  return Math.round(stat.baseCost * Math.pow(stat.costGrowth, level));
}

// Loaded as a plain <script> in the browser; required by the Node test runner.
if (typeof module !== 'undefined') {
  module.exports = { STATS, statValue, statCost };
}
