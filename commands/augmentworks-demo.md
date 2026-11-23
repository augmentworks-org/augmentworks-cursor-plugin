---
name: augmentworks-demo
description: Run a failing and a fixed refund agent on loopback and show the evidence for each.
---

Use the installed `augmentworks-regression` skill. From the current workspace, run:

```sh
npx --yes @augmentworks/cli@0.4.2 demo --json
```

Read the returned summary. Check `ok`, `cleanup.ok`, and the two run exit codes. Compare `runs.faulty.reports.json` against `runs.corrected.reports.json` with the skill's report helper. Explain the actual failed check, how the observed order state changed after the fix, and which local HTML files the developer can open. This is a fictional target on loopback. Keep the user's application and account out of the demo.
