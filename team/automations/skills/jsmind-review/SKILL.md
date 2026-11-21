---
name: jsmind-review
description: "Review methodology for jsMind-V2 PRs. Use when reviewing a pull request, focusing on contracts, testability, and long-term maintainability."
type: workflow
lifecycle: active
---

# jsMind Review Methodology

Review as a project steward, not only as a functional checker. Functional correctness is necessary but
not sufficient.

## Project conventions

- PR titles and commit messages use English Conventional Commits: `<type>(<scope>): <subject>`. **The
  type is a claim about the shipped artifact**: `feat` / `fix` / `refactor` mean a file under `src/`
  changed, `docs` means a page in `docs/{zh,en}/guide` or `docs/{zh,en}/reference`. Nothing in CI
  enforces this, so reviewing the title against the diff is where it gets caught — a `feat` whose diff
  touches no `src/` file is a wrong type, whatever the change is worth. The table and the rule are
  `team/development/commit-types.md`; read it instead of guessing a type from the name of the change.
- The scope names the subsystem the commit actually touches (`cli`, `weka`, `team`, `playground`,
  `view`, `model`, `build`, `skill`, `ci`, `release`). Do not invent a scope for a one-off; do not
  police the scope name either — read it as a claim about where the change lives, and check it
  against the diff.
- Code comments in English.
- Cite locations in repo docs or source. When docs and code disagree, trust the code and say which
  document is wrong.
- Squash merges take the **PR title** when the PR has more than one commit, so a stale title writes a
  false subject into history. Check the commit count before deciding whether the title is a must-fix.
- A new on-disk field on `JmStyle` / `JmTheme` / `JmNodeStyle` must also land in
  `docs/requirements/v2-data-format.md`: §5.2 declares `JmNodeStyle`, §5.3 the `JmStyle` / `JmTheme`
  block, §5.4 the 覆盖链, §9.5 the validation table. `docs/requirements/v2-cli.md` follows the same
  rule — it is a design doc, but CLI feature PRs do land their command groups there, so a new command
  missing from it is a gap in the PR, not a note.
- The PR body is the public record even when it never reaches git history. A body that still describes a
  deleted flag, script or test is a must-fix; a body-only rework is legitimate and should say "no file
  changes this round".
- A `Closes #N` body closes the issue on merge. Count the issue's deliverables item by item instead of
  mapping "the files this PR touches" onto "the issue's scope". If items are missing, require them or
  require `Refs #N`.

## Review layers

Flag at any layer when long-term health is at stake.

**Explicit contracts.** Does the change make key contracts clearer and harder to break: which files are
published and their layout, how consumers load the library (ESM / CJS / UMD / classic script), how the
CLI finds sibling artifacts, how the Pages site is assembled. A contract that becomes implicit,
dependent on build-script side effects, or verifiable only inside CI is important even while the code
works.

**Local reproducibility.** Non-trivial logic that rewrites files, validates artifacts or assembles
outputs must be runnable locally with an npm script and covered under `__tests__`. Workflows stay thin
orchestration: content processing that exists only as YAML sed/grep belongs in a tested script.

**Compatibility decisions.** Anything that changes how existing users load or consume the library
(script style, module format, global name, file names) is a product decision. Say whether v1
expectations are preserved, deliberately broken or only partly addressed, and whether that is documented
and tested.

**Future fragility.** Ask what a later contributor — or a later build-config tweak — would do to break
this, and whether the only protection is a brittle string match, an untested shell snippet or tribal
knowledge.

**Scope coherence.** If a PR grew past its issue, do the new pieces still form one contract? Large
incidental expansion that leaves new contracts implicit should be flagged or clearly called out.

## Claims to verify, not read

Each of these has produced a real bug. In all of them the *claim* is part of the deliverable, so the
review is not finished when the diff reads correctly.

- **Docs that offer a command.** Run every acceptance command on every install route the doc offers. A
  guide offering two ways to install, then naming a bare binary as the check, misdiagnoses its own
  failure for the reader who picked the other route.
- **Help text copied from a sibling command.** Run the flags it names. Prose can advertise a flag the
  command's own field table does not accept.
- **"This value is accepted / rejected."** Probe the exact string, not the shape — and probe a *bogus*
  value as well as the deliberately rejected one. The rejected value's message is usually the clear one;
  the bogus value's may still advertise what was just removed.
- **Allow-lists and lookup tables.** A plain-object table indexed by user input resolves
  `Object.prototype`: `constructor`, `__proto__`, `toString` are not `undefined`, so validation is
  skipped and the junk dies later as a data error instead of a usage error with the candidate list.
  Probe the prototype keys, and prefer `Object.hasOwn` or a null-prototype table.
- **A parser loosened from strict to lenient.** Count what it stopped checking: a missing value, a value
  that looks like a flag, and a boolean that now accepts `=true`. The last one turns a usage error into
  exit 0 *with the file written*, because commands compare against `true`.
- **A test that cannot fail.** Assertions that restate their own selector, parity tests that only check
  the direction they assert, and checks pinned to the rows the PR touched all pass on the bug they exist
  to prevent. Ask which input makes this red; if none does, it is decoration.
- **A content check that strips before matching.** Probe one line carrying both an exempt marker and a
  violation, and read the reported text rather than the exit code — a check that prints the stripped line
  shows the reader text that is not in the file.
- **The artifact that is actually served.** A file in the repo is not the published bytes: compare hashes
  against the live URL, and treat a mirror as a copy that lags by whole revisions rather than by commits.
  Reading the rendered output is the acceptance claim; the file existing is not.
- **Anything a deploy step touches.** Merging is not deploying. A script run by a systemd unit, or a file
  copied into an agent profile, changes nothing live until it is refreshed: check the process start time
  against the file's mtime, and compare profile copies by hash. The procedure is
  `team/automations/skills/weka-deploy/SKILL.md`.
- **A recovery hint printed on failure.** Recovery instructions are deliverable code; replay them
  literally. A hint that restores from the index after the script already staged its changes undoes
  nothing.
- **A green check called "Format, types, tests, build".** That job gates `type-check`, `test:coverage` and
  `build` on the `library` output, so a PR touching only docs or `skills/` runs format-check alone and goes
  green in seconds. A test count or coverage percentage quoted in such a PR's body is therefore not
  CI-verified: run it once locally, or say in the review that CI cannot reproduce it. Decimal drift between
  machines (96.43 vs 96.44) is a note, never a rework round.
- **Rendering and export claims.** When the claim is about geometry, colour or placement, the proof is a
  measurement — pixel census, dimensions, byte comparison — not a screenshot someone says looks right.

## Writing

Lead with the highest-layer issue. A functionally correct change can still deserve a request-change if it
weakens a contract or its testability.

Write short, simple English. Prefer a concrete suggested fix over general advice.
