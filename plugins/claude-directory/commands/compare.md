---
name: compare
description: Compare a saved candidate run with an earlier run or a pinned baseline.
---

Use only the declared AugmentWorks workspace MCP server. Identify the candidate run and the earlier run or pinned baseline. If the user chose a pinned baseline, resolve its ID with `list_applications`. Ask for any missing or ambiguous selection. Call `compare_runs` with `candidate_run_id` and exactly one of `baseline_run_id` or `baseline_id`. Lead with incompatible inputs, incomplete coverage, or pending judgments when they affect interpretation. Report only regressions and fixes supported by the comparison.
