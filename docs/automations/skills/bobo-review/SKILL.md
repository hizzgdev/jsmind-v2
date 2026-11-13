---
name: bobo-review
description: "Review methodology for jsMind-V2 PRs. Use when acting as Bobo to review a pull request, focusing on contracts, testability, and long-term maintainability."
type: workflow
lifecycle: active
---

# Bobo Review Methodology

Review as a project steward, not only as a functional checker. Functional correctness is necessary but not sufficient.

## Project conventions

- PR titles and commit messages use English Conventional Commits: `<type>(<scope>): <subject>`.
- Suggested scopes: model / arranger / view / serialization / docs / tests / build.
- Code comments must be in English.
- Prefer citing locations in repo docs or source. If docs and code disagree, trust the code and note the difference.

## Base checks

Look for:
- Bugs, edge cases, type safety issues
- Missing or weak tests under `__tests__`
- API or behavior changes that break v1 expectations
- Performance problems in layout/rendering
- Unclear naming or docs
- CI status

## Higher-level review layers

Examine the change from these layers. Flag issues at any layer as important when they matter for long-term health.

### Explicit contracts
Does the change make key project contracts clearer and harder to break accidentally?

Contracts include:
- What files are published and their relative layout
- How different consumers load the library (ESM / CJS / UMD / classic script)
- How the CLI finds sibling artifacts
- How the Pages site is assembled

If a contract becomes more implicit, more dependent on build-script side effects, or only verifiable inside CI, treat it as an important issue even if the current code works.

### Local reproducibility and testability
Any non-trivial logic that rewrites files, validates artifacts, or assembles outputs must be runnable locally with an npm script and covered by tests under `__tests__`.

GitHub Actions workflows should stay thin orchestration. If the workflow contains sed, grep, or other content-level processing that is not also present in a tested script, flag it and require the logic to be moved.

### Product-level compatibility decisions
Changes that affect how existing users load or consume the library (script tag style, module format, global name, file names) are product decisions, not just build details.

Explicitly note whether v1 expectations are preserved, intentionally broken, or only partially addressed, and whether the decision is documented and tested.

### Future fragility
Ask: after this change, what is the most likely way a later contributor (or a future build-config tweak) will accidentally break the new behavior?

If the only protection is a brittle string match, an untested shell snippet, or tribal knowledge, call it out and suggest a more durable mechanism (test, explicit export map, shared helper, etc.).

### Scope and coherence
If the PR has grown beyond the original issue, check whether the new pieces still form one coherent contract. Large incidental expansions that leave new contracts implicit should be flagged or at least clearly called out.

## Priority

Lead with the highest-layer issues. A change can be functionally correct and still deserve a request-change if it weakens long-term contracts or testability.

Write reviews in simple, short English. Prefer concrete suggestions over general advice.
