const origin = "https://augmentworks.ai";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const maxItems = 50;
const maxBytes = 2 * 1024 * 1024;
const requirementOutcomes = ["pass", "fail", "inconclusive", "error", "not_run"];
const credential = /aw_(?:api|connector|refresh)_[A-Za-z0-9_-]+/i;

function check(value) {
  if (!value) throw new Error("AugmentWorks returned an unexpected workspace response.");
}

function responseId(value) {
  check(typeof value === "string" && uuid.test(value));
  return value.toLowerCase();
}

function name(value) {
  check(typeof value === "string" && value.length > 0 && value.length <= 200);
  return credential.test(value) ? "[redacted]" : value.replace(/\p{C}/gu, " ");
}

function identifier(value) {
  check(typeof value === "string");
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/.test(value) && !credential.test(value)
    ? value : "[redacted]";
}

function choice(value, allowed) {
  check(allowed.includes(value));
  return value;
}

function count(value) {
  check(Number.isSafeInteger(value) && value >= 0);
  return value;
}

function bounded(items, project) {
  check(Array.isArray(items));
  return items.slice(0, maxItems).map(project);
}

function applications(data) {
  check(data.ok === true && Array.isArray(data.applications) && Array.isArray(data.baselines));
  const workspaces = new Set([...data.applications, ...data.baselines].map(item => responseId(item?.workspaceId)));
  check(workspaces.size <= 1);
  return {
    workspaceId: [...workspaces][0] ?? null,
    applicationEnvironmentCount: data.applications.length,
    baselineCount: data.baselines.length,
    applications: bounded(data.applications, item => {
      check(item.schemaVersion === "aw-application-identity/1");
      return {
        applicationId: responseId(item.applicationId), applicationName: name(item.applicationName),
        environmentId: responseId(item.environmentId), environmentName: name(item.environmentName),
      };
    }),
    baselines: bounded(data.baselines, item => {
      check(item.schemaVersion === "aw-baseline/1");
      return {
        baselineId: responseId(item.baselineId), name: name(item.name), runId: responseId(item.runId),
        applicationId: responseId(item.applicationId), environmentId: responseId(item.environmentId),
      };
    }),
    truncated: data.applications.length > maxItems || data.baselines.length > maxItems,
  };
}

function runReport(data, args) {
  check(data.schemaVersion === "aw-run-report/1" && responseId(data.runId) === args.run_id.toLowerCase());
  check(typeof data.reportReady === "boolean" && data.coverage && (data.aggregate === null || typeof data.aggregate === "object"));
  const coverage = {};
  for (const field of ["plannedAttempts", "completedAttempts", "requiredJudgmentsPlanned", "requiredJudgmentsComplete"]) {
    const value = data.coverage[field];
    coverage[field] = value === null ? null : count(value);
  }
  const failures = data.aggregate?.knownRequiredFailures;
  return {
    runId: responseId(data.runId), workspaceId: responseId(data.workspaceId),
    dashboardUrl: origin + "/portal/runs/" + responseId(data.runId),
    executionStatus: choice(data.executionStatus, ["queued", "connected", "running", "cancel_requested", "cancelled", "completed", "failed"]),
    evaluationStatus: choice(data.evaluationStatus, ["absent", "pending", "complete", "partial", "error"]),
    outcome: choice(data.outcome, [null, "passed", "failed", "inconclusive", "error"]),
    reportReady: data.reportReady, coverage,
    requirementOutcome: choice(data.aggregate?.requirementOutcome ?? null, [null, ...requirementOutcomes]),
    knownRequiredFailures: failures == null ? null : bounded(failures, identifier),
    knownRequiredFailureCount: failures == null ? null : failures.length,
  };
}

function comparison(data, args) {
  check(data.schemaVersion === "aw-semantic-comparison-read/1");
  const cmp = data.comparison;
  check(cmp && cmp.createsBillableRun !== true && responseId(cmp.candidateRunId) === args.candidate_run_id.toLowerCase());
  const baselineRunId = responseId(cmp.baselineRunId);
  check(!args.baseline_run_id || baselineRunId === args.baseline_run_id.toLowerCase());
  check(Array.isArray(cmp.comparedCases) && Array.isArray(cmp.compatibilityReasons));
  if (data.inputRevisions) {
    check(responseId(data.inputRevisions.candidateRunId) === responseId(cmp.candidateRunId));
    check(responseId(data.inputRevisions.baselineRunId) === baselineRunId);
  }
  const cases = cmp.comparedCases.map(item => {
    check(item && typeof item === "object");
    return {
      caseId: identifier(item.caseId), criterionId: identifier(item.criterionId), repetitionIndex: count(item.repetitionIndex),
      requirement: choice(item.requirement, ["required", "advisory"]),
      baselineOutcome: choice(item.baselineOutcome, [null, ...requirementOutcomes]),
      candidateOutcome: choice(item.candidateOutcome, [null, ...requirementOutcomes]),
      change: choice(item.change ?? null, [null, "improved", "result_established", "now_verified", "coverage_differed", "unchanged", "regressed", "not_comparable", "added", "removed", "not_run"]),
      category: choice(item.category ?? null, [null, "new_required_failure", "fixed_required_failure", "persistent_required_failure", "newly_verified", "added_case", "removed_case", "advisory_only_change"]),
    };
  });
  // Earlier evidence records carry outcomes and a category without a change label.
  const changed = cases.filter(item => item.category !== null ||
    (item.change === null ? item.baselineOutcome !== item.candidateOutcome : item.change !== "unchanged"));
  return {
    baselineRunId, candidateRunId: responseId(cmp.candidateRunId),
    comparability: choice(cmp.comparability, ["compatible", "incompatible", "incomplete"]),
    compatibilityReasons: bounded(cmp.compatibilityReasons, identifier),
    coverageChange: choice(cmp.coverageChange, ["none", "added_cases", "removed_cases", "added_and_removed_cases", "repetition_count_changed", "selection_filter_changed"]),
    evaluationStatus: choice(cmp.evaluationStatus, ["pending", "running", "complete", "partial", "error", "cancelled"]),
    candidateRequirementOutcome: choice(cmp.candidateRequirementOutcome ?? null, [null, ...requirementOutcomes]),
    totalCases: cmp.comparedCases.length, changedOrFlaggedCases: changed.length,
    comparedCases: changed.slice(0, maxItems),
    truncated: changed.length > maxItems,
  };
}

const routes = {
  list_applications: { fields: [], path: () => "/v1/applications", project: applications },
  get_run_report: { fields: ["run_id"], path: args => "/v1/relay/runs/" + args.run_id + "/report?limit=1", project: runReport },
  compare_runs: {
    fields: ["candidate_run_id", "baseline_run_id", "baseline_id"], path: () => "/v1/comparisons/evaluate",
    body: args => args.baseline_run_id
      ? { candidateRunId: args.candidate_run_id, baselineRunId: args.baseline_run_id }
      : { candidateRunId: args.candidate_run_id, baselineId: args.baseline_id },
    project: comparison,
  },
};

function validate(name, args) {
  if (!Object.hasOwn(routes, name)) throw new Error("Unknown AugmentWorks workspace tool.");
  const route = routes[name];
  if (!args || typeof args !== "object" || Array.isArray(args) ||
      !Object.entries(args).every(([key, value]) => route.fields.includes(key) && typeof value === "string" && uuid.test(value))) {
    throw new Error("Invalid workspace tool arguments. Use only the documented UUID fields.");
  }
  if (name === "get_run_report" && !args.run_id) throw new Error("A run_id UUID is required.");
  if (name === "compare_runs" && (!args.candidate_run_id || Boolean(args.baseline_id) === Boolean(args.baseline_run_id))) {
    throw new Error("Supply candidate_run_id and exactly one of baseline_id and baseline_run_id.");
  }
  return route;
}

const httpErrors = {
  400: "The request was rejected. Verify the IDs and that both runs support comparison.",
  401: "Set a valid workspace API key in AUGMENTWORKS_API_KEY.",
  403: "The key lacks workspace access or the read permissions required for this operation.",
  404: "The requested resource is unavailable to this workspace.",
  409: "The saved evaluation changed. Fetch the report and try again.",
  410: "The requested evidence has expired or been removed.",
  429: "Workspace requests are rate limited. Try again later.",
};

async function readJson(response) {
  if (!response.body || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("The AugmentWorks response was empty or too large.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("The AugmentWorks response was too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}

export async function callWorkspaceTool(name, args, { apiKey = process.env.AUGMENTWORKS_API_KEY, fetchImpl = globalThis.fetch, signal } = {}) {
  const route = validate(name, args);
  if (typeof apiKey !== "string" || !/^aw_api_[A-Za-z0-9_-]{32,256}$/.test(apiKey)) {
    throw new Error("Set a valid AugmentWorks workspace API key in AUGMENTWORKS_API_KEY and restart the MCP server.");
  }
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const body = route.body?.(args);
  let response;
  let data;
  try {
    response = await fetchImpl(origin + route.path(args), {
      method: body ? "POST" : "GET", redirect: "error", signal: requestSignal,
      headers: { Accept: "application/json", Authorization: "Bearer " + apiKey, ...(body && { "Content-Type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (response.ok) data = await readJson(response);
    else await response.body?.cancel();
  } catch {
    if (requestSignal.aborted) throw new Error("The AugmentWorks request timed out or was cancelled.");
    throw new Error("Could not read a valid bounded response from the AugmentWorks API.");
  }
  if (!response.ok) {
    throw new Error(`AugmentWorks HTTP ${response.status}. ${httpErrors[response.status] ?? "The service could not complete this request."}`);
  }
  check(data?.createsBillableRun === false);
  return route.project(data, args);
}
