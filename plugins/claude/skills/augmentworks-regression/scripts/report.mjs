import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

const outcomes = ["passed", "failed", "inconclusive", "error"];
const cleanupStatuses = ["completed", "failed", "not_required"];
const digest = /^[a-f0-9]{64}$/;

function requireField(condition, field) {
  if (!condition) throw new Error(`Invalid local report field: ${field}`);
}

function isText(value) {
  return typeof value === "string" && value.length > 0;
}

// Packet authors control labels. Only print identifier-like text, never arbitrary prose.
function label(value) {
  if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,149}$/.test(value)) return value;
  return `id#${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function projectReport(raw) {
  requireField(raw?.schema_version === "AW-LOCAL-RESULT-1", "schema_version (expected AW-LOCAL-RESULT-1)");
  requireField(isText(raw.run_id), "run_id");
  requireField(outcomes.includes(raw.outcome), "outcome");
  requireField(isText(raw.scorer_version), "scorer_version");
  requireField(isText(raw.packet?.id) && isText(raw.packet?.version) && digest.test(raw.packet?.sha256), "packet");
  requireField(isText(raw.target?.name) && digest.test(raw.target?.config_sha256), "target");
  requireField(Array.isArray(raw.scenarios) && raw.scenarios.length > 0, "scenarios");
  requireField(Array.isArray(raw.attempts), "attempts");

  const scenarios = new Map();
  for (const scenario of raw.scenarios) {
    requireField(isText(scenario?.scenario_key) && !scenarios.has(scenario.scenario_key), "unique scenario_key");
    requireField(Number.isInteger(scenario.repetitions) && scenario.repetitions >= 1 && scenario.repetitions <= 20, "scenario repetitions");
    scenarios.set(scenario.scenario_key, scenario.repetitions);
  }

  const counts = { scenarios: scenarios.size, attempts: raw.attempts.length, passed: 0, failed: 0, inconclusive: 0, errors: 0 };
  const attempts = new Map();
  for (const attempt of raw.attempts) {
    requireField(scenarios.has(attempt?.scenario_key), "attempt scenario_key");
    const index = attempt.repetition_index;
    requireField(Number.isInteger(index) && index >= 0 && index < scenarios.get(attempt.scenario_key), "repetition_index");
    const key = JSON.stringify([attempt.scenario_key, index]);
    requireField(!attempts.has(key), "unique scenario/repetition");
    requireField(outcomes.includes(attempt.status), "attempt status");
    requireField(cleanupStatuses.includes(attempt.cleanup_status), "cleanup_status");
    requireField(Array.isArray(attempt.assertions), "assertions");
    counts[attempt.status === "error" ? "errors" : attempt.status]++;

    const checks = new Map();
    for (const check of attempt.assertions) {
      requireField(isText(check?.key) && !checks.has(check.key) && typeof check.passed === "boolean", "unique assertion key and boolean passed");
      checks.set(check.key, check.passed);
    }
    attempts.set(key, {
      scenario_key: label(attempt.scenario_key),
      repetition_index: index,
      status: attempt.status,
      cleanup_status: attempt.cleanup_status,
      checks
    });
  }
  requireField(Object.entries(counts).every(([key, value]) => raw.counts?.[key] === value), "counts");
  const expected = [...scenarios.values()].reduce((sum, repetitions) => sum + repetitions, 0);
  return {
    run_id: label(raw.run_id), outcome: raw.outcome, counts, scenarios, attempts,
    missing_repetitions: expected - attempts.size,
    identity: {
      packet_id: raw.packet.id, packet_version: raw.packet.version, packet_sha256: raw.packet.sha256,
      target_name: raw.target.name, config_sha256: raw.target.config_sha256, scorer_version: raw.scorer_version
    }
  };
}

async function readReport(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error("Expected a local JSON report file under 16 MiB");
    let raw;
    try {
      raw = JSON.parse(await file.readFile("utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Invalid JSON in local report");
      throw error;
    }
    return projectReport(raw);
  } finally {
    await file.close();
  }
}

function inspect(report) {
  const issues = [];
  const cleanup = { completed: 0, failed: 0, not_required: 0 };
  for (const { checks, ...attempt } of report.attempts.values()) {
    cleanup[attempt.cleanup_status]++;
    const failed = [...checks].filter(([, passed]) => !passed).map(([key]) => label(key));
    if (failed.length || attempt.status !== "passed" || attempt.cleanup_status === "failed") {
      issues.push({ ...attempt, failed_checks: failed });
    }
  }
  return {
    run_id: report.run_id, outcome: report.outcome, counts: report.counts,
    cleanup, missing_repetitions: report.missing_repetitions, issues
  };
}

function sameScenarios(left, right) {
  return left.size === right.size && [...left].every(([key, count]) => right.get(key) === count);
}

function compare(baseline, current) {
  const reasons = Object.keys(baseline.identity).filter(key => baseline.identity[key] !== current.identity[key]);
  const pair = {
    baseline_run: baseline.run_id, current_run: current.run_id,
    baseline_outcome: baseline.outcome, current_outcome: current.outcome
  };
  if (reasons.length) return { ...pair, comparable: false, reasons, changes: [] };

  const changes = [];
  const attempt_changes = [];
  const coverage = {
    scenarios_match: sameScenarios(baseline.scenarios, current.scenarios),
    baseline_missing_repetitions: baseline.missing_repetitions,
    current_missing_repetitions: current.missing_repetitions,
    matched_checks: 0, baseline_only_checks: 0, current_only_checks: 0,
    baseline_only_attempts: 0, current_only_attempts: 0, indeterminate_attempt_pairs: 0
  };
  for (const key of new Set([...baseline.attempts.keys(), ...current.attempts.keys()])) {
    const old = baseline.attempts.get(key);
    const now = current.attempts.get(key);
    const { scenario_key, repetition_index } = old ?? now;
    const identity = { scenario_key, repetition_index };
    const decisive = [old, now].every(attempt => attempt &&
      ["passed", "failed"].includes(attempt.status) && attempt.cleanup_status !== "failed");
    if (old && now && !decisive) coverage.indeterminate_attempt_pairs++;
    if (!now) coverage.baseline_only_attempts++;
    if (!old) coverage.current_only_attempts++;
    if (old?.status !== now?.status || old?.cleanup_status !== now?.cleanup_status) {
      attempt_changes.push({
        ...identity, before: old?.status ?? "unobserved", after: now?.status ?? "unobserved",
        cleanup_before: old?.cleanup_status ?? "unobserved", cleanup_after: now?.cleanup_status ?? "unobserved"
      });
    }
    for (const check of new Set([...(old?.checks.keys() ?? []), ...(now?.checks.keys() ?? [])])) {
      const a = old?.checks.get(check);
      const b = now?.checks.get(check);
      if (a === undefined) coverage.current_only_checks++;
      else if (b === undefined) coverage.baseline_only_checks++;
      else coverage.matched_checks++;
      if (a === b) continue;
      let classification = "unobserved";
      if (a !== undefined && b !== undefined) {
        classification = decisive ? (b ? "fixed" : "regressed") : "indeterminate";
      }
      changes.push({
        ...identity, check: label(check), before: a ?? null, after: b ?? null, classification
      });
    }
  }
  coverage.complete = coverage.scenarios_match && coverage.matched_checks > 0 &&
    !coverage.baseline_missing_repetitions && !coverage.current_missing_repetitions &&
    !coverage.baseline_only_attempts && !coverage.current_only_attempts &&
    !coverage.baseline_only_checks && !coverage.current_only_checks && !coverage.indeterminate_attempt_pairs;
  return { ...pair, comparable: true, coverage, attempt_changes, changes };
}

async function main([command, ...paths]) {
  let result;
  if (command === "inspect" && paths.length === 1) result = inspect(await readReport(paths[0]));
  else if (command === "compare" && paths.length === 2) result = compare(await readReport(paths[0]), await readReport(paths[1]));
  else throw new Error("Usage: node report.mjs inspect <report.json> | compare <baseline.json> <current.json>");
  console.log(JSON.stringify(result, null, 2));
  if (result.comparable === false) process.exitCode = 2;
}

main(process.argv.slice(2)).catch(error => {
  // Filesystem error messages can contain private paths.
  console.error(error.code ? `Unable to read local report (${error.code})` : error.message);
  process.exitCode = 2;
});
