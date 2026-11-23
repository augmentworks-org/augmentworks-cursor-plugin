import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const edition = new URL("../plugins/claude-directory/", import.meta.url);
const native = new URL("../plugins/claude/", import.meta.url);
const scopes = {
  "commands/connect.md": ["list_applications"],
  "commands/report.md": ["list_applications", "get_run_report"],
  "commands/compare.md": ["list_applications", "compare_runs"],
  "commands/cli-guide.md": [],
  "skills/augmentworks-workspace/SKILL.md": ["list_applications", "get_run_report", "compare_runs"],
};
const read = (base, path) => readFile(new URL(path, base), "utf8");

async function packageFiles(directory) {
  const paths = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const children = await packageFiles(new URL(`${item.name}/`, directory));
      paths.push(...children.map(child => `${item.name}/${child}`));
    } else {
      assert.ok(item.isFile(), `Unexpected file type: ${item.name}`);
      paths.push(item.name);
    }
  }
  return paths.sort();
}

test("directory edition contains only its listed documentation, metadata, and PNG", async () => {
  assert.deepEqual(await packageFiles(edition), [
    ".claude-plugin/plugin.json", ".mcp.json", "LICENSE", "README.md", "assets/augmentworks.png", ...Object.keys(scopes),
  ].sort());
  const manifest = JSON.parse(await read(edition, ".claude-plugin/plugin.json"));
  assert.equal(manifest.name, "augmentworks");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(await read(edition, "LICENSE"), await read(native, "LICENSE"));
  const icon = await readFile(new URL(manifest.icon, edition));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.doesNotMatch(JSON.stringify(manifest), /"hooks"|"lspServers"|"agents"/);
});

test("directory edition uses the native workspace OAuth profile and leaves the local plugin available", async () => {
  const connector = JSON.parse(await read(edition, ".mcp.json"));
  assert.deepEqual(connector, JSON.parse(await read(native, ".mcp.json")));
  assert.equal(connector.mcpServers.workspace.url, "https://augmentworks.ai/mcp");
  assert.equal(connector.mcpServers.workspace.oauth.clientId, "augmentworks-claude-code");
  assert.ok((await read(native, "commands/test.md")).includes("augmentworks-regression"));
});

test("directory instructions use the declared workspace reads without pre-approving tools or invoking a shell", async () => {
  for (const [path, required] of Object.entries(scopes)) {
    const source = await read(edition, path);
    const header = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1];
    assert.ok(header, `Missing frontmatter in ${path}`);
    assert.deepEqual(header.split("\n").map(line => line.split(":")[0]), ["name", "description"], path);
    for (const tool of ["list_applications", "get_run_report", "compare_runs"]) {
      assert.equal(source.includes("`" + tool + "`"), required.includes(tool), path + ": " + tool);
    }
    assert.doesNotMatch(source, /!`|^\s*`{3}(?:sh|shell|bash|powershell|zsh)\b/im);
    assert.doesNotMatch(source, /(?:^|`)\s*(?:npx|npm exec|node|jq|curl|wget|bash)\s+/m);
  }
  const guide = await read(edition, "commands/cli-guide.md");
  assert.match(guide, /https:\/\/augmentworks\.ai\/docs\//);
  assert.match(guide, /terminal|manual/i);
});
