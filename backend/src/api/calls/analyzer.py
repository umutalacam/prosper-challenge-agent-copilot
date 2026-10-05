#
# CallAnalyzer — what a finished call's timeline means: its walk through the
# agent as steps, and what went wrong (issues). The one place that judges a
# call; CallRecordService runs it when a call is saved (the issues are stored
# with it, in call_issues) and when one is read back in full.
#

from typing import Any

from api.calls.repository import CallIssue, CallRecord, Event


class CallAnalyzer:
    def steps(self, call: CallRecord) -> list[dict[str, Any]]:
        """The call's walk through the agent, one step per stay in a node, from the
        ``started`` and ``transition`` events (the same ones that build ``path``).

        :param call: The finished call.
        :return: One ``{node, entered_ms, stay_ms, replies, exit, ending}`` per stay:
            ``replies`` = bot replies during it, ``exit`` = ``{function, args}`` of the
            action that moved the call on (None for the last), ``ending`` = the outcome
            on the last step (None on the others). Empty if the flow never started.
        """
        steps: list[dict[str, Any]] = []

        def enter(node: str, at_ms: int) -> None:
            steps.append(
                {"node": node, "entered_ms": at_ms, "stay_ms": 0, "replies": 0, "exit": None, "ending": None}
            )

        for e in call.events:
            if e["type"] == "started":
                enter(e["node"], e["at_ms"])
            elif e["type"] == "transition" and steps:
                left = steps[-1]
                left["stay_ms"] = max(0, e["at_ms"] - left["entered_ms"])
                left["exit"] = {"function": e["function"], "args": e["args"]}
                enter(e["to"], e["at_ms"])
            elif e["type"] == "bot" and steps:
                steps[-1]["replies"] += 1
        if steps:
            steps[-1]["stay_ms"] = max(0, call.duration_ms - steps[-1]["entered_ms"])
            steps[-1]["ending"] = call.outcome
        return steps

    def issues(self, call: CallRecord) -> list[CallIssue]:
        """What went wrong, in timeline order. A ``stuck`` event is a failure only in the
        last step of a call that didn't complete; anywhere else the call moved on, so
        it's a long stay (often just a conversation, e.g. a greeting collecting a name
        and a date of birth).

        :param call: The finished call.
        :return: The issues, each pointing at its step in ``steps``; empty for a clean call.
        """
        issues: list[CallIssue] = []
        stuck: list[tuple[Event, int]] = []
        step = -1  # index of the step the timeline is in, as ``steps`` counts them
        for e in call.events:
            if e["type"] in ("started", "transition"):
                step += 1
            elif e["type"] == "stuck":
                stuck.append((e, step))
        last = step
        for e, at_step in stuck:
            failed = at_step == last and call.outcome != "completed"
            issues.append(
                CallIssue(
                    kind="stuck" if failed else "long_stay",
                    node=e["node"],
                    step=at_step,
                    at_ms=e["at_ms"],
                    replies=e["replies"],
                )
            )
        for e in call.events:
            if e["type"] == "error":
                issues.append(
                    CallIssue(
                        kind="error",
                        node=call.end_node,
                        step=last if last >= 0 else None,
                        at_ms=e["at_ms"],
                        message=e["message"],
                    )
                )
        return issues
