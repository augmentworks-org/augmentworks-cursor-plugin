---
name: compare
description: Compare two local AugmentWorks reports and show which checks regressed, recovered, or lack comparable evidence.
---

Use the installed `augmentworks:augmentworks-regression` skill's **Inspect and compare evidence** workflow. Identify the earlier baseline and the later candidate by their explicit paths or the two runs named in this conversation. If their identity or order is ambiguous, ask which is which. A run directory refers to its `report.json`.

Run the skill's `scripts/report.mjs compare` with the baseline first. Confirm that the two runs exercised the intended before/after deployments. A matching configuration can resolve to different endpoints through environment variables. Explain any comparability warning before interpreting changes. Identify regressions, fixes, and coverage changes by scenario or check key. Link both local HTML reports if present. Read the existing evidence only.
