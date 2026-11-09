---
name: augmentworks-hosted
description: Use the separate CLI workflow to quote a hosted assessment and run it within a user-approved limit.
---

Explain that this command uses the CLI and its separate authentication: the current browser-authorized MCP connection can read saved results but cannot quote or start assessments. If the developer requires an MCP-only run, report that this operation is not available yet and stop. Do not silently switch to CLI execution to satisfy an MCP request.

For a requested CLI assessment, use the installed `augmentworks-regression` skill's **Hosted assessment** workflow. Establish the workspace, permitted target, data scope, and assessment or suite first. Quote that exact selection with `--estimate` and show its cost in credits. Pause for explicit authorization of the target and numeric ceiling unless the developer already supplied both for this invocation.

If authorized and within the ceiling, launch once with the same selection and `--max-credits`. Return the run ID and the dashboard URL emitted by the CLI. Use the existing run ID to follow pending grading.
