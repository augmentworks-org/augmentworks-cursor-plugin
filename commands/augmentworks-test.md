---
name: augmentworks-test
description: Run a local packet against an authorized HTTP agent and identify the assertions that failed.
---

Use the installed `augmentworks-regression` skill's **Run a local regression** workflow. Use the config and packet given by the developer, or select a compatible pair from this project. Run the packaged FAQ checks only against their fixture or a target with the same agreed policy.

Make a fresh run with `test --local`, capture its exit code, and inspect its JSON report with the skill's helper even when checks fail. Return the outcome, affected scenario and assertion keys, and the local report paths. Keep the JSON path so the developer can rerun the same inputs after a fix and use `/augmentworks-compare`.
