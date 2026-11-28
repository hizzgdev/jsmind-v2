---
name: jsmind-review
description: "Review methodology for jsMind-V2 PRs. Use when reviewing a pull request, focusing on contracts, testability, and long-term maintainability."
type: workflow
lifecycle: active
---

# jsMind Review Methodology

Review as a project steward, not only as a functional checker. Functional correctness is necessary but
not sufficient.

## Writing

Lead with the highest-layer issue. A functionally correct change can still deserve a request-change if it
weakens a contract or its testability. Prefer a concrete suggested fix over general advice. Everything
below it is mechanical, and each rule exists because its absence was measured on this repo's PRs.

- **The comment speaks the PR body's language.** Chinese body prose → Chinese comment; English body prose
  → English comment. Not the issue's language, not the previous round's, not this file's. Decide it once
  per PR: drop `<!-- -->` comments, fenced code and code spans, compare Chinese characters against Latin
  ones, take the majority. A body that holds only `Closes #N` falls back to the language of the issue it
  closes; if that is undecidable too, write English. Every round on one PR keeps that language until the
  body itself changes language — one PR never mixes two. Always English regardless: PR title, commit
  messages, code identifiers, file paths, option names, label names.
- **Conclusion first, `## 要改什么` second, `### 证据` last.** The first line is the conclusion alone —
  `结论：request changes` or `结论：可以合并` — with nothing before it. Under `## 要改什么`, number the
  items, cap each at 3 lines, and give each item its own location (`文件:行`) plus the replacement or the
  behaviour required. No `建议考虑`, no `或许可以`, and no item that only names a document to read.
- **2000 characters is a hard cap.** Measure with `wc -m` before posting; the 2.8k–4.7k comments this
  replaces spent most of their length retelling the probe process, and a reader stops before the finding.
  A sentence that cites a document instead of stating the rule is a defect:
  `见 team/development/commit-types.md` only stands when the same sentence already says what the rule is,
  and the test is whether a reader can act without opening another file. An item already fixed gets one
  line (`第 3 轮 A 已修，<commit>`), never a retelling of the earlier round.
- **Posting the summary comment.** `gh pr comment <n> --repo <owner>/<repo> -F - <<'MD' … MD` works
  unattended; wrapping the heredoc in `$(cat <<'EOF' … EOF)` gets rejected by the command guard as a
  dangerous payload, and `execute_code` refuses `subprocess` in an unattended run.
- **A must-fix that has a line belongs on the diff.** Send it through the review-comment endpoint
  (`POST repos/{owner}/{repo}/pulls/<n>/comments`) instead of the summary; the summary keeps the
  cross-file and contract-level conclusions, and every review still posts one. The payload is
  `{"body": …, "commit_id": "<head sha>", "path": "src/view/index.ts", "line": 409, "side": "RIGHT"}`.
  `--input` takes a file path or `-` for stdin, so
  `gh api -X POST repos/{owner}/{repo}/pulls/<n>/comments --input - <<'JSON' … JSON` posts directly;
  writing the payload to `$TMPDIR` with `write_file` and passing the path works too. Both are usable
  unattended — only the `$(cat <<'EOF' … EOF)` form is rejected. `line` must fall inside the diff's hunk — an added or changed line — or GitHub answers 422
  `line must be part of the diff`, and `commit_id` is the head sha that hunk belongs to. The language
  and length rules apply here as well.

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
- Source comments are English.
- Cite locations in repo docs or source. When docs and code disagree, trust the code and say which
  document is wrong.
- Squash merges take the **PR title** when the PR has more than one commit, so a stale title writes a
  false subject into history. Check the commit count before deciding whether the title is a must-fix —
  and check the repo's squash settings for the body too: `gh api repos/{owner}/{repo} --jq
  '[.squash_merge_commit_title,.squash_merge_commit_message]'` returns `COMMIT_OR_PR_TITLE` /
  `COMMIT_MESSAGES` here, so the branch's per-commit messages are concatenated into the merge commit
  body verbatim (`b6f15a2`'s body is six bulleted commit messages). A rework round that reverses an
  earlier commit's rule therefore leaves a false *paragraph* under a corrected title. Report that
  paragraph as a note for the owner and leave the branch alone: the owner edits the squash message in
  GitHub's merge box, while asking for a rewrite needs a force push this flow has no permission for (see
  "The review never asks for the branch history to be rewritten" below).
- A new on-disk field on `JmStyle` / `JmTheme` / `JmNodeStyle` must also land in
  `docs/requirements/v2-data-format.md`: §5.2 declares `JmNodeStyle`, §5.3 the `JmStyle` / `JmTheme`
  block, §5.4 the 覆盖链, §9.5 the validation table. `docs/requirements/v2-cli.md` follows the same
  rule — it is a design doc, but CLI feature PRs do land their command groups there, so a new command
  missing from it is a gap in the PR, not a note.
- The PR body is the public record even when it never reaches git history. A body that still describes a
  deleted flag, script or test is a must-fix; a body-only rework is legitimate and should say "no file
  changes this round". A *count* that drifted because a later rework round added a test is a note, not a
  rework round: `team/automations/weka/SOUL.cody.md` tells cody not to edit the title or body on a rework
  card, so a request to fix it cannot be acted on. Put the real number and what it should read in the
  review comment for the owner, and say why it is not blocking.
- A `Closes #N` body closes the issue on merge. Count the issue's deliverables item by item instead of
  mapping "the files this PR touches" onto "the issue's scope". If items are missing, require them or
  require `Refs #N`.
- **The review never asks for the branch history to be rewritten.** How many commits a branch holds is
  not a defect: the merge is GitHub's squash and merge, so the branch's shape never reaches `master`.
  A "squash these N commits" request sends the implementer into a force push this flow has no permission
  for, and the card dies there — the ban and its reason are in
  `team/automations/weka/SOUL.reed.md` under 不要要求重写分支历史. What is reviewable is the diff; only
  the PR title survives into the merge subject, which is why the title is reviewed against the diff.
- **A conclusion that hinges on an owner decision is not a verdict.** Post the PR comment first — fixed
  first line `## 需要 owner 决定：<one sentence>`, the options with their consequences, `@hizzgdev`, last
  line `请在本 PR 回复，我按你的回复继续。` — and only then block the card, with that comment's URL as
  the first line of the block reason. Never bury the question in a long review body and never leave it
  only on the card: the card is invisible to the owner.

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
- **A measured table in the PR body.** Numbers pasted from a browser run can come from a revision
  before the final test rewrite: check the box size and the starting point the table names against the
  shipped test, and whether the current assertion would still print those numbers. A table whose
  container size or hardcoded origin no longer exists in the suite is a report the reader cannot
  reproduce — ask for the current numbers or an explicit "from the previous revision" label, even when
  the property it demonstrates still holds.
- **A "one repaint / one pass" claim backed by a settle counter.** A loop that awaits a per-item
  measurement does not run in one frame: `DomUtility.measureElement` waits a rAF every call, so N
  recoloured nodes cost N frames even though `settle` runs once (the existing `measureNodeSizes` batches
  with `Promise.all`, so the serialized path is the anomaly, not the norm). Count measurement batches or
  frames, not settle calls - a `passes === 1` assertion stays green on a one-frame-per-node loop. Fixing
  it needs the batch wrapped in ONE `_whileUnscaled`: concurrent `refreshNodeStyle` calls re-enter it and
  the first completion restores the viewport transform while the rest are still measuring.
- **A deferred repaint that captures the map before its `await`.** A "one repaint on the next frame" guard
  that reads `activeMind` before `await refreshNodesStyle(...)` and never re-checks it afterwards does not
  survive `close()`/`open()` landing during the measurement - and the same-turn test the author wrote
  (change style, `close()` immediately) passes because the notification has not even reached the observer
  yet. `JmNodeView.refreshNodeStyle` re-appends the element after the measurement, so the closed map's node
  comes back with its new colour painted over the next map, and `settle(oldMind)` throws
  `TypeError: Cannot set properties of null (setting 'innerHTML')` at `placeNode` while `measureElement`'s
  `container.removeChild` throws `NotFoundError` when the element was already released. Probe with a delay:
  `node.style = ...; await sleep(d); await jm.open(other)` for d in 0..60ms and count painted
  `[data-jm-node-id]` plus `unhandledRejection` - the window is one frame wide, so d=0 stays green and d=5
  fails.
- **A cleanup that iterates the model's node list.** `clear(mind)` over `mind._nodes` cannot remove an
  element whose node already left the model: `onNodeRemoved` is debug-only, so the element stays painted
  through `close()` and through `open()` of the next map - the exact "old nodes remain" symptom the map
  cleanup exists to fix. Probe add -> `removeNode` -> `close` -> `open(other)` and census
  `[data-jm-node-id]`, not just node counts before and after a plain open.
- **A generated-artifact command that fails after the PR.** Run it on the base commit first: `npm run docs:api`
  already throws `Missing Chinese translations: JsMind.commands` on master (from the zoom/commands work), so a new
  English-only `@remarks` on a documented method adds a second missing key rather than introducing the breakage. Name
  which keys were already missing and which the diff adds, and do not turn docs regeneration into a must-fix for a
  bugfix PR while the base is red.
- **A test count in the PR body.** Count the declarations in the diff rather than the suite
totals: `git diff base...head -- __tests__ | grep -E '^[+-]\s*(test|it)\('` gives added-minus-removed, and
the body's per-file breakdown must sum to it. A rewritten case shows up as one removal plus one
addition, so a body that counts it as new is off by one against its own parenthetical.
- **A test that cannot fail.** Assertions that restate their own selector, parity tests that only check
  the direction they assert, and checks pinned to the rows the PR touched all pass on the bug they exist
  to prevent. Ask which input makes this red; if none does, it is decoration.
- **A test bound copied from another fixture's constant.** A case that opens a 150×120 box but asserts
  `extent.right <= SMALL.width` (420) passes on a map that overflows its own box. Check the constant in
  each assertion against the fixture the case actually opened; the numbers happening to fit hides it.
- **A shell gesture that disables a native behaviour the page still needs.** `touch-action: none` plus a
  cancelled `pointerdown` stops page scrolling from touches that start on the map. Where the pan is a
  no-op (the shell sized the host to the map, so the band is empty at 1x), a touch user loses the only
  way to reach the rest of a cropped page. Read the gesture together with the state it acts on, and note
  whether `touch-action` is set once or follows whether a pan can move at all.
- **A content check that strips before matching.** Probe one line carrying both an exempt marker and a
  violation, and read the reported text rather than the exit code — a check that prints the stripped line
  shows the reader text that is not in the file.
- **The artifact that is actually served.** A file in the repo is not the published bytes: compare hashes
  against the live URL, and treat a mirror as a copy that lags by whole revisions rather than by commits.
  Reading the rendered output is the acceptance claim; the file existing is not.
- **Anything a deploy step touches.** Merging is not deploying. A script run by a systemd unit, or a file
  copied into an agent profile, changes nothing live until it is refreshed: check the process start time
  against the file's mtime, and compare profile copies by hash. The procedure is
  `team/automations/skills/weka-deploy/SKILL.md`. The same gap hides behind a config *read*:
  `hermes config get <key>` prints the value from the config file — it never asks the running process, and
  it resolves the caller's profile home (`HERMES_HOME=~/.hermes/profiles/<p>` prints `null` for keys that
  only the default config carries). A key the gateway reads once at boot can therefore be "3" in the file
  and "2" live while the check is green. Ask for a restart proof (process start time vs the config edit)
  next to the file read, and pin `HERMES_HOME=$HOME/.hermes` when the procedure may run from a profile
  shell. `hermes config set` resolves its target the same way (`get_config_path()` →
  `get_hermes_home()`), so a doc that pins the home for the read must pin it for the write too — otherwise
  a profile shell writes the profile's config and the check reds on a file the human just edited. Read the
  boot log line as the cap resolved at boot, not as the live rate: the dispatcher clamps spawns under memory
  pressure (`_memory_pressure_level`, elevated → one per tick, critical → none), so calling that line "the
  number it is enforcing now" overstates it.
- **A diff taken against a stale local `master`.** `git diff master...HEAD` uses the *local* ref; when master has moved past the branch point (or the branch was rebased onto newer master), the three-dot diff silently adds commits the PR never contained — a file count that disagrees with `gh pr diff --name-only` is the tell. Compare `git merge-base origin/master HEAD` against the PR's base before trusting any local `--stat`, and review `gh pr diff` / the PR file list as the truth.
- **An "outside the window" node census that counts folded children.** Folded branches leave their nodes laid out at the
  map origin with `visibility: hidden`, so `getBoundingClientRect()` reports them off-window once a fit or pan moves the
  origin - and `checkVisibility()` without `{checkVisibilityCSS: true}` calls them visible. A fit that looks like it left
  nodes off the edge (3 of 18 in `example/v2-features.json` at 700x500) is usually those boxes; filter on
  `getComputedStyle(n).visibility` before claiming a fit bug, and A/B the same gesture with and without the change
  under review before writing it up.
- **A geometry claim only measurable on the deployed page.** Classic-scrollbar behaviour cannot be reproduced under the UI harness (`--hide-scrollbars`), but the PR preview URL can: open it with a browser tool at a *different* window size than the implementer used, then read `inner.style.transform`, `document.scrollingElement` vs `innerWidth/Height`, per-node rects, and `getComputedStyle(host).touchAction`, and dispatch wheel + real `mousePressed/Released` pairs with `clickCount` 1,2 for the double-click. A different box size is the independence: the transform differs, the invariants (centred, nothing outside, idempotent) must still hold.
- **A hook or helper that shells out to `hermes kanban` from a worker session.** Popping
  `HERMES_DELEGATED_CHILD_CONTEXT` in `kanban_db_dispatch.py` is only about the worker *process*: because the
  worker carries `HERMES_KANBAN_TASK`, `delegated_child_subprocess_env()` re-mints the marker
  (`agent/delegation_context.py:184-186` + `:139-140`) into every child via `build_subprocess_env()`
  (`tools/environments/local.py:410`), and `agent/shell_hooks.py:507` uses exactly that for hooks. The child then
  fails `kanban_path_is_fenced()` on the pinned `HERMES_KANBAN_DB`, so `hermes kanban list` exits 1 with
  `kanban: delegate_task child contexts cannot mutate …`. Verify by running the script in a worker shell and then
  with  `env -u HERMES_DELEGATED_CHILD_CONTEXT`; a stubbed `hermes` on PATH hides it, so require a test whose stub
  fails when its own env carries the marker.
- **A hook scoped by a task id taken from the `post_tool_call` payload.** The payload has no kanban card id: `extra.task_id`
  is `_CallIds(...).hook_kwargs()`'s `effective_task_id` (`model_tools.py:684`), which is `task_id or uuid4()`
  (`agent/turn_context.py:585`), and a kanban worker's turn calls `run_conversation` **without** `task_id`
  (`gateway/session_kanban.py:357`; only the non-kanban branch at `:273-276` passes one). `tool_input` is the model's raw
  args, so a SOUL that says `kanban_show()` sends `{}`. The worker env is no help either — its own
  `HERMES_KANBAN_TASK`/`RUN_ID`/`CLAIM_LOCK` are scrubbed, so a hook child inherits none. Probe it without spending a
  model call: `terminal(background=True, command="sleep 60")`, then read `$HERMES_HOME/processes.json` —
  `owner_task_id` is that same `_current_task_id` (`tools/process_registry.py:2704`) and shows a uuid, not `t_…`. A test
  that supplies `tool_input.task_id` itself stays green on the broken path; require one with the real shape (empty
  `tool_input`, uuid in `extra.task_id`, `profile` set) and a resolution that can still name the card — under
  `kanban.max_in_progress_per_profile: 1`, "the one `running` card assigned to `payload["profile"]`" is the available
  signal.
- **A hook-doc command with a missing required argument.** `hermes hooks revoke` takes the command string as a
  positional and exits 2 (`the following arguments are required: command`) when a doc writes it bare;
  `hermes --accept-hooks` is a root-level flag, not a `hooks` subcommand flag. Doctor prints at most four
  answer lines (`hermes_cli/hooks.py:286-345`), the JSON smoke test is skipped entirely while the pair is
  not allowlisted (`:316-319`), the allowlist is `{"approvals":[{event,command}]}` at
  `get_hermes_home()/shell-hooks-allowlist.json` (so per profile), the synthetic payload does carry `profile`
  (`agent/shell_hooks.py:100` → a doctor run really reconciles), and a hand-written allowlist entry approves
  the pair but records no mtime, so doctor can never report drift on it. Check the **interpreter** the block
  names, not only the script: a bare `python3` on this host is `/usr/bin/python3` 3.6.8 (`~/.local/bin` holds
  only `python3.10`/`python3.11`, `.bashrc` adds none), so `python3 team/automations/weka/labels.py` dies with
  `SyntaxError: future feature annotations is not defined`, while the section's unittest line correctly uses
  `~/.hermes/venvs/weka/bin/python` (3.11.13). A worker shell hides this: its `python3` is Hermes's own 3.14
  venv, which is why such a block reads fine to whoever ran it there. The same trap hides behind
  `hermes -p <p> hooks doctor`: `✓ ran clean with empty stdout (exit=N, …)` prints for *any* exit code
  (`hermes_cli/hooks.py:333-335` checks only that stdout is empty), so a hook whose `#!/usr/bin/env python3`
  resolves to the host's 3.6.8 stays green — and `All shell hooks look healthy.` prints — while nothing runs.
  Read the `exit=` value, and treat doctor-green as registration plus spawn, never as proof the script parses.
- **A recovery hint printed on failure.** Recovery instructions are deliverable code; replay them
  literally. A hint that restores from the index after the script already staged its changes undoes
  nothing.
- **A green check called "Format, types, tests, build".** That job gates `type-check`, `test:coverage` and
  `build` on the `library` output, so a PR touching only docs or `skills/` runs format-check alone and goes
  green in seconds. A test count or coverage percentage quoted in such a PR's body is therefore not
  CI-verified: run it once locally, or say in the review that CI cannot reproduce it. On this 2-core box a
  unit run is ~6 min and the UI run ~2 min — start them in the background and paste the `# tests` lines
  into the review rather than trusting the body. Decimal drift between machines (96.43 vs 96.44) is a
  note, never a rework round.
- **A status-marker refresh whose edit list stops at the sections the card named.** `roadmap.md` carries
  status in three places (§2 table, §3 sequence, §4 section headings) and `milestones.md` in two more (the
  M checklists, appendix A's `已完成` row), so refreshing some of them leaves the same file saying ✅ in one
  place and ⏳/❌ forty lines later. `grep -nE '⏳|❌|^\- \[ \]|尚未开始|将来|已预留'` over both files before
  judging the scope: a patch that fixes half the markers turns uniformly-stale text into a
  self-contradiction, which is worse for the reader than the state it replaced. Also check the PR body's
  list of leftovers against the actual headings (`#### S11` was cited but §4 has no S11 section).
- **A completed-items list that is not re-derived from what the PR just flipped.** Appendix A's `已完成`
  row must gain every S item this PR marks ✅, including M-plan items and including items that finished
  after the card was filed (a checklist box ticked in the same PR is the tell). Adding the M2 items the
  card named (`S8`, `S9`'s HTML) while dropping the one that merged an hour before the card (`S14`) leaves
  the appendix telling a reader that shipped work is still outstanding — the exact bug the refresh exists
  to fix. Diff the row against the ✅ set, not against the card's replacement text.
- **A `format-check` run started while the test suite is still running.** `__tests__/build/pages-site.test.ts`
  drives a real VitePress build, which leaves `tutorials/.vitepress/.temp/` on disk mid-run, and eslint's
  ignore list covers `docs/.vitepress/cache|dist` but not `tutorials/.vitepress/**` — so the check reports
  80+ errors in generated JS/CSS that no diff touched. Wait for the suite to exit and re-run (the dir is
  removed on completion); a red confined to `.vitepress/.temp` is the race, not the change. If it persists
  on an idle tree, reproduce on a clean `git archive` extract before blaming the patch.
- **Rendering and export claims.** When the claim is about geometry, colour or placement, the proof is a
  measurement — pixel census, dimensions, byte comparison — not a screenshot someone says looks right.
- **A `@throws` on a view-level command that promises a "no map is open" error.** The view only learns about a
  map through `settle()`, and `JmMindChangeCoordinator.onMindMapClosed` is empty, so after `JsMind.close()` the view
  still holds the last model and the command runs rather than throwing. Probe it in the browser (`close()`, move the
  view away, call the command) instead of trusting the JSDoc, and require either the doc corrected to the state the
  view can actually detect or a real reset on close - not an empty guard documented as a contract.
- **An acceptance criterion the issue gained after the card was snapshotted.** The Kanban card body is the issue as it
  read at trigger time; GitHub is the source of truth and the body can be rewritten while the implementer works
  (`updatedAt` on the issue vs the card timestamp). Re-read `gh issue view <n>` before mapping acceptance to
  assertions, and say in the PR comment that the criterion postdates the brief so the implementer is not accused of
  skipping a requirement it never received. The same read catches the issue being *paused*: a comment saying "先不做/暂缓" while the labels and assignee still say in-flight means GitHub and the board disagree. Check the timeline for the state changes the comment claims (unlabeled, unassigned, archived); if they never happened, do not pick a side - `kanban_block(kind="needs_input")` with the decision and leave the technical state in a PR comment.
- **A transform layered over an existing scroll container.** Scroll the box first (`el.scrollLeft/Top = 300`)
  and then issue the command: switching `overflow` to `hidden` keeps the scroll offset, so the state and
  and the paint differ by `scroll × scale` while the accessor still reports the offset it replaced. Drive both
  modes in a real browser and check `getViewport()` against painted boxes in each.
- **A handoff that quotes a per-file UI run as "the ui tests".** `node --test __tests__/ui/viewport.test.ts` is 29 cases; `npm run test:ui` is 71 and includes `export-html.test.ts`, which drives the built artifact in a real browser and is where a viewport/gesture change usually shows up. A green per-file run plus a red `UI tests` check means the other files were never run - check `gh pr checks` before reading the handoff's test line, and name the failing case (file:line plus the actual/expected numbers) rather than "ui tests fail". Also reproduce on the base in a scratch `git archive` copy of `origin/master` before blaming the diff; a shared node_modules symlink makes the rebuild cheap.
- **A zoom gesture change that also moves the shell's wheel anchor.** The exported page opens at the identity viewport on the unfitted map, so its origin starts *outside* the pan band (`content.left` is a layout margin, not 0). Any rule that clamps a zoom origin into the band therefore moves the map under the pointer on the first wheel turn, breaking the anchor contract the tests in `export-html.test.ts` and `viewport.test.ts` protect - even when the rule only meant to close a fitting-axis hole. Derive the expected origin by hand (`anchor - anchor/newScale`, then the band's near end) and check the drift equals the failure's pixel difference before writing it up.
- **An acceptance criterion that contradicts the same issue's own root cause.** An issue whose root-cause section
  says "`zoomViewport` clamps only the scale, not the origin" can still list "the overflowing axis keeps its origin
  clamped into the band" as acceptance - master never clamped it, so a PR that leaves the anchored origin alone
  satisfies the *behaviour unchanged* half and only the wording is wrong. Check each acceptance line against the
  root-cause section before writing it up as a deviation, and put the reword on the owner rather than on the
  implementer, who is told not to edit the issue.
- **An invariant fix that collides with a published no-op.** "A fitting axis is always centred" and "a zoom to the
  factor already in effect writes the identity" cannot both hold (an exported page calls `zoomTo(1)` at open on the
  assumption that it changes nothing). Verify the fix's exception rather than the headline: probe with a seeded sweep
  that asserts (a) every factor-changing zoom centres a fitting axis, (b) a same-factor zoom is a byte-identical
  no-op, (c) `canPan === false` implies the content rect is inside the box, and (d) an overflowing axis is one pan
  from on screen. Negative-control it twice: the new test file dropped onto `origin/master`'s `src` must red, and
  deleting the exception in a scratch copy of the head must red exactly that one case. Re-implement the *old*
  arithmetic inline (`focus - anchor/scale`) for the reported sequence instead of checking out the base - matching
  the issue's numbers bit for bit is what proves the new numbers are not measured against a different fixture.
- **A box-gap assertion added to a suite that runs Chromium with `--hide-scrollbars`.** `offsetWidth - clientWidth`
  is `[0, 0]` whether or not the box still scrolls, so the assertion cannot red there. To find out which assertion in a
  new group actually protects the behaviour, neutralize them one at a time in a scratch copy (expectation -> the value
  the buggy state produces) and re-run: whichever reds next is the live one. Report the vacuous one as documented, not
  as a defect, and require the live one to exist.

- **A build output left behind by a negative-control run.** `dist/` is gitignored, so a worktree can hold an
  `artifact.html` assembled from a tree where the line under review was commented out (a `// TEMP-BEFORE`
  marker is the tell). Exporting from it reproduces the pre-change page and makes a correct diff look
  broken. Run `node scripts/assemble-artifact.ts` (or `npm run build`) before exporting, and when a
  measurement disagrees with a green UI suite, grep the page you actually loaded for the line in question.

- **A `@throws` added to the view interface but not to the commander a caller holds.** `JmCommander` is what
  `jm.commands` returns and the only reachable path; `JmViewHandle` is internal. A PR that makes a command throw and
  documents it only on `JmViewHandle` leaves the generated page's `JmCommander` section silent, or listing only the
  reasons it used to throw when the new guard fires before them - and `JmCommander.getViewport`'s `@returns` drifts
  the same way. The same method documented twice on one page is where they disagree: diff the `## JmCommander` half
  of `docs/*/reference/api/viewport.md` against the `## JmViewHandle` half, and require the commander JSDoc plus the
  `JmCommander.*` keys in `scripts/docs/api-translations-zh.json` and a `docs:api` rerun.

- **A rework round that rebases onto a newer master and silently reverts a sibling fix.** A branch cut before a fix merged, rebased afterwards, resolves the conflict in the fix's file by keeping its own older copy - so the PR is green, its own tests were rewritten to match, and the diff quietly deletes merged work. The tell is a `src/` file in the PR's file list that the issue did not ask to touch: `git diff origin/master -- <that file>` should be empty and is not, and the deleted test declarations (`git diff origin/master -- __tests__ | grep -E '^-\s*(test|it)\('`) name the fix. Reproduce the fixed bug's original sequence against the head's own source (import the head module in a probe) instead of arguing from the diff, and require master's file plus its tests and their JSDoc back.
- **A spec that moved after the head was pushed.** Compare the issue's `updatedAt` against the head commit's
  date before approving: a head can be green and faithful to the brief it received, yet wrong against a
  spec revised after it was pushed. Two shapes seen here — an option relocated between option groups
  (`takeOverViewport: boolean` on `JsMindOptions` → `viewportMode: 'native' | 'viewport'` on `ViewOptions`)
  and a default the owner flipped in an inline review comment (`viewportMode` `'native'` → `'viewport'`).
  Request the rework and say in the comment that the revision postdates the head, so the implementer is not
  accused of skipping a requirement it never got. Relocating a documented field also renames its key in
  `scripts/docs/api-translations-zh.json` (otherwise `docs:api` stops with "Missing Chinese translations")
  and falsifies records that quote the old name (`team/development/viewport-mode.md`'s "选项名保留" bullet);
  a per-file plan derived from the diff usually omits both. A flipped default is a polarity change on every
  surface that encodes it: the `DEFAULT_OPTIONS` value plus the comment that argues for it, every
  `@remarks`/`@throws` whose condition is phrased as "created *without* X" (the flipped default makes it
  never true), the tests that assert the old default and the ones that pass `{}` meaning the old mode (they
  stop throwing and red as a group), the generated docs pages, the decision record's "why the default is
  X" section, the single commit message, and the PR body's counter-example table. Also check the repo's own
  hosts: `example/playground.html` / `example/demo.html` call `create()` then `open()` with fixed-size
  boxes and no gesture code, so a default flip takes native scrolling away from the published demo pages —
  one explicit option per page is the fix.
- **A literal `git grep` acceptance line treated as a note.** When an issue's acceptance list says `git grep -n "<symbol>"` is empty, it means the whole tree, decision records and historical code quotes included - a doc paragraph explaining the replaced field still reds it. Report the exact hit paths and line numbers and ask for a reword (a placeholder like `<mode latch>` keeps the history readable); do not downgrade it to a non-blocking note because the occurrence is prose. If the owner wants historical quotes exempt, the issue line has to change - that is the owner's edit, not the implementer's.
- **A nested option advertised through a shallow `Partial<T>`.** Moving an option under an option group (`JsMindOptions.view.viewportMode`) while typing the entry point `options?: Partial<JsMindOptions>` makes the documented literal unusable in TypeScript: `Partial` stops at the top level, so `{ view: { viewportMode: 'viewport' } }` fails with TS2739 because `view` must still be a complete `ViewOptions` (`padding`, `expander`). The tell is the branch's own workaround: `{ ...DEFAULT_OPTIONS.view, viewportMode }` spreads in the TS tests and options passed as JSON inside a string (`Record<string, unknown>`) in the UI test, so `tsc` never sees the literal the error message and the generated page tell callers to write. Probe it instead of reading it: a scratch `tsc -p` project importing `src/common/option.ts` with `strict` and the literal; a real error there means every .d.ts consumer gets the same one (`dist/jsmind.d.ts` carries the signature). The fix is per-group partials (`mind?/view?/layout?: Partial<...>`) matching what `mergeObjects` already merges at runtime, plus one test that passes the literal without a spread so `type-check` guards it.

- **A regenerated API page that is half translated.** `docs:api` fails only on a *missing* key, never on a key that
  covers less than the English block. A `@remarks` that gains a paragraph — or a page that is regenerated for the first
  time since its prose was written — renders in full on the `en` page while `zh` renders only what the translation
  says, so one commit ships two pages documenting different things. Compare en and zh by paragraph for every
  regenerated page, and extend the existing `*.remarks` key instead of adding a second one.

- **A "strip on finish" claim checked against one object when the card keys two.** A reconciler flag gated on
  "the card still has a phase" (`include_pr=label is not None`) drops the branch→PR lookup for every finished
  card, so a `done` issue card strips the issue and never even reads its PR - while the new ops note justifies
  the whole `done` branch by "otherwise the label stays on a PR until merge". Drive each status against a card
  that keys two objects and count the `gh` reads, not the asserted labels: a test that seeds only the issue
  stays green on the gap.

- **A label-owner table whose "where" column was written for the manual era.** When a doc PR moves the
  writer of flow labels from the bots to a reconciler, the "where it lands" cells usually stay as they were
  and go false: `labels.py`'s `refs_for(include_pr=label is not None)` puts an issue card's phase on the
  issue *and* the PR its `branch_name` opened, so `weka-reviewing` is no longer "always a PR" (reed's run is
  on the issue card). Do not argue from the table: import `labels.py` in a probe, feed it the real card
  shape (title `#<n>: …`, body starting with the issue URL, `branch_name` set) and print
  `Reconciler.run("full")` per (status, assignee) - the reported target list is the answer.

- **A deploy doc's read-only command nobody ran.**
  `~/.hermes/venvs/weka/bin/python team/automations/weka/labels.py --dry-run --full` from the clone
  (the worktree has no `config.json`) is safe and read-only; run it rather than trusting the
  prose. It prints skip/progress lines (`… is not in the phase table; skipping`,
  ``title does not start with `#<number>:`; skipping``,
  `profile <p>: N running cards; falling back to a full sweep`) alongside `-old +new`, so
  "anything else is a diff line" is wrong. It also exposes config drift prose cannot: the host's
  `config.json` has no `reviewer` key (while `config.example.json` does), so every `running` + reed card is
  skipped and `weka-reviewing` is never written - and `hooks doctor` stays green through it. In a worker
  shell the same command only prints the delegate-fence error; drop
  `HERMES_DELEGATED_CHILD_CONTEXT`/`HERMES_KANBAN_TASK`/`HERMES_KANBAN_RUN_ID`/`HERMES_KANBAN_CLAIM_LOCK` for
  the real read. Hook timeouts are `hooks.<event>[].timeout`, default 60 s (`agent/shell_hooks.py:37`), not
  the 5 s a doc may claim.

- **A master regression test replaced by a differently-scoped new one.** A rework round that has to touch a UI suite
  can drop a case that a *different* issue landed (here: `ui viewport - a zoom leaves a map that fits centred, never in a
  corner`, landed for #274/#279, replaced by a `fitToView is the way back…` case) and justify it from the buggy
  intermediate state it last ran in. Do not argue from the diff: run master's case verbatim against the head. Recipe
  when the shell fences heredocs and `execute_code` refuses `subprocess` — `git show origin/master:<test file> | sed -n
  '<start>,<end>p' > $S/block.ts`, `sed "s#from './helpers.ts'#from '<abs path to the head's helpers.ts>'#"
  <head test file> > $S/base.ts`, `cat $S/base.ts $S/block.ts > $S/probe-viewport.test.ts`, then
  `node --test --test-name-pattern="<case title>" $S/probe.test.ts` (the harness resolves `dist/` from the helpers'
  own location, so the copy still loads the head's bundle). A `1/1 pass` means the removal was the implementer's choice,
  not the mode change's necessity — require master's case back *alongside* the new one, since they cover different
  states. Same check for a test the round merely rewrote: a rewrite that asserts less is a coverage loss.
