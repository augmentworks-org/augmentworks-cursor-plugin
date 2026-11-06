import { parseReadToolArgs, projectReadToolResult } from "./vendor/read-contract.mjs";

const origin = "https://augmentworks.ai";
const maxBytes = 2 * 1024 * 1024;

const routes = {
  list_applications: { path: () => "/v1/applications" },
  get_run_report: {
    path: args => "/v1/relay/runs/" + args.run_id + "/report?limit=1",
  },
  compare_runs: {
    path: () => "/v1/comparisons/evaluate",
    body: args => args.baseline_run_id
      ? { candidateRunId: args.candidate_run_id, baselineRunId: args.baseline_run_id }
      : { candidateRunId: args.candidate_run_id, baselineId: args.baseline_id },
  },
};

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

export async function callWorkspaceTool(name, input, { apiKey = process.env.AUGMENTWORKS_API_KEY, fetchImpl = globalThis.fetch, signal } = {}) {
  const args = parseReadToolArgs(name, input);
  const route = routes[name];
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
  return projectReadToolResult(name, args, data);
}
