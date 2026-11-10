import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugin = join(root, "plugins/claude");
const actions = ["compare", "connect", "demo", "hosted", "setup", "test"];
const read = (path) => readFile(join(plugin, path), "utf8");

async function entries(directory, prefix = "") {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`;
    assert.equal(item.isSymbolicLink(), false, `plugin must contain regular files: ${path}`);
    if (item.isDirectory()) files.push(...await entries(join(directory, item.name), `${path}/`));
    else files.push(path);
  }
  return files.sort();
}

test("Claude marketplace selects the self-contained package with native metadata", async () => {
  const marketplace = JSON.parse(await readFile(join(root, ".claude-plugin/marketplace.json"), "utf8"));
  const manifest = JSON.parse(await read(".claude-plugin/plugin.json"));
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(marketplace.name, "augmentworks-tools");
  assert.deepEqual(marketplace.plugins.map(({ name, source }) => ({ name, source })), [
    { name: "augmentworks", source: "./plugins/claude" },
  ]);
  assert.equal(manifest.name, marketplace.plugins[0].name);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.logo, undefined);
  assert.equal(manifest.hooks, undefined);
  assert.equal(manifest.commands, undefined, "short command files use Claude's default namespaced discovery");
  for (const field of ["documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"]) {
    assert.equal(new URL(manifest[field]).origin, "https://augmentworks.ai");
  }
  assert.equal((await readFile(join(plugin, manifest.icon))).toString("ascii", 1, 4), "PNG");
  assert.match(await read("LICENSE"), /Apache License/);

  assert.deepEqual(await entries(plugin), [
    ".claude-plugin/plugin.json", ".mcp.json", "LICENSE", "README.md", "assets/augmentworks.png",
    ...actions.map((action) => `commands/${action}.md`),
    "skills/augmentworks-regression/SKILL.md", "skills/augmentworks-regression/assets/faq-packet.json",
    "skills/augmentworks-regression/scripts/report.mjs",
  ].sort(), "Claude package excludes Cursor adapter, lockfile installs, hooks and API-key profiles");
});

test("Claude OAuth uses its registered public client and fixed callback without Cursor schema or secrets", async () => {
  const mcp = JSON.parse(await read(".mcp.json"));
  assert.deepEqual(mcp, { mcpServers: { workspace: {
    type: "http", url: "https://augmentworks.ai/mcp",
    oauth: { clientId: "augmentworks-claude-code", callbackPort: 8788 },
  } } });
  const skill = await read("skills/augmentworks-regression/SKILL.md");
  assert.match(skill, /http:\/\/localhost:8788\/callback/);
  assert.match(skill, /plugin:augmentworks:workspace/);
  assert.match(skill, /Report connected only after it succeeds/);
  assert.match(skill, /Do not fall back to CLI login or an API-key adapter/);
  assert.match(skill, /current MCP tools cannot quote, start or dispatch assessments/);
  assert.doesNotMatch(skill, /Cursor|\.cursor|augmentworks-cursor|Customize → MCPs/);
});

test("Claude discovers short commands and resolves the packaged skill resources", async () => {
  const readme = await read("README.md");
  const skill = await read("skills/augmentworks-regression/SKILL.md");
  assert.match(skill, /^---\nname: augmentworks-regression\ndescription: [^\n]+\n---/);
  for (const action of actions) {
    const command = await read(`commands/${action}.md`);
    assert.ok(command.startsWith(`---\nname: ${action}\ndescription: `));
    assert.ok(command.includes("`augmentworks:augmentworks-regression`"));
    assert.ok(readme.includes(`/augmentworks:${action}`));
    assert.doesNotMatch(command, /Cursor|\/augmentworks-(?:demo|connect|setup|test|compare|hosted)\b/);
  }
  for (const resource of ["scripts/report.mjs", "assets/faq-packet.json"]) {
    assert.ok(skill.includes(`\${CLAUDE_PLUGIN_ROOT}/skills/augmentworks-regression/${resource}`));
    assert.ok((await read(`skills/augmentworks-regression/${resource}`)).length > 0);
  }
  assert.doesNotMatch(skill, /\/absolute\/skill\/path|\.\.\/\.\.\/examples\//);
  const versions = [...readme.matchAll(/@augmentworks\/cli@([^\s`]+)/g)].map((match) => match[1]);
  assert.ok(versions.length > 0);
  assert.ok(versions.every((version) => /^\d+\.\d+\.\d+$/.test(version)));
  assert.equal(new Set(versions).size, 1);
  assert.match(readme, /MCP cannot quote, start, or dispatch an assessment/);
  assert.match(readme, /does not establish support for Claude web, mobile, or Cowork/);
});

test("installed report helper runs from a path with spaces and detects the same check being fixed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "aw claude installed "));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const installed = join(dir, "installed plugin");
  await cp(plugin, installed, { recursive: true });
  const makeReport = (passed) => ({
    schema_version: "AW-LOCAL-RESULT-1", run_id: passed ? "local_fixed" : "local_failed", scorer_version: "v1",
    target: { name: "fixture", config_sha256: "a".repeat(64) },
    packet: { id: "refund", version: "1.0.0", sha256: "b".repeat(64) },
    scenarios: [{ scenario_key: "refund", repetitions: 1 }],
    outcome: passed ? "passed" : "failed",
    counts: { scenarios: 1, attempts: 1, passed: Number(passed), failed: Number(!passed), inconclusive: 0, errors: 0 },
    attempts: [{ scenario_key: "refund", repetition_index: 0, status: passed ? "passed" : "failed",
      cleanup_status: "completed", turns: [{ assistant_content: "PRIVATE-TRANSCRIPT" }],
      assertions: [{ key: "refund-limit", passed, actual: "PRIVATE-OBSERVATION" }] }],
  });
  const baseline = join(dir, "before report.json");
  const candidate = join(dir, "after report.json");
  await writeFile(baseline, JSON.stringify(makeReport(false)));
  await writeFile(candidate, JSON.stringify(makeReport(true)));
  const result = spawnSync(process.execPath, [join(installed, "skills/augmentworks-regression/scripts/report.mjs"),
    "compare", baseline, candidate], { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE-/);
  const comparison = JSON.parse(result.stdout);
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.changes.map(({ check, classification }) => ({ check, classification })), [
    { check: "refund-limit", classification: "fixed" },
  ]);
});

test("generated package is current and check mode detects drift without rewriting it", async (t) => {
  const current = spawnSync(process.execPath, ["scripts/build-claude.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(current.status, 0, current.stderr);
  const dir = await mkdtemp(join(tmpdir(), "aw-claude-build-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const path of ["scripts", "commands", "skills", "claude-source", "package.json", ".cursor-plugin", "LICENSE", "assets", "plugins", ".claude-plugin"]) {
    await cp(join(root, path), join(dir, path), { recursive: true });
  }
  const path = join(dir, "plugins/claude/README.md");
  const changed = `${await readFile(path, "utf8")}\nUncommitted generated change.\n`;
  await writeFile(path, changed);
  const stale = spawnSync(process.execPath, ["scripts/build-claude.mjs", "--check"], { cwd: dir, encoding: "utf8" });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /plugins\/claude\/README.md/);
  assert.equal(await readFile(path, "utf8"), changed);
});
