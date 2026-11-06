import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pin = JSON.parse(await readFile(new URL("mcp/vendor/read-contract.lock.json", root), "utf8"));
if (!/^[0-9a-f]{40}$/.test(pin.revision)) throw new Error("Expected a full Git commit in the read-contract lock.");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--upstream")) {
  throw new Error("Usage: node scripts/check-read-contract.mjs [--upstream]");
}
const base = `https://raw.githubusercontent.com/augmentworks-org/augmentworks-cli/${pin.revision}/packages/mcp-contracts/`;
const files = [
  { local: "mcp/vendor/read-contract.mjs", source: "index.mjs", hash: pin.moduleSha256 },
  { local: "test/fixtures/read-v1.json", source: "fixtures/read-v1.json", hash: pin.fixturesSha256 },
];
for (const { local, source, hash } of files) {
  const bytes = await readFile(new URL(local, root));
  if (createHash("sha256").update(bytes).digest("hex") !== hash) {
    throw new Error(`${local} differs from its pinned SHA-256 digest.`);
  }
  if (args.includes("--upstream")) {
    const response = await fetch(base + source, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Could not verify pinned upstream ${source}: HTTP ${response.status}.`);
    if (!bytes.equals(Buffer.from(await response.arrayBuffer()))) {
      throw new Error(`${local} differs from upstream commit ${pin.revision}.`);
    }
  }
}
