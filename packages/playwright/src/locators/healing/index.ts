export type { HealContext, HealResult, HealingStrategy, HealEvent } from './types';
export { RulesStrategy } from './RulesStrategy';
export { FuzzyStrategy } from './FuzzyStrategy';
export { registerHealingStrategy, unregisterHealingStrategy } from './registry';
export { levenshtein, normalizedLevenshtein, similarity } from './similarity';
