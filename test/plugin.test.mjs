import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("plugin layout exposes the documented commands, skill and bundled resources", async () => {
  const manifest = JSON.parse(await read(".cursor-plugin/plugin.json"));
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(manifest.name, "augmentworks");
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.license, pkg.license);
  const icon = await readFile(new URL(manifest.logo, root));
  assert.equal(icon.toString("ascii", 1, 4), "PNG");

  const commands = (await readdir(new URL("commands/", root))).sort();
  const expectedNames = ["compare", "demo", "hosted", "setup", "test"].map(
    (action) => `augmentworks-${action}`,
  );
  assert.deepEqual(commands, expectedNames.map((name) => `${name}.md`));
  const readme = await read("README.md");
  for (const name of expectedNames) {
    const command = await read(`commands/${name}.md`);
    assert.match(command, new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription: [^\\r\\n]+\\r?\\n---`));
    assert.ok(readme.includes(`/${name}`));
  }

  const skill = "skills/augmentworks-regression/";
  const instructions = await read(skill + "SKILL.md");
  assert.match(instructions, /^---\r?\nname: augmentworks-regression\r?\ndescription: [^\r\n]+\r?\n---/);
  for (const resource of ["scripts/report.mjs", "assets/faq-packet.json"]) {
    assert.ok(instructions.includes(resource));
    assert.ok((await read(skill + resource)).length > 0);
  }
});
