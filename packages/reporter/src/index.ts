// Public entry of @testfly/reporter. The default export is the Playwright reporter class.
export { default, TestFlyReporter, type TestFlyReporterOptions } from './reporter';
export * from './schema';
export { detectCi } from './ci';
export { triageFailure, TRIAGE_RULES, type TriageContext } from './triage';
export { computeFlakiness, riskFor, RISK_THRESHOLDS } from './flakiness';
export { readHistory, writeRun, pruneHistory, historyFileName } from './history';
export {
  loadQuarantine,
  parseQuarantine,
  matchQuarantine,
  type QuarantineEntry,
  type QuarantineList,
} from './quarantine';
export { planShards, type ShardPlan } from './sharder';
export { evaluateGate, type GateResult, type QualityGateOptions } from './gate';
export { mergeRuns } from './merge';
export { computeTotals, passRate } from './totals';
export { generateDashboard, buildDashboardModel, type DashboardModel } from './dashboard';
