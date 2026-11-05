import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cliPackage = '@augmentworks/cli@0.4.2';
const assets = new URL('../skills/augmentworks-regression/', import.meta.url);
const reporter = fileURLToPath(new URL('scripts/report.mjs', assets));
const faqPacket = fileURLToPath(new URL('assets/faq-packet.json', assets));

async function project(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'AugmentWorks plugin smoke '));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

async function cli(cwd, args, expectedCode = 0) {
  // On Windows invoke npm's JS entry directly so paths never pass through cmd.exe.
  const win = process.platform === 'win32';
  const npx = win ? process.execPath : 'npx';
  const npmEntry = process.env.npm_execpath;
  const binDir = npmEntry?.endsWith('npm-cli.js')
    ? dirname(npmEntry)
    : join(dirname(process.execPath), 'node_modules', 'npm', 'bin');
  const prefix = win ? [join(binDir, 'npx-cli.js')] : [];
  const env = { ...process.env, npm_config_prefer_offline: 'true' };
  for (const key of Object.keys(env)) {
    if (/^(AUGMENTWORKS_|CHATBOT_)/i.test(key)) delete env[key];
  }
  try {
    const result = await exec(npx, [...prefix, '--yes', cliPackage, ...args], {
      cwd, env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(expectedCode, 0, `Expected CLI exit ${expectedCode}, got success`);
    return result.stdout;
  } catch (error) {
    if (expectedCode === 0 || error.code !== expectedCode) throw error;
    return error.stdout;
  }
}

async function report(cwd, ...args) {
  const { stdout } = await exec(process.execPath, [reporter, ...args], { cwd });
  return JSON.parse(stdout);
}

async function verifyArtifacts(json, html, junit, outcome) {
  const [result, page, xml] = await Promise.all(
    [json, html, junit].map(path => readFile(path, 'utf8')),
  );
  const parsed = JSON.parse(result);
  assert.equal(parsed.schema_version, 'AW-LOCAL-RESULT-1');
  assert.equal(parsed.outcome, outcome);
  assert.match(page, /<html\b/i);
  assert.match(xml, /<testsuite[s]?\b/);
}

test('the packaged refund demo exposes and fixes the policy failure', async t => {
  const cwd = await project(t);
  const demo = JSON.parse(await cli(cwd, ['demo', '--json']));
  assert.equal(demo.ok, true);
  assert.equal(demo.cleanup.ok, true);
  const { faulty, corrected } = demo.runs;
  assert.deepEqual([faulty.exit_code, corrected.exit_code], [10, 0]);
  for (const run of [faulty, corrected]) {
    const { json, html, junit } = run.reports;
    await verifyArtifacts(json, html, junit, run === faulty ? 'failed' : 'passed');
  }

  const failed = await report(cwd, 'inspect', faulty.reports.json);
  const key = 'policy-limit-order-remains-paid';
  assert.equal(failed.outcome, 'failed');
  assert.ok(failed.issues.some(issue => issue.failed_checks.includes(key)));
  const diff = await report(cwd, 'compare', faulty.reports.json, corrected.reports.json);
  assert.equal(diff.comparable, true);
  assert.equal(diff.current_outcome, 'passed');
  assert.ok(diff.changes.some(change => change.check === key && change.classification === 'fixed'));
});

test('setup, doctor, local FAQ failure, fix, and comparison work against a configured HTTP target', async t => {
  const cwd = await project(t);
  const fixtureKey = 'local-smoke-fixture';
  const received = [];
  let answer = 'Your return window is 7 days.';
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/chat' ||
        request.headers.authorization !== `Bearer ${fixtureKey}`) {
      response.writeHead(403).end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push(JSON.parse(body).message);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ answer, finished: true }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  await cli(cwd, ['init', '--agent']);
  assert.ok((await readFile(join(cwd, 'augmentworks.agent.md'), 'utf8')).length > 0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await writeFile(join(cwd, '.env'), `CHATBOT_BASE_URL=${baseUrl}\nCHATBOT_API_KEY=${fixtureKey}\n`);
  await cli(cwd, ['doctor', '-c', 'augmentworks.yaml']);
  assert.equal(received.length, 0);

  const flags = ['test', '--local', '-c', 'augmentworks.yaml', '--packet', faqPacket, '--output-dir'];
  const before = join(cwd, '.augmentworks', 'runs', 'before fix');
  const after = join(cwd, '.augmentworks', 'runs', 'after fix');
  await cli(cwd, [...flags, before], 10);
  answer = 'You have 30 days to return an item.';
  await cli(cwd, [...flags, after]);
  for (const [dir, outcome] of [[before, 'failed'], [after, 'passed']]) {
    await verifyArtifacts(join(dir, 'report.json'), join(dir, 'report.html'), join(dir, 'junit.xml'), outcome);
  }
  assert.ok(received.length >= 2);
  assert.ok(received.every(question => question === 'How long do I have to return an item?'));
  const diff = await report(cwd, 'compare', join(before, 'report.json'), join(after, 'report.json'));
  assert.equal(diff.comparable, true);
  assert.deepEqual([diff.baseline_outcome, diff.current_outcome], ['failed', 'passed']);
  assert.ok(diff.changes.some(change => change.classification === 'fixed'));
});
