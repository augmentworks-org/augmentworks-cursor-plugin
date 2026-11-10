import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = "plugins/claude";
const actions = ["compare", "connect", "demo", "hosted", "setup", "test"];
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/build-claude.mjs [--check]");
}

async function read(path) {
  return readFile(join(root, path), "utf8");
}

function replaceRequired(text, source, replacement, label) {
  if (!text.includes(source)) throw new Error(`Shared source changed: ${label}`);
  return text.replace(source, replacement);
}

function adaptCommands(text) {
  return text
    .replaceAll("Cursor", "Claude Code")
    .replace(/\/augmentworks-(compare|connect|demo|hosted|setup|test)\b/g, "/augmentworks:$1")
    .replaceAll("`augmentworks-regression`", "`augmentworks:augmentworks-regression`");
}

async function listFiles(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(child));
    else if (entry.isFile()) result.push(relative(root, child).replaceAll("\\", "/"));
    else throw new Error(`Generated package cannot contain symlinks or special files: ${child}`);
  }
  return result;
}

const pkg = JSON.parse(await read("package.json"));
const cursor = JSON.parse(await read(".cursor-plugin/plugin.json"));
const files = new Map();
const add = (path, contents) => files.set(`${destination}/${path}`, Buffer.from(contents));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

add(".claude-plugin/plugin.json", json({
  name: "augmentworks",
  displayName: "AugmentWorks",
  version: pkg.version,
  description: "Test HTTP agents locally, compare regressions, and inspect saved AugmentWorks results in Claude Code.",
  author: cursor.author,
  homepage: "https://augmentworks.ai",
  repository: cursor.repository,
  license: pkg.license,
  keywords: cursor.keywords,
  icon: "./assets/augmentworks.png",
  documentationUrl: "https://augmentworks.ai/docs/local-quickstart",
  supportUrl: "https://augmentworks.ai/contact",
  privacyPolicyUrl: "https://augmentworks.ai/privacy",
  termsOfServiceUrl: "https://augmentworks.ai/terms",
}));
add(".mcp.json", json({
  mcpServers: {
    workspace: {
      type: "http",
      url: "https://augmentworks.ai/mcp",
      oauth: { clientId: "augmentworks-claude-code", callbackPort: 8788 },
    },
  },
}));

const allSource = [];
for (const action of actions) {
  const sourcePath = `commands/augmentworks-${action}.md`;
  const source = await read(sourcePath);
  allSource.push(source);
  let command = replaceRequired(source, `name: augmentworks-${action}\n`, `name: ${action}\n`, sourcePath);
  command = adaptCommands(command);
  if (action === "connect") {
    command = replaceRequired(command,
      "Guide the developer to its Authenticate/Connect control if needed,",
      "Guide the developer to `/mcp` and the workspace server's authentication control if needed,",
      "connect authentication instruction");
  }
  add(`commands/${action}.md`, command);
}

let skill = await read("skills/augmentworks-regression/SKILL.md");
allSource.push(skill);
const startMarker = "## Connect to saved workspace results\n";
const endMarker = "## Inspect existing hosted results\n";
const start = skill.indexOf(startMarker);
const end = skill.indexOf(endMarker, start);
if (start < 0 || end <= start) throw new Error("Shared connection workflow boundaries changed");
skill = skill.slice(0, start) + (await read("claude-source/connect.md")).trimEnd() + "\n\n" + skill.slice(end);
skill = replaceRequired(skill,
  "Resolve `scripts/report.mjs` and `assets/faq-packet.json` relative to **this SKILL.md** and use their absolute paths from the project working directory.",
  "Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` in these instructions. Use `${CLAUDE_PLUGIN_ROOT}/skills/augmentworks-regression/scripts/report.mjs` and `${CLAUDE_PLUGIN_ROOT}/skills/augmentworks-regression/assets/faq-packet.json` as the installed resource paths. Quote each complete path and keep the developer's project as the working directory. Do not depend on these variables being present in the Bash process environment.",
  "installed skill resource paths");
skill = skill.replaceAll("/absolute/skill/path", "${CLAUDE_PLUGIN_ROOT}/skills/augmentworks-regression");
skill = adaptCommands(skill);
if (/Cursor|\.cursor|augmentworks-cursor|\.\.\/\.\.\/examples\//.test(skill)) {
  throw new Error("Cursor-specific instructions remain in the generated Claude skill");
}
add("skills/augmentworks-regression/SKILL.md", skill);

const versions = [...new Set(allSource.flatMap((text) => [...text.matchAll(/@augmentworks\/cli@([\w.+-]+)/g)].map((match) => match[1])))];
if (versions.length !== 1 || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(versions[0])) {
  throw new Error("Shared sources must use one exact published CLI version");
}
add("README.md", (await read("claude-source/README.md")).replaceAll("{{CLI_VERSION}}", versions[0]));
for (const path of ["LICENSE", "assets/augmentworks.png", "skills/augmentworks-regression/scripts/report.mjs", "skills/augmentworks-regression/assets/faq-packet.json"]) {
  add(path, await readFile(join(root, path)));
}
files.set(".claude-plugin/marketplace.json", Buffer.from(json({
  name: "augmentworks-tools",
  owner: cursor.author,
  metadata: { description: "AugmentWorks tools for testing AI agents and inspecting regression evidence." },
  plugins: [{
    name: "augmentworks",
    source: "./plugins/claude",
    description: "Test HTTP agents locally and inspect saved AugmentWorks results in Claude Code.",
  }],
})));

const unexpected = (await listFiles(join(root, destination))).filter((path) => !files.has(path));
if (unexpected.length) {
  throw new Error(`Unexpected files in generated Claude package; review and remove them explicitly:\n${unexpected.join("\n")}`);
}

const stale = [];
for (const [path, expected] of files) {
  if (check) {
    try {
      if (!(await readFile(join(root, path))).equals(expected)) stale.push(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      stale.push(path);
    }
  } else {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), expected);
  }
}
if (stale.length) {
  console.error(`Claude package is out of date. Run npm run build:claude and commit the generated files:\n${stale.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`${check ? "Verified" : "Generated"} ${files.size} Claude package and marketplace files.`);
}
