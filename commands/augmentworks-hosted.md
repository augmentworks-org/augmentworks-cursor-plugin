---
name: augmentworks-hosted
description: Get a credit quote for an AugmentWorks hosted assessment and run it within a user-approved limit.
---

Use the installed `augmentworks-regression` skill's **Hosted assessment** workflow. Establish the workspace, permitted target, data scope, and assessment or suite first. Quote that exact selection with `--estimate` and show its cost in credits. Pause for explicit authorization of the target and numeric ceiling unless the developer already supplied both for this invocation.

If authorized and within the ceiling, launch once with the same selection and `--max-credits`. Return the run ID and the dashboard URL emitted by the CLI. Use the existing run ID to follow pending grading.
