const STATS = {
  maxHp: {
    label: 'Max HP',
    base: 20,
    perLevel: 5,
    baseCost: 5,
    costGrowth: 1.4,
    value(level) {
      return this.base + level * this.perLevel;
    },
  },

  attackDamage: {
    label: 'Attack Damage',
    base: 1,
    perLevel: 1,
    baseCost: 5,
    costGrowth: 1.5,
    value(level) {
      return this.base + level * this.perLevel;
    },
  },

  attackSpeed: {
    label: 'Attack Speed',
    base: 2,
    perLevel: 0.2,
    baseCost: 5,
    costGrowth: 1.5,
    // Divides rather than subtracts, so the cooldown shrinks with diminishing
    // returns and never reaches zero — which is why it needs no floor.
    value(level) {
      return this.base / (1 + level * this.perLevel);
    },
  },

  healthRegen: {
    label: 'Health Regen',
    // Seconds to regenerate 1 HP. Divides like attackSpeed, so higher levels
    // mean less time per HP without the interval ever reaching zero.
    base: 60,
    perLevel: 0.25,
    baseCost: 5,
    costGrowth: 1.5,
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
