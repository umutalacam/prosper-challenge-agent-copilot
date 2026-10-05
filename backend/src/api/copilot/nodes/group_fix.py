#
# The group fix conversation: "Fix with copilot" on an issue group in the Issues pane
# (one kind of issue at one node, across a version's calls).
#
#   GroupFixNode    the first turn: reads what each call's AI analysis said caused it
#                   (causes, not the per-call suggestions), finds the common cause and
#                   proposes one fix, in conversation. The turn ends with a `proposal`.
#   DiscussFixNode  every reply while a proposal is open (the browser sends it back):
#                   the user agrees → it becomes the goal and the build loop runs
#                   (planner → executor → reviewer → wrap_up); otherwise it answers
#                   their ideas, revises the proposal, and the conversation goes on.
#

from typing import Any

from api.copilot.nodes.base import DecisionNode, bullets
from api.copilot.turn import Event, Turn

_KINDS = {
    "stuck": "got stuck (the bot kept replying without moving on, and the call ended there)",
    "long_stay": "needed many replies before moving on",
    "error": "failed with a pipeline error",
}


def describe(group: dict[str, Any]) -> str:
    """:param group: ``{kind, node, version, call_count, causes}``.
    :return: The issue and its calls' causes, as context for the model.
    """
    where = f"in node '{group['node']}'" if group.get("node") else "before the flow started"
    return (
        f"In version {group.get('version')} of the agent, {group.get('call_count')} calls "
        f"{_KINDS.get(group.get('kind', ''), 'ran into a problem')} {where}. "
        "What each call's analysis found caused it:\n" + bullets(group.get("causes") or [])
    )


def proposed(suggestion: str) -> Event:
    """:param suggestion: The fix as it stands.
    :return: The event that keeps the conversation open: the browser sends it back.
    """
    return {"type": "proposal", "suggestion": suggestion}


class GroupFixNode(DecisionNode):
    name = "group_fix"
    activity = "Finding the common cause…"

    def context(self, turn: Turn) -> str | None:
        return describe(turn.group_fix or {})

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        suggestion = answer.get("suggestion", "")
        turn.reply = f"I'd suggest: {suggestion}\n\nWant me to apply it, or would you change something?"
        return [
            {"type": "note", "text": f"Common cause: {answer.get('common_cause', '')}"},
            {"type": "reply", "text": turn.reply},
            proposed(suggestion),
        ]

    def next(self, turn: Turn) -> str | None:
        return None  # the user replies; discuss_fix takes it from there


class DiscussFixNode(DecisionNode):
    name = "discuss_fix"
    activity = "Thinking it over…"

    def context(self, turn: Turn) -> str | None:
        group = turn.group_fix or {}
        return describe(group) + f"\n\nThe fix proposed so far: {group.get('proposal', '')}"

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        suggestion = answer.get("suggestion", "")
        if answer.get("agreed"):
            turn.intent = "build"  # so wrap_up checks the agent is still valid
            turn.goal = f"Apply the fix agreed with the user: {suggestion}"
            return [{"type": "note", "text": f"Goal: {turn.goal}"}]
        turn.reply = answer.get("reply", "")
        return [{"type": "reply", "text": turn.reply}, proposed(suggestion)]

    def next(self, turn: Turn) -> str | None:
        return "planner" if turn.intent == "build" else None
