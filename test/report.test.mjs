import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../skills/augmentworks-regression/scripts/report.mjs", import.meta.url));

function report(outcomes) {
  const attempts = outcomes.map((passed, index) => ({
    scenario_key: "refund", repetition_index: index, status: passed ? "passed" : "failed",
    cleanup_status: "completed",
    turns: [{ assistant_content: "PRIVATE-CHAT" }], observations: [{ value: "PRIVATE-OBSERVATION" }],
    assertions: [
      { key: "no-refund", passed, actual: "PRIVATE-ACTUAL" },
      { key: "stable", passed: true }
    ]
  }));
  return {
    schema_version: "AW-LOCAL-RESULT-1", run_id: "local_run_test", scorer_version: "v1",
    target: { name: "PRIVATE-TARGET", config_sha256: "a".repeat(64) },
    packet: { id: "refund", version: "1.0.0", sha256: "b".repeat(64) },
    scenarios: [{ scenario_key: "refund", repetitions: attempts.length }],
    outcome: outcomes.every(Boolean) ? "passed" : "failed",
    counts: { scenarios: 1, attempts: attempts.length, passed: outcomes.filter(Boolean).length,
      failed: outcomes.filter(x => !x).length, inconclusive: 0, errors: 0 }, attempts
  };
}

async function run(t, command, ...reports) {
  const dir = await mkdtemp(join(tmpdir(), "aw-report-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = await Promise.all(reports.map(async (body, index) => {
    const path = join(dir, `${index}.json`);
    await writeFile(path, typeof body === "string" ? body : JSON.stringify(body));
    return path;
  }));
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, command, ...files], { encoding: "utf8" });
  assert.doesNotMatch(stdout + stderr, /PRIVATE-/);
  return { status, result: stdout ? JSON.parse(stdout) : null, stderr };
}

test("inspect names the failed check and repetition, and excludes private values", async t => {
  const raw = report([true, false]);
  raw.attempts[1].assertions.push({ key: "FREE TEXT PRIVATE-THING", passed: false });
  const { result, status } = await run(t, "inspect", raw);
  assert.equal(status, 0);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.cleanup, { completed: 2, failed: 0, not_required: 0 });
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].repetition_index, 1);
  assert.equal(result.issues[0].failed_checks[0], "no-refund");
  assert.match(result.issues[0].failed_checks[1], /^id#/);
});

test("compare matches repeated attempts and checks by key even after reordering", async t => {
  const before = report([false, true]);
  const after = report([true, false]);
  after.attempts.reverse().forEach(a => a.assertions.reverse());
  const { status, result } = await run(t, "compare", before, after);
  assert.equal(status, 0);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.coverage.matched_checks, 4);
  assert.deepEqual(result.changes.map(c => [c.repetition_index, c.check, c.classification]), [
    [0, "no-refund", "fixed"], [1, "no-refund", "regressed"]
  ]);
});

test("missing checks and repetitions are reported as unobserved", async t => {
  const before = report([false, true]);
  const after = report([true]);
  after.scenarios[0].repetitions = 2;
  after.attempts[0].assertions.shift();
  const { result } = await run(t, "compare", before, after);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.baseline_only_attempts, 1);
  assert.equal(result.coverage.current_missing_repetitions, 1);
  assert.equal(result.coverage.baseline_only_checks, 3);
  assert.ok(result.changes.every(c => c.classification === "unobserved"));
});

test("operational or inconclusive results do not count as fixes", async t => {
  const before = report([false]);
  const after = report([true]);
  after.outcome = after.attempts[0].status = "inconclusive";
  after.counts.passed--;
  after.counts.inconclusive++;
  const { result } = await run(t, "compare", before, after);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.changes[0].classification, "indeterminate");
  const cleanup = report([true]);
  cleanup.attempts[0].cleanup_status = "failed";
  assert.equal((await run(t, "compare", before, cleanup)).result.changes[0].classification, "indeterminate");
});

test("changing target, config, packet, or scorer scope rejects comparison", async t => {
  const before = report([false]);
  const after = report([true]);
  after.target = { name: "PRIVATE-OTHER", config_sha256: "f".repeat(64) };
  after.packet.sha256 = "1".repeat(64);
  after.scorer_version = "v2";
  const { status, result } = await run(t, "compare", before, after);
  assert.equal(status, 2);
  assert.equal(result.comparable, false);
  assert.deepEqual(result.reasons.sort(), ["config_sha256", "packet_sha256", "scorer_version", "target_name"]);
  assert.deepEqual(result.changes, []);
});

test("malformed, wrong schema or ambiguous check identity fails without leaking input", async t => {
  const duplicate = report([false]);
  duplicate.attempts[0].assertions.push(duplicate.attempts[0].assertions[0]);
  for (const input of ['{"PRIVATE-THI', { schema_version: "HOSTED-REPORT" }, duplicate]) {
    const { status, result, stderr } = await run(t, "inspect", input);
    assert.equal(status, 2);
    assert.equal(result, null);
    assert.match(stderr, /Invalid/);
  }
});
