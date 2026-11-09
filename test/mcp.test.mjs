import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const key = 'aw_api_' + 'x'.repeat(43);
const privateText = 'private customer transcript; never return this';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const baselineRun = '33333333-3333-4333-8333-333333333333';
const pin = '44444444-4444-4444-8444-444444444444';
const app = '55555555-5555-4555-8555-555555555555';
const env = '66666666-6666-4666-8666-666666666666';
const origin = 'https://augmentworks.ai';

// The same request/response envelopes as the hosted routes. Only the fetch
// implementation inside the child is replaced; the actual MCP wire, server,
// argument validation, authentication and response projections are exercised.
const applications = {
  ok: true, createsBillableRun: false,
  applications: [{
    schemaVersion: 'aw-application-identity/1', workspaceId, applicationId: app,
    environmentId: env, applicationName: 'Support', environmentName: 'staging',
  }],
  baselines: [{
    schemaVersion: 'aw-baseline/1', workspaceId, baselineId: pin, name: 'v1',
    applicationId: app, environmentId: env, runId: baselineRun, promotionRevision: 1,
  }],
};
const report = {
  schemaVersion: 'aw-run-report/1', createsBillableRun: false, runId: run, workspaceId,
  dashboardUrl: origin + '/portal/runs/' + run, asOf: '2026-09-07T12:00:00Z',
  executionStatus: 'completed', evaluationStatus: 'complete', outcome: 'failed', reportReady: true,
  aggregate: {
    requirementOutcome: 'fail', requiredPassThreshold: 1,
    coverage: { planned: 1, passed: 0, failed: 1, inconclusive: 0, error: 0, notRun: 0 },
    advisoryFailed: 0, pendingJudgeJobs: 0, knownRequiredFailures: ['faq/fact'],
    evaluationErrors: [], missingRequiredCoverage: [],
  },
  coverage: { plannedAttempts: 1, completedAttempts: 1, requiredJudgmentsPlanned: 1, requiredJudgmentsComplete: 1 },
  attempts: [{ mappedResponse: { availability: 'available', text: privateText } }],
  page: { nextCursor: null, hasMore: false, totalAttempts: 1 },
};
const comparison = {
  schemaVersion: 'aw-semantic-comparison-read/1', createsBillableRun: false,
  comparison: {
    baselineRunId: baselineRun, candidateRunId: run, comparability: 'compatible',
    compatibilityReasons: ['compatible_build_change_only'], coverageChange: 'none',
    evaluationStatus: 'complete', candidateRequirementOutcome: 'fail',
    comparedCases: [{
      caseId: 'faq', criterionId: 'faq/fact', repetitionIndex: 0, requirement: 'required',
      baselineOutcome: 'pass', candidateOutcome: 'fail', change: 'regressed',
      category: 'new_required_failure', mappedResponse: privateText,
    }],
  },
  inputRevisions: { baselineRunId: baselineRun, candidateRunId: run },
};

async function session(t, {
  location = pluginRoot, credential = key, status = 200, runReport = report, diff = comparison, oversized = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'aw mcp client '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.ndjson');
  const preload = join(dir, 'mock-fetch.mjs');
  const bodies = {
    '/v1/applications': applications,
    ['/v1/relay/runs/' + run + '/report']: runReport,
    '/v1/comparisons/evaluate': diff,
  };
  await writeFile(log, '');
  await writeFile(preload, `
    import { appendFileSync } from 'node:fs';
    const bodies = ${JSON.stringify(bodies)};
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      const body = await req.text();
      const url = new URL(req.url);
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({
        url: req.url, method: req.method, redirect: req.redirect,
        authenticated: req.headers.get('authorization') === 'Bearer ' + process.env.AUGMENTWORKS_API_KEY,
        body: body ? JSON.parse(body) : null,
      }) + '\\n');
      if (url.origin !== ${JSON.stringify(origin)} || !Object.hasOwn(bodies, url.pathname)) {
        throw new Error('Unexpected network request');
      }
      if (${oversized}) return new Response('x'.repeat(2 * 1024 * 1024 + 1));
      return Response.json(${status} === 200 ? bodies[url.pathname] : {error: ${JSON.stringify(privateText)}}, {status: ${status}});
    };`);
  const config = JSON.parse(await readFile(join(location, 'examples/api-key-mcp.json'), 'utf8'));
  const [server] = Object.values(config.mcpServers);
  assert.equal(server.command, 'node');
  assert.equal(server.type, 'stdio');
  const variable = '${env:AUGMENTWORKS_API_KEY}';
  assert.deepEqual(server.env, { AUGMENTWORKS_API_KEY: variable });
  const childEnv = Object.fromEntries(Object.entries(server.env)
    .map(([name, value]) => [name, value.replace(variable, () => credential)]));
  const args = server.args.map(arg => arg.replaceAll('${env:AUGMENTWORKS_PLUGIN_ROOT}', location));
  const client = new Client({ name: 'aug-interop-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', pathToFileURL(preload).href, ...args],
    cwd: dir, env: childEnv,
    stderr: 'pipe',
  });
  t.after(() => client.close());
  await client.connect(transport);
  return {
    client,
    calls: async () => (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)),
  };
}

async function success(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.doesNotMatch(JSON.stringify(result), /private customer transcript|aw_api_|mappedResponse/);
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}

// SDK versions may represent rejected input as either a tool error or a JSON-RPC error.
async function failure(client, name, args) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    return error.message;
  }
  assert.equal(result.isError, true);
  return result.content.map(block => block.text).join(' ');
}

test('MCP negotiates over stdio and advertises exactly the hosted read tools without credentials', async t => {
  const { client, calls } = await session(t, { credential: '' });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['compare_runs', 'get_run_report', 'list_applications']);
  for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true);
  assert.match(await failure(client, 'list_applications', {}), /key|credential|auth/i);
  assert.deepEqual(await calls(), []);
});

test('MCP reads hosted discoveries, failure summaries, and both kinds of comparisons', async t => {
  const { client, calls } = await session(t);
  const apps = await success(client, 'list_applications', {});
  assert.match(JSON.stringify(apps), new RegExp(pin));
  const summary = await success(client, 'get_run_report', { run_id: run });
  assert.match(JSON.stringify(summary), /faq\/fact/);
  assert.equal(summary.outcome, 'failed');
  for (const selector of [{ baseline_run_id: baselineRun }, { baseline_id: pin }]) {
    const diff = await success(client, 'compare_runs', { candidate_run_id: run, ...selector });
    assert.equal(diff.comparability, 'compatible');
    assert.match(JSON.stringify(diff), /faq\/fact/);
  }
  const requests = await calls();
  assert.deepEqual(requests.map(r => [new URL(r.url).origin, r.method, new URL(r.url).pathname]), [
    [origin, 'GET', '/v1/applications'], [origin, 'GET', '/v1/relay/runs/' + run + '/report'],
    [origin, 'POST', '/v1/comparisons/evaluate'], [origin, 'POST', '/v1/comparisons/evaluate'],
  ]);
  assert.equal(new URL(requests[1].url).searchParams.get('limit'), '1');
  assert.deepEqual(requests.map(r => r.body), [
    null, null, { candidateRunId: run, baselineRunId: baselineRun }, { candidateRunId: run, baselineId: pin },
  ]);
  assert.ok(requests.every(r => r.authenticated && r.redirect === 'error'));
});

test('MCP keeps pending judgments distinct from a passing result', async t => {
  const { client } = await session(t, {
    runReport: { ...report, outcome: null, evaluationStatus: 'pending', reportReady: false, aggregate: null },
  });
  const summary = await success(client, 'get_run_report', { run_id: run });
  assert.equal(summary.outcome, null);
  assert.equal(summary.evaluationStatus, 'pending');
  assert.equal(summary.reportReady, false);
});

test('MCP rejects ambiguous selectors, untrusted URLs and unlisted tools before any HTTP call', async t => {
  const { client, calls } = await session(t);
  await failure(client, 'compare_runs', { candidate_run_id: run });
  await failure(client, 'compare_runs', { candidate_run_id: run, baseline_run_id: baselineRun, baseline_id: pin });
  await failure(client, 'get_run_report', { run_id: '../create?run=1' });
  await failure(client, 'list_applications', { url: 'https://example.invalid' });
  await failure(client, 'start_run', {});
  assert.deepEqual(await calls(), []);
});

for (const status of [403, 503]) {
  test(`MCP reports HTTP ${status} without disclosing upstream errors`, async t => {
    const { client } = await session(t, { status });
    const message = await failure(client, 'get_run_report', { run_id: run });
    assert.match(message, new RegExp(String(status)));
    assert.ok(!message.includes(privateText) && !message.includes(key));
  });
}

test('MCP refuses an unexpanded Cursor credential placeholder without sending it upstream', async t => {
  const { client, calls } = await session(t, { credential: '${env:AUGMENTWORKS_API_KEY}' });
  assert.equal((await client.listTools()).tools.length, 3);
  assert.match(await failure(client, 'list_applications', {}), /key|credential/i);
  assert.deepEqual(await calls(), []);
});

test('MCP preserves an incompatible comparison instead of attributing fixes or regressions', async t => {
  const diff = {
    ...comparison,
    comparison: {
      ...comparison.comparison, comparability: 'incompatible',
      compatibilityReasons: ['rubric_changed'], comparedCases: [],
    },
  };
  const { client } = await session(t, { diff });
  const projected = await success(client, 'compare_runs', { candidate_run_id: run, baseline_run_id: baselineRun });
  assert.equal(projected.comparability, 'incompatible');
  assert.deepEqual(projected.comparedCases, []);
});

for (const [problem, options] of [
  ['a mismatched run ID', { runReport: { ...report, runId: baselineRun } }],
  ['an unrecognized schema', { runReport: { ...report, schemaVersion: 'aw-run-report/99' } }],
  ['an oversized response', { oversized: true }],
]) {
  test(`MCP rejects reports with ${problem} and withholds the upstream body`, async t => {
    const { client } = await session(t, options);
    const message = await failure(client, 'get_run_report', { run_id: run });
    assert.ok(message.length > 0 && message.length < 1000);
    assert.ok(!message.includes(privateText) && !message.includes(key));
  });
}

test('MCP starts from a standalone plugin copy with no node_modules or project package', async t => {
  const location = await mkdtemp(join(tmpdir(), 'aw packaged plugin '));
  t.after(() => rm(location, { recursive: true, force: true }));
  for (const item of ['examples/api-key-mcp.json', '.cursor-plugin/plugin.json', 'mcp']) {
    await cp(join(pluginRoot, item), join(location, item), { recursive: true });
  }
  const { client, calls } = await session(t, { location, credential: '' });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['compare_runs', 'get_run_report', 'list_applications']);
  assert.deepEqual(await calls(), []);
});

test('MCP preserves the available evidence when older hosted reports omit failure IDs or change labels', async t => {
  const olderCase = { ...comparison.comparison.comparedCases[0] };
  delete olderCase.change;
  delete olderCase.category;
  const diff = { ...comparison, comparison: { ...comparison.comparison, comparedCases: [olderCase] } };
  const runReport = { ...report, aggregate: { passed: 0, failed: 1, error: 0 } };
  const { client } = await session(t, { runReport, diff });
  const summary = await success(client, 'get_run_report', { run_id: run });
  assert.equal(summary.outcome, 'failed');
  assert.equal(summary.knownRequiredFailures, null);
  assert.equal(summary.knownRequiredFailureCount, null);
  const projected = await success(client, 'compare_runs', { candidate_run_id: run, baseline_run_id: baselineRun });
  assert.equal(projected.comparedCases.length, 1);
  const [item] = projected.comparedCases;
  assert.equal(item.change, null);
  assert.deepEqual([item.baselineOutcome, item.candidateOutcome], ['pass', 'fail']);
});
