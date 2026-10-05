#
# GroupFixNode — the start of a group fix: "Fix with copilot" on an issue group in
# the Issues pane (one kind of issue at one node, across a version's calls). The
# model reads what each call's AI analysis said caused it — causes, not the per-call
# suggestions — finds the common cause, and proposes one fix for all of them. The
# turn ends asking the user about it; their answer is the next turn, which builds
# through resolve_intent → planner → executor → reviewer like any request.
#

from typing import Any

from api.copilot.nodes.base import DecisionNode, bullets
from api.copilot.turn import Event, Turn

_KINDS = {
    "stuck": "got stuck (the bot kept replying without moving on, and the call ended there)",
    "long_stay": "needed many replies before moving on",
    "error": "failed with a pipeline error",
}


class GroupFixNode(DecisionNode):
    name = "group_fix"
    activity = "Finding the common cause…"

    def context(self, turn: Turn) -> str | None:
        group = turn.group_fix or {}
        where = f"in node '{group['node']}'" if group.get("node") else "before the flow started"
        return (
            f"In version {group.get('version')} of the agent, {group.get('call_count')} calls "
            f"{_KINDS.get(group.get('kind', ''), 'ran into a problem')} {where}. "
            "What each call's analysis found caused it:\n" + bullets(group.get("causes") or [])
        )

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        cause, suggestion = answer.get("common_cause", ""), answer.get("suggestion", "")
        turn.questions = [
            {"question": f"Suggested fix: {suggestion} Apply it?", "options": ["Apply this fix"]}
        ]
        return [{"type": "note", "text": f"Common cause: {cause}"}, {"type": "questions", "questions": turn.questions}]

    def next(self, turn: Turn) -> str | None:
        return None  # the user answers; the next turn builds
