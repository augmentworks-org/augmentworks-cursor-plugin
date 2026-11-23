---
name: report
description: Read the outcome, coverage, and failed checks for a saved AugmentWorks run.
---

Use only the declared AugmentWorks workspace MCP server. Ask for a hosted run ID if the user has not identified one; for a pinned baseline, use `list_applications` to resolve the selected application and its baseline run. Call `get_run_report` with the chosen run ID. Summarize its recorded status, coverage, and failed checks. Keep pending or missing evidence explicit. If access fails or the run is absent, report that result. Do not retrieve local files or start a run.
