#!/usr/bin/env python3
"""Block the `kanban_create` tool in the profiles that run cards.

Hermes lets a worker create cards on purpose — `tools/kanban_tools.py` advertises
`kanban_create` as the way to spawn follow-up work — and a card the model shapes
is not shaped the way a script's card is. Card `t_c712830c` was titled
`#273 follow-up: …` and its body named a merged PR, so `labels.py`'s
`CARD_TITLE_RE = ^#(n):` could not classify it, `refs_for()` skipped it, and the
PR it opened was never reconciled: its three flow labels were typed by hand.
Cards are the webhook's job, and a fence a model can forget is not a fence, so
this one lives in the tool layer.

The fence is profile-level, because a profile is what Hermes consents for:
`_consented` keys on the `(event, command)` pair and never asks whether the
session is a worker (`agent/shell_hooks.py`). Any session of cody, reed or scout
therefore refuses `kanban_create` — an interactive `hermes -p cody` too, with
the same fixed message. Outside the fence are the `hermes kanban create`
subcommand, which writes to the board without passing through the tool layer,
and every profile that carries neither this hook nor its allowlist entry.

Wire it as `hooks.pre_tool_call` with `matcher: "^kanban_create$"` and
`fail_closed: true` in every profile — the desired state and the allowlist entry
are in `team/automations/skills/weka-deploy/SKILL.md`. Unattended sessions run
with `-q`, so nobody is there to answer a consent prompt: the pair has to be
allowlisted ahead of time (a worker gets it from the dispatcher's
`accept_hooks=True`), and once the hook is registered `fail_closed` is what
turns a broken script into a block instead of a silent pass.

Three properties this file has to keep:

- stdin is read and dropped, never parsed. The payload carries the card title and
  body the model wrote, and a decision taken from model text is a decision that
  text can move. Nothing here looks at it.
- stdout is exactly one JSON object, ASCII-escaped, and nothing else: the parent
  parses it, and `hermes hooks doctor` fails a hook whose stdout is not JSON. The
  exit code blocks on its own (`agent/shell_hooks.py` honours 2 for
  `pre_tool_call`), so an unparseable stdout still cannot open the gate.
- no network, no Kanban board read, no PATH lookup. `/usr/bin/python3`, which the
  profile configs name, is 3.6.8 on this host: this file stays inside the stdlib
  calls that exist there.

The log line is the evidence that this script decided. A block with no line came
from somewhere else, and the message the tool returns says where:
`failed closed: …` is the `fail_closed` path — the hook could not be spawned,
timed out, or exited non-zero with no directive — while `can't open file '…'`
is the interpreter failing to read this file and exiting 2, which blocks on its
own with no `fail_closed` involved. That is the distinction to look for when the
fence "works" for the wrong reason.
"""
import json
import os
import sys
import time

MESSAGE = (
    "worker 不能建卡。需要单独 PR 的后续工作：开 issue（英文标题、label weka、assign zzgbot），"
    "webhook 会建卡；只是给人留提醒：写进 PR body 的「需要人来做」或 kanban_comment。"
    "规则见 #289 第 10 节。"
)

DENY_LOG = os.path.join(os.path.expanduser("~"), ".hermes", "state", "weka-labels", "deny.log")


def append_log():
    """Append one line to the deny log, and never let that change the decision."""
    line = "%s hook=pre_tool_call tool=kanban_create decision=block\n" % time.strftime(
        "%Y-%m-%dT%H:%M:%S%z"
    )
    try:
        directory = os.path.dirname(DENY_LOG)
        if not os.path.isdir(directory):
            os.makedirs(directory)
        with open(DENY_LOG, "a") as handle:
            handle.write(line)
    except (OSError, IOError):
        pass


def main():
    try:
        sys.stdin.read()  # dropped on purpose: no tool argument is read
    except (OSError, IOError, ValueError):
        pass
    append_log()
    sys.stdout.write(json.dumps({"decision": "block", "message": MESSAGE}) + "\n")
    sys.stdout.flush()
    return 2


if __name__ == "__main__":
    sys.exit(main())
